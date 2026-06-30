/**
 * @file Player info endpoints (MMR, account XP, content, competitive updates).
 */

/**
 * Get player MMR (rank, RR, etc.).
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchPlayerMMR(ctx) {
  const { api, puuid, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/mmr/v1/players/${puuid}`, null, { shard, tokenStore, clientVersion });
}

/**
 * Get competitive updates for a player.
 * @param {object} ctx
 * @param {{ startIndex?: number, endIndex?: number, queue?: string }} [options]
 * @returns {Promise<object>}
 */
export async function fetchCompetitiveUpdates(ctx, options = {}) {
  const { api, puuid, shard, clientVersion, tokenStore } = ctx;
  let path = `/mmr/v1/players/${puuid}/competitiveupdates`;
  const params = [];
  if (options.startIndex !== undefined) params.push(`startIndex=${options.startIndex}`);
  if (options.endIndex !== undefined) params.push(`endIndex=${options.endIndex}`);
  if (options.queue) params.push(`queue=${options.queue}`);
  if (params.length) path += '?' + params.join('&');
  return api('GET', path, null, { shard, tokenStore, clientVersion });
}

/**
 * Get account XP (account level, XP history).
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchAccountXP(ctx) {
  const { api, puuid, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/account-xp/v1/players/${puuid}`, null, { shard, tokenStore, clientVersion });
}

/**
 * Fetch game content (seasons, acts, events, etc.).
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchContent(ctx) {
  const { api, shard, clientVersion, tokenStore } = ctx;
  return api('GET', '/content-service/v3/content', null, { shard, tokenStore, clientVersion });
}
