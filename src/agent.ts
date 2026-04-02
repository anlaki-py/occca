// Agent -- orchestrates model interactions and tool execution

import OpenAI from 'openai';
import type { OCCCAConfig, AgentCallbacks } from './types/index.js';
import { getSystemPrompt } from './constants/prompts.js';
import { getAllTools, getTool } from './tools/registry.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

export class Agent {
  private client: OpenAI;
  private config: OCCCAConfig;
  private messages: ChatCompletionMessageParam[] = [];
  private systemPrompt: string;

  constructor(config: OCCCAConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.systemPrompt = getSystemPrompt(config.model);
    this.messages = [];
  }

  updateConfig(config: Partial<OCCCAConfig>): void {
    Object.assign(this.config, config);
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
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

  async *run(userMessage: string, callbacks: AgentCallbacks): AsyncGenerator<void> {
    this.messages.push({ role: 'user', content: userMessage });

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
        });

        let assistantContent = '';
        const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

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

        if (toolCalls.size > 0) {
          const toolResults: ChatCompletionMessageParam[] = [];

          for (const [_, tc] of toolCalls) {
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
                result = await tool.execute(args);
              } catch (err: any) {
                result = `Error executing ${tc.name}: ${err.message}`;
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
          continueLoop = true;
        }

        yield;
      } catch (err: any) {
        callbacks.onError(err);
        return;
      }
    }

    callbacks.onComplete();
  }
}
