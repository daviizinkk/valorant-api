/**
 * @file Party endpoints.
 */

/**
 * Fetch the player's current party.
 *
 * @param {object}  ctx
 * @param {string}  ctx.puuid
 * @param {string}  ctx.region
 * @param {string}  ctx.shard
 * @param {string}  ctx.clientVersion
 * @param {import('../auth/tokens.js').TokenStore} ctx.tokenStore
 * @returns {Promise<object>}
 */
export async function fetchParty(ctx) {
  const { api, puuid, region, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/parties/v1/players/${puuid}`, null, {
    type: 'glz',
    region,
    shard,
    tokenStore,
    clientVersion,
  });
}

/**
 * Fetch party details by party ID.
 *
 * @param {string}  partyId
 * @param {object}  ctx
 * @returns {Promise<object>}
 */
export async function fetchPartyById(partyId, ctx) {
  const { api, region, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/parties/v1/parties/${partyId}`, null, {
    type: 'glz',
    region,
    shard,
    tokenStore,
    clientVersion,
  });
}
