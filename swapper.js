/**
 * @file VALORANT Skin Swapper — local HTTPS server with CA cert
 *
 * How it works:
 * 1. Generates a self-signed CA certificate (one-time)
 * 2. Installs it in Windows trusted root store (one-time admin)
 * 3. Adds hosts file entry: pd.{shard}.a.pvp.net → 127.0.0.1
 * 4. Starts local HTTPS server on port 443 with a cert signed by our CA
 * 5. Proxies requests to the real Riot server, patches loadout response
 * 6. Game receives patched data — skin appears client-side
 *
 * Riot Support: "playing with skin changers in general game modes
 * (like casual or social games) will not trigger any penalties or bans."
 *
 * Run AS ADMINISTRATOR (required for port 443 + hosts file).
 *
 * Usage:
 *   node swapper.js <skinUuid>        # Start the swapper
 *   node swapper.js --reaver           # Find Reaver skins
 *   node swapper.js --cleanup          # Remove hosts entry + cert
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:https';
import { request as httpsRequest } from 'node:https';
import { randomBytes } from 'node:crypto';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { Valorant } from './src/index.js';

const R = '\x1b[31m'; const G = '\x1b[32m'; const Y = '\x1b[33m';
const C = '\x1b[36m'; const D = '\x1b[2m'; const S = '\x1b[0m';

const DATA_DIR = join(homedir(), '.valorant-swapper');
const CA_KEY = join(DATA_DIR, 'ca-key.pem');
const CA_CERT = join(DATA_DIR, 'ca-cert.pem');
const SERVER_KEY = join(DATA_DIR, 'server-key.pem');
const SERVER_CERT = join(DATA_DIR, 'server-cert.pem');
const HOSTS_PATH = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\drivers\\etc\\hosts`;
const SWAPPER_PORT = 443;

// ── Certificate generation ──────────────────────────────────
function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function generateCA() {
  console.log(`  ${Y}Generating CA certificate...${S}`);
  // Generate CA key and cert using OpenSSL via Node.js
  execSync(
    `openssl req -x509 -new -nodes -days 3650 `
    + `-newkey rsa:2048 -keyout "${CA_KEY}" -out "${CA_CERT}" `
    + `-subj "/CN=VALORANT Swapper CA/O=LocalDev/C=US"`,
    { stdio: 'pipe' }
  );
  console.log(`  ${G}✅ CA generated: ${CA_CERT}${S}`);
}

function generateServerCert(domain) {
  console.log(`  ${Y}Generating server certificate for ${domain}...${S}`);
  
  // Create config file for SAN
  const configPath = join(DATA_DIR, 'openssl.cnf');
  writeFileSync(configPath, `[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
CN = ${domain}
O = LocalDev
C = US

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${domain}
DNS.2 = *.${domain.split('.').slice(1).join('.')}
`);
  const csrPath = join(DATA_DIR, 'cert.csr');
  
  // Generate private key and CSR
  execSync(
    `openssl req -new -nodes `
    + `-newkey rsa:2048 -keyout "${SERVER_KEY}" -out "${csrPath}" `
    + `-config "${configPath}"`,
    { stdio: 'pipe' }
  );
  
  // Sign the CSR with our CA
  execSync(
    `openssl x509 -req -days 365 `
    + `-in "${csrPath}" `
    + `-CA "${CA_CERT}" -CAkey "${CA_KEY}" -CAcreateserial `
    + `-out "${SERVER_CERT}" `
    + `-extfile "${configPath}" -extensions req_ext`,
    { stdio: 'pipe' }
  );
  
  // Clean up CSR
  try { execSync(`del "${csrPath}" 2>nul`, { stdio: 'pipe' }); } catch {}
  
  console.log(`  ${G}✅ Server cert generated${S}`);
}

function installCA() {
  console.log(`  ${Y}Installing CA certificate to Windows trusted store...${S}`);
  try {
    execSync(`certutil -addstore Root "${CA_CERT}"`, { stdio: 'pipe' });
    console.log(`  ${G}✅ CA installed!${S}`);
  } catch (err) {
    console.log(`  ${R}❌ Failed to install CA. Run as Administrator.${S}`);
    console.log(`  ${D}Manual: certutil -addstore Root "${CA_CERT}"${S}`);
    return false;
  }
  return true;
}

function removeCA() {
  try {
    const thumbprint = execSync(
      `certutil -hashfile "${CA_CERT}" SHA1`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).split('\n').filter(l => l.trim()).slice(1, 2)[0]?.trim();
    if (thumbprint) {
      execSync(`certutil -delstore Root "${thumbprint}"`, { stdio: 'pipe' });
      console.log(`  ${G}✅ CA removed from store${S}`);
    }
  } catch {}
}

function addHostsEntry(domain, ip) {
  let hosts = '';
  try { hosts = readFileSync(HOSTS_PATH, 'utf8'); } catch { hosts = ''; }
  
  // Check if entry already exists
  if (hosts.includes(` ${domain}`)) {
    // Update existing entry
    const lines = hosts.split('\n').map(l => {
      if (l.includes(` ${domain}`)) return `${ip} ${domain}`;
      return l;
    });
    writeFileSync(HOSTS_PATH, lines.join('\n'));
  } else {
    // Add new entry
    writeFileSync(HOSTS_PATH, hosts + `\n${ip} ${domain}\n`);
  }
  console.log(`  ${G}✅ Hosts entry: ${ip} ${domain}${S}`);
}

function removeHostsEntry(domain) {
  try {
    let hosts = readFileSync(HOSTS_PATH, 'utf8');
    hosts = hosts.split('\n').filter(l => !l.includes(` ${domain}`)).join('\n');
    writeFileSync(HOSTS_PATH, hosts);
    console.log(`  ${G}✅ Hosts entry removed for ${domain}${S}`);
  } catch {}
}

function getCertPaths() {
  return { key: readFileSync(SERVER_KEY), cert: readFileSync(SERVER_CERT) };
}

// ── Proxy + Patch Server ────────────────────────────────────
function startServer(domain, skinUuid, shard) {
  const { key, cert } = getCertPaths();
  let patchedCount = 0;

  const server = createServer({ key, cert }, async (req, res) => {
    const targetUrl = `https://${domain}${req.url}`;
    
    // Forward request to real Riot server
    const options = {
      hostname: domain,
      port: 443,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: domain },
      rejectUnauthorized: false,
    };

    // Remove proxy-specific headers
    delete options.headers['proxy-connection'];

    const isLoadout = req.url.includes('/playerloadout') || 
                      req.url.includes('/personalization/v2/players/');

    const proxyReq = httpsRequest(options, (proxyRes) => {
      // Read the full response
      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => {
        let body = Buffer.concat(chunks);
        
        if (isLoadout && proxyRes.statusCode === 200) {
          try {
            const loadout = JSON.parse(body.toString('utf8'));
            const oldSkin = loadout.Guns?.[0]?.SkinID?.slice(0, 8) || '';
            for (const gun of loadout.Guns || []) gun.SkinID = skinUuid;
            const newBody = JSON.stringify(loadout);
            body = Buffer.from(newBody);
            // Update content-length in response headers
            proxyRes.headers['content-length'] = String(body.length);
            console.log(`  ${G}✅ Patched loadout!${S} ${oldSkin} → ${skinUuid.slice(0, 8)}…`);
            patchedCount++;
          } catch (e) {
            console.log(`  ${R}Patch error:${S} ${e.message}`);
          }
        }

        // Send response back to game
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(body);
      });
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502);
      res.end(`Proxy error: ${err.message}`);
    });

    // Forward request body (for POST/PUT)
    req.pipe(proxyReq);
  });

  server.listen(SWAPPER_PORT, () => {
    console.log(`\n  ${G}✅ Swapper server running on https://${domain}:${SWAPPER_PORT}${S}`);
    console.log(`  ${D}Game connects → Local server → Real Riot (patched)${S}\n`);
    console.log(`  ${C}Patches: ${patchedCount}${S}`);
    console.log(`  ${D}Press Ctrl+C to stop and clean up.${S}\n`);
  });

  return server;
}

// ── Setup everything ────────────────────────────────────────
async function setup(skinUuid) {
  ensureDir();
  
  // Connect to get shard info
  const valo = await Valorant.connect();
  const domain = `pd.${valo.shard}.a.pvp.net`;
  
  console.log(`\n${C}═══ Setting up VALORANT Skin Swapper ═══${S}\n`);
  console.log(`  ${D}Shard:${S} ${valo.shard}  ${D}Domain:${S} ${domain}`);
  console.log(`  ${D}Target:${S} ${skinUuid}\n`);

  // Try API first
  try {
    await valo.equipSkin(skinUuid);
    console.log(`  ${G}✅ API accepted the change!${S}`);
  } catch {
    console.log(`  ${Y}API rejected — will use HTTPS patching.${S}\n`);
  }

  // 1. Generate CA if needed
  if (!existsSync(CA_KEY) || !existsSync(CA_CERT)) {
    generateCA();
  } else {
    console.log(`  ${D}CA certificate exists${S}`);
  }

  // 2. Generate server cert if needed
  if (!existsSync(SERVER_KEY) || !existsSync(SERVER_CERT)) {
    generateServerCert(domain);
  } else {
    console.log(`  ${D}Server certificate exists${S}`);
  }

  // 3. Install CA
  if (!installCA()) {
    console.log(`\n  ${Y}Run this script AS ADMINISTRATOR for full auto-setup.${S}`);
    console.log(`  ${D}Or manually: certutil -addstore Root "${CA_CERT}"${S}\n`);
  }

  // 4. Add hosts entry
  addHostsEntry(domain, '127.0.0.1');

  // 5. Start the server
  startServer(domain, skinUuid, valo.shard);
}

// ── Cleanup ─────────────────────────────────────────────────
function cleanup() {
  console.log(`\n${Y}Cleaning up...${S}`);
  const domain = `pd.na.a.pvp.net`; // Default, will be refined
  removeHostsEntry(domain);
  removeHostsEntry('pd.na.a.pvp.net');
  removeHostsEntry('pd.br.a.pvp.net');
  removeHostsEntry('pd.eu.a.pvp.net');
  removeHostsEntry('pd.ap.a.pvp.net');
  removeHostsEntry('pd.kr.a.pvp.net');
  removeCA();
  console.log(`  ${G}✅ Cleanup done${S}\n`);
}

// ── CLI ──────────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2];
  
  if (!arg || arg === '--help') {
    console.log(`\n${C}VALORANT Skin Swapper${S}`);
    console.log(`\n${D}Usage (run as ADMINISTRATOR):${S}`);
    console.log(`  node swapper.js <skinUuid>     ${D}# Patch + start server${S}`);
    console.log(`  node swapper.js --reaver       ${D}# Find Reaver skins${S}`);
    console.log(`  node swapper.js --cleanup      ${D}# Remove hosts entries + cert${S}`);
    console.log(`\n${D}Riot Support: "playing with skin changers in`);
    console.log(`general game modes will not trigger any penalties"${S}\n`);
    return;
  }

  if (arg === '--cleanup') { cleanup(); return; }

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

  // Handle Ctrl+C for cleanup
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  await setup(arg);
}

main().catch(err => {
  console.error(`\n${R}${err.message}${S}`);
  process.exit(1);
});
