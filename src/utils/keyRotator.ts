// Key rotation engine — manages multiple API keys with rate-limit tracking
// Provides transparent key switching when one key hits a rate limit

/** How long (ms) a key stays in cooldown after being rate-limited */
const RATE_LIMIT_COOLDOWN_MS = 60_000;

/** Per-key rate-limit state */
interface KeyState {
  key: string;
  /** Timestamp when this key was marked rate-limited, or null if healthy */
  rateLimitedAt: number | null;
}

/**
 * Manages a pool of API keys, rotating to the next available key
 * when the current one hits a rate limit. Keys enter a 60-second
 * cooldown after being flagged, then become eligible again.
 */
export class KeyRotator {
  private keys: KeyState[];
  private currentIndex: number;

  /**
   * @param apiKeys - Array of API key strings to rotate through
   */
  constructor(apiKeys: string[]) {
    this.keys = apiKeys.map(key => ({ key, rateLimitedAt: null }));
    this.currentIndex = 0;
  }

  /**
   * Get the currently active API key.
   * @returns The API key string at the current index
   */
  getCurrentKey(): string {
    return this.keys[this.currentIndex]!.key;
  }

  /**
   * Check whether there are multiple keys available for rotation.
   * @returns true if the pool has more than one key
   */
  hasAlternativeKeys(): boolean {
    return this.keys.length > 1;
  }

  /**
   * Mark the given key as rate-limited (sets a cooldown timestamp).
   * @param key - The API key string that was rate-limited
   */
  markRateLimited(key: string): void {
    const state = this.keys.find(k => k.key === key);
    if (state) {
      state.rateLimitedAt = Date.now();
    }
  }

  /**
   * Try to rotate to the next non-rate-limited key.
   * Checks all keys in round-robin order, skipping any still in cooldown.
   * @returns The new active key string, or null if all keys are rate-limited
   */
  rotate(): string | null {
    const now = Date.now();

    // Try each key starting from the one after the current
    for (let offset = 1; offset <= this.keys.length; offset++) {
      const index = (this.currentIndex + offset) % this.keys.length;
      const state = this.keys[index]!;

      // Key is healthy — use it
      if (state.rateLimitedAt === null) {
        this.currentIndex = index;
        return state.key;
      }

      // Key's cooldown has expired — reset and use it
      if (now - state.rateLimitedAt >= RATE_LIMIT_COOLDOWN_MS) {
        state.rateLimitedAt = null;
        this.currentIndex = index;
        return state.key;
      }
    }

    // All keys are still rate-limited
    return null;
  }

  /**
   * Manually reset a specific key's rate-limit state.
   * @param key - The API key string to un-flag
   */
  resetKey(key: string): void {
    const state = this.keys.find(k => k.key === key);
    if (state) {
      state.rateLimitedAt = null;
    }
  }

  /**
   * Hot-update the key pool (e.g. after /config changes).
   * Preserves rate-limit state for keys that still exist.
   * @param apiKeys - New set of API key strings
   */
  updateKeys(apiKeys: string[]): void {
    // Build a map of existing rate-limit state keyed by the key string
    const existingState = new Map(this.keys.map(k => [k.key, k.rateLimitedAt]));

    this.keys = apiKeys.map(key => ({
      key,
      rateLimitedAt: existingState.get(key) ?? null,
    }));

    // Clamp current index if the pool shrank
    if (this.currentIndex >= this.keys.length) {
      this.currentIndex = 0;
    }
  }

  /** @returns Total number of keys in the pool */
  getKeyCount(): number {
    return this.keys.length;
  }
}
