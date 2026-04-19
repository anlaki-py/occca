#!/usr/bin/env node

// CLI entry point -- REPL loop, command handling, argument parsing

import readline from 'readline';
import { program } from 'commander';
import { getConfig, getActiveApiKeys, saveFullConfig, getConfigPath } from '../utils/config.js';
import type { OCCCAConfig } from '../types/index.js';
import { Agent } from '../agent.js';
import { loadHistory, saveHistoryLine } from '../utils/history.js';
import { PRODUCT_NAME, PRODUCT_VERSION, PRODUCT_DESCRIPTION } from '../constants/product.js';
import {
  loadModels,
  setActiveModel,
  addModel,
  removeModel,
  updateModel,
  findModelByName,
} from '../utils/models.js';
import {
  printBanner,
  printConfig,
  printAssistantLabel,
  finishAssistantMessage,
  printMarkdown,
  printError,
  printInfo,
  printSuccess,
  printHelp,
  printWarning,
  printDivider,
  printNotice,
  getUserPromptString,
} from '../components/display.js';
import {
  showToolStart,
  showToolEnd,
} from '../components/toolDisplay.js';
import {
  runModelPicker,
  runModelCreator,
  runModelEditor,
  pickModelForAction,
  printCurrentModelInfo,
} from '../components/modelDisplay.js';
import {
  listenForCancellation,
  askWithEscape,
  EscapeCancelledError,
  mergeQuestionAnswerWithCapturedLines,
} from '../utils/input.js';
import { initializeMcp, cleanupMcp, getMcpServerStatus, enableMcpServer, disableMcpServer } from '../mcp/index.js';

// ─── CLI Argument Parsing ────────────────────────────────────────

program
  .name('occca')
  .version(PRODUCT_VERSION)
  .description(`${PRODUCT_NAME} - ${PRODUCT_DESCRIPTION}`)
  .option('-m, --model <model>', 'Model to use')
  .option('-k, --api-key <key>', 'API key')
  .option('-u, --base-url <url>', 'API base URL')
  .option('-t, --temperature <temp>', 'Temperature', parseFloat)
  .option('-p, --prompt <prompt>', 'Run a single prompt and exit (non-interactive)')
  .parse(process.argv);

const opts = program.opts();

// ─── Slash commands ──────────────────────────────────────────────

const SLASH_COMMANDS = [
  '/help',
  '/config',
  '/clear',
  '/new',
  '/compact',
  '/model',
  '/mcp',
  '/cost',
  '/exit',
  '/quit',
];

// ─── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = getConfig();

  // Apply CLI overrides
  if (opts.model) config.model = opts.model;
  if (opts.apiKey) config.apiKey = opts.apiKey;
  if (opts.baseUrl) config.baseUrl = opts.baseUrl;
  if (opts.temperature !== undefined) config.temperature = opts.temperature;

  // Warn if still using placeholder key
  if (!config.apiKey || config.apiKey === 'sk-your-api-key-here') {
    printBanner();
    printWarning('API key not configured!');
    console.log('');
    console.log('  Set your API key using one of:');
    console.log('    - /config command (interactive editor)');
    console.log('    - Environment variable: OPENAI_API_KEY');
    console.log('    - CLI flag: --api-key <key>');
    console.log(`    - Edit config file: ${getConfigPath()}`);
    console.log('');
  }

  // Initialize MCP servers from mcp.json
  await initializeMcp();

  // Build the key pool — CLI flag overrides the profile keys
  const apiKeys = opts.apiKey ? [opts.apiKey] : getActiveApiKeys();

  const agent = new Agent(config, apiKeys);

  // Non-interactive mode
  if (opts.prompt) {
    await runSinglePrompt(agent, opts.prompt);
    await cleanupMcp();
    return;
  }

  // Interactive REPL mode
  await runInteractive(agent, config);
}

// ─── Non-Interactive Mode ───────────────────────────────────────

