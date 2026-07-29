/**
 * @file Determine the current Riot Client / VALORANT version.
 *
 * The client version is required in the `X-Riot-ClientVersion` header
 * for all PVP/PD endpoints. We obtain it from the local sessions endpoint
 * (when the game is running) or fall back to the ShooterGame log.
 */

import { readFileSync, existsSync } from 'node:fs';
import { localRequest } from './connect.js';

/**
 * Version cache — persists across calls so we don't re-read the log every time.
 * @type {string|null}
 */
let cachedVersion = null;

/**
 * Fetch the current client version.
 *
 * Strategy:
 * 1. Try the sessions endpoint (needs VALORANT running)
 * 2. Fall back to parsing the ShooterGame log (needs VALORANT launched at least once)
 * 3. Use last known cached version
 *
 * @param {number}  port     Lockfile port
 * @param {string}  password Lockfile password
 * @returns {Promise<string>}
 */
export async function fetchClientVersion(port, password) {
  // 1. Try the sessions endpoint first
  try {
    const basic = Buffer.from(`riot:${password}`).toString('base64');

    const res = await localRequest({
      port,
      path: '/product-session/v1/external-sessions',
      headers: { Authorization: `Basic ${basic}` },
    });

    if (res.statusCode === 200) {
      const data = JSON.parse(res.body);
      for (const session of Object.values(data)) {
        if (session.productId?.toLowerCase() === 'valorant' && session.version) {
          cachedVersion = session.version;
          return session.version;
        }
      }
    }
  } catch {
    // Fall through to fallback
  }

  // 2. Try reading from ShooterGame.log (cached version string)
  if (!cachedVersion) {
    try {
      const logPath = `${process.env.LOCALAPPDATA}\\VALORANT\\Saved\\Logs\\ShooterGame.log`;
      if (existsSync(logPath)) {
        const log = readFileSync(logPath, 'utf8');
        // Pattern: version=13.02.00.5092570 or similar
        const match = log.match(/version=(\d+\.\d+\.\d+\.\d+)/);
        if (match) {
          cachedVersion = match[1];
        } else {
          // Try the Riot Client deploy version format
          const deployMatch = log.match(/deploy-version[=:]\s*(\S+)/i);
          if (deployMatch) cachedVersion = deployMatch[1];
        }
      }
    } catch {
      // Fall through
    }
  }

  // 3. Use cached version if available
  if (cachedVersion) {
    return cachedVersion;
  }

  throw new Error(
    'Could not determine client version. Please launch VALORANT at least once and try again.'
  );
}
