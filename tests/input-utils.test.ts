import { describe, expect, it } from 'vitest';
import { mergeQuestionAnswerWithCapturedLines } from '../src/utils/input.js';

describe('mergeQuestionAnswerWithCapturedLines', () => {
  /**
   * Ensures normal single-line input stays unchanged.
   */
  it('returns callback answer when no captured lines exist', () => {
    const result = mergeQuestionAnswerWithCapturedLines('hello', []);
    expect(result).toBe('hello');
  });

  /**
   * Ensures pasted multi-line content is preserved as one message.
   */
  it('joins captured lines when first line matches callback answer', () => {
    const result = mergeQuestionAnswerWithCapturedLines('line 1', ['line 1', 'line 2', 'line 3']);
    expect(result).toBe('line 1\nline 2\nline 3');
  });

  /**
   * Ensures we keep data even if callback/capture ordering desyncs.
   */
  it('falls back to prefixing callback answer on mismatch', () => {
    const result = mergeQuestionAnswerWithCapturedLines('first', ['second', 'third']);
    expect(result).toBe('first\nsecond\nthird');
  });
});