async function runSinglePrompt(agent: Agent, prompt: string): Promise<void> {
  let fullResponse = '';

  const callbacks = {
    onToken: (token: string) => { fullResponse += token; },
    onToolStart: (name: string, args: Record<string, unknown>) => {
      showToolStart(name, args);
    },
    onToolEnd: (name: string, result: string) => {
      showToolEnd(name, result);
    },
    onError: (error: Error) => {
      printError(error.message);
    },
    onComplete: () => {
      if (fullResponse.trim()) {
        printMarkdown(fullResponse);
      }
    },
    onNotice: (message: string) => {
      printNotice(message);
    },
  };

  // run() is a plain async function — just await it
  await agent.run(prompt, callbacks);
}

// ─── Readline with Tab Completion + History ─────────────────────

function createReadline(): readline.Interface {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 500,
    completer: (line: string): [string[], string] => {
      if (line.startsWith('/')) {
        const hits = SLASH_COMMANDS.filter(c => c.startsWith(line));
        return [hits.length ? hits : SLASH_COMMANDS, line];
      }
      return [[], line];
    },
  });

  // Load persistent history into readline (most recent last)
  const history = loadHistory();
  const rlAny = rl as any;
  if (rlAny.history && Array.isArray(rlAny.history)) {
    rlAny.history.push(...history.reverse());
  }

  // CRITICAL: Prevent readline from closing on Ctrl+C at the prompt.
  // When terminal: true, readline emits its own 'SIGINT' event on Ctrl+C.
  // Without a listener, it closes the interface by default, causing the
  // REPL to exit. This listener clears the current line instead.
  rl.on('SIGINT', () => {
    // Clear the current line and re-prompt
    rl.write(null, { ctrl: true, name: 'u' }); // Clear line
    rl.prompt();
  });

  return rl;
}

/**
 * Prompt for a line of input using readline.
 * Properly cleans up the 'close' handler after resolution
 * to prevent listener leaks across REPL iterations.
 *
 * IMPORTANT (Windows fix): Before each question, explicitly force stdin
 * into raw mode + flowing state. Readline's internal `this.paused` flag
 * can desync from stdin's actual state after agent turns (tool calls,
 * streaming, etc). When that happens, readline's own `resume()` inside
 * `question()` is a no-op because it thinks stdin is already flowing —
 * but stdin is actually stalled. Our explicit calls bypass that check.
 *
 * @param rl - The persistent readline interface
 * @param prompt - The prompt string to display
 * @returns The user's raw input string
 */
function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    /**
     * Amount of idle time (ms) used to detect the end of a paste burst.
     * Multi-line paste events typically deliver several `line` events back-to-back.
     * Waiting briefly lets us merge those lines into one logical user message.
     */
    const PASTE_BURST_WINDOW_MS = 40;

    // Force stdin into the correct state for readline input.
    // This is the core fix for the "can't type after tool calls" bug.
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    // Continuation prompt used after Alt+Enter for multiline drafting.
    const CONTINUATION_PROMPT = '... ';

    // Alt+Enter flag for the next submitted line.
    let pendingAltEnter = false;

    // Stores prior lines collected through Alt+Enter continuations.
    const multilineBuffer: string[] = [];

    // Handler for unexpected readline closure (e.g. Ctrl+D / EOF)
    const onClose = () => reject(new Error('readline closed'));
    rl.once('close', onClose);

    // Capture all line events while this question is active.
    // This lets us merge multi-line paste into one submission.
    const capturedLines: string[] = [];
    const onLine = (line: string) => {
      capturedLines.push(line);
    };
    rl.on('line', onLine);

    const onKeypress = (
      _ch: string | undefined,
      key: { name?: string; meta?: boolean; alt?: boolean } | undefined,
    ) => {
      if (key?.name === 'return' && (key.meta === true || key.alt === true)) {
        pendingAltEnter = true;
      }
    };
    process.stdin.on('keypress', onKeypress);

    let onFinalLine: (line: string) => void = () => {};

    const cleanup = () => {
      rl.removeListener('close', onClose);
      rl.removeListener('line', onLine);
      rl.removeListener('line', onFinalLine);
      process.stdin.removeListener('keypress', onKeypress);
    };

    const finalizeAnswer = (answer: string) => {
      /**
       * Resolve the final answer only after the paste burst settles.
       * During this small window, additional line events are considered
       * part of the same pasted message rather than separate prompts.
       */
      const settlePasteBurst = (lastCount: number): void => {
        setTimeout(() => {
          if (capturedLines.length !== lastCount) {
            settlePasteBurst(capturedLines.length);
            return;
          }

          cleanup();
          const merged = mergeQuestionAnswerWithCapturedLines(answer, capturedLines);
          if (multilineBuffer.length > 0) {
            resolve([...multilineBuffer, merged].join('\n'));
            return;
          }
          resolve(merged);
        }, PASTE_BURST_WINDOW_MS);
      };
      settlePasteBurst(capturedLines.length);
    };

    rl.setPrompt(prompt);
    rl.prompt();

    onFinalLine = (line: string) => {
      if (pendingAltEnter) {
        pendingAltEnter = false;
        multilineBuffer.push(line);
        capturedLines.length = 0;
        rl.setPrompt(CONTINUATION_PROMPT);
        rl.prompt();
        return;
      }

      finalizeAnswer(line);
    };
    rl.on('line', onFinalLine);
  });
}

