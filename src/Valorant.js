/**
 * @file Main Valorant client class.
 *
 * Usage:
 * ```js
 * import { Valorant } from 'valorant-api';
 *
 * const valo = await Valorant.connect();
 * const loadout = await valo.getLoadout();
 * ```
 */

import { readLockfile } from './auth/lockfile.js';
import { fetchTokens, TokenStore } from './auth/tokens.js';
import { fetchRegion } from './auth/shard.js';
import { fetchClientVersion } from './auth/version.js';
import { apiRequest } from './util/request.js';

import {
  fetchLoadout,
  saveLoadout,
  setPlayerCard as setCard,
  setPlayerTitle as setTitle,
  setPreferredLevelBorder as setBorder,
  equipWeaponSkin,
} from './endpoints/loadout.js';

import { fetchInventory, fetchWallet, ItemTypes } from './endpoints/inventory.js';
import { fetchStorefront, fetchPrices } from './endpoints/store.js';
import { fetchParty, fetchPartyById } from './endpoints/party.js';

import {
  getWeapons,
  getWeapon,
  getSkins,
  getSkin,
  getPlayerCards,
  getPlayerCard,
  getPlayerTitles,
  searchSkins,
  searchCards,
  searchTitles,
  resolveSkin,
  clearCache as clearMetadataCache,
} from './metadata/api.js';

import { LoadoutError } from './errors.js';

// Errors are re-exported from index.js

/**
 * The main client class.
 *
 * Create an instance with {@link Valorant.connect} or {@link Valorant.init}.
 */
export class Valorant {
  /**
   * @param {object} options
   * @param {number} options.port
   * @param {string} options.password
   * @param {string} options.accessToken
   * @param {string} options.entitlementToken
   * @param {string} options.puuid
   * @param {string} options.region
   * @param {string} options.shard
   * @param {string} options.clientVersion
   */
  constructor(options) {
    /** @type {number} */
    this.port = options.port;
    /** @type {string} */
    this.password = options.password;

    /** @type {string} */
    this.puuid = options.puuid;
    /** @type {string} */
    this.region = options.region;
    /** @type {string} */
    this.shard = options.shard;
    /** @type {string} */
    this.clientVersion = options.clientVersion;

    /** @type {TokenStore} */
    this._tokenStore = new TokenStore(() =>
      fetchTokens(this.port, this.password)
    );
    // Seed with the initial tokens
    this._tokenStore._tokens = {
      accessToken: options.accessToken,
      entitlementToken: options.entitlementToken,
      subject: options.puuid,
      fetchedAt: Date.now(),
    };

    // Bind the shared request function with context
    this._api = (method, path, body, opts) =>
      apiRequest(method, path, body, {
        ...opts,
        region: this.region,
        shard: this.shard,
        tokenStore: this._tokenStore,
        clientVersion: this.clientVersion,
      });

    /** @type {{ puuid: string, shard: string, region: string, clientVersion: string, tokenStore: TokenStore, api: Function }} */
    this._ctx = {
      puuid: this.puuid,
      shard: this.shard,
      region: this.region,
      clientVersion: this.clientVersion,
      tokenStore: this._tokenStore,
      api: this._api,
    };
  }

  // ── Factory methods ──────────────────────────────────────────

  /**
   * Connect to the VALORANT API automatically.
   *
   * Discovers the Riot Client lockfile, authenticates, and returns a ready-to-use
   * client. This is the recommended way to create a client.
   *
   * @returns {Promise<Valorant>}
   */
  static async connect() {
    // 1. Find and parse lockfile
    const lockfile = readLockfile();

    // 2. Fetch tokens
    const tokens = await fetchTokens(lockfile.port, lockfile.password);

    // 3. Determine region / shard
    const { region, shard } = await fetchRegion(lockfile.port, lockfile.password);

    // 4. Determine client version
    const clientVersion = await fetchClientVersion(lockfile.port, lockfile.password);

    return new Valorant({
      port: lockfile.port,
      password: lockfile.password,
      accessToken: tokens.accessToken,
      entitlementToken: tokens.entitlementToken,
      puuid: tokens.subject,
      region,
      shard,
      clientVersion,
    });
  }

  /**
   * Create a client from explicit tokens (for testing or advanced use).
   *
   * @param {object}  opts
   * @param {number}  opts.port
   * @param {string}  opts.password
   * @param {string}  opts.accessToken
   * @param {string}  opts.entitlementToken
   * @param {string}  opts.puuid
   * @param {string}  opts.region
   * @param {string}  opts.shard
   * @param {string}  opts.clientVersion
   * @returns {Valorant}
   */
  static init(opts) {
    return new Valorant(opts);
  }

  // ── Loadout ──────────────────────────────────────────────────

