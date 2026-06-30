/**
 * @file Shared HTTP request layer for the VALORANT API.
 *
 * Every endpoint call goes through this module. It automatically:
 * - Prepends the correct base URL (PD or GLZ)
 * - Attaches all required headers (Auth, Entitlement, Client Version, Client Platform)
 * - Serializes / deserializes JSON
 * - Retries transient failures
 * - Auto-refreshes expired authentication on 401
 * - Throws descriptive errors
 */

import { request as httpsRequest } from 'node:https';

import { retry } from './retry.js';
import {
  AuthenticationError,
  NetworkError,
  RateLimitError,
  APIError,
} from '../errors.js';

/**
 * Client platform value (base64-encoded JSON).
 * Required by all PVP endpoints as the X-Riot-ClientPlatform header.
 *
 * @type {string}
 */
export const CLIENT_PLATFORM = Buffer.from(
  JSON.stringify({
    platformType: 'PC',
    platformOS: 'Windows',
    platformOSVersion: '10.0.19042.1.256.64bit',
    platformChipset: 'Unknown',
  })
).toString('base64');

/**
 * @typedef {object} RequestOptions
 * @property {'pd'|'glz'}         [type='pd']     Base URL type
 * @property {string}             [region]         Region (required for 'glz')
 * @property {string}             shard
 * @property {import('../auth/tokens.js').TokenStore} tokenStore
 * @property {string}             clientVersion
 * @property {number}             [timeout=15000]
 */

/**
 * Execute a PVP/PD/GLZ API request.
 *
 * @param {string}  method           HTTP method
 * @param {string}  path             URL path (e.g. "/personalization/v2/players/{puuid}/playerloadout")
 * @param {object}  [body]           Request body (for PUT/POST)
 * @param {RequestOptions}  options
 * @returns {Promise<object>}  Parsed response body
 */
export async function apiRequest(method, path, body, options) {
  const { type = 'pd', region, shard, tokenStore, clientVersion } = options;

  // Build the base URL
  let baseUrl;
  if (type === 'glz') {
    if (!region) {
      throw new Error('Region is required for GLZ endpoints.');
    }
    baseUrl = `https://glz-${region}-1.${shard}.a.pvp.net`;
  } else {
    baseUrl = `https://pd.${shard}.a.pvp.net`;
  }

  // We retry at most once on 401 to refresh tokens
  let refreshed = false;

  const doRequest = async () => {
    const tokens = await tokenStore.getTokens();

    const url = new URL(path, baseUrl);

    const requestHeaders = {
      Authorization: `Bearer ${tokens.accessToken}`,
      'X-Riot-Entitlements-JWT': tokens.entitlementToken,
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'X-Riot-ClientVersion': clientVersion,
    };
    if (body) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    const response = await rawRequest(method, url.toString(), {
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      timeout: options.timeout ?? 15000,
    });

    // Auto-refresh on 401 (expired token)
    if (response.statusCode === 401 && !refreshed) {
      refreshed = true;
      await tokenStore.refresh();
      return doRequest();
    }

    // Handle error status codes
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw buildError(response.statusCode, response.body, url.toString());
    }

    // Parse JSON response
    if (!response.body || response.body.length === 0) {
      return null;
    }

    try {
      return JSON.parse(response.body);
    } catch {
      throw new APIError(
        `Failed to parse response from ${method} ${path}: invalid JSON`,
        { statusCode: response.statusCode, body: response.body }
      );
    }
  };

  // Wrap in retry for transient failures (network, 5xx, 429)
  return retry(doRequest, {
    maxAttempts: 3,
    baseDelayMs: 1000,
    shouldRetry: (attempt, err) => {
      // Don't retry auth errors after refresh
      if (err instanceof AuthenticationError) {
        return false;
      }
      // Retry network errors, 5xx, and rate limits
      return (
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.statusCode === 429 ||
        (err.statusCode >= 500 && err.statusCode < 600)
      );
    },
  });
}

/**
 * Low-level HTTPS request.
 *
 * @param {string}  method
 * @param {string}  url
 * @param {object}  [opts]
 * @param {object}  [opts.headers]
 * @param {string}  [opts.body]
 * @param {number}  [opts.timeout]
 * @returns {Promise<{statusCode: number, body: string, headers: object}>}
 */
function rawRequest(method, url, opts = {}) {
  const urlObj = new URL(url);

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          ...opts.headers,
        },
        timeout: opts.timeout ?? 15000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = chunks.length
            ? Buffer.concat(chunks).toString('utf8')
            : '';
          resolve({
            statusCode: res.statusCode,
            body,
            headers: res.headers,
          });
        });
      }
    );

    req.on('error', (err) => {
      reject(new NetworkError(`Request to ${method} ${url} failed: ${err.message}`, { cause: err }));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new NetworkError(`Request to ${method} ${url} timed out.`));
    });

    if (opts.body) {
      req.write(opts.body);
    }

    req.end();
  });
}

/**
 * Build an appropriate error based on HTTP status code.
 *
 * @param {number}  statusCode
 * @param {string}  body
 * @param {string}  url
 * @returns {Error}
 */
function buildError(statusCode, body, url) {
  const message = `HTTP ${statusCode} for ${url}`;

  if (statusCode === 401) {
    return new AuthenticationError(`${message} — authentication failed.`);
  }
  if (statusCode === 403) {
    return new APIError(`${message} — forbidden.`, { statusCode, body });
  }
  if (statusCode === 429) {
    // Try to extract Retry-After header from the body or response
    let retryAfter = null;
    try {
      const parsed = JSON.parse(body);
      if (parsed.retryAfter) retryAfter = parsed.retryAfter;
    } catch {
      // ignore
    }
    return new RateLimitError(`${message} — rate limited.`, { retryAfter });
  }
  if (statusCode >= 500) {
    return new APIError(`${message} — server error.`, { statusCode, body });
  }

  return new APIError(`${message}`, { statusCode, body });
}
