#!/usr/bin/env node

// CLI entry point -- REPL loop, command handling, argument parsing

import readline from 'readline';
import { program } from 'commander';
import { getConfig, saveFullConfig, getConfigPath } from '../utils/config.js';
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
import { listenForEscape, askWithEscape, EscapeCancelledError } from '../utils/input.js';

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

const SLASH_COMMANDS = ['/help', '/config', '/clear', '/new', '/compact', '/model', '/cost', '/exit', '/quit'];

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

  const agent = new Agent(config);

  // Non-interactive mode
  if (opts.prompt) {
    await runSinglePrompt(agent, opts.prompt);
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
  };

  for await (const _ of agent.run(prompt, callbacks)) {
    // Agent loop iterations
  }
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

  return rl;
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
    rl.once('close', () => reject(new Error('readline closed')));
  });
}

// ─── Interactive REPL Mode ──────────────────────────────────────

async function runInteractive(agent: Agent, config: OCCCAConfig): Promise<void> {
  printBanner();
  printConfig(config.model, config.baseUrl);

  const promptStr = getUserPromptString();

  // Create single persistent readline instance for the entire session
  const rl = createReadline();

  try {
    while (true) {
      let input: string;
      try {
        input = await question(rl, promptStr);
      } catch {
        console.log('');
        printInfo('Goodbye!');
        process.exit(0);
      }

      const trimmed = input.trim();
      if (!trimmed) continue;

      // Save to persistent history
      saveHistoryLine(trimmed);

      // Handle slash commands
      if (trimmed.startsWith('/')) {
        const shouldExit = await handleCommand(trimmed, agent, config);
        if (shouldExit) {
          rl.close();
          process.exit(0);
        }
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
        await runAgentTurn(agent, trimmed);
      } catch (err: any) {
        printError(formatApiError(err));
      }
    }
  } finally {
    rl.close();
  }
}

// ─── Agent Turn ─────────────────────────────────────────────────

async function runAgentTurn(agent: Agent, input: string): Promise<void> {
  let hasStartedResponse = false;
  let fullResponse = '';

  // Create an AbortController so the Escape key can cancel the stream
  const controller = new AbortController();
  const stopListening = listenForEscape(() => {
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
  };

  try {
    for await (const _ of agent.run(input, callbacks, controller.signal)) {
      // Agent loop iterations
    }
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
 * Supports Escape to cancel midway through editing.
 * @param config - Current runtime config (mutated in place)
 * @param agent - Agent instance to refresh after config change
 */
async function runConfigEditor(config: OCCCAConfig, agent: Agent): Promise<void> {
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
      apiKey: updated.apiKey,
      baseUrl: updated.baseUrl,
      model: updated.model,
      temperature: updated.temperature,
    });

    // Update runtime config and agent
    config.apiKey = updated.apiKey;
    config.baseUrl = updated.baseUrl;
    config.model = updated.model;
    config.temperature = updated.temperature;
    agent.updateConfig(config);

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
 * No args → interactive picker. With name → quick-switch by profile name.
 * @param arg - Subcommand or model profile name
 * @param config - Runtime config (mutated on switch)
 * @param agent - Agent instance to refresh
 */
async function handleModelCommand(
  arg: string,
  config: OCCCAConfig,
  agent: Agent,
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
        // Pick a model and edit it
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
          apiKey: updated.apiKey,
          baseUrl: updated.baseUrl,
          model: updated.model,
          temperature: updated.temperature,
        });
        printSuccess(`Model "${updated.name}" updated.`);

        // If the edited model is the active one, refresh the agent
        if (targetId === modelsConfig.activeModelId) {
          applyActiveModel(config, agent);
        }
        return;
      }

      case 'remove':
      case 'rm':
      case 'delete': {
        // Pick a model and remove it
        const modelsConfig = loadModels();
        if (modelsConfig.models.length <= 1) {
          printWarning('Cannot remove the last model profile.');
          return;
        }
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
        return;
      }

      case '': {
        // No argument — show interactive picker
        const modelsConfig = loadModels();
        const activeProfile = modelsConfig.models.find(m => m.id === modelsConfig.activeModelId);
        if (activeProfile) {
          printCurrentModelInfo(activeProfile);
        }

        const selectedId = await runModelPicker(modelsConfig.models, modelsConfig.activeModelId);
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
  agent.updateConfig(config);
}

// ─── Slash Commands ─────────────────────────────────────────────

async function handleCommand(
  input: string,
  agent: Agent,
  config: OCCCAConfig,
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
      await handleModelCommand(arg, config, agent);
      return false;
    }

    case '/config': {
      await runConfigEditor(config, agent);
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
      return true;

    default:
      printWarning(`Unknown command: ${cmd}. Type /help for available commands.`);
      return false;
  }
}

// ─── Run ─────────────────────────────────────────────────────────

main().catch((err) => {
  printError(err.message);
  process.exit(1);
});
