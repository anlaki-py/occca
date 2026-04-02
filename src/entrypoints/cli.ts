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

  // Keep process alive
  process.stdin.setRawMode?.(false);

  while (true) {
    const rl = createReadline();

    let input: string;
    try {
      input = await question(rl, promptStr);
    } catch {
      console.log('');
      printInfo('Goodbye!');
      process.exit(0);
    } finally {
      rl.close();
    }

    const trimmed = input.trim();
    if (!trimmed) continue;

    // Save to persistent history
    saveHistoryLine(trimmed);

    // Handle slash commands
    if (trimmed.startsWith('/')) {
      const shouldExit = await handleCommand(trimmed, agent, config);
      if (shouldExit) {
        process.exit(0);
      }
      continue;
    }

    // Handle shell escape (! prefix)
    if (trimmed.startsWith('!')) {
      const { executeBash } = await import('../tools/BashTool/index.js');
      const result = await executeBash({ command: trimmed.slice(1).trim() });
      console.log(result);
      continue;
    }

    // Run agent turn
    try {
      await runAgentTurn(agent, trimmed);
    } catch (err: any) {
      printError(formatApiError(err));
    }
  }
}

// ─── Agent Turn ─────────────────────────────────────────────────

async function runAgentTurn(agent: Agent, input: string): Promise<void> {
  let hasStartedResponse = false;
  let fullResponse = '';

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
        finishAssistantMessage();
      }
    },
  };

  for await (const _ of agent.run(input, callbacks)) {
    // Agent loop iterations
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

function askQuestion(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function runConfigEditor(config: OCCCAConfig, agent: Agent): Promise<void> {
  const { c } = await import('../utils/theme.js');

  console.log('');
  console.log(c.brandBold('  Configuration Editor'));
  console.log(c.inactive(`  Config file: ${getConfigPath()}`));
  printDivider();
  console.log('');
  console.log(c.inactive('  Press Enter to keep current value. Type a new value to change it.'));
  console.log('');

  // API Key
  const maskedKey = config.apiKey
    ? (config.apiKey === 'sk-your-api-key-here' ? c.warning('(not set)') : '***' + config.apiKey.slice(-4))
    : c.error('(empty)');
  console.log(c.inactive('  Current API Key: ') + maskedKey);
  const newKey = await askQuestion(c.brand('  API Key: '));
  if (newKey.trim()) config.apiKey = newKey.trim();

  // Base URL
  console.log(c.inactive('  Current Endpoint: ') + c.text(config.baseUrl));
  const newUrl = await askQuestion(c.brand('  Endpoint: '));
  if (newUrl.trim()) config.baseUrl = newUrl.trim();

  // Model
  console.log(c.inactive(' Current Model: ') + c.text(config.model));
  const newModel = await askQuestion(c.brand(' Model: '));
  if (newModel.trim()) config.model = newModel.trim();

  // Temperature
  console.log(c.inactive('  Current Temperature: ') + c.text(String(config.temperature)));
  const newTemp = await askQuestion(c.brand('  Temperature: '));
  if (newTemp.trim()) {
    const parsed = parseFloat(newTemp.trim());
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) config.temperature = parsed;
  }

  // Save
  saveFullConfig(config);
  agent.updateConfig(config);
  console.log('');
  printSuccess(`Config saved to ${getConfigPath()}`);
  printDivider();
  console.log(c.inactive(' Model: ') + c.text(config.model));
  console.log(c.inactive(' Endpoint: ') + c.text(config.baseUrl));
  console.log(c.inactive(' Temperature: ') + c.text(String(config.temperature)));
  console.log(c.inactive(' API Key: ') + c.text(config.apiKey ? '***' + config.apiKey.slice(-4) : 'NOT SET'));
  printDivider();
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

    case '/model':
      if (arg) {
        config.model = arg;
        printSuccess(`Model switched to: ${arg}`);
      } else {
        printInfo(`Current model: ${config.model}`);
        console.log('  Usage: /model <model-name>');
      }
      return false;

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
