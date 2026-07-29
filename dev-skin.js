/**
 * @file Dev Skin Changer — Client-side skin equipper (educational/unreleased)
 *
 * Two approaches:
 *  1. API mode (try first) — uses setLoadout() directly (works for owned skins)
 *  2. Proxy mode — local HTTPS proxy that patches loadout responses in-flight
 *                 (client-side only, no server modification)
 *
 * Usage:
 *   node dev-skin.js <skinUuid>               # API mode
 *   node dev-skin.js --proxy <skinUuid>       # Proxy mode (intercepts game traffic)
 */

import { createServer } from 'node:http';
import { connect as tlsConnect } from 'node:tls';
import { connect as netConnect } from 'node:net';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Valorant, LoadoutError } from './src/index.js';

const R = '\x1b[31m'; const G = '\x1b[32m'; const Y = '\x1b[33m';
const C = '\x1b[36m'; const D = '\x1b[2m'; const S = '\x1b[0m';

const PROXY_PORT = 8888;
const CONFIG_FILE = '.dev-skin-config.json';

// ── Config persistance ──────────────────────────────────────
function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  return { skinUuid: null, weaponUuid: null, skinName: '' };
}

function saveConfig(config) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ── Resolve skin info ───────────────────────────────────────
async function resolveSkinMeta(skinUuid) {
  try {
    const res = await fetch(`https://valorant-api.com/v1/weapons/skins/${skinUuid}`);
    const { data, status } = await res.json();
    if (status === 200 && data) {
      return {
        name: data.displayName,
        icon: data.displayIcon,
        weaponUuid: null, // We'll get this from the loadout
        levels: data.levels,
        chromas: data.chromas,
      };
    }
  } catch {}
  return null;
}

// ── Mode 1: API approach ────────────────────────────────────
async function apiMode(skinUuid) {
  console.log(`\n${C}═══ API Mode: equipSkin() ═══${S}\n`);

  const valo = await Valorant.connect();
  console.log(`  ${D}Connected:${S} ${valo.region.toUpperCase()}`);

  try {
    console.log(`  Attempting to equip skin ${Y}${skinUuid}${S}...`);
    const result = await valo.equipSkin(skinUuid);
    console.log(`  ${G}✅ SUCCESS!${S} Loadout version: ${result.loadout?.Version || result.Version}`);
    console.log(`  ${D}Skin applied in-game. Check your loadout.${S}`);
    return true;
  } catch (err) {
    console.log(`  ${R}❌ Failed:${S} ${err.message}`);
    
    if (err instanceof LoadoutError) {
      console.log(`\n  ${Y}This skin is not owned.${S}`);
      console.log(`  ${C}→ Try proxy mode instead:${S}`);
      console.log(`  ${D}node dev-skin.js --proxy ${skinUuid}${S}`);
      console.log(`  ${D}(Works client-side for any skin)${S}`);
    } else if (err.message?.includes('400') || err.message?.includes('403')) {
      console.log(`\n  ${Y}Server rejected — skin not in your inventory.${S}`);
      console.log(`  ${C}→ Proxy mode can bypass this client-side.${S}`);
    }
    return false;
  }
}

