/**
 * @file Loadout endpoints — fetching and updating the player loadout.
 */

/**
 * @param {import('../util/request.js').apiRequest} api
 * @param {object}  ctx
 * @param {string}  ctx.puuid
 * @param {string}  ctx.shard
 * @param {string}  ctx.clientVersion
 * @param {import('../auth/tokens.js').TokenStore} ctx.tokenStore
 * @returns {Promise<object>}  Current loadout
 */
export async function fetchLoadout({ api, puuid, shard, clientVersion, tokenStore }) {
  return api('GET', `/personalization/v2/players/${puuid}/playerloadout`, null, {
    shard,
    tokenStore,
    clientVersion,
  });
}

/**
 * Save (replace) the player loadout.
 *
 * The body must be the full loadout object as returned by {@link fetchLoadout}.
 * Only modify the fields you need to change — every field is required.
 *
 * @param {object}  loadout   The full loadout object
 * @param {object}  ctx
 * @param {string}  ctx.puuid
 * @param {string}  ctx.shard
 * @param {string}  ctx.clientVersion
 * @param {import('../auth/tokens.js').TokenStore} ctx.tokenStore
 * @returns {Promise<object>}  Updated loadout
 */
export async function saveLoadout(loadout, { api, puuid, shard, clientVersion, tokenStore }) {
  return api('PUT', `/personalization/v2/players/${puuid}/playerloadout`, loadout, {
    shard,
    tokenStore,
    clientVersion,
  });
}

/**
 * Convenience: set the player's card.
 *
 * @param {string}  cardId   PlayerCard UUID
 * @param {object}  ctx
 * @returns {Promise<object>}
 */
export async function setPlayerCard(cardId, ctx) {
  const loadout = await fetchLoadout(ctx);
  loadout.Identity.PlayerCardID = cardId;
  return saveLoadout(loadout, ctx);
}

/**
 * Convenience: set the player's title.
 *
 * @param {string}  titleId  PlayerTitle UUID
 * @param {object}  ctx
 * @returns {Promise<object>}
 */
export async function setPlayerTitle(titleId, ctx) {
  const loadout = await fetchLoadout(ctx);
  loadout.Identity.PlayerTitleID = titleId;
  return saveLoadout(loadout, ctx);
}

/**
 * Convenience: set the preferred level border.
 *
 * @param {string}  borderId  PreferredLevelBorderID UUID
 * @param {object}  ctx
 * @returns {Promise<object>}
 */
export async function setPreferredLevelBorder(borderId, ctx) {
  const loadout = await fetchLoadout(ctx);
  loadout.Identity.PreferredLevelBorderID = borderId;
  return saveLoadout(loadout, ctx);
}

/**
 * Convenience: equip a skin for a specific weapon.
 *
 * Internally fetches the current loadout, finds the gun entry matching
 * the weapon UUID, updates its skin / chroma / level, and saves.
 *
 * @param {string}  weaponId    Weapon UUID (from the loadout Guns array)
 * @param {string}  skinId      Skin UUID
 * @param {string}  skinLevelId Skin level UUID (default level if unsure)
 * @param {string}  chromaId    Chroma UUID (default chroma if unsure)
 * @param {object}  ctx
 * @returns {Promise<object>}
 */
export async function equipWeaponSkin(weaponId, skinId, skinLevelId, chromaId, ctx) {
  const loadout = await fetchLoadout(ctx);

  const gun = loadout.Guns.find((g) => g.ID === weaponId);
  if (!gun) {
    throw new Error(`Weapon "${weaponId}" not found in loadout.`);
  }

  gun.SkinID = skinId;
  gun.SkinLevelID = skinLevelId;
  gun.ChromaID = chromaId;

  return saveLoadout(loadout, ctx);
}
