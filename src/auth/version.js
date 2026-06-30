/**
 * @file Determine the current Riot Client / VALORANT version.
 *
 * The client version is required in the `X-Riot-ClientVersion` header
 * for all PVP/PD endpoints. We obtain it from the local sessions endpoint.
 */

import { localRequest } from './connect.js';

/**
 * Fetch the current client version from the local sessions endpoint.
 *
 * The sessions endpoint returns a map keyed by process name.
 * We look for "valorant" (case-insensitive) and grab its version field.
 *
 * @param {number}  port     Lockfile port
 * @param {string}  password Lockfile password
 * @returns {Promise<string>}  Client version string (e.g. "release-08.06-2345678")
 */
export async function fetchClientVersion(port, password) {
  const basic = Buffer.from(`riot:${password}`).toString('base64');

  const res = await localRequest({
    port,
    path: '/product-session/v1/external-sessions',
    headers: {
      Authorization: `Basic ${basic}`,
    },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Sessions endpoint returned HTTP ${res.statusCode}`);
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new Error('Failed to parse sessions response.');
  }

  // Iterate over sessions to find the VALORANT game process
  for (const session of Object.values(data)) {
    if (session.productId?.toLowerCase() === 'valorant') {
      if (session.version) {
        return session.version;
      }
    }
  }

  // Fallback: try any session that has a non-zero version string
  for (const session of Object.values(data)) {
    if (session.version && session.version !== '0') {
      return session.version;
    }
  }

  throw new Error('Could not determine client version from sessions endpoint.');
}
