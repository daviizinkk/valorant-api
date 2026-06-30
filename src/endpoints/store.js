/**
 * @file Store / shop endpoints.
 */

/**
 * Fetch the current storefront (daily offers, featured bundles).
 *
 * Uses the live V3 endpoint (POST) as observed in ShooterGame log.
 *
 * @param {object}  ctx
 * @param {string}  ctx.puuid
 * @param {string}  ctx.shard
 * @param {string}  ctx.clientVersion
 * @param {import('../auth/tokens.js').TokenStore} ctx.tokenStore
 * @returns {Promise<object>}
 */
export async function fetchStorefront(ctx) {
  const { api, puuid, shard, clientVersion, tokenStore } = ctx;
  return api('POST', `/store/v3/storefront/${puuid}`, {}, { shard, tokenStore, clientVersion });
}

/**
 * Fetch the current store prices.
 *
 * @param {object}  ctx
 * @returns {Promise<object>}
 */
export async function fetchPrices(ctx) {
  const { api, shard, clientVersion, tokenStore } = ctx;
  return api('GET', '/store/v1/prices', null, { shard, tokenStore, clientVersion });
}
