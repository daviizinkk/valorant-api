/**
 * @file Contracts endpoints.
 */

/**
 * Get all contracts (battle pass, agent contracts, etc.).
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function fetchContracts(ctx) {
  const { api, puuid, shard, clientVersion, tokenStore } = ctx;
  return api('GET', `/contracts/v1/contracts/${puuid}`, null, { shard, tokenStore, clientVersion });
}

/**
 * Activate a contract (e.g. start a new agent contract).
 * @param {string} contractId
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function activateContract(contractId, ctx) {
  const { api, puuid, shard, clientVersion, tokenStore } = ctx;
  return api('POST', `/contracts/v1/contracts/${puuid}/special/${contractId}`, null, {
    shard, tokenStore, clientVersion,
  });
}
