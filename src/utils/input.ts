// Escape-aware input utilities for interactive prompts
// Provides readline wrappers that cancel on Escape keypress

import readline from 'readline';

/** Sentinel error thrown when the user presses Escape to cancel */
export class EscapeCancelledError extends Error {
  constructor() {
    super('Cancelled by user (Escape)');
    this.name = 'EscapeCancelledError';
  }
}

/**
 * Prompt the user for input with Escape-to-cancel support.
 * Listens for raw Escape keypress (0x1b) alongside normal readline input.
 * @param prompt - The prompt string to display
 * @returns The user's trimmed answer
 * @throws EscapeCancelledError if the user presses Escape
 */
export function askWithEscape(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Listen for Escape key — readline emits 'keypress' events when terminal is true
    const onKeypress = (_char: string, key: readline.Key) => {
      if (key && key.name === 'escape') {
        cleanup();
        reject(new EscapeCancelledError());
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      rl.close();
    };

    // readline enables keypress events on stdin when terminal: true
    process.stdin.on('keypress', onKeypress);

    rl.question(prompt, (answer) => {
      cleanup();
      resolve(answer.trim());
    });

    // Also reject if stdin is closed unexpectedly
    rl.once('close', () => {
      process.stdin.removeListener('keypress', onKeypress);
    });
  });
}

/**
 * Set up a raw Escape key listener that calls a callback when pressed.
 * Returns a cleanup function to remove the listener.
 * Used during streaming to cancel the agent's generation.
 * @param onEscape - Callback invoked when Escape is pressed
 * @returns Cleanup function to stop listening
 */
export function listenForEscape(onEscape: () => void): () => void {
  const wasRaw = process.stdin.isRaw;

  // Enable raw mode to intercept individual keypresses
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  const onData = (data: Buffer) => {
    // Escape key is byte 0x1b (27) — only trigger on bare Escape, not arrow keys
    // Arrow keys send 0x1b followed by more bytes, so check for single byte
    if (data.length === 1 && data[0] === 0x1b) {
      cleanup();
      onEscape();
    }
  };

  const cleanup = () => {
    process.stdin.removeListener('data', onData);
    // Restore previous raw mode state
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(wasRaw ?? false);
    }
  };

  process.stdin.on('data', onData);

  return cleanup;
}