// ─── Interactive REPL Mode ──────────────────────────────────────

async function runInteractive(agent: Agent, config: OCCCAConfig): Promise<void> {
  printBanner();
  printConfig(config.model, config.baseUrl);

  const promptStr = getUserPromptString();
  // Create single persistent readline instance for the entire session
  const rl = createReadline();
  let cancelActiveTurn: (() => void) | null = null;
  const onSigint = () => {
    if (cancelActiveTurn) {
      cancelActiveTurn();
      return;
    }
    printInfo('Cancelled.');
    rl.prompt();
  };

  // KEEPALIVE: Prevent the Node.js event loop from draining if stdin's
  // internal handle state gets disrupted (e.g. after tool calls on Windows).
  // This interval keeps at least one active handle in the event loop.
  const keepalive = setInterval(() => {}, 2_147_483_647);

  // Ensure stdin keeps the event loop alive (belt-and-suspenders)
  if (typeof process.stdin.ref === 'function') {
    process.stdin.ref();
  }

  try {
    /**
     * Keep Ctrl+C non-destructive for the entire REPL lifecycle.
     * If a model/tool turn is active, Ctrl+C aborts that work.
     * If idle at prompt, Ctrl+C only clears the current input line.
     */
    process.on('SIGINT', onSigint);

    while (true) {
      let input: string;
      try {
        input = await question(rl, promptStr);
      } catch {
        console.log('');
        printInfo('Goodbye!');
        break;
      }

      const trimmed = input.trim();
      if (!trimmed) continue;

      // Save to persistent history
      saveHistoryLine(trimmed);

      // Handle slash commands — pass rl so interactive prompts can pause it
      if (trimmed.startsWith('/')) {
        const shouldExit = await handleCommand(trimmed, agent, config, rl);
        if (shouldExit) break;
        continue;
      }

      // Handle shell escape (! prefix)
      if (trimmed.startsWith('!')) {
        const command = trimmed.slice(1).trim();
        const { executeBash } = await import('../tools/BashTool/index.js');
        const result = await executeBash({ command });
        console.log(result);
        agent.addShellCommand(command, result);
        continue;
      }

      // Run agent turn
      try {
        await runAgentTurn(agent, trimmed, (cancelFn) => {
          cancelActiveTurn = cancelFn;
        });
      } catch (err: any) {
        // Show both user-friendly and debug info so crashes are diagnosable
        printError(formatApiError(err));
        if (err.stack && !err.message?.includes(err.stack)) {
          printError(`Debug: ${err.stack}`);
        }
      } finally {
        cancelActiveTurn = null;
      }
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
    clearInterval(keepalive);
    rl.close();
  }

  process.exit(0);
}

// ─── Agent Turn ─────────────────────────────────────────────────

async function runAgentTurn(
  agent: Agent,
  input: string,
  registerCancel: (cancelFn: () => void) => void,
): Promise<void> {
  let hasStartedResponse = false;
  let fullResponse = '';

  // Create an AbortController so Escape or Ctrl+C can cancel active work
  const controller = new AbortController();
  registerCancel(() => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  });
  const stopListening = listenForCancellation(() => {
    controller.abort();
  });

  const callbacks = {
    onToken: (token: string) => {
      if (!hasStartedResponse) {
        printAssistantLabel();
        hasStartedResponse = true;
      }
      fullResponse += token;
    },
    onToolStart: (name: string, args: Record<string, unknown>) => {
      if (fullResponse.trim()) {
        printMarkdown(fullResponse);
        fullResponse = '';
      }
      if (!hasStartedResponse) {
        printAssistantLabel();
        hasStartedResponse = true;
      }
      showToolStart(name, args);
    },
    onToolEnd: (name: string, result: string) => {
      showToolEnd(name, result);
    },
    onError: (error: Error) => {
      printError(formatApiError(error));
    },
    onComplete: () => {
      if (fullResponse.trim()) {
        printMarkdown(fullResponse);
        fullResponse = '';
      }
      if (hasStartedResponse) {
        // Show cancellation indicator if aborted
        if (controller.signal.aborted) {
          printInfo('Generation cancelled.');
        }
        finishAssistantMessage();
      }
    },
    onNotice: (message: string) => {
      printNotice(message);
    },
  };

  try {
    // run() is a plain async function — just await it
    await agent.run(input, callbacks, controller.signal);
  } finally {
    // Always clean up the Escape listener
    stopListening();
  }
}

