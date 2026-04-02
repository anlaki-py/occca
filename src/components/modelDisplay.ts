// Model display components — list, picker, editor, creator UI
// Interactive prompts for managing model profiles from the CLI

import type { ModelProfile } from '../types/index.js';
import { c } from '../utils/theme.js';
import { CHECKMARK, TOOL_ARROW } from '../constants/figures.js';
import { printDivider } from './display.js';
import { askWithEscape as ask } from '../utils/input.js';

// ─── Current Model Info ──────────────────────────────────────────

/**
 * Print current active model info and available /model subcommands.
 * Shown when user types `/model` with no arguments.
 * @param active - The currently active model profile
 */
export function printCurrentModelInfo(active: ModelProfile): void {
  // Key count display
  const keyCount = active.apiKeys.length;
  const keyDisplay = keyCount === 1
    ? (active.apiKeys[0] !== 'sk-your-api-key-here'
        ? '***' + active.apiKeys[0]!.slice(-4)
        : c.warning('not set'))
    : c.text(`${keyCount} keys configured`);

  console.log('');
  console.log(c.brandBold('  Current Model'));
  printDivider();
  console.log(c.inactive('  Name:     ') + c.text(active.name));
  console.log(c.inactive('  Model:    ') + c.text(active.model));
  console.log(c.inactive('  Endpoint: ') + c.text(active.baseUrl));
  console.log(c.inactive('  API Keys: ') + keyDisplay);
  console.log(c.inactive('  Temp:     ') + c.text(String(active.temperature)));
  printDivider();

  // Subcommand hints
  console.log('');
  console.log(c.inactive('  Available commands:'));
  const cmds = [
    ['/model',          'Switch model (arrow keys)'],
    ['/model add',      'Create a new profile'],
    ['/model edit',     'Edit an existing profile'],
    ['/model remove',   'Remove a profile'],
    ['/model <name>',   'Quick-switch by name'],
  ];
  for (const [cmd, desc] of cmds) {
    console.log(c.brand(`    ${cmd!.padEnd(18)}`) + c.inactive(desc!));
  }
  console.log('');
}

// ─── Arrow-Key Model Picker ─────────────────────────────────────

/**
 * Render the model list with a cursor at the selected index.
 * Used internally by runModelPicker to redraw on each keypress.
 * @param models - All model profiles
 * @param activeId - ID of the current active profile
 * @param cursorIndex - Index of the cursor position
 * @param lineCount - Number of lines previously rendered (for clearing)
 * @returns Number of lines rendered
 */
function renderPickerList(
  models: ModelProfile[],
  activeId: string,
  cursorIndex: number,
  lineCount: number,
): number {
  // Move cursor up to overwrite previous render
  if (lineCount > 0) {
    process.stdout.write(`\x1b[${lineCount}A`);
  }

  let lines = 0;

  for (let i = 0; i < models.length; i++) {
    const m = models[i]!;
    const isActive = m.id === activeId;
    const isCursor = i === cursorIndex;

    // Cursor indicator: ❯ for selected, space otherwise
    const cursor = isCursor ? c.brand(` ${TOOL_ARROW} `) : '   ';
    // Active indicator: ✓ for the currently active model
    const activeMarker = isActive ? c.success(` ${CHECKMARK}`) : '  ';

    // Name styling — highlighted when cursor is on it
    const name = isCursor ? c.text(m.name) : c.inactive(m.name);
    const model = c.subtle(` (${m.model})`);

    // Clear line before writing to avoid leftover characters
    process.stdout.write('\x1b[2K');
    console.log(`  ${cursor}${name}${model}${activeMarker}`);
    lines++;
  }

  return lines;
}

/**
 * Interactive model picker navigated with arrow keys.
 * Up/Down to move, Enter to confirm, Escape to cancel.
 * @param models - All saved model profiles
 * @param activeId - ID of the currently active profile
 * @returns Selected model ID, or null if cancelled
 */
