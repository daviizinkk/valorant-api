/**
 * @file Metadata API — fetches static game content from valorant-api.com.
 *
 * This API is the authoritative source for weapons, skins, cards, titles,
 * agents, maps, and other static game data. Responses are cached in memory.
 */

import { request as httpsRequest } from 'node:https';
import { TextDecoder } from 'node:util';

import { MetadataCache } from './cache.js';
import { MetadataError } from '../errors.js';

const BASE_URL = 'https://valorant-api.com/v1';

/** @type {MetadataCache} */
const cache = new MetadataCache();

/**
 * Make a request to valorant-api.com.
 *
 * @param {string}  path  URL path (e.g. "/weapons", "/playercards")
 * @param {object}  [params]  Query parameters
 * @returns {Promise<any>}
 */
async function fetchFromValorantAPI(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const urlStr = url.toString();

  return new Promise((resolve, reject) => {
    const req = httpsRequest(urlStr, {
      timeout: 10000,
      headers: { 'Accept-Encoding': 'identity' }, // disable compression for simple parsing
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        try {
          const parsed = JSON.parse(body);
          if (parsed.status !== 200) {
            reject(new MetadataError(`valorant-api.com returned status ${parsed.status}`));
            return;
          }
          resolve(parsed.data);
        } catch {
          reject(new MetadataError(`Failed to parse valorant-api.com response. Body start: ${body.slice(0, 100)}`));
        }
      });
    });

    req.on('error', (err) => reject(new MetadataError(`Network error: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new MetadataError('Request to valorant-api.com timed out.'));
    });

    req.end();
  });
}

/**
 * Fetch data with caching.
 *
 * @param {string} cacheKey
 * @param {string} path
 * @param {object} [params]
 * @returns {Promise<any>}
 */
async function cachedFetch(cacheKey, path, params = {}) {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const data = await fetchFromValorantAPI(path, params);
  cache.set(cacheKey, data);
  return data;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Get all weapons.
 * @returns {Promise<object[]>}
 */
export async function getWeapons() {
  return cachedFetch('weapons', '/weapons');
}

/**
 * Get a weapon by UUID.
 * @param {string} uuid
 * @returns {Promise<object|null>}
 */
export async function getWeapon(uuid) {
  const weapons = await getWeapons();
  return weapons.find((w) => w.uuid === uuid) || null;
}

/**
 * Get all weapon skins.
 * @returns {Promise<object[]>}
 */
export async function getSkins() {
  const weapons = await getWeapons();
  return weapons.flatMap((w) => w.skins);
}

/**
 * Get a specific skin by UUID.
 * @param {string} uuid
 * @returns {Promise<object|null>}
 */
export async function getSkin(uuid) {
  // Also try weapons-based lookup first
  const allSkins = await getSkins();
  let skin = allSkins.find((s) => s.uuid === uuid);
  if (skin) return skin;

  // Fallback: fetch single skin endpoint
  try {
    const data = await fetchFromValorantAPI(`/weapons/skins/${uuid}`);
    return data;
  } catch {
    return null;
  }
}

/**
 * Search weapon skins by display name (case-insensitive).
 * @param {string} query
 * @returns {Promise<object[]>}
 */
export async function searchSkins(query) {
  const allSkins = await getSkins();
  const lower = query.toLowerCase();
  return allSkins.filter((s) => s.displayName.toLowerCase().includes(lower));
}

/**
 * Get all player cards.
 * @returns {Promise<object[]>}
 */
export async function getPlayerCards() {
  return cachedFetch('playercards', '/playercards');
}

/**
 * Get a player card by UUID.
 * @param {string} uuid
 * @returns {Promise<object|null>}
 */
export async function getPlayerCard(uuid) {
  const cards = await getPlayerCards();
  return cards.find((c) => c.uuid === uuid) || null;
}

/**
 * Search player cards by display name.
 * @param {string} query
 * @returns {Promise<object[]>}
 */
export async function searchCards(query) {
  const cards = await getPlayerCards();
  const lower = query.toLowerCase();
  return cards.filter((c) => c.displayName.toLowerCase().includes(lower));
}

/**
 * Get all player titles.
 * @returns {Promise<object[]>}
 */
export async function getPlayerTitles() {
  return cachedFetch('playertitles', '/playertitles');
}

/**
 * Search player titles by display name.
 * @param {string} query
 * @returns {Promise<object[]>}
 */
export async function searchTitles(query) {
  const titles = await getPlayerTitles();
  const lower = query.toLowerCase();
  return titles.filter((t) => t.displayName.toLowerCase().includes(lower));
}

/**
 * Resolve a skin UUID to determine weapon UUID, default level, and default chroma.
 *
 * @param {string} skinUuid
 * @returns {Promise<{weaponUuid: string, skinLevelUuid: string, chromaUuid: string}|null>}
 */
export async function resolveSkin(skinUuid) {
  const weapons = await getWeapons();

  for (const weapon of weapons) {
    for (const skin of weapon.skins) {
      if (skin.uuid === skinUuid) {
        // Found it — use the first level and first chroma as defaults
        const defaultLevel = skin.levels?.[0]?.uuid || null;
        const defaultChroma = skin.chromas?.[0]?.uuid || null;
        return {
          weaponUuid: weapon.uuid,
          skinLevelUuid: defaultLevel,
          chromaUuid: defaultChroma,
        };
      }
    }
  }

  return null;
}

/**
 * Get the weapon UUID that a skin belongs to.
 *
 * @param {string} skinUuid
 * @returns {Promise<string|null>}
 */
export async function getWeaponUuidForSkin(skinUuid) {
  const result = await resolveSkin(skinUuid);
  return result?.weaponUuid || null;
}

/**
 * Clear the metadata cache.
 */
export function clearCache() {
  cache.clear();
}
