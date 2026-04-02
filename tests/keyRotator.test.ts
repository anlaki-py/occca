// Tests for the KeyRotator — key rotation, cooldown, edge cases

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeyRotator } from '../src/utils/keyRotator.js';

describe('KeyRotator', () => {
  // ─── Constructor & Basic Accessors ───────────────────────────

  it('should return the first key as the current key', () => {
    const rotator = new KeyRotator(['key-a', 'key-b', 'key-c']);
    expect(rotator.getCurrentKey()).toBe('key-a');
  });

  it('should report hasAlternativeKeys correctly', () => {
    expect(new KeyRotator(['key-a']).hasAlternativeKeys()).toBe(false);
    expect(new KeyRotator(['key-a', 'key-b']).hasAlternativeKeys()).toBe(true);
  });

  it('should report correct key count', () => {
    expect(new KeyRotator(['a', 'b', 'c']).getKeyCount()).toBe(3);
    expect(new KeyRotator(['a']).getKeyCount()).toBe(1);
  });

  // ─── Rotation ────────────────────────────────────────────────

  it('should rotate to the next key when current is rate-limited', () => {
    const rotator = new KeyRotator(['key-a', 'key-b', 'key-c']);

    // Mark current key (key-a) as rate-limited
    rotator.markRateLimited('key-a');

    // Rotate should skip key-a and return key-b
    const next = rotator.rotate();
    expect(next).toBe('key-b');
    expect(rotator.getCurrentKey()).toBe('key-b');
  });

  it('should wrap around when rotating past the last key', () => {
    const rotator = new KeyRotator(['key-a', 'key-b', 'key-c']);

    // Manually set to the last key by marking first two and rotating
    rotator.markRateLimited('key-a');
    rotator.markRateLimited('key-b');
    const next = rotator.rotate();
    expect(next).toBe('key-c');

    // Now mark key-c and let cooldowns expire for key-a
    rotator.resetKey('key-a');
    rotator.markRateLimited('key-c');
    const wrapped = rotator.rotate();
    expect(wrapped).toBe('key-a');
  });

  it('should return null when all keys are rate-limited', () => {
    const rotator = new KeyRotator(['key-a', 'key-b']);

    rotator.markRateLimited('key-a');
    rotator.markRateLimited('key-b');

    const result = rotator.rotate();
    expect(result).toBeNull();
  });

  it('should return null for single-key rotation (no alternatives)', () => {
    const rotator = new KeyRotator(['solo-key']);

    rotator.markRateLimited('solo-key');

    // Even though there's one key, it's marked so rotate returns null
    const result = rotator.rotate();
    expect(result).toBeNull();
  });

  // ─── Cooldown Expiry ─────────────────────────────────────────

  it('should make a key available again after cooldown expires', () => {
    vi.useFakeTimers();

    const rotator = new KeyRotator(['key-a', 'key-b']);

    rotator.markRateLimited('key-a');
    rotator.markRateLimited('key-b');

    // Both rate-limited → null
    expect(rotator.rotate()).toBeNull();

    // Advance time past the 60s cooldown
    vi.advanceTimersByTime(61_000);

    // Now key-b (next after current index) should be available
    const recovered = rotator.rotate();
    expect(recovered).toBe('key-b');

    vi.useRealTimers();
  });

  it('should not make a key available before cooldown expires', () => {
    vi.useFakeTimers();

    const rotator = new KeyRotator(['key-a', 'key-b']);

    rotator.markRateLimited('key-a');
    rotator.markRateLimited('key-b');

    // Advance only 30s — still in cooldown
    vi.advanceTimersByTime(30_000);

    expect(rotator.rotate()).toBeNull();

    vi.useRealTimers();
  });

  // ─── resetKey ────────────────────────────────────────────────

  it('should manually reset a rate-limited key', () => {
    const rotator = new KeyRotator(['key-a', 'key-b']);

    rotator.markRateLimited('key-a');
    rotator.markRateLimited('key-b');

    // Reset key-a manually
    rotator.resetKey('key-a');

    // key-a should now be available
    const result = rotator.rotate();
    expect(result).toBe('key-a');
  });

  // ─── updateKeys ──────────────────────────────────────────────

  it('should update the key pool while preserving existing state', () => {
    const rotator = new KeyRotator(['key-a', 'key-b']);
    rotator.markRateLimited('key-a');

    // Update pool: keep key-a (rate-limited), add key-c
    rotator.updateKeys(['key-a', 'key-c']);

    expect(rotator.getKeyCount()).toBe(2);
    // key-a is still rate-limited, so rotate should pick key-c
    const next = rotator.rotate();
    expect(next).toBe('key-c');
  });

  it('should clamp currentIndex when pool shrinks', () => {
    const rotator = new KeyRotator(['key-a', 'key-b', 'key-c']);

    // Move to key-c by marking a and b then rotating
    rotator.markRateLimited('key-a');
    rotator.markRateLimited('key-b');
    rotator.rotate(); // should be at key-c (index 2)

    // Shrink pool to just key-a
    rotator.updateKeys(['key-a']);
    expect(rotator.getCurrentKey()).toBe('key-a');
    expect(rotator.getKeyCount()).toBe(1);
  });

  it('should clean state for removed keys during updateKeys', () => {
    const rotator = new KeyRotator(['key-a', 'key-b']);
    rotator.markRateLimited('key-b');

    // Replace key-b with key-c (key-b's state should not carry over)
    rotator.updateKeys(['key-a', 'key-c']);

    // key-c should be healthy since it's new
    rotator.markRateLimited('key-a');
    const next = rotator.rotate();
    expect(next).toBe('key-c');
  });
});