function formatApiError(error: Error): string {
  const msg = error.message;
  if (msg.includes('401') || msg.includes('Unauthorized')) {
    return 'Authentication failed. Check your API key.';
  }
  if (msg.includes('429') || msg.includes('rate limit')) {
    return 'Rate limited. Please wait a moment and try again.';
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return 'Model or endpoint not found. Check your model name and base URL.';
  }
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
    return `Cannot connect to API. Check your base URL and network connection.`;
  }
  if (msg.includes('context_length_exceeded') || msg.includes('maximum context length')) {
    return 'Context length exceeded. Use /compact to reduce conversation size, or /clear to start fresh.';
  }
  return `API Error: ${msg}`;
}

// ─── Config Editor ──────────────────────────────────────────────

/**
 * Interactive config editor — edits the currently active model profile.
 * Pauses readline to prevent input conflict, supports Escape to cancel.
 * @param config - Current runtime config (mutated in place)
 * @param agent - Agent instance to refresh after config change
 * @param rl - The main readline instance to pause during editing
 */
async function runConfigEditor(config: OCCCAConfig, agent: Agent, rl?: readline.Interface): Promise<void> {
  try {
    const { c } = await import('../utils/theme.js');
    const modelsConfig = loadModels();
    const activeProfile = modelsConfig.models.find(m => m.id === modelsConfig.activeModelId);

    if (!activeProfile) {
      printError('No active model profile found.');
      return;
    }

    // Edit the active profile interactively
    const updated = await runModelEditor({ ...activeProfile });

    // Persist the changes to the profile
    updateModel(updated.id, {
      name: updated.name,
      apiKeys: updated.apiKeys,
      baseUrl: updated.baseUrl,
      model: updated.model,
      temperature: updated.temperature,
    });

    // Update runtime config and agent with the new key pool
    config.apiKey = updated.apiKeys[0] || '';
    config.baseUrl = updated.baseUrl;
    config.model = updated.model;
    config.temperature = updated.temperature;
    agent.updateConfig(config, updated.apiKeys);

    console.log('');
    printSuccess(`Profile "${updated.name}" saved.`);
    printDivider();
    console.log(c.inactive('  Model:    ') + c.text(config.model));
    console.log(c.inactive('  Endpoint: ') + c.text(config.baseUrl));
    console.log(c.inactive('  Temp:     ') + c.text(String(config.temperature)));
    console.log(c.inactive('  API Key:  ') + c.text(config.apiKey && config.apiKey !== 'sk-your-api-key-here' ? '***' + config.apiKey.slice(-4) : 'NOT SET'));
    printDivider();
  } catch (err) {
    if (err instanceof EscapeCancelledError) {
      printInfo('Config editing cancelled.');
      return;
    }
    throw err;
  }
}



