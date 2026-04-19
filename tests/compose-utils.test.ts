import { describe, expect, it } from 'vitest';
import { createComposeState, handleComposeInput } from '../src/utils/compose.js';

describe('compose utilities', () => {
  /**
   * Ensures the factory returns a clean inactive compose state.
   */
  it('creates an initial compose state', () => {
    const state = createComposeState();
    expect(state.active).toBe(false);
    expect(state.lines).toEqual([]);
  });

  /**
   * Ensures normal mode passes input through unchanged.
   */
  it('submits input directly when compose mode is inactive', () => {
    const state = createComposeState();
    const result = handleComposeInput('hello', state);
    expect(result).toEqual({ kind: 'submit', value: 'hello' });
  });

  /**
   * Ensures compose mode buffers lines until an explicit send command.
   */
  it('buffers lines and submits full draft on /send', () => {
    const state = createComposeState();
    state.active = true;

    expect(handleComposeInput('line one', state)).toEqual({ kind: 'continue' });
    expect(handleComposeInput('line two', state)).toEqual({ kind: 'continue' });
    expect(handleComposeInput('/send', state)).toEqual({
      kind: 'submit',
      value: 'line one\nline two',
    });
    expect(state.active).toBe(false);
    expect(state.lines).toEqual([]);
  });

  /**
   * Ensures cancel exits compose mode and clears draft content.
   */
  it('clears draft and exits on /cancel', () => {
    const state = createComposeState();
    state.active = true;
    state.lines = ['draft line'];

    const result = handleComposeInput('/cancel', state);
    expect(result).toEqual({ kind: 'continue' });
    expect(state.active).toBe(false);
    expect(state.lines).toEqual([]);
  });

  /**
   * Ensures empty drafts do not submit accidental blank prompts.
   */
  it('returns continue when /send is used with empty draft', () => {
    const state = createComposeState();
    state.active = true;

    const result = handleComposeInput('/send', state);
    expect(result).toEqual({ kind: 'continue' });
    expect(state.active).toBe(false);
    expect(state.lines).toEqual([]);
  });
});
