/**
 * @file Skin Swapper — Simple local proxy for showcasing skins in-game.
 *
 * Uses the local Riot Client (lockfile) API to intercept loadout data
 * and patch skin UUIDs. No game memory access, no kernel interaction.
 *
 * Riot Support has stated: "simply playing with skin changers in
 * general game modes (like casual or social games) will not trigger
 * any penalties or bans."
 *
 * Usage:
 *   node swapper.js <skinUuid>        # Patch + launch proxy
 *   node swapper.js --list-skins      # See available skins
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { connect as tlsConnect } from 'node:tls';
import { connect as netConnect } from 'node:net';
import { Valorant } from './src/index.js';

const R = '\x1b[31m'; const G = '\x1b[32m'; const Y = '\x1b[33m';
const C = '\x1b[36m'; const D = '\x1b[2m'; const S = '\x1b[0m';

const LOCKFILE = `${process.env.LOCALAPPDATA}\\Riot Games\\Riot Client\\Config\\lockfile`;

function readLockfile() {
  const [name, pid, port, pass] = readFileSync(LOCKFILE, 'utf8').trim().split(':');
  return { name, pid: Number(pid), port: Number(port), pass };
}

// ── Simple patch proxy ──────────────────────────────────────
function startProxy(targetPort, skinUuid) {
  const proxyPort = targetPort - 1;
  let patchedCount = 0;

  const server = createServer((req, res) => {
    if (req.method !== 'CONNECT') {
      res.writeHead(200);
      return res.end(`Swapper active on :${proxyPort}\nPatches: ${patchedCount}\n`);
    }

    const [host, portStr] = req.url.split(':');
    const port = Number(portStr) || 443;

    // Only intercept Riot PD servers
    const isRiot = /pd\.\w+\.a\.pvp\.net/i.test(host) ||
                   /glz-\w+-\w+\.\w+\.a\.pvp\.net/i.test(host);

    if (isRiot) {
      handleRiotTunnel(req, res, host, port, skinUuid)
        .then(n => { if (n > 0) patchedCount += n; })
        .catch(() => {});
    } else {
      // Regular tunnel - just pass through
      const target = netConnect(port, host, () => {
        res.writeHead(200);
        req.pipe(target);
        target.pipe(req);
      });
      target.on('error', () => res.destroy());
      req.on('error', () => target.end());
    }
  });

  server.listen(proxyPort, () => {
    console.log(`  ${G}✅ Local proxy:${S} 127.0.0.1:${proxyPort} → Riot servers\n`);
    console.log(`  ${Y}Set your Windows proxy to:${S}`);
    console.log(`    Address: 127.0.0.1  Port: ${proxyPort}\n`);
    console.log(`  ${D}Then launch VALORANT and go to the Range.${S}`);
    console.log(`  ${D}Press Ctrl+C to stop.\n`);
  });
}

async function handleRiotTunnel(clientReq, clientRes, host, port, skinUuid) {
  // Connect to real Riot server
  const server = tlsConnect(port, host, { rejectUnauthorized: false }, async () => {
    clientRes.writeHead(200, { 'Connection': 'keep-alive' });

    // Read the client's HTTP request
    let reqBuf = Buffer.alloc(0);
    let responded = false;

    clientReq.on('data', (chunk) => {
      reqBuf = Buffer.concat([reqBuf, chunk]);
      if (responded) return;

      const reqStr = reqBuf.toString();
      if (!reqStr.includes('\r\n\r\n')) return;
      responded = true;

      // Check if this is a loadout request
      const isLoadout = reqStr.includes('/playerloadout') || reqStr.includes('/personalization/v2/players/');

      if (isLoadout && reqStr.startsWith('GET')) {
        // Forward and patch the response
        server.write(reqBuf);
        let respBuf = Buffer.alloc(0);
        let contentLen = -1;
        let headersEnd = -1;

        server.on('data', (data) => {
          respBuf = Buffer.concat([respBuf, data]);

          if (headersEnd === -1) {
            const r = respBuf.toString();
            headersEnd = r.indexOf('\r\n\r\n');
            if (headersEnd !== -1) {
              const m = r.substring(0, headersEnd).match(/content-length:\s*(\d+)/i);
              if (m) contentLen = parseInt(m[1]);
            }
          }

          if (contentLen > 0 && headersEnd !== -1) {
            const bodyStart = headersEnd + 4;
            if (respBuf.length - bodyStart >= contentLen) {
              const body = respBuf.slice(bodyStart, bodyStart + contentLen).toString();
              try {
                const loadout = JSON.parse(body);
                const oldSkin = loadout.Guns?.[0]?.SkinID?.slice(0, 12) || '';
                for (const gun of loadout.Guns || []) gun.SkinID = skinUuid;
                const newBody = JSON.stringify(loadout);
                const firstPart = respBuf.slice(0, headersEnd).toString()
                  .replace(/content-length:\s*\d+/i, `Content-Length: ${Buffer.byteLength(newBody)}`);
                const patched = Buffer.concat([
                  Buffer.from(firstPart + '\r\n\r\n'),
                  Buffer.from(newBody)
                ]);
                clientRes.write(patched);
                clientRes.end();
                console.log(`  ${G}✅ Patched loadout!${S} ${oldSkin} → ${skinUuid.slice(0, 12)}…`);
                return;
              } catch {}
            }
          }

          // Passthrough if we can't patch
          clientRes.write(respBuf);
          clientRes.end();
        });

        server.on('error', () => { if (!clientRes.writableEnded) clientRes.end(); });
      } else {
        // Non-loadout: just tunnel
        server.write(reqBuf);
        server.pipe(clientRes);
      }
    });

    clientReq.on('error', () => server.end());
  });

  server.on('error', () => { if (!clientRes.writableEnded) clientRes.end(); });
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2];
  if (!arg || arg === '--help') {
    console.log(`\n${C}VALORANT Skin Swapper${S}`);
    console.log(`\n${D}Usage:${S}`);
    console.log(`  node swapper.js <skinUuid>     ${D}# Patch + start proxy${S}`);
    console.log(`  node swapper.js --list-skins   ${D}# Show available skins${S}`);
    console.log(`  node swapper.js --reaver       ${D}# Quick: find Reaver skins${S}`);
    console.log(`\n${D}Riot Support: "playing with skin changers in`);
    console.log(`general game modes will not trigger any penalties"${S}\n`);
    return;
  }

  if (arg === '--list-skins') {
    const res = await fetch('https://valorant-api.com/v1/weapons/skins');
    const { data } = await res.json();
    const grouped = {};
    for (const s of data) {
      const prefix = s.displayName.split(/\s/)[0];
      (grouped[prefix] = grouped[prefix] || []).push(s);
    }
    // Show the most interesting ones
    for (const [name, skins] of Object.entries(grouped).sort()) {
      if (skins.length > 1) {
        console.log(`\n${C}${name}${S}`);
        for (const s of skins.slice(0, 3)) {
          console.log(`  ${Y}${s.uuid}${S}  ${s.displayName}`);
        }
        if (skins.length > 3) console.log(`  ${D}... and ${skins.length - 3} more${S}`);
      }
    }
    console.log(`\n${D}Total: ${data.length} skins${S}\n`);
    return;
  }

  if (arg === '--reaver') {
    const res = await fetch('https://valorant-api.com/v1/weapons/skins');
    const { data } = await res.json();
    const reavers = data.filter(s => s.displayName.toLowerCase().includes('reaver'));
    console.log(`\n${C}Reaver skins:${S}\n`);
    for (const s of reavers) {
      console.log(`  ${Y}${s.uuid}${S}  ${G}${s.displayName}${S}`);
    }
    console.log('');
    return;
  }

  // ── Normal mode: patch + proxy ─────────────────────────
  const skinUuid = arg;

  console.log(`\n${C}VALORANT Skin Swapper${S}`);
  console.log(`${D}Target: ${skinUuid}${S}\n`);

  // Connect and verify
  const valo = await Valorant.connect();
  const lf = readLockfile();

  console.log(`  ${D}Connected:${S} ${valo.region.toUpperCase()} / ${valo.shard}`);
  console.log(`  ${D}Lockfile:${S} port ${lf.port}\n`);

  // Try API first (may or may not work for unowned skins)
  let apiWorked = false;
  try {
    await valo.equipSkin(skinUuid);
    apiWorked = true;
    console.log(`  ${G}✅ API accepted the change.${S}`);
  } catch {
    console.log(`  ${Y}API rejected — using proxy only.${S}`);
  }

  console.log(`\n  ${C}═══ Starting proxy — this is what makes it show in-game ═══${S}\n`);
  console.log(`  ${Y}The game doesn't re-read the loadout in real-time.`);
  console.log(`  The proxy intercepts the game's loadout requests and patches them.${S}\n`);

  // Start the proxy (always needed — game caches loadout locally)
  startProxy(lf.port, skinUuid);
}

main().catch(err => {
  console.error(`\n${R}${err.message}${S}`);
  process.exit(1);
});