// ─── Model Subcommands ──────────────────────────────────────────

/**
 * Handle /model and its subcommands (add, edit, remove, or switch).
 * Pauses the main readline during interactive pickers to prevent
 * arrow keys from cycling through input history.
 * @param arg - Subcommand or model profile name
 * @param config - Runtime config (mutated on switch)
 * @param agent - Agent instance to refresh
 * @param rl - The main readline instance to pause during pickers
 */
async function handleModelCommand(
  arg: string,
  config: OCCCAConfig,
  agent: Agent,
  rl?: readline.Interface,
): Promise<void> {
  const subcommand = arg.split(/\s+/)[0]?.toLowerCase() || '';

  try {
    switch (subcommand) {
      case 'add': {
        // Create a new model profile interactively
        const result = await runModelCreator();
        if (!result) {
          printInfo('Model creation cancelled.');
          return;
        }
        const profile = addModel(result);
        printSuccess(`Model "${profile.name}" created.`);

        // Ask if user wants to switch to it
        const answer = await askWithEscape('  Switch to this model now? (y/N): ');
        if (answer.toLowerCase() === 'y') {
          setActiveModel(profile.id);
          applyActiveModel(config, agent);
          printSuccess(`Switched to "${profile.name}".`);
        }
        return;
      }

      case 'edit': {
        // Pause readline so the arrow-key picker doesn't conflict
        rl?.pause();
        try {
          const modelsConfig = loadModels();
          const targetId = await pickModelForAction(modelsConfig.models, 'edit');
          if (!targetId) {
            printInfo('Edit cancelled.');
            return;
          }
          const target = modelsConfig.models.find(m => m.id === targetId);
          if (!target) return;

          const updated = await runModelEditor({ ...target });
          updateModel(updated.id, {
            name: updated.name,
            apiKeys: updated.apiKeys,
            baseUrl: updated.baseUrl,
            model: updated.model,
            temperature: updated.temperature,
          });
          printSuccess(`Model "${updated.name}" updated.`);

          // If the edited model is the active one, refresh the agent
          if (targetId === modelsConfig.activeModelId) {
            applyActiveModel(config, agent);
          }
        } finally {
          rl?.resume();
        }
        return;
      }

      case 'remove':
      case 'rm':
      case 'delete': {
        const modelsConfig = loadModels();
        if (modelsConfig.models.length <= 1) {
          printWarning('Cannot remove the last model profile.');
          return;
        }
        // Pause readline so the arrow-key picker doesn't conflict
        rl?.pause();
        try {
          const targetId = await pickModelForAction(modelsConfig.models, 'remove');
          if (!targetId) {
            printInfo('Removal cancelled.');
            return;
          }
          const target = modelsConfig.models.find(m => m.id === targetId);
          const wasActive = targetId === modelsConfig.activeModelId;
          const removed = removeModel(targetId);
          if (removed) {
            printSuccess(`Model "${target?.name}" removed.`);
            // If we deleted the active model, refresh to the new active
            if (wasActive) {
              applyActiveModel(config, agent);
              const newActive = loadModels().models.find(m => m.id === loadModels().activeModelId);
              printInfo(`Switched to "${newActive?.name}".`);
            }
          } else {
            printError('Failed to remove model.');
          }
        } finally {
          rl?.resume();
        }
        return;
      }

      case '': {
        // No argument — show interactive picker
        const modelsConfig = loadModels();
        const activeProfile = modelsConfig.models.find(m => m.id === modelsConfig.activeModelId);
        if (activeProfile) {
          printCurrentModelInfo(activeProfile);
        }

        // Pause readline so arrow keys don't cycle through input history
        rl?.pause();
        let selectedId: string | null;
        try {
          selectedId = await runModelPicker(modelsConfig.models, modelsConfig.activeModelId);
        } finally {
          rl?.resume();
        }

        if (!selectedId) {
          printInfo('No change.');
          return;
        }
        if (selectedId === modelsConfig.activeModelId) {
          printInfo('Already using that model.');
          return;
        }
        setActiveModel(selectedId);
        applyActiveModel(config, agent);
        const selected = loadModels().models.find(m => m.id === selectedId);
        printSuccess(`Switched to "${selected?.name}" (${selected?.model}).`);
        return;
      }

      default: {
        // Quick-switch by profile name
        const profile = findModelByName(arg);
        if (profile) {
          setActiveModel(profile.id);
          applyActiveModel(config, agent);
          printSuccess(`Switched to "${profile.name}" (${profile.model}).`);
        } else {
          printWarning(`No model profile named "${arg}". Use /model to see available models.`);
        }
        return;
      }
    }
  } catch (err) {
    if (err instanceof EscapeCancelledError) {
      printInfo('Cancelled.');
      return;
    }
    throw err;
  }
}

