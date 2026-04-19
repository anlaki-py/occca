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
 * This function ensures keypress events are emitted on stdin by calling
 * emitKeypressEvents() explicitly. This is necessary because during tool
 * execution (especially shell commands), readline may not be actively
 * processing input, and keypress events wouldn't otherwise be emitted.
 *
 * @param onEscape - Callback invoked when Escape is pressed
 * @returns Cleanup function to stop listening
 */
export function listenForEscape(onEscape: () => void): () => void {
  let cleaned = false;

  // Ensure keypress events are being emitted on stdin.
  // This is idempotent - calling it multiple times is safe.
  readline.emitKeypressEvents(process.stdin);

  // Save previous raw mode state so we can restore it
  const wasRaw = process.stdin.isRaw;

  // Set raw mode to capture escape key reliably during tool execution.
  // Without this, the terminal buffers input and escape sequences aren't
  // parsed correctly, especially when child processes might be involved.
  if (process.stdin.isTTY && !wasRaw) {
    process.stdin.setRawMode(true);
  }

  const onKeypress = (ch: string | undefined, key: { name?: string; sequence?: string } | undefined) => {
    // Handle both parsed key names and raw escape sequence for Windows terminals
    const isEscape = key?.name === 'escape' || key?.sequence === '\u001b' || ch === '\u001b';
    if (isEscape) {
      cleanup();
      onEscape();
    }
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    process.stdin.removeListener('keypress', onKeypress);

    // Restore previous raw mode state
    if (process.stdin.isTTY && wasRaw === false && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
  };

  process.stdin.on('keypress', onKeypress);

  return cleanup;
}

/**
 * Set up cancellation listeners that trigger on Escape or Ctrl+C.
 * Returns a cleanup function that removes both keypress and SIGINT hooks.
 *
 * @param onCancel - Callback invoked when cancellation keys are pressed
 * @returns Cleanup function to stop listening
 */
export function listenForCancellation(onCancel: () => void): () => void {
  let cleaned = false;

  // Ensure keypress events are available on stdin.
  readline.emitKeypressEvents(process.stdin);

  const wasRaw = process.stdin.isRaw;
  if (process.stdin.isTTY && !wasRaw) {
    process.stdin.setRawMode(true);
  }

  const onKeypress = (
    ch: string | undefined,
    key: { name?: string; sequence?: string; ctrl?: boolean } | undefined,
  ) => {
    const isEscape = key?.name === 'escape' || key?.sequence === '\u001b' || ch === '\u001b';
    const isCtrlC = key?.ctrl === true && key?.name === 'c';
    if (isEscape || isCtrlC) {
      cleanup();
      onCancel();
    }
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    process.stdin.removeListener('keypress', onKeypress);
    if (process.stdin.isTTY && wasRaw === false && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
  };

  process.stdin.on('keypress', onKeypress);
  return cleanup;
}

/**
 * Merge readline question callback answer with captured line events.
 * Readline emits the first submitted line in both places, and pasted
 * multi-line input may emit additional `line` events in the same burst.
 *
 * @param answer - The string provided by readline.question callback
 * @param capturedLines - All lines captured from readline's `line` events
 * @returns Single logical user message, preserving multi-line paste
 */
export function mergeQuestionAnswerWithCapturedLines(answer: string, capturedLines: string[]): string {
  if (capturedLines.length === 0) {
    return answer;
  }

  // Normal case: callback answer equals first captured line
  if (capturedLines[0] === answer) {
    return capturedLines.join('\n');
  }

  // Defensive fallback for desynced ordering in specific terminals
  return [answer, ...capturedLines].join('\n');
}