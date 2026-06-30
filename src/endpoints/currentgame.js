/**
 * @file Current game endpoints.
 */

/**
 * Get current game info for the player.
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchCurrentGamePlayer(ctx) {
  const { api, puuid, region, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/core-game/v1/players/${puuid}`, null, {
    type: 'glz', region, shard, tokenStore, clientVersion,
  });
}

/**
 * Get current match details.
 * @param {string} matchId
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchCurrentGameMatch(matchId, ctx) {
  const { api, region, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/core-game/v1/matches/${matchId}`, null, {
    type: 'glz', region, shard, tokenStore, clientVersion,
  });
}

/**
 * Get current game loadouts.
 * @param {string} matchId
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchCurrentGameLoadouts(matchId, ctx) {
  const { api, region, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/core-game/v1/matches/${matchId}/loadouts`, null, {
    type: 'glz', region, shard, tokenStore, clientVersion,
  });
}

/**
 * Quit the current game.
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function quitCurrentGame(ctx) {
  const { api, puuid, region, shard, clientVersion, tokenStore } = ctx;
  return api('POST', `/core-game/v1/players/${puuid}/disassociate`, null, {
    type: 'glz', region, shard, tokenStore, clientVersion,
  });
}
