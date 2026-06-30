/**
 * @file Determine the player's shard and region.
 *
 * The shard determines the base URL for PVP endpoints:
 *   `https://pd.{shard}.a.pvp.net`
 *   `https://glz-{region}-1.{shard}.a.pvp.net`
 *
 * We determine the shard by:
 * 1. Fetching the region from the local Riot Client
 * 2. Mapping region to shard using the known lookup table
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
 * @property {string} region  Region code (e.g. "na", "eu", "ap", "kr")
 * @property {string} shard   Shard code (e.g. "na", "eu", "ap", "kr", "pbe")
 */

/**
 * Fetch the player's region from the local Riot Client.
 *
 * @param {number}  port     Lockfile port
 * @param {string}  password Lockfile password
 * @returns {Promise<RegionInfo>}
 */
export async function fetchRegion(port, password) {
  const basic = Buffer.from(`riot:${password}`).toString('base64');

  const res = await localRequest({
    port,
    path: '/riotclient/region-locale',
    headers: {
      Authorization: `Basic ${basic}`,
    },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Region endpoint returned HTTP ${res.statusCode}`);
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new Error('Failed to parse region-locale response.');
  }

  if (!data.region) {
    throw new Error('Region response missing "region" field.');
  }

  const region = data.region.toLowerCase();
  const shard = REGION_TO_SHARD[region] || region;

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