// ── Mode 2: Proxy approach ──────────────────────────────────
async function proxyMode(skinUuid) {
  console.log(`\n${C}═══ Proxy Mode: Local MITM Proxy ═══${S}\n`);
  console.log(`  ${D}Target skin:${S} ${Y}${skinUuid}${S}`);

  // Resolve skin info
  const meta = await resolveSkinMeta(skinUuid);
  if (meta) console.log(`  ${D}Skin name:${S} ${G}${meta.name}${S}`);
  else console.log(`  ${Y}Warning: Could not resolve skin metadata${S}`);

  // Save config for the proxy to read
  saveConfig({ skinUuid, skinName: meta?.name || 'Unknown', updatedAt: Date.now() });

  console.log(`\n  ${C}Starting proxy on port ${PROXY_PORT}...${S}\n`);

  // Track which PD hostname to intercept
  const config = loadConfig();

  const server = createServer((req, res) => {
    // ── HTTP CONNECT tunnel (for HTTPS) ────────────────────
    if (req.method === 'CONNECT') {
      const targetHost = req.url.split(':')[0];
      const targetPort = parseInt(req.url.split(':')[1]) || 443;

      // Check if this is a Riot PD server (loadout endpoint)
      const isPD = /pd\.\w+\.a\.pvp\.net/i.test(targetHost);

      if (isPD) {
        // MITM mode for PD server
        handleMITM(req, res, targetHost, targetPort, config);
      } else {
        // Regular tunnel for everything else
        handleTunnel(req, res, targetHost, targetPort);
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`Dev Skin Proxy running on :${PROXY_PORT}\nConfigure your system proxy to 127.0.0.1:${PROXY_PORT}\n`);
    }
  });

  server.listen(PROXY_PORT, () => {
    console.log(`  ${G}✅ Proxy running on http://127.0.0.1:${PROXY_PORT}${S}`);
    console.log(`\n  ${C}═══ INSTRUCTIONS ═══${S}`);
    console.log(`  ${Y}1.${S} Set Windows proxy to 127.0.0.1:${PROXY_PORT}`);
    console.log(`     ${D}Settings → Network → Proxy → Manual → 127.0.0.1:${PROXY_PORT}${S}`);
    console.log(`  ${Y}2.${S} Launch VALORANT`);
    console.log(`  ${Y}3.${S} The proxy will patch loadout responses in real-time`);
    console.log(`  ${Y}4.${S} Check your loadout in-game — ${G}skin should appear${S}`);
    console.log(`\n  ${D}Only the loadout endpoint is intercepted.${S}`);
    console.log(`  ${D}All other traffic passes through unchanged.${S}`);
    console.log(`  ${C}Ctrl+C to stop.${S}\n`);
  });
}

// ── MITM handler for PD server ──────────────────────────────
function handleMITM(clientReq, clientRes, targetHost, targetPort, config) {
  // Connect to the real PD server
  const serverConn = tlsConnect(targetPort, targetHost, {
    rejectUnauthorized: false, // Self-signed? Accept anyway
  }, () => {
    // Tell the client the tunnel is established
    clientRes.writeHead(200, { 'Connection': 'keep-alive' });

    // Read the client's HTTP request
    let reqData = Buffer.alloc(0);
    let responded = false;

    clientReq.on('data', (chunk) => {
      reqData = Buffer.concat([reqData, chunk]);

      // Check if we have the full request headers
      const reqStr = reqData.toString();
      if (reqStr.includes('\r\n\r\n') && !responded) {
        responded = true;

        // Forward the request to the real server
        serverConn.write(reqData);

        // Read the response
        let respData = Buffer.alloc(0);
        let contentLength = -1;
        let headersEnd = -1;

        serverConn.on('data', (respChunk) => {
          respData = Buffer.concat([respData, respChunk]);

          // Parse headers to get content length
          if (headersEnd === -1) {
            const respStr = respData.toString();
            headersEnd = respStr.indexOf('\r\n\r\n');
            if (headersEnd !== -1) {
              const headers = respStr.substring(0, headersEnd);
              const clMatch = headers.match(/content-length:\s*(\d+)/i);
              if (clMatch) contentLength = parseInt(clMatch[1]);
            }
          }

          // Check if we have the full response
          if (contentLength > 0 && headersEnd !== -1) {
            const bodyStart = headersEnd + 4;
            const bodyReceived = respData.length - bodyStart;

            if (bodyReceived >= contentLength) {
              // Full response received — check if it's the loadout endpoint
              const respStr = respData.toString();
              const isLoadout = respStr.includes('personalization/v2/players/') || 
                               respStr.includes('playerloadout') ||
                               respStr.includes('"Guns"');
              
              if (isLoadout && config.skinUuid) {
                // Patch the loadout!
                const body = respData.slice(bodyStart, bodyStart + contentLength).toString('utf8');
                try {
                  const loadout = JSON.parse(body);
                  const patched = patchLoadout(loadout, config.skinUuid);
                  const newBody = JSON.stringify(patched);
                  
                  // Rebuild response with new content-length
                  const statusLine = respStr.substring(0, respStr.indexOf('\r\n'));
                  const headerPart = respStr.substring(respStr.indexOf('\r\n') + 2, headersEnd);
                  const newHeaders = headerPart.replace(/content-length:\s*\d+/i, `Content-Length: ${Buffer.byteLength(newBody)}`);
                  
                  const patchedResponse = `${statusLine}\r\n${newHeaders}\r\n\r\n${newBody}`;
                  clientRes.write(patchedResponse);
                  clientRes.end();
                  
                  console.log(`  ${G}✅ Patched loadout → ${config.skinName || config.skinUuid}${S}`);
                  return;
                } catch (e) {
                  console.log(`  ${R}Patch error:${S} ${e.message}`);
                }
              }
              
              // Not loadout or patch failed — forward unchanged
              clientRes.write(respData);
              clientRes.end();
            }
          }
        });

        serverConn.on('error', () => {
          if (!clientRes.writableEnded) {
            clientRes.end();
          }
        });
      }
    });

    clientReq.on('end', () => {
      if (!responded) {
        serverConn.end();
      }
    });
  });

  serverConn.on('error', (err) => {
    if (!clientRes.writableEnded) {
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      clientRes.end(`Proxy error: ${err.message}`);
    }
  });
}

