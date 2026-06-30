/**
 * @file Token management — fetching and auto-refreshing authentication tokens
 * from the local Riot Client.
 */

import { localRequest } from './connect.js';
import { AuthenticationError } from '../errors.js';

/**
 * @typedef {object} TokenSet
 * @property {string} accessToken       Bearer token for Authorization header
 * @property {string} entitlementToken  Token for X-Riot-Entitlements-JWT header
 * @property {string} subject           Player UUID (PUUID)
 * @property {number} fetchedAt         Timestamp when tokens were fetched
 */

/**
 * Fetch tokens from the local Riot Client's entitlements endpoint.
 *
 * @param {number}  port     Lockfile port
 * @param {string}  password Lockfile password
 * @returns {Promise<TokenSet>}
 * @throws {AuthenticationError}
 */
export async function fetchTokens(port, password) {
  const basic = Buffer.from(`riot:${password}`).toString('base64');

  const res = await localRequest({
    port,
    path: '/entitlements/v1/token',
    headers: {
      Authorization: `Basic ${basic}`,
    },
  });

  if (res.statusCode !== 200) {
    throw new AuthenticationError(
      `Local entitlements endpoint returned HTTP ${res.statusCode}`
    );
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new AuthenticationError('Failed to parse tokens response from local Riot Client.');
  }

  if (!data.accessToken || !data.token || !data.subject) {
    throw new AuthenticationError(
      'Tokens response missing required fields (accessToken, token, subject).'
    );
  }

  return {
    accessToken: data.accessToken,
    entitlementToken: data.token,
    subject: data.subject,
    fetchedAt: Date.now(),
  };
}

/**
 * Lightweight token cache that auto-refreshes when tokens are about to expire.
 *
 * Riot tokens typically last ~1 hour. We refresh preemptively.
 */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
const TOKEN_LIFETIME_MS = 55 * 60 * 1000; // Assume ~55 min lifetime

/**
 * Token store with automatic refresh.
 */
export class TokenStore {
  /**
   * @param {() => Promise<TokenSet>} fetcher  Async function to fetch fresh tokens
   */
  constructor(fetcher) {
    this._fetcher = fetcher;
    /** @type {TokenSet|null} */
    this._tokens = null;
    this._fetchPromise = null;
  }

  /**
   * Get valid tokens, refreshing if necessary.
   *
   * @returns {Promise<TokenSet>}
   */
  async getTokens() {
    const tokens = this._tokens;

    if (tokens && (Date.now() - tokens.fetchedAt) < (TOKEN_LIFETIME_MS - TOKEN_REFRESH_BUFFER_MS)) {
      return tokens;
    }

    return this._refresh();
  }

  /**
   * Force a refresh (used when we get a 401).
   *
   * @returns {Promise<TokenSet>}
   */
  async refresh() {
    return this._refresh();
  }

  /**
   * Invalidate cached tokens (forces next call to refresh).
   */
  invalidate() {
    this._tokens = null;
  }

  /**
   * @returns {Promise<TokenSet>}
   */
  async _refresh() {
    // Deduplicate concurrent refresh calls
    if (!this._fetchPromise) {
      this._fetchPromise = this._fetcher()
        .then((tokens) => {
          this._tokens = tokens;
          return tokens;
        })
        .finally(() => {
          this._fetchPromise = null;
        });
    }

    return this._fetchPromise;
  }
}
