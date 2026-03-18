/**
 * In-Memory TTL Cache
 * Reduces Google Sheets API calls for frequently-read data.
 * Default TTL: 60 seconds.
 */

export class TTLCache {
  constructor(defaultTtlMs = 60_000) {
    this.store = new Map();
    this.defaultTtl = defaultTtlMs;
  }

  /**
   * Get a cached value, or null if expired/missing.
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set a value with optional TTL override.
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlMs]
   */
  set(key, value, ttlMs) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTtl),
    });
  }

  /**
   * Invalidate a specific key or all keys matching a prefix.
   * @param {string} keyOrPrefix
   */
  invalidate(keyOrPrefix) {
    if (this.store.has(keyOrPrefix)) {
      this.store.delete(keyOrPrefix);
      return;
    }
    // Prefix invalidation
    for (const key of this.store.keys()) {
      if (key.startsWith(keyOrPrefix)) {
        this.store.delete(key);
      }
    }
  }

  /** Clear all cached entries. */
  clear() {
    this.store.clear();
  }
}

// Shared singleton cache for Sheets operations
export const sheetsCache = new TTLCache(60_000);

export default { TTLCache, sheetsCache };