export function runModelPicker(
  models: ModelProfile[],
  activeId: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (models.length === 0) {
      resolve(null);
      return;
    }

    // Start cursor on the currently active model
    let cursorIndex = models.findIndex(m => m.id === activeId);
    if (cursorIndex === -1) cursorIndex = 0;

    // Header
    console.log('');
    console.log(c.brandBold('  Switch Model'));
    printDivider();
    console.log(c.inactive('  Use ↑↓ to navigate, Enter to select, Esc to cancel'));
    console.log('');

    // Initial render
    let lineCount = renderPickerList(models, activeId, cursorIndex, 0);

    // Enable raw mode to capture individual keypresses
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasRaw ?? false);
      }
      // Print a blank line after the picker
      console.log('');
    };

    const onData = (data: Buffer) => {
      const key = data.toString();

      // Escape (0x1b alone, not followed by [ which would be an arrow key)
      if (data.length === 1 && data[0] === 0x1b) {
        cleanup();
        resolve(null);
        return;
      }

      // Ctrl+C
      if (data.length === 1 && data[0] === 0x03) {
        cleanup();
        resolve(null);
        return;
      }

      // Enter / Return
      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(models[cursorIndex]!.id);
        return;
      }

      // Arrow keys: ESC [ A (up), ESC [ B (down)
      if (key === '\x1b[A') {
        // Up arrow
        cursorIndex = (cursorIndex - 1 + models.length) % models.length;
        lineCount = renderPickerList(models, activeId, cursorIndex, lineCount);
        return;
      }

      if (key === '\x1b[B') {
        // Down arrow
        cursorIndex = (cursorIndex + 1) % models.length;
        lineCount = renderPickerList(models, activeId, cursorIndex, lineCount);
        return;
      }

      // j/k vim-style navigation
      if (key === 'j') {
        cursorIndex = (cursorIndex + 1) % models.length;
        lineCount = renderPickerList(models, activeId, cursorIndex, lineCount);
        return;
      }

      if (key === 'k') {
        cursorIndex = (cursorIndex - 1 + models.length) % models.length;
        lineCount = renderPickerList(models, activeId, cursorIndex, lineCount);
        return;
      }
    };

    process.stdin.on('data', onData);
  });
}

// ─── Model Creator ───────────────────────────────────────────────

/**
 * Interactive prompt to create a new model profile from scratch.
 * Guides the user through each field with sensible defaults.
 * @returns A new profile object without an ID (caller assigns one)
 */
export async function runModelCreator(): Promise<Omit<ModelProfile, 'id'> | null> {
  console.log('');
  console.log(c.brandBold('  Create New Model'));
  printDivider();
  console.log('');

  // Profile name (required)
  const name = await ask(c.brand('  Profile name: '));
  if (!name) {
    console.log(c.inactive('  Cancelled.'));
    return null;
  }

  // API base URL
  console.log(c.inactive('  Default: https://api.openai.com/v1'));
  const baseUrl = await ask(c.brand('  API Endpoint: '));

  // Model identifier
  console.log(c.inactive('  Default: gpt-5'));
  const model = await ask(c.brand('  Model name: '));

  // API keys — support comma-separated for multiple keys
  console.log(c.inactive('  Tip: Enter multiple keys separated by commas for automatic rotation.'));
  const apiKeyInput = await ask(c.brand('  API Key(s): '));
  const apiKeys = apiKeyInput
    ? apiKeyInput.split(',').map(k => k.trim()).filter(Boolean)
    : ['sk-your-api-key-here'];

  // Temperature
  console.log(c.inactive('  Default: 0 (range 0-2)'));
  const tempStr = await ask(c.brand('  Temperature: '));
  let temperature = 0;
  if (tempStr) {
    const parsed = parseFloat(tempStr);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
      temperature = parsed;
    }
  }

  return {
    name,
    apiKeys,
    baseUrl: baseUrl || 'https://api.openai.com/v1',
    model: model || 'gpt-5',
    temperature,
  };
}

// ─── Model Editor ────────────────────────────────────────────────

/**
 * Interactive field-by-field editor for an existing model profile.
 * Shows current values and lets the user override each one (Enter to keep).
 * @param profile - The profile to edit
 * @returns Updated profile (same ID)
 */
