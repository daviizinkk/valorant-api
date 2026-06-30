/**
 * @file Determine the player's shard and region.
 *
 * The shard determines the base URL for PVP endpoints:
 *   `https://pd.{shard}.a.pvp.net`
 *   `https://glz-{region}-1.{shard}.a.pvp.net`
 *
 * IMPORTANT: The GLZ region might differ from the auth region!
 * (e.g. auth says "na" but deployment is "br" for Brazilian players)
 * We read the actual deployment from the sessions endpoint.
 */

import { localRequest } from './connect.js';

/**
 * Region-to-shard lookup table.
 * @type {Record<string, string>}
 */
const REGION_TO_SHARD = {
  na: 'na',
  latam: 'na',
  br: 'na',
  eu: 'eu',
  ap: 'ap',
  kr: 'kr',
};

/**
 * The shard for PBE (Public Beta Environment).
 * @type {string}
 */
const PBE_SHARD = 'pbe';

/**
 * @typedef {object} RegionInfo
 * @property {string} region  Region code for GLZ endpoints (e.g. "na", "br", "eu")
 * @property {string} shard   Shard code (e.g. "na", "eu", "ap", "kr", "pbe")
 */

/**
 * Get the deployment region from session launch arguments.
 * This is the correct region for GLZ endpoints.
 *
 * @param {number}  port     Lockfile port
 * @param {string}  password Lockfile password
 * @returns {Promise<string>}  Deployment region (e.g. "br", "na", "eu")
 */
async function fetchDeploymentRegion(port, password) {
  const basic = Buffer.from(`riot:${password}`).toString('base64');

  const res = await localRequest({
    port,
    path: '/product-session/v1/external-sessions',
    headers: {
      Authorization: `Basic ${basic}`,
    },
  });

  if (res.statusCode !== 200) return null;

  let data;
  try { data = JSON.parse(res.body); } catch { return null; }

  // Look for VALORANT session with -ares-deployment flag
  for (const session of Object.values(data)) {
    if (session.productId?.toLowerCase() === 'valorant' &&
        session.launchConfiguration?.arguments) {
      const args = session.launchConfiguration.arguments;
      const depArg = args.find(a => a.startsWith('-ares-deployment='));
      if (depArg) {
        return depArg.split('=')[1].toLowerCase();
      }
    }
  }

  return null;
}

/**
 * Fetch the player's region info with correct GLZ deployment detection.
 *
 * @param {number}  port     Lockfile port
 * @param {string}  password Lockfile password
 * @returns {Promise<RegionInfo>}
 */
export async function fetchRegion(port, password) {
  const basic = Buffer.from(`riot:${password}`).toString('base64');

  // Get auth region (for PD endpoints)
  const authRes = await localRequest({
    port,
    path: '/riotclient/region-locale',
    headers: { Authorization: `Basic ${basic}` },
  });

  if (authRes.statusCode !== 200) {
    throw new Error(`Region endpoint returned HTTP ${authRes.statusCode}`);
  }

  let authData;
  try { authData = JSON.parse(authRes.body); } catch {
    throw new Error('Failed to parse region-locale response.');
  }
  if (!authData.region) throw new Error('Region response missing "region" field.');

  const authRegion = authData.region.toLowerCase();
  const shard = REGION_TO_SHARD[authRegion] || authRegion;

  // Try to get the deployment region (for GLZ endpoints)
  const deployRegion = await fetchDeploymentRegion(port, password);
  const region = deployRegion || authRegion;

  return { region, shard };
}

/**
 * Determine the shard and region.
 * By default, uses the live shard. Set `isPBE = true` for PBE.
 *
 * @param {number}  port     Lockfile port
 * @param {string}  password Lockfile password
 * @param {{ isPBE?: boolean }} [options]
 * @returns {Promise<RegionInfo>}
 */
export async function fetchShard(port, password, options = {}) {
  if (options.isPBE) {
    // PBE always uses the 'pbe' shard
    try {
      const regionInfo = await fetchRegion(port, password);
      return { region: regionInfo.region, shard: PBE_SHARD };
    } catch {
      return { region: 'na', shard: PBE_SHARD };
    }
  }

  return fetchRegion(port, password);
}
