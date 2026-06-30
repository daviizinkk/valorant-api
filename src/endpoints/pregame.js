/**
 * @file Pre-game (agent select) endpoints.
 */

/**
 * Get pre-game player info.
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchPregamePlayer(ctx) {
  const { api, puuid, region, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/pregame/v1/players/${puuid}`, null, {
    type: 'glz', region, shard, tokenStore, clientVersion,
  });
}

/**
 * Get pre-game match info (map, agents, etc.).
 * @param {string} matchId Pre-game match ID
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchPregameMatch(matchId, ctx) {
  const { api, region, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/pregame/v1/matches/${matchId}`, null, {
    type: 'glz', region, shard, tokenStore, clientVersion,
  });
}

/**
 * Get pre-game loadouts.
 * @param {string} matchId
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchPregameLoadouts(matchId, ctx) {
  const { api, region, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/pregame/v1/matches/${matchId}/loadouts`, null, {
    type: 'glz', region, shard, tokenStore, clientVersion,
  });
}

/**
 * Select an agent during pre-game.
 * @param {string} matchId
 * @param {string} agentId
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function selectCharacter(matchId, agentId, ctx) {
  const { api, region, shard, clientVersion, tokenStore } = ctx;
  return api('POST', `/pregame/v1/matches/${matchId}/select/${agentId}`, null, {
    type: 'glz', region, shard, tokenStore, clientVersion,
  });
}

/**
 * Lock in an agent during pre-game.
 * @param {string} matchId
 * @param {string} agentId
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function lockCharacter(matchId, agentId, ctx) {
  const { api, region, shard, clientVersion, tokenStore } = ctx;
  return api('POST', `/pregame/v1/matches/${matchId}/lock/${agentId}`, null, {
    type: 'glz', region, shard, tokenStore, clientVersion,
  });
}

/**
 * Quit pre-game / dodge.
 * @param {string} matchId
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function quitPregame(matchId, ctx) {
  const { api, region, shard, clientVersion, tokenStore } = ctx;
  return api('POST', `/pregame/v1/matches/${matchId}/quit`, null, {
    type: 'glz', region, shard, tokenStore, clientVersion,
  });
}
