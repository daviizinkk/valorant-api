/**
 * @file Simple in-memory metadata cache with TTL.
 *
 * Metadata from valorant-api.com is cached in memory to avoid
 * redundant network requests. The cache is lazy — data is only
 * fetched when first requested.
 */

/**
 * Default TTL for cached metadata (24 hours).
 * @type {number}
 */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {object} CacheEntry
 * @property {any}       data
 * @property {number}    cachedAt
 * @property {number}    ttl
 */

/**
 * In-memory metadata cache.
 */
export class MetadataCache {
  constructor() {
    /** @type {Map<string, CacheEntry>} */
    this._store = new Map();
  }

  /**
   * Get a cached value.
   *
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > entry.ttl) {
      this._store.delete(key);
      return null;
    }
    return entry.data;
  }

  /**
   * Set a cached value.
   *
   * @param {string} key
   * @param {any}    data
   * @param {number} [ttl]
   */
  set(key, data, ttl = DEFAULT_TTL_MS) {
    this._store.set(key, { data, cachedAt: Date.now(), ttl });
  }

  /**
   * Clear all cached entries.
   */
  clear() {
    this._store.clear();
  }

  /**
   * Remove a specific entry.
   *
   * @param {string} key
   */
  invalidate(key) {
    this._store.delete(key);
  }
}