// ── Regular TCP tunnel ──────────────────────────────────────
function handleTunnel(req, res, host, port) {
  const targetConn = netConnect(port, host, () => {
    res.writeHead(200, { 'Connection': 'keep-alive' });
    req.pipe(targetConn);
    targetConn.pipe(req);
  });
  targetConn.on('error', () => { if (!res.writableEnded) res.end(); });
  req.on('error', () => targetConn.end());
}

// ── Patch the loadout ───────────────────────────────────────
function patchLoadout(loadout, targetSkinUuid) {
  // Find which weapon this skin belongs to by checking the Guns array
  // The game stores Guns with SkinID fields — we just need to find
  // a weapon that has a matching skin UUID pattern or override all skins
  //
  // For the dev tool, we'll equip the target skin on ALL weapons
  // so the user can see it on any gun they pick up
  
  for (const gun of loadout.Guns) {
    gun.SkinID = targetSkinUuid;
    // Use default level and chroma if the skin has them
    // (we don't know the actual defaults without metadata, but
    //  the game will use fallback values)
  }
  
  loadout.Version = (loadout.Version || 0) + 1;
  return loadout;
}

// ── Print skin info ─────────────────────────────────────────
async function printSkinInfo(skinUuid) {
  // Show current owned skins + resolve the target
  try {
    const valo = await Valorant.connect();
    
    // Show current equipped skin
    const loadout = await valo.getLoadout();
    console.log(`\n${D}Currently equipped:${S}`);
    for (const gun of loadout.Guns.slice(0, 3)) {
      console.log(`  ${gun.ID.slice(0, 8)}… → ${Y}${gun.SkinID.slice(0, 12)}…${S}`);
    }
    
    // Try to resolve target skin name
    const meta = await resolveSkinMeta(skinUuid);
    if (meta) {
      console.log(`\n${D}Target skin:${S} ${G}${meta.name}${S}`);
    }
  } catch (err) {
    console.log(`${R}Could not fetch current state:${S} ${err.message}`);
  }
}

// ── CLI ──────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isProxy = args[0] === '--proxy';
  const skinUuid = isProxy ? args[1] : args[0];

  if (!skinUuid || skinUuid.startsWith('--')) {
    console.log(`\n${C}VALORANT Dev Skin Tool${S}`);
    console.log(`\n${D}Usage:${S}`);
    console.log(`  node dev-skin.js <skinUuid>               ${D}# Try API equip${S}`);
    console.log(`  node dev-skin.js --proxy <skinUuid>       ${D}# Local proxy (client-side)${S}`);
    console.log(`\n${D}Example:${S}`);
    console.log(`  node dev-skin.js --proxy ef584a70-4f8d-ec84-3f7f-068f4b244d8f`);
    console.log(`\n${Y}Tip: Find skin UUIDs at valorant-api.com${S}\n`);
    process.exit(1);
  }

  console.log(`${C}
   ╔════════════════════════════════════╗
   ║    VALORANT Dev Skin Tool          ║
   ║    Client-side · Educational       ║
   ╚════════════════════════════════════╝${S}`);

  console.log(`\n  ${D}Target skin UUID:${S} ${Y}${skinUuid}${S}`);

  if (isProxy) {
    await printSkinInfo(skinUuid);
    await proxyMode(skinUuid);
  } else {
    await apiMode(skinUuid);
  }
}

main().catch(err => {
  console.error(`\n${R}Error:${S} ${err.message}`);
  process.exit(1);
});
