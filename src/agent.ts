// Agent -- orchestrates model interactions and tool execution
// Integrates KeyRotator for automatic API key rotation on rate limits

import OpenAI from 'openai';
import type { OCCCAConfig, AgentCallbacks } from './types/index.js';
import { getSystemPrompt } from './constants/prompts.js';
import { getAllTools, getTool } from './tools/registry.js';
import { KeyRotator } from './utils/keyRotator.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

/** Fixed delay (ms) between retries for both rate-limit waits and transient errors */
const RETRY_DELAY_MS = 15_000;

export class Agent {
  private client: OpenAI;
  private config: OCCCAConfig;
  private messages: ChatCompletionMessageParam[] = [];
  private systemPrompt: string;
  private keyRotator: KeyRotator;

  /**
   * @param config - Runtime configuration (apiKey, baseUrl, model, temperature)
   * @param apiKeys - Full pool of API keys for rotation (defaults to [config.apiKey])
   */
  constructor(config: OCCCAConfig, apiKeys?: string[]) {
    this.config = config;
    this.keyRotator = new KeyRotator(apiKeys || [config.apiKey]);
    this.client = new OpenAI({
      apiKey: this.keyRotator.getCurrentKey(),
      baseURL: config.baseUrl,
    });
    this.systemPrompt = getSystemPrompt(config.model);
    this.messages = [];
  }

  /**
   * Update runtime config and optionally refresh the key pool.
   * Recreates the OpenAI client with the new settings.
   * @param config - Partial config overrides
   * @param apiKeys - Optional new key pool for rotation
   */
  updateConfig(config: Partial<OCCCAConfig>, apiKeys?: string[]): void {
    Object.assign(this.config, config);
    if (apiKeys) {
      this.keyRotator.updateKeys(apiKeys);
    }
    this.client = new OpenAI({
      apiKey: this.keyRotator.getCurrentKey(),
      baseURL: this.config.baseUrl,
    });
    if (config.model) {
      this.systemPrompt = getSystemPrompt(this.config.model);
    }
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  clearHistory(): void {
    this.messages = [];
  }

  /**
   * Add a shell command execution to the message history.
   * This allows the model to see commands the user ran via ! escape.
   * @param command - The shell command that was executed
   * @param output - The output from the command
   */
  addShellCommand(command: string, output: string): void {
    this.messages.push(
      { role: 'user', content: `[Shell command executed]: ${command}` },
      { role: 'assistant', content: `[Output]:\n${output}` }
    );
  }

  /** Compact: summarize old messages to reduce context */
  async compact(): Promise<string> {
    if (this.messages.length < 4) {
      return 'Not enough messages to compact.';
    }

    const toSummarize = this.messages.slice(0, -4);
    const toKeep = this.messages.slice(-4);

    try {
      const summaryResponse = await this.client.chat.completions.create({
        model: this.config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: 'Summarize the following conversation concisely, preserving key decisions, file paths, code changes, and technical details. Be brief but complete.' },
          { role: 'user', content: toSummarize.map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n') },
        ],
      });

      const summary = summaryResponse.choices[0]?.message?.content || 'Unable to summarize.';
      this.messages = [
        { role: 'user', content: `[Conversation summary]: ${summary}` },
        { role: 'assistant', content: 'Understood. I have the context from our previous conversation.' },
        ...toKeep,
      ];

      return `Compacted ${toSummarize.length} messages into a summary. ${this.messages.length} messages remain.`;
    } catch (err: any) {
      return `Failed to compact: ${err.message}`;
    }
  }

  // ─── Error Classification ──────────────────────────────────────

  /**
   * Check if an error is a rate-limit (429) response.
   * @param err - The caught error
   * @returns true if the error indicates rate limiting
   */
  private isRateLimitError(err: any): boolean {
    const msg = err.message || '';
    return err.status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('Rate limit');
  }

