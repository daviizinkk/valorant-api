/**
 * @file Custom error classes for the VALORANT API wrapper.
 * Provides descriptive, typed errors instead of generic {@link Error}.
 */

/**
 * Base error for all library-specific errors.
 */
export class ValorantError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.code]  Machine-readable error code
   * @param {number} [options.statusCode]  HTTP status code if applicable
   */
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code ?? null;
    this.statusCode = options.statusCode ?? null;
  }
}

/**
 * The Riot Client is not running or the lockfile cannot be found.
 */
export class RiotClientNotRunningError extends ValorantError {
  constructor(message = 'Riot Client is not running or cannot be located.') {
    super(message, { code: 'RIOT_CLIENT_NOT_RUNNING' });
  }
}

/**
 * The lockfile exists but could not be parsed.
 */
export class InvalidLockfileError extends ValorantError {
  constructor(message = 'Lockfile is malformed or unreadable.') {
    super(message, { code: 'INVALID_LOCKFILE' });
  }
}

/**
 * Authentication with the local Riot Client failed.
 */
export class AuthenticationError extends ValorantError {
  constructor(message = 'Failed to authenticate with the Riot Client.') {
    super(message, { code: 'AUTHENTICATION_FAILED' });
  }
}

/**
 * Token has expired and automatic refresh failed.
 */
export class TokenExpiredError extends AuthenticationError {
  constructor(message = 'Authentication tokens have expired and could not be refreshed.') {
    super(message, { code: 'TOKEN_EXPIRED' });
  }
}

/**
 * A network / fetch failure that is likely transient.
 */
export class NetworkError extends ValorantError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {Error} [options.cause]  The original error
   */
  constructor(message = 'A network error occurred.', options = {}) {
    super(message, { code: 'NETWORK_ERROR' });
    this.cause = options.cause ?? null;
  }
}

/**
 * HTTP 429 — rate limited by Riot's API.
 */
export class RateLimitError extends ValorantError {
  /**
   * @param {string} [message]
   * @param {object} [options]
   * @param {number} [options.retryAfter]  Seconds to wait before retrying
   */
  constructor(message = 'Rate limited by the VALORANT API.', options = {}) {
    super(message, { code: 'RATE_LIMITED', statusCode: 429 });
    this.retryAfter = options.retryAfter ?? null;
  }
}

/**
 * The VALORANT client returned an unexpected or malformed response.
 */
export class APIError extends ValorantError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {number} [options.statusCode]
   * @param {object} [options.body]  Raw response body
   */
  constructor(message, options = {}) {
    super(message, { code: 'API_ERROR', statusCode: options.statusCode });
    this.body = options.body ?? null;
  }
}

/**
 * Loadout-specific error (fetching or saving).
 */
export class LoadoutError extends ValorantError {
  constructor(message = 'Failed to process the player loadout.') {
    super(message, { code: 'LOADOUT_ERROR' });
  }
}

/**
 * Metadata lookup failed (valorant-api.com).
 */
export class MetadataError extends ValorantError {
  constructor(message = 'Failed to fetch or process metadata.') {
    super(message, { code: 'METADATA_ERROR' });
  }
}
