/**
 * @file Retrieve the player's PUUID from the local Riot Client.
 *
 * The PUUID (Player Universally Unique Identifier) is returned directly
 * by the entitlements endpoint as the `subject` field, so this module
 * mostly aliases that value. However, we also provide a standalone
 * lookup via the local userinfo endpoint for flexibility.
 */

import { localRequest } from './connect.js';

/**
 * Fetch the player's PUUID from the local userinfo endpoint.
 *
 * @param {number}  port     Lockfile port
 * @param {string}  password Lockfile password
 * @returns {Promise<string>}  The player's PUUID
 */
export async function fetchPuuid(port, password) {
  const basic = Buffer.from(`riot:${password}`).toString('base64');

  const res = await localRequest({
    port,
    path: '/rso-auth/v1/authorization/userinfo',
    headers: {
      Authorization: `Basic ${basic}`,
    },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Userinfo endpoint returned HTTP ${res.statusCode}`);
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new Error('Failed to parse userinfo response.');
  }

  if (!data.sub) {
    throw new Error('Userinfo response missing "sub" field (PUUID).');
  }

  return data.sub;
}
