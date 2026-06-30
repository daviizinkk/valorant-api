/**
 * @file Inventory / entitlements endpoints.
 */

/**
 * Fetch all owned items (weapon skins, cards, titles, etc.).
 *
 * @param {object}  api
 * @param {object}  ctx
 * @param {string}  ctx.puuid
 * @param {string}  ctx.shard
 * @param {string}  ctx.clientVersion
 * @param {import('../auth/tokens.js').TokenStore} ctx.tokenStore
 * @param {string}  [itemTypeId]  Filter by item type UUID (optional)
 * @returns {Promise<object>}
 */
export async function fetchInventory({ api, puuid, shard, clientVersion, tokenStore }, itemTypeId) {
  let path = `/store/v1/entitlements/${puuid}`;
  if (itemTypeId) {
    path += `/${itemTypeId}`;
  }
  return api('GET', path, null, { shard, tokenStore, clientVersion });
}

/**
 * Wallet information (VP, Radianite, etc.).
 *
 * @param {object}  ctx
 * @returns {Promise<object>}
 */
export async function fetchWallet(ctx) {
  const { api, puuid, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/store/v1/wallet/${puuid}`, null, { shard, tokenStore, clientVersion });
}

/**
 * Item type UUIDs for filtering inventory queries.
 */
export const ItemTypes = {
  AGENTS: '01bb38e1-da47-4e6a-9b3d-945fe4655707',
  CONTRACTS: 'f85cb6f7-33e5-4dc8-b609-ec7212301948',
  SPRAYS: 'd5f120f8-ff8c-4aac-92ea-f2b5acbe9475',
  GUN_BUDDIES: 'dd3bf334-87f3-40bd-b043-682a57a8dc3a',
  PLAYER_CARDS: '3f296c07-64c3-494c-923b-fe692a4fa1bd',
  WEAPON_SKINS: 'e7c63390-eda7-46e0-bb7a-a6abdacd2433',
  SKIN_VARIANTS: '3ad1b2b2-acdb-4524-852f-954a76ddae0a',
  PLAYER_TITLES: 'de7caa6b-adf7-4588-bbd1-143831e786c6',
};