  /**
   * Check if an error is non-retryable (auth failures, bad requests, etc.).
   * These errors won't resolve with retries, so we fail immediately.
   * @param err - The caught error
   * @returns true if the error should not be retried
   */
  private isNonRetryable(err: any): boolean {
    const msg = err.message || '';
    // 401 Unauthorized — bad API key
    if (err.status === 401 || msg.includes('401') || msg.includes('Unauthorized')) return true;
    // 404 Not Found — bad model or endpoint
    if (err.status === 404 || msg.includes('404') || msg.includes('not found')) return true;
    // Context length exceeded — needs /compact, not a retry
    if (msg.includes('context_length_exceeded') || msg.includes('maximum context length')) return true;
    return false;
  }

  // ─── Retry Helpers ─────────────────────────────────────────────

  /**
   * Sleep for the given duration with a visible countdown via onNotice.
   * Respects the abort signal so the user can cancel mid-wait.
   * @param ms - Milliseconds to wait
   * @param reason - Human-readable reason displayed in the notice
   * @param callbacks - Agent callbacks for sending notices
   * @param signal - Optional abort signal
   */
  private async sleepWithCountdown(
    ms: number,
    reason: string,
    callbacks: AgentCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const seconds = Math.ceil(ms / 1000);
    callbacks.onNotice(`${reason} Retrying in ${seconds}s...`);

    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);

