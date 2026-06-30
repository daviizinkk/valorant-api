<div align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
  <img src="https://img.shields.io/badge/dependencies-0-success" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/status-stable-brightgreen" alt="Status">
  <br>
  <img src="https://img.shields.io/github/stars/daviiz/valorant-api?style=social" alt="Stars">
  <img src="https://img.shields.io/github/forks/daviiz/valorant-api?style=social" alt="Forks">
</div>

<br>

# 🎮 valorant-api

> **A production-quality Node.js wrapper for the unofficial VALORANT API.**
> Zero configuration. Automatic authentication. Clean API.

```js
import { Valorant } from 'valorant-api';

const valo = await Valorant.connect();
const loadout = await valo.getLoadout();
await valo.equipSkin('ef584a70-4f8d-ec84-3f7f-068f4b244d8f');
```

---

## ✨ Features

| # | Feature | Details |
|---|---------|---------|
| 🔑 | **Zero configuration** | Auto-discovers Riot Client, authenticates, manages tokens — no setup needed |
| 🔄 | **Auto-refresh** | Expired tokens refresh transparently — never get a 401 |
| 🛡️ | **Smart retry** | Exponential backoff with jitter for 429, 5xx, and network errors |
| 🎨 | **Smart cosmetics** | `equipSkin(uuid)` auto-resolves weapon, chroma, and level from metadata |
| 📦 | **Metadata integration** | Wraps [valorant-api.com](https://valorant-api.com/) for weapons, skins, cards, titles |
| 🔍 | **Search helpers** | `searchSkins("Reaver")`, `searchCards("VCT")`, `searchTitles("Radiant")` |
| 📝 | **Descriptive errors** | Typed error classes (no more generic `Error`) |
| ⚡ | **ESM only** | Modern `import`/`export` syntax for Node 18+ |
| 📦 | **Zero runtime deps** | Only Node.js built-in modules |

---

## 📦 Installation

```bash
npm install valorant-api
```

Requires **Node.js 18 or later** and the **Riot Client** running.

---

## 🚀 Quick Start

Make sure Riot Client is running (you don't need VALORANT open for most features).

```js
import { Valorant } from 'valorant-api';

// Connect automatically — discovers lockfile, authenticates, sets everything up
const valo = await Valorant.connect();

// Fetch loadout
const loadout = await valo.getLoadout();
console.log(loadout.Identity.PlayerCardID);

// Equip a skin (auto-resolves weapon, chroma, and level)
await valo.equipSkin('ef584a70-4f8d-ec84-3f7f-068f4b244d8f');

// Set player card
await valo.setPlayerCard('5b1f1f1a-...');

// Set player title
await valo.setPlayerTitle('a1b2c3d4-...');

// Check the store (requires VALORANT game launched)
const store = await valo.getStore();

// Get wallet balances
const wallet = await valo.getWallet();
```

---

## 🖥️ Web Dashboard

The repo includes a built-in web dashboard!

```bash
npm start
# or
node app/server.js
```

Then open **http://localhost:3456** in your browser.

![Dashboard Preview](https://via.placeholder.com/800x450/0e1420/ff4655?text=VALORANT+Dashboard)

| Tab | What it does |
|-----|-------------|
| **Overview** | Region, shard, wallet balances, account info |
| **Loadout** | All 20 weapons with skin names & icons |
| **Skins** | Search + click to equip any skin |
| **Cards** | Search + click to set your player card |
| **Titles** | Search + click to equip a title |
| **Store** | Daily offers, featured bundles, Night Market |
| **Inventory** | All owned items |

---

## 📚 API Reference

### `Valorant.connect()`

```js
const valo = await Valorant.connect();
```

What happens automatically:
1. Locates the Riot Client lockfile
2. Parses port & password
3. Authenticates via local entitlements endpoint
4. Retrieves PUUID, region, shard, and client version
5. Seeds the token cache (auto-refresh on expiry)
6. Returns a ready `Valorant` instance

### `Valorant.init(options)`

Create a client with explicit tokens (advanced / testing).

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
| `valo.getLoadout()` | Fetch current loadout |
| `valo.setLoadout(loadout)` | Save full loadout (fetch → modify → save pattern) |
| `valo.setPlayerCard(uuid)` | Set player card (preserves all other fields) |
| `valo.setPlayerTitle(uuid)` | Set player title |
| `valo.setPreferredLevelBorder(uuid)` | Set level border |
| `valo.equipSkin(uuid)` | Equip skin — auto-resolves weapon, chroma, level |

### Store & Inventory

| Method | Description |
|--------|-------------|
| `valo.getStore()` | Daily offers + featured bundles |
| `valo.getPrices()` | Item prices |
| `valo.getInventory(itemTypeId?)` | All owned items (optional type filter) |
| `valo.getWallet()` | VP, Radianite, Kingdom Credits |

### Metadata (valorant-api.com)

| Method | Description |
|--------|-------------|
| `valo.getWeapons()` | All weapons |
| `valo.getWeapon(uuid)` | Single weapon |
| `valo.getSkins()` | All weapon skins |
| `valo.getSkin(uuid)` | Single skin |
| `valo.getPlayerCards()` | All player cards |
| `valo.getPlayerCard(uuid)` | Single card |
| `valo.getPlayerTitles()` | All player titles |
| `valo.searchSkins("Reaver")` | Search skins by name |
| `valo.searchCards("VCT")` | Search cards by name |
| `valo.searchTitles("Radiant")` | Search titles by name |

### Error Classes

All errors extend `ValorantError` and have a machine-readable `code` property.

```js
import { RiotClientNotRunningError, RateLimitError } from 'valorant-api';

try {
  const valo = await Valorant.connect();
} catch (err) {
  if (err instanceof RiotClientNotRunningError) {
    console.log('Start Riot Client first!');
  }
}
```

| Error | Code | When |
|-------|------|------|
| `RiotClientNotRunningError` | `RIOT_CLIENT_NOT_RUNNING` | Riot Client not found |
| `InvalidLockfileError` | `INVALID_LOCKFILE` | Lockfile malformed |
| `AuthenticationError` | `AUTHENTICATION_FAILED` | Auth failed |
| `TokenExpiredError` | `TOKEN_EXPIRED` | Refresh failed |
| `NetworkError` | `NETWORK_ERROR` | Connection failed |
| `RateLimitError` | `RATE_LIMITED` | HTTP 429 |
| `APIError` | `API_ERROR` | HTTP 4xx/5xx |
| `LoadoutError` | `LOADOUT_ERROR` | Loadout processing |
| `MetadataError` | `METADATA_ERROR` | Metadata fetch failed |

---

## 🏗️ Project Structure

```
valorant-api/
├── app/                    # Web dashboard
│   ├── server.js           # HTTP server (zero deps)
│   └── public/             # Frontend (HTML/CSS/JS)
├── src/
│   ├── index.js            # Entry point
│   ├── Valorant.js         # Main client class
│   ├── errors.js           # Custom error classes
│   ├── auth/               # Lockfile, tokens, PUUID, shard, version
│   ├── endpoints/          # Loadout, inventory, store, party
│   ├── metadata/           # valorant-api.com wrapper + cache
│   └── util/               # Request layer + retry logic
├── package.json
├── LICENSE
├── .gitignore
└── README.md
```

---

## 🛠️ How to Upload to GitHub

### 1. Create the repo on GitHub

```bash
# Go to https://github.com/new
# Repo name: valorant-api
# Description: Node.js wrapper for the unofficial VALORANT API
# Keep it PUBLIC (for stars!)
# Do NOT initialize with README (we already have one)
```

### 2. Push your code

```bash
# In the valorant-api directory:
git init
git add .
git commit -m "Initial commit: VALORANT API wrapper + web dashboard"

# Link to your GitHub repo
git remote add origin https://github.com/daviiz/valorant-api.git

# Push
git branch -M main
git push -u origin main
```

### 3. After pushing

- ✅ Your repo will be live at `https://github.com/daviiz/valorant-api`
- ⭐ Ask friends to star it
- 📢 Share on Reddit (r/Valorant, r/VALORANT, r/node), Twitter, Discord servers
- 🔄 Keep it updated with issues and PRs

### 4. Star History & Growth Tips

- **Add a star history badge**: `![Star History](https://img.shields.io/github/stars/daviiz/valorant-api?style=social)`
- **Use star-history.com**: `https://star-history.com/#daviiz/valorant-api&Timeline`
- Share it in VALORANT communities — this is useful for everyone who plays VALORANT
- Make a short demo video and post on Twitter/X with #valorant #nodejs
- Keep responding to issues quickly — repos with active maintainers grow faster

---

## 💻 Platform Support

| Platform | Support |
|----------|---------|
| 🪟 Windows | ✅ Full support |
| 🍎 macOS | ✅ Supported |
| 🐧 Linux | ⚠️ Experimental (Wine/Lutris) |

---

## 📄 License

MIT © daviiz

---

<div align="center">
  <sub>Built with ❤️ for the VALORANT community</sub>
  <br>
  <sub>Not affiliated with Riot Games. VALORANT is a trademark of Riot Games, Inc.</sub>
</div>
