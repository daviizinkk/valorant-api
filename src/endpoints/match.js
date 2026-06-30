/**
 * @file Match history and match details endpoints.
 */

/**
 * Get match history for a player.
 * @param {object} ctx
 * @param {{ startIndex?: number, endIndex?: number, queue?: string }} [options]
 * @returns {Promise<object>}
 */
export async function fetchMatchHistory(ctx, options = {}) {
  const { api, puuid, shard, clientVersion, tokenStore } = ctx;
  let path = `/match-history/v1/history/${puuid}`;
  const params = [];
  if (options.startIndex !== undefined) params.push(`startIndex=${options.startIndex}`);
  if (options.endIndex !== undefined) params.push(`endIndex=${options.endIndex}`);
  if (options.queue) params.push(`queue=${options.queue}`);
  if (params.length) path += '?' + params.join('&');
  return api('GET', path, null, { shard, tokenStore, clientVersion });
}

/**
 * Get details for a specific match.
 * @param {string} matchId
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchMatchDetails(matchId, ctx) {
  const { api, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/match-details/v1/matches/${matchId}`, null, {
    shard, tokenStore, clientVersion,
  });
}