  /**
   * Fetch the current player loadout.
   * @returns {Promise<object>}
   */
  async getLoadout() {
    return fetchLoadout(this._ctx);
  }

  /**
   * Save (replace) the full player loadout.
   * @param {object} loadout
   * @returns {Promise<object>}
   */
  async setLoadout(loadout) {
    return saveLoadout(loadout, this._ctx);
  }

  /**
   * Set the player's card.
   * @param {string} uuid  PlayerCard UUID
   * @returns {Promise<object>}
   */
  async setPlayerCard(uuid) {
    return setCard(uuid, this._ctx);
  }

  /**
   * Set the player's title.
   * @param {string} uuid  PlayerTitle UUID
   * @returns {Promise<object>}
   */
  async setPlayerTitle(uuid) {
    return setTitle(uuid, this._ctx);
  }

  /**
   * Set the preferred level border.
   * @param {string} uuid  PreferredLevelBorderID UUID
   * @returns {Promise<object>}
   */
  async setPreferredLevelBorder(uuid) {
    return setBorder(uuid, this._ctx);
  }

  /**
   * Equip a skin by its UUID.
   *
   * Automatically resolves the weapon UUID, default skin level, and default chroma
   * using metadata from valorant-api.com.
   *
   * @param {string} skinUuid
   * @returns {Promise<object>}
   * @throws {LoadoutError}  If the skin cannot be resolved
   */
  async equipSkin(skinUuid) {
    const resolved = await resolveSkin(skinUuid);
    if (!resolved) {
      throw new LoadoutError(`Could not resolve skin UUID "${skinUuid}".`);
    }

    if (!resolved.skinLevelUuid) {
      throw new LoadoutError(`Skin "${skinUuid}" has no default level.`);
    }

    if (!resolved.chromaUuid) {
      throw new LoadoutError(`Skin "${skinUuid}" has no default chroma.`);
    }

    return equipWeaponSkin(
      resolved.weaponUuid,
      skinUuid,
      resolved.skinLevelUuid,
      resolved.chromaUuid,
      this._ctx
    );
  }

  // ── Store ────────────────────────────────────────────────────

  /**
   * Get the current storefront (daily offers, featured bundles).
   * @returns {Promise<object>}
   */
  async getStore() {
    return fetchStorefront(this._ctx);
  }

  /**
   * Get current store prices.
   * @returns {Promise<object>}
   */
  async getPrices() {
    return fetchPrices(this._ctx);
  }

  // ── Inventory ────────────────────────────────────────────────

  /**
   * Get the player's inventory (all owned items).
   * @param {string} [itemTypeId]  Optional item type filter
   * @returns {Promise<object>}
   */
  async getInventory(itemTypeId) {
    return fetchInventory(this._ctx, itemTypeId);
  }

  /**
   * Get the player's wallet balance.
   * @returns {Promise<object>}
   */
  async getWallet() {
    return fetchWallet(this._ctx);
  }

  // ── Party ────────────────────────────────────────────────────

  /**
   * Get the player's current party.
   * @returns {Promise<object>}
   */
  async getParty() {
    return fetchParty(this._ctx);
  }

  // ── Metadata (valorant-api.com) ──────────────────────────────

  /** @returns {Promise<object[]>} */
  async getWeapons() {
    return getWeapons();
  }

  /** @param {string} uuid @returns {Promise<object|null>} */
  async getWeapon(uuid) {
    return getWeapon(uuid);
  }

  /** @returns {Promise<object[]>} */
  async getSkins() {
    return getSkins();
  }

  /** @param {string} uuid @returns {Promise<object|null>} */
  async getSkin(uuid) {
    return getSkin(uuid);
  }

  /** @param {string} query @returns {Promise<object[]>} */
  async searchSkins(query) {
    return searchSkins(query);
  }

  /** @returns {Promise<object[]>} */
  async getPlayerCards() {
    return getPlayerCards();
  }

  /** @param {string} uuid @returns {Promise<object|null>} */
  async getPlayerCard(uuid) {
    return getPlayerCard(uuid);
  }

  /** @param {string} query @returns {Promise<object[]>} */
  async searchCards(query) {
    return searchCards(query);
  }

  /** @returns {Promise<object[]>} */
  async getPlayerTitles() {
    return getPlayerTitles();
  }

  /** @param {string} query @returns {Promise<object[]>} */
  async searchTitles(query) {
    return searchTitles(query);
  }

  /**
   * Clear the in-memory metadata cache.
   */
  clearMetadataCache() {
    clearMetadataCache();
  }

  /**
   * Manually refresh authentication tokens.
   * Called automatically on 401, but can be invoked manually if needed.
   *
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    await this._tokenStore.refresh();
  }
}

// ── Default export ─────────────────────────────────────────────

export default Valorant;
