/**
 * @file Low-level HTTPS requests to the local Riot Client.
 * Handles the self-signed certificate and basic auth.
 */

import { request as httpsRequest } from 'node:https';

import { Agent } from 'node:https';

/**
 * @param {import('node:https').AgentOptions} [options]
 * @returns {import('node:https').Agent}
 */
function createLocalAgent(options = {}) {
  return new Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    keepAliveMsecs: 3000,
    ...options,
  });
}

/**
 * Make an HTTPS request to the local Riot Client.
 *
 * @param {object}  options
 * @param {string}  options.hostname  Defaults to '127.0.0.1'
 * @param {number}  options.port      Lockfile port
 * @param {string}  options.path      URL path (e.g. "/entitlements/v1/token")
 * @param {string}  [options.method]  HTTP method (default "GET")
 * @param {object}  [options.headers] Extra headers
 * @param {string}  [options.body]    Request body (for POST/PUT)
 * @returns {Promise<{statusCode: number, body: string, headers: object}>}
 */
export function localRequest(options) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: options.hostname || '127.0.0.1',
        port: options.port,
        path: options.path,
        method: options.method || 'GET',
        headers: {
          ...options.headers,
        },
        agent: createLocalAgent(),
        timeout: 10000,
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

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Local request timed out'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}