      // If the user cancels, stop waiting immediately
      if (signal) {
        const onAbort = () => {
          clearTimeout(timer);
          resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  /**
   * Handle a rate-limit error: rotate keys or wait and retry.
   * @param callbacks - Agent callbacks for notices
   * @param signal - Optional abort signal
   * @returns true if we should retry the request
   */
  private async handleRateLimit(callbacks: AgentCallbacks, signal?: AbortSignal): Promise<boolean> {
    const currentKey = this.keyRotator.getCurrentKey();
    this.keyRotator.markRateLimited(currentKey);

    // Mask key for display: show only last 4 chars
    const maskedKey = '***' + currentKey.slice(-4);

    if (this.keyRotator.hasAlternativeKeys()) {
      // Try rotating to a different key
      const nextKey = this.keyRotator.rotate();

      if (nextKey) {
        const maskedNext = '***' + nextKey.slice(-4);
        callbacks.onNotice(`Rate limit hit on key ${maskedKey}. Rotated to key ${maskedNext}.`);
        // Recreate client with the new key
        this.client = new OpenAI({
          apiKey: nextKey,
          baseURL: this.config.baseUrl,
        });
        return true;
      }
    }

    // No alternative keys available (single key or all exhausted)
    // Wait and retry with the same key pool
    await this.sleepWithCountdown(
      RETRY_DELAY_MS,
      `Rate limit hit${this.keyRotator.hasAlternativeKeys() ? ' on all keys' : ''}.`,
      callbacks,
      signal,
    );

    return !signal?.aborted;
  }

  /**
   * Handle a transient (retryable) error: wait with fixed delay and retry.
   * @param err - The error that occurred
   * @param callbacks - Agent callbacks for notices
   * @param signal - Optional abort signal
   * @returns true if we should retry the request
   */
  private async handleTransientError(
    err: any,
    callbacks: AgentCallbacks,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const reason = err.message || 'Unknown error';
    await this.sleepWithCountdown(
      RETRY_DELAY_MS,
      `Error: ${reason}.`,
      callbacks,
      signal,
    );
    return !signal?.aborted;
  }

  // ─── Main Run Loop ────────────────────────────────────────────

  /**
   * Run the agent loop: send user message, stream response, execute tools.
   * Automatically retries on rate limits (with key rotation) and transient errors.
   * This is a plain async function (NOT a generator) — the previous async generator
   * pattern caused silent process exits on Windows due to iterator finalization
   * interfering with readline's stdin management.
   * @param userMessage - The user's input text
   * @param callbacks - Event callbacks for tokens, tools, errors, completion, notices
   * @param signal - Optional AbortSignal for cancelling mid-generation (e.g. Escape key)
   */
  async run(userMessage: string, callbacks: AgentCallbacks, signal?: AbortSignal): Promise<void> {
    this.messages.push({ role: 'user', content: userMessage });

    // Outer safety net — nothing from inside can kill the process
    try {
      let continueLoop = true;

      while (continueLoop) {
        continueLoop = false;

        try {
          const stream = await this.client.chat.completions.create({
            model: this.config.model,
            temperature: this.config.temperature,
            messages: [
              { role: 'system', content: this.systemPrompt },
              ...this.messages,
            ],
            tools: getAllTools(),
            tool_choice: 'auto',
            stream: true,
          }, {
            // Pass abort signal to the HTTP request so it cancels cleanly
            signal: signal as any,
          });

          let assistantContent = '';
          const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

          // Stream response chunks — collect text and tool calls
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;

            if (!delta) continue;

            if (delta.content) {
              assistantContent += delta.content;
              callbacks.onToken(delta.content);
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                if (!toolCalls.has(index)) {
                  toolCalls.set(index, { id: tc.id || '', name: tc.function?.name || '', arguments: '' });
                }
                const existing = toolCalls.get(index)!;
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              }
            }
          }

          // Build and save the assistant message
          const assistantMessage: ChatCompletionMessageParam = {
            role: 'assistant',
            content: assistantContent || null,
          };

          if (toolCalls.size > 0) {
            (assistantMessage as any).tool_calls = Array.from(toolCalls.values()).map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            }));
          }

          this.messages.push(assistantMessage);

          // Execute tool calls if any
          if (toolCalls.size > 0) {
            const toolResults: ChatCompletionMessageParam[] = [];

            for (const [_, tc] of toolCalls) {
              // Check for cancellation before each tool call
              if (signal?.aborted) {
                this.safeComplete(callbacks);
                return;
              }

              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.arguments || '{}');
              } catch {
                args = {};
              }

              const tool = getTool(tc.name);
              callbacks.onToolStart(tc.name, args);

              let result: string;
              if (tool) {
                try {
                  // Pass abort signal to tool execution for cancellation support
                  result = await tool.execute(args, signal);
                } catch (err: any) {
                  // Treat abort as cancellation, not error
                  if (signal?.aborted || err.name === 'AbortError') {
                    result = '[Tool execution cancelled by user]';
                  } else {
                    result = `Error executing ${tc.name}: ${err.message}`;
                  }
                }
              } else {
                result = `Error: Unknown tool "${tc.name}"`;
              }

              callbacks.onToolEnd(tc.name, result);

              toolResults.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: result,
              } as any);
            }

            this.messages.push(...toolResults);

            // Check if cancelled between tool rounds
            if (signal?.aborted) {
              this.safeComplete(callbacks);
              return;
            }

            // Loop back for the follow-up response
            continueLoop = true;
          }
        } catch (err: any) {
          // Don't report abort errors as failures — user intentionally cancelled
          if (signal?.aborted || err.name === 'AbortError') {
            this.safeComplete(callbacks);
            return;
          }

          // Rate limit — rotate key or wait and retry forever
          if (this.isRateLimitError(err)) {
            const shouldRetry = await this.handleRateLimit(callbacks, signal);
            if (shouldRetry) {
              continueLoop = true;
              continue;
            }
            // User cancelled during wait
            this.safeComplete(callbacks);
            return;
          }

          // Non-retryable error — fail immediately
          if (this.isNonRetryable(err)) {
            callbacks.onError(err);
            return;
          }

          // Transient error — wait fixed duration and retry forever
          const shouldRetry = await this.handleTransientError(err, callbacks, signal);
          if (shouldRetry) {
            continueLoop = true;
            continue;
          }
          // User cancelled during wait
          this.safeComplete(callbacks);
          return;
        }
      }

      // All iterations complete — signal done
      this.safeComplete(callbacks);
    } catch (outerErr: any) {
      // Absolute last resort — something unexpected escaped all inner handling.
      // Report it instead of crashing the process.
      try {
        callbacks.onError(outerErr instanceof Error ? outerErr : new Error(String(outerErr)));
      } catch {
        console.error('[OCCCA] Fatal agent error:', outerErr);
      }
    }
  }

  /**
   * Safely invoke onComplete — if the callback throws (e.g. from
   * markdown rendering), log the error instead of crashing.
   */
  private safeComplete(callbacks: AgentCallbacks): void {
    try {
      callbacks.onComplete();
    } catch (err: any) {
      try {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      } catch {
        console.error('[OCCCA] Error in onComplete callback:', err);
      }
    }
  }
}