export async function runModelEditor(profile: ModelProfile): Promise<ModelProfile> {
  console.log('');
  console.log(c.brandBold(`  Editing: ${profile.name}`));
  printDivider();
  console.log(c.inactive('  Press Enter to keep current value.'));
  console.log('');

  // Profile name
  console.log(c.inactive('  Current name: ') + c.text(profile.name));
  const newName = await ask(c.brand('  Name: '));
  if (newName) profile.name = newName;

  // API endpoint
  console.log(c.inactive('  Current endpoint: ') + c.text(profile.baseUrl));
  const newUrl = await ask(c.brand('  Endpoint: '));
  if (newUrl) profile.baseUrl = newUrl;

  // Model identifier
  console.log(c.inactive('  Current model: ') + c.text(profile.model));
  const newModel = await ask(c.brand('  Model: '));
  if (newModel) profile.model = newModel;

  // API keys — show count and masked values
  const keyCount = profile.apiKeys.length;
  if (keyCount === 1) {
    const maskedKey = profile.apiKeys[0] !== 'sk-your-api-key-here'
      ? '***' + profile.apiKeys[0]!.slice(-4)
      : c.warning('not set');
    console.log(c.inactive('  Current API Key: ') + maskedKey);
  } else {
    const maskedKeys = profile.apiKeys.map(k => '***' + k.slice(-4)).join(', ');
    console.log(c.inactive(`  Current API Keys (${keyCount}): `) + maskedKeys);
  }
  console.log(c.inactive('  Tip: Enter multiple keys separated by commas for automatic rotation.'));
  const newKeyInput = await ask(c.brand('  API Key(s): '));
  if (newKeyInput) {
    profile.apiKeys = newKeyInput.split(',').map(k => k.trim()).filter(Boolean);
  }

  // Temperature
  console.log(c.inactive('  Current temperature: ') + c.text(String(profile.temperature)));
  const newTemp = await ask(c.brand('  Temperature: '));
  if (newTemp) {
    const parsed = parseFloat(newTemp);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
      profile.temperature = parsed;
    }
  }

  return profile;
}

// ─── Arrow-Key Picker for Edit/Remove ────────────────────────────

/**
 * Arrow-key navigable picker for selecting a model to edit or remove.
 * @param models - All saved model profiles
 * @param action - Description of the action (e.g. "edit", "remove")
 * @returns Selected model ID, or null if cancelled
 */
export function pickModelForAction(
  models: ModelProfile[],
  action: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (models.length === 0) {
      resolve(null);
      return;
    }

    let cursorIndex = 0;

    // Header
    console.log('');
    console.log(c.brandBold(`  Select model to ${action}`));
    printDivider();
    console.log(c.inactive('  Use ↑↓ to navigate, Enter to select, Esc to cancel'));
    console.log('');

    // Render a simpler list (just name + model)
    const renderList = (prevLines: number): number => {
      if (prevLines > 0) {
        process.stdout.write(`\x1b[${prevLines}A`);
      }

      for (let i = 0; i < models.length; i++) {
        const m = models[i]!;
        const isCursor = i === cursorIndex;
        const cursor = isCursor ? c.brand(` ${TOOL_ARROW} `) : '   ';
        const name = isCursor ? c.text(m.name) : c.inactive(m.name);
        const model = c.subtle(` (${m.model})`);

        process.stdout.write('\x1b[2K');
        console.log(`  ${cursor}${name}${model}`);
      }

      return models.length;
    };

    let lineCount = renderList(0);

    // Enable raw mode
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasRaw ?? false);
      }
      console.log('');
    };

    const onData = (data: Buffer) => {
      const key = data.toString();

      // Escape
      if (data.length === 1 && data[0] === 0x1b) {
        cleanup();
        resolve(null);
        return;
      }

      // Ctrl+C
      if (data.length === 1 && data[0] === 0x03) {
        cleanup();
        resolve(null);
        return;
      }

      // Enter
      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(models[cursorIndex]!.id);
        return;
      }

      // Arrow up / k
      if (key === '\x1b[A' || key === 'k') {
        cursorIndex = (cursorIndex - 1 + models.length) % models.length;
        lineCount = renderList(lineCount);
        return;
      }

      // Arrow down / j
      if (key === '\x1b[B' || key === 'j') {
        cursorIndex = (cursorIndex + 1) % models.length;
        lineCount = renderList(lineCount);
        return;
      }
    };

    process.stdin.on('data', onData);
  });
}
