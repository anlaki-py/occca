// Display components -- banner, labels, messages, help
// Extracted from ui.ts

import chalk from 'chalk';
import { c } from '../utils/theme.js';
import { BULLET, TOOL_ARROW, CHECKMARK, CROSS, INFO_MARK, WARN_MARK } from '../constants/figures.js';
import { PRODUCT_NAME, PRODUCT_VERSION } from '../constants/product.js';
import { renderMarkdown } from '../utils/markdown.js';

// ─── Banner ──────────────────────────────────────────────────────

export function printBanner(): void {
  console.log('');
  console.log(c.brand(`  ${BULLET} `) + chalk.bold.white(PRODUCT_NAME) + c.inactive(` v${PRODUCT_VERSION}`));
  console.log('');
}

export function printConfig(model: string, baseUrl: string): void {
  const cwd = process.cwd();
  console.log(c.subtle('  ' + '─'.repeat(50)));
  console.log(c.inactive('  Model:    ') + c.text(model));
  console.log(c.inactive('  Endpoint: ') + c.text(baseUrl));
  console.log(c.inactive('  CWD:      ') + c.text(cwd));
  console.log(c.subtle('  ' + '─'.repeat(50)));
  console.log('');
  console.log(c.inactive('  Type your message to start. Use ') + c.suggestion('/help') + c.inactive(' for commands.'));
  console.log('');
}

// ─── Prompt ──────────────────────────────────────────────────────

export function getUserPromptString(): string {
  return c.brand(`\n${TOOL_ARROW} `);
}

export function printUserPrompt(): void {
  process.stdout.write(getUserPromptString());
}

// ─── Assistant Messages ──────────────────────────────────────────

export function printAssistantLabel(): void {
  console.log('');
  console.log(c.brand(`  ${BULLET} `) + chalk.bold.white(PRODUCT_NAME));
}

export function printToken(token: string): void {
  process.stdout.write(token);
}

export function finishAssistantMessage(): void {
  console.log('');
}

export function printMarkdown(text: string): void {
  if (!text.trim()) return;
  try {
    const rendered = renderMarkdown(text);
    const indented = rendered
      .split('\n')
      .map(line => '    ' + line)
      .join('\n');
    process.stdout.write(indented);
    console.log('');
  } catch {
    const indented = text.split('\n').map(line => '    ' + line).join('\n');
    console.log(indented);
  }
}

// ─── Status Messages ─────────────────────────────────────────────

export function printError(message: string): void {
  console.log(c.error(`\n  ${CROSS} `) + message);
}

export function printWarning(message: string): void {
  console.log(c.warning(`\n  ${WARN_MARK} `) + message);
}

export function printInfo(message: string): void {
  console.log(c.permission(`\n  ${INFO_MARK} `) + message);
}

export function printSuccess(message: string): void {
  console.log(c.success(`\n  ${CHECKMARK} `) + message);
}

// ─── Help ────────────────────────────────────────────────────────

export function printHelp(): void {
  console.log('');
  console.log(chalk.bold.white('  Commands'));
  console.log(c.subtle('  ' + '─'.repeat(50)));
  console.log('');
  const cmds = [
    ['/help',    'Show this help message'],
    ['/config',  'Edit configuration'],
    ['/clear',   'Clear conversation history'],
    ['/new',     'Clear history and start fresh session'],
    ['/compact', 'Compact conversation to save context'],
    ['/model',   'Show or switch model'],
    ['/cost',    'Show current session info'],
    ['/exit',    'Exit OCCCA'],
    ['! <cmd>',  'Run a shell command inline'],
  ];
  for (const [cmd, desc] of cmds) {
    console.log(c.brand(`  ${cmd!.padEnd(12)}`) + c.inactive(desc!));
  }
  console.log('');
  console.log(chalk.bold.white('  Environment Variables'));
  console.log(c.subtle('  ' + '─'.repeat(50)));
  console.log('');
  const vars = [
    ['OPENAI_API_KEY',    'Your API key'],
    ['OPENAI_BASE_URL',   'API base URL (for custom providers)'],
    ['OCCCA_MODEL',       'Model to use (default: gpt-4o)'],
    ['OCCCA_MAX_TOKENS',  'Max response tokens (default: 16384)'],
    ['OCCCA_TEMPERATURE', 'Sampling temperature (default: 0)'],
  ];
  for (const [name, desc] of vars) {
    console.log(c.suggestion(`  ${name!.padEnd(20)}`) + c.inactive(desc!));
  }
  console.log('');
}

export function printDivider(): void {
  console.log(c.subtle('  ' + '─'.repeat(50)));
}
