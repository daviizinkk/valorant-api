<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
  <img src="https://img.shields.io/badge/dependencies-0-success" alt="Zero deps">
  <img src="https://img.shields.io/github/stars/daviizinkk/valorant-api?style=social" alt="Stars">
</p>

<h1 align="center">valorant-api</h1>
<p align="center"><em>Node.js wrapper for the unofficial VALORANT API — zero config, auto auth, dashboard included</em></p>

```js
import { Valorant } from 'valorant-api';
const valo = await Valorant.connect();
const loadout = await valo.getLoadout();
await valo.equipSkin('ef584a70-4f8d-ec84-3f7f-068f4b244d8f');
```

---

## Features

**Zero configuration** – discovers your Riot Client, authenticates, and manages tokens automatically. No API keys, no setup files, no manual token refreshes.

**Automatic auth** – tokens are fetched from the local Riot Client and refreshed transparently when they expire. You never see a 401.

**Smart retry** – transient failures (rate limits, server errors, network blips) are retried with exponential backoff and jitter. Invalid requests are not retried.

**Metadata integration** – wraps [valorant-api.com](https://valorant-api.com/) for weapons, skins, player cards, titles, and search. Responses are cached in memory to avoid redundant network calls.

**Smart cosmetics** – `equipSkin(uuid)` resolves the weapon, default chroma, and default level automatically using game metadata.

**Typed errors** – descriptive error subclasses (e.g. `RiotClientNotRunningError`, `RateLimitError`) with machine-readable `.code` properties.

**Zero runtime dependencies** – built entirely on Node.js built-in modules.

---

## Installation

```bash
npm install valorant-api
```

Requires **Node.js 18+** and the **Riot Client** running on your machine.

---

## Quick start

```js
import { Valorant } from 'valorant-api';

// Connects automatically — discovers the lockfile, authenticates,
// retrieves PUUID, region, shard, and client version.
const valo = await Valorant.connect();

// Read your current loadout
const loadout = await valo.getLoadout();

// Equip a skin (auto-resolves weapon, chroma, and level)
await valo.equipSkin('ef584a70-4f8d-ec84-3f7f-068f4b244d8f');

// Set your player card
await valo.setPlayerCard('5b1f1f1a-...');

// Set your player title
await valo.setPlayerTitle('a1b2c3d4-...');

// Check your store (requires VALORANT game to be launched)
const store = await valo.getStore();

// See your wallet balances
const wallet = await valo.getWallet();
```

---

## Web dashboard

The repo includes a web-based dashboard for visual interaction.

```bash
npm start
# or
node app/server.js
```

Open **http://localhost:3456** in your browser.

| Section | What you can do |
|---------|----------------|
| Overview | See region, shard, wallet balances, and account info |
| Loadout | Browse all 20 weapons with skin names and icons |
| Skins | Search and equip any skin by name |
| Cards | Search and set your player card |
| Titles | Search and equip a title |
| Store | View daily offers and bundles (requires game running) |
| Inventory | Browse all owned entitlements |

---

## API reference

### Valorant.connect()

Discovers the Riot Client lockfile, authenticates, and returns a ready client.

```js
const valo = await Valorant.connect();
```

What happens automatically:
1. Locates the lockfile across Windows, macOS, or Linux paths
2. Reads the port and password
3. Authenticates via the local entitlements endpoint
4. Retrieves PUUID, region, shard, and client version
5. Seeds the token cache (auto-refresh on expiry)

### Valorant.init(options)

Creates a client with explicit values (useful for testing or advanced setups).

```js
const valo = Valorant.init({
  port: 59247,
  password: '...',
  accessToken: '...',
  entitlementToken: '...',
  puuid: '...',
  region: 'na',
  shard: 'na',
  clientVersion: 'release-08.06-2345678',
});
```

### Loadout

| Method | Description |
|--------|-------------|
| `getLoadout()` | Fetches the full player loadout (guns, sprays, identity) |
| `setLoadout(loadout)` | Saves a modified loadout (fetch -> modify -> save) |
| `setPlayerCard(uuid)` | Sets the player card, preserving all other fields |
| `setPlayerTitle(uuid)` | Sets the player title |
| `setPreferredLevelBorder(uuid)` | Sets the level border |
| `equipSkin(uuid)` | Equips a skin; resolves weapon, chroma, and level automatically |

### Store and inventory

| Method | Description |
|--------|-------------|
| `getStore()` | Daily offers, featured bundles, and Night Market |
| `getPrices()` | Current item prices |
| `getInventory(itemTypeId?)` | All owned entitlements (optional type filter) |
| `getWallet()` | VP, Radianite, Kingdom Credits balances |

### Metadata helpers

These call [valorant-api.com](https://valorant-api.com/) and cache results in memory.

```js
valo.getWeapons()
valo.getWeapon(uuid)
valo.getSkins()
valo.getSkin(uuid)
valo.getPlayerCards()
valo.getPlayerCard(uuid)
valo.getPlayerTitles()
valo.searchSkins('Reaver')
valo.searchCards('VCT')
valo.searchTitles('Radiant')
```

### Error handling

Every error extends `ValorantError` and exposes a `.code` property.

| Class | `.code` | When it's thrown |
|-------|---------|------------------|
| `RiotClientNotRunningError` | `RIOT_CLIENT_NOT_RUNNING` | Lockfile not found |
| `InvalidLockfileError` | `INVALID_LOCKFILE` | Lockfile is malformed |
| `AuthenticationError` | `AUTHENTICATION_FAILED` | Auth request failed |
| `TokenExpiredError` | `TOKEN_EXPIRED` | Token refresh failed |
| `NetworkError` | `NETWORK_ERROR` | Connection or timeout |
| `RateLimitError` | `RATE_LIMITED` | HTTP 429 response |
| `APIError` | `API_ERROR` | HTTP 4xx or 5xx response |
| `LoadoutError` | `LOADOUT_ERROR` | Loadout processing issue |
| `MetadataError` | `METADATA_ERROR` | Metadata fetch failed |

```js
import { RiotClientNotRunningError } from 'valorant-api';

try {
  const valo = await Valorant.connect();
} catch (err) {
  if (err instanceof RiotClientNotRunningError) {
    console.log('Please start Riot Client first.');
  }
}
```

---

## Project structure

```
valorant-api/
├── app/                  # Web dashboard
│   ├── server.js         # HTTP server (zero dependencies)
│   └── public/           # Frontend (HTML, CSS, JS)
├── src/
│   ├── index.js          # Package entry point
│   ├── Valorant.js       # Main client class
│   ├── errors.js         # Error subclasses
│   ├── auth/             # Lockfile, tokens, PUUID, shard, version
│   ├── endpoints/        # Loadout, inventory, store, party
│   ├── metadata/         # valorant-api.com wrapper and cache
│   └── util/             # Shared request layer and retry logic
├── package.json
├── LICENSE
└── README.md
```

---

## Platform support

| Platform | Status |
|----------|--------|
| Windows | Full support |
| macOS | Supported |
| Linux | Experimental (Wine / Lutris paths) |

---

## License

MIT &copy; [daviizinkk](https://github.com/daviizinkk)

```
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR
ANY CLAIM, DAMAGES OR OTHER LIABILITY ARISING FROM THE USE OF
THIS SOFTWARE.
```

In plain English: you can use, modify, and share this code freely. I provide no warranty and accept no liability for how it's used. This is standard for open-source projects.

*Not affiliated with Riot Games. VALORANT is a trademark of Riot Games, Inc.*
