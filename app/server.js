/**
 * @file VALORANT Dashboard — HTTP server
 *
 * Serves the frontend SPA and proxies API calls to the valorant-api library.
 *
 * Usage: node app/server.js
 * Then open http://localhost:3456
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Valorant } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = process.env.PORT || 3456;

// ── MIME types ────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// ── VALORANT client singleton ─────────────────────────────────
let valoClient = null;
let clientConnected = false;

async function getClient() {
  if (valoClient && clientConnected) return valoClient;
  valoClient = await Valorant.connect();
  clientConnected = true;
  return valoClient;
}

// ── Error helper ──────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ── Router ────────────────────────────────────────────────────
const routes = {

  // ── Status ──────────────────────────────────────────────
  ['GET /api/status']: async (req, res) => {
    try {
      const v = await getClient();
      json(res, 200, {
        connected: true,
        puuid: v.puuid,
        region: v.region,
        shard: v.shard,
        version: v.clientVersion,
      });
    } catch (err) {
      json(res, 503, { connected: false, error: err.message, code: err.code });
    }
  },

  // ── Loadout ─────────────────────────────────────────────
  ['GET /api/loadout']: async (req, res) => {
    try {
      const v = await getClient();
      const loadout = await v.getLoadout();
      json(res, 200, loadout);
    } catch (err) {
      json(res, 500, { error: err.message, code: err.code });
    }
  },

  ['PUT /api/loadout']: async (req, res, body) => {
    try {
      const v = await getClient();
      const updated = await v.setLoadout(body);
      json(res, 200, updated);
    } catch (err) {
      json(res, 500, { error: err.message, code: err.code });
    }
  },

  // ── Set player card ─────────────────────────────────────
  ['PUT /api/player-card']: async (req, res, body) => {
    try {
      const v = await getClient();
      const result = await v.setPlayerCard(body.uuid);
      json(res, 200, { success: true, loadout: result });
    } catch (err) {
      json(res, 500, { error: err.message, code: err.code });
    }
  },

  // ── Set player title ────────────────────────────────────
  ['PUT /api/player-title']: async (req, res, body) => {
    try {
      const v = await getClient();
      const result = await v.setPlayerTitle(body.uuid);
      json(res, 200, { success: true, loadout: result });
    } catch (err) {
      json(res, 500, { error: err.message, code: err.code });
    }
  },

  // ── Equip skin ──────────────────────────────────────────
  ['PUT /api/equip-skin']: async (req, res, body) => {
    try {
      const v = await getClient();
      const result = await v.equipSkin(body.uuid);
      json(res, 200, { success: true, loadout: result });
    } catch (err) {
      json(res, 500, { error: err.message, code: err.code });
    }
  },

  // ── Wallet ──────────────────────────────────────────────
  ['GET /api/wallet']: async (req, res) => {
    try {
      const v = await getClient();
      const wallet = await v.getWallet();
      json(res, 200, wallet);
    } catch (err) {
      json(res, 500, { error: err.message, code: err.code });
    }
  },

  // ── Store ───────────────────────────────────────────────
  ['GET /api/store']: async (req, res) => {
    try {
      const v = await getClient();
      const store = await v.getStore();
      json(res, 200, store);
    } catch (err) {
      // Store requires the game client to be running - return a friendly message
      json(res, 200, {
        _unavailable: true,
        _reason: 'Store requires VALORANT game to be launched. Play a match and refresh.',
        error: err.message,
      });
    }
  },

  // ── Inventory ───────────────────────────────────────────
  ['GET /api/inventory']: async (req, res) => {
    try {
      const v = await getClient();
      const inv = await v.getInventory();
      json(res, 200, inv);
    } catch (err) {
      json(res, 500, { error: err.message, code: err.code });
    }
  },

  // ── Party ───────────────────────────────────────────────
  ['GET /api/party']: async (req, res) => {
    try {
      const v = await getClient();
      const party = await v.getParty();
      json(res, 200, party);
    } catch (err) {
      json(res, 500, { error: err.message, code: err.code });
    }
  },

  // ── Metadata: weapons ───────────────────────────────────
  ['GET /api/weapons']: async (req, res) => {
    try {
      const v = await getClient();
      const weapons = await v.getWeapons();
      json(res, 200, weapons);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  // ── Metadata: skins search ──────────────────────────────
  ['GET /api/skins']: async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const query = url.searchParams.get('q') || '';
      const v = await getClient();
      const results = query
        ? await v.searchSkins(query)
        : await v.getSkins();
      json(res, 200, { results, query });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  // ── Metadata: player cards search ───────────────────────
  ['GET /api/cards']: async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const query = url.searchParams.get('q') || '';
      const v = await getClient();
      const results = query
        ? await v.searchCards(query)
        : await v.getPlayerCards();
      json(res, 200, { results, query });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  // ── Metadata: player titles search ──────────────────────
  ['GET /api/titles']: async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const query = url.searchParams.get('q') || '';
      const v = await getClient();
      const results = query
        ? await v.searchTitles(query)
        : await v.getPlayerTitles();
      json(res, 200, { results, query });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },
};

// ── Parse JSON body ──────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(null);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(raw)); }
      catch { resolve(null); }
    });
  });
}

// ── Server ───────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const method = req.method;
  let path = req.url.split('?')[0].replace(/\/$/, '') || '/index.html';

  // ── API routes ──────────────────────────────────────────
  const routeKey = `${method} ${path}`;
  if (routes[routeKey]) {
    const body = await parseBody(req);
    return routes[routeKey](req, res, body);
  }

  // ── Serve static files ──────────────────────────────────
  const filePath = join(PUBLIC, path);
  if (!existsSync(filePath)) {
    // SPA fallback: serve index.html for unknown paths
    const idx = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(idx);
  }

  const ext = extname(filePath);
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  🎮 VALORANT Dashboard\n  ─────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Ready — Riot Client must be running.\n`);
});
