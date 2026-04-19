// Compose mode utilities for multiline input drafting in REPL.

/**
 * State container for compose-mode draft input.
 */
export type ComposeState = {
  active: boolean;
  lines: string[];
};

/**
 * Factory helper for a clean compose state object.
 * @returns Initial inactive compose state with empty draft buffer
 */
export function createComposeState(): ComposeState {
  return {
    active: false,
    lines: [],
  };
}

/**
 * Handle compose-mode line collection and control commands.
 * `/send` submits accumulated lines as one message and exits compose mode.
 * `/cancel` discards the draft and exits compose mode.
 *
 * @param input - Raw user input for the current prompt iteration
 * @param state - Current compose-mode state
 * @returns Action describing whether to continue waiting or submit
 */
export function handleComposeInput(
  input: string,
  state: ComposeState,
): { kind: 'continue' } | { kind: 'submit'; value: string } {
  if (!state.active) {
    return { kind: 'submit', value: input };
  }

  const trimmed = input.trim().toLowerCase();
  if (trimmed === '/cancel') {
    state.active = false;
    state.lines = [];
    return { kind: 'continue' };
  }

  if (trimmed === '/send') {
    const draft = state.lines.join('\n').trim();
    state.active = false;
    state.lines = [];
    if (!draft) {
      return { kind: 'continue' };
    }
    return { kind: 'submit', value: draft };
  }

  state.lines.push(input);
  return { kind: 'continue' };
}
