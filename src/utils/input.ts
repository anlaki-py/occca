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
 * Creates a temporary readline for the prompt, listens for Escape via
 * the 'keypress' event (which readline enables on stdin automatically).
 *
 * CRITICAL: Saves and restores existing keypress listeners to avoid
 * breaking the main readline's input handling after this temporary
 * readline closes. Without this, the main REPL would hang after
 * interactive prompts like /model add.
 *
 * @param prompt - The prompt string to display
 * @returns The user's trimmed answer
 * @throws EscapeCancelledError if the user presses Escape
 */
export function askWithEscape(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Save existing keypress listeners BEFORE removing them.
    // This is critical for not breaking the main readline's state.
    const savedKeypressListeners = process.stdin.rawListeners('keypress') as Function[];
    process.stdin.removeAllListeners('keypress');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    let cleaned = false;

    // Escape detection via readline's own 'keypress' pipeline
    const onKeypress = (_char: string, key: readline.Key) => {
      if (key && key.name === 'escape') {
        cleanup();
        reject(new EscapeCancelledError());
      }
    };

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      process.stdin.removeListener('keypress', onKeypress);
      rl.close();
      // Restore all previously saved keypress listeners so the main
      // readline can continue functioning after this prompt finishes.
      for (const listener of savedKeypressListeners) {
        process.stdin.on('keypress', listener as (...args: any[]) => void);
      }
    };

    // readline enables keypress events on stdin when terminal: true
    process.stdin.on('keypress', onKeypress);

    rl.question(prompt, (answer) => {
      cleanup();
      resolve(answer.trim());
    });

    // Also clean up if stdin is closed unexpectedly
    rl.once('close', () => {
      cleanup();
    });
  });
}

/**
 * Set up an Escape key listener that calls a callback when pressed.
 * Returns a cleanup function to remove the listener.
 *
 * CRITICAL DESIGN: This function MUST NOT touch process.stdin directly
 * (no setRawMode, no resume/pause, no 'data' listeners). All of those
 * interfere with readline's internal stream management on Windows and
 * cause the event loop to drain, silently killing the process.
 *
 * Instead, we listen for 'keypress' events which readline's
 * emitKeypressEvents() pipeline already emits on stdin. This works
 * _with_ readline rather than against it.
 *
 * @param onEscape - Callback invoked when Escape is pressed
 * @returns Cleanup function to stop listening
 */
export function listenForEscape(onEscape: () => void): () => void {
  let cleaned = false;

  // Use the 'keypress' event that readline has already set up on stdin.
  // This avoids ANY direct manipulation of stdin's raw mode or flow state.
  const onKeypress = (_ch: string | undefined, key: { name?: string } | undefined) => {
    if (key && key.name === 'escape') {
      cleanup();
      onEscape();
    }
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    process.stdin.removeListener('keypress', onKeypress);
  };

  process.stdin.on('keypress', onKeypress);

  return cleanup;
}