/**
 * Refresh the runtime config and agent from the current active model profile.
 * @param config - Runtime config to update in place
 * @param agent - Agent to reinitialize with new config
 */
function applyActiveModel(config: OCCCAConfig, agent: Agent): void {
  const fresh = getConfig();
  config.apiKey = fresh.apiKey;
  config.baseUrl = fresh.baseUrl;
  config.model = fresh.model;
  config.temperature = fresh.temperature;
  // Refresh both config and key pool
  agent.updateConfig(config, getActiveApiKeys());
}

// ─── MCP Commands ────────────────────────────────────────────────

/**
 * Handle /mcp command and its subcommands.
 * @param arg - Subcommand (enable, disable) or empty for status
 */
async function handleMcpCommand(arg: string): Promise<void> {
  const { c } = await import('../utils/theme.js');
  const parts = arg.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase() || '';
  const serverName = parts.slice(1).join(' ').trim();

  // No subcommand - show status
  if (!subcommand) {
    const servers = getMcpServerStatus();
    
    if (servers.length === 0) {
        printInfo('No MCP servers configured.');
        console.log('');
        console.log('  Create a ~/.occca/mcp.json file to configure MCP servers.');
        console.log('');
        console.log(c.inactive('  Example mcp.json:'));
        console.log('');
        console.log(c.text('  {'));
        console.log(c.text('    "mcpServers": {'));
        console.log(c.text('      "my-server": {'));
        console.log(c.text('        "command": "npx",'));
        console.log(c.text('        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]'));
        console.log(c.text('      }'));
        console.log(c.text('    }'));
        console.log(c.text('  }'));
        console.log('');
        return;
      }

    console.log('');
    console.log(c.brand('  MCP Servers'));
    console.log(c.inactive('  ────────────'));
    
    for (const server of servers) {
      const statusColor = 
        server.status === 'connected' ? c.success :
        server.status === 'disabled' ? c.inactive :
        server.status === 'failed' ? c.error :
        c.warning;
      
      const statusLabel = server.status === 'connected' ? 'connected' :
                          server.status === 'failed' ? 'failed' :
                          server.status === 'disabled' ? 'disabled' :
                          'disconnected';
      
      console.log(`  ${statusColor('●')} ${c.text(server.name.padEnd(20))} ${c.inactive(statusLabel)}`);
    }
    console.log('');
    return;
  }

  // Enable command
  if (subcommand === 'enable') {
    if (!serverName) {
      printWarning('Usage: /mcp enable <server_name>');
      return;
    }
    
    const servers = getMcpServerStatus();
    const server = servers.find(s => s.name === serverName);
    
    if (!server) {
      printError(`No MCP server named "${serverName}".`);
      printInfo('Available servers: ' + servers.map(s => s.name).join(', '));
      return;
    }
    
    if (server.status === 'connected') {
      printInfo(`Server "${serverName}" is already connected.`);
      return;
    }
    
    printInfo(`Enabling "${serverName}"...`);
    const success = await enableMcpServer(serverName);
    
    if (success) {
      printSuccess(`Server "${serverName}" enabled and connected.`);
    } else {
      printError(`Failed to enable "${serverName}".`);
    }
    return;
  }

  // Disable command
  if (subcommand === 'disable') {
    if (!serverName) {
      printWarning('Usage: /mcp disable <server_name>');
      return;
    }
    
    const servers = getMcpServerStatus();
    const server = servers.find(s => s.name === serverName);
    
    if (!server) {
      printError(`No MCP server named "${serverName}".`);
      printInfo('Available servers: ' + servers.map(s => s.name).join(', '));
      return;
    }
    
    if (server.status === 'disabled') {
      printInfo(`Server "${serverName}" is already disabled.`);
      return;
    }
    
    const success = await disableMcpServer(serverName);
    
    if (success) {
      printSuccess(`Server "${serverName}" disabled.`);
    } else {
      printError(`Failed to disable "${serverName}".`);
    }
    return;
  }

  printWarning(`Unknown /mcp subcommand: ${subcommand}`);
  printInfo('Usage: /mcp [enable|disable] <server_name>');
}

// ─── Slash Commands ─────────────────────────────────────────────

/**
 * Route slash commands. Receives readline so interactive subcommands
 * can pause it to avoid arrow-key conflicts.
 */
async function handleCommand(
  input: string,
  agent: Agent,
  config: OCCCAConfig,
  rl?: readline.Interface,
): Promise<boolean> {
  const parts = input.split(/\s+/);
  const cmd = parts[0]!.toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case '/help':
      printHelp();
      return false;

    case '/clear':
      agent.clearHistory();
      printSuccess('Conversation cleared.');
      return false;

    case '/new':
      agent.clearHistory();
      console.clear();
      printBanner();
      printConfig(config.model, config.baseUrl);
      return false;

    case '/compact': {
      printInfo('Compacting conversation...');
      const result = await agent.compact();
      printSuccess(result);
      return false;
    }

    case '/model': {
      await handleModelCommand(arg, config, agent, rl);
      return false;
    }

    case '/mcp': {
      await handleMcpCommand(arg);
      return false;
    }

    case '/config': {
      await runConfigEditor(config, agent, rl);
      return false;
    }

    case '/cost':
    case '/stats':
      printInfo(`Messages in context: ${agent.getMessageCount()}`);
      return false;

    case '/exit':
    case '/quit':
      console.log('');
      printInfo('Goodbye!');
      await cleanupMcp();
      return true;

    default:
      printWarning(`Unknown command: ${cmd}. Type /help for available commands.`);
      return false;
  }
}

// ─── Process Error Guards ────────────────────────────────────────
// Prevent silent crashes — log full error details before exiting

process.on('uncaughtException', (err) => {
  printError(`Uncaught exception: ${err.message}`);
  if (err.stack) printError(`Stack: ${err.stack}`);
  // Don't exit — let the REPL continue if possible
});

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  printError(`Unhandled rejection: ${msg}`);
  if (reason?.stack) printError(`Stack: ${reason.stack}`);
  // Don't exit — let the REPL continue if possible
});

// ─── Run ─────────────────────────────────────────────────────────

main().catch((err) => {
  // Show full error details for debugging, not just message
  printError(`Fatal: ${err.message || err}`);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
