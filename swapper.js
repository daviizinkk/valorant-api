/**
 * @file VALORANT Skin Swapper — local HTTPS server with CA cert
 *
 * How it works:
 * 1. Generates a self-signed CA certificate (one-time, pure Node.js)
 * 2. Installs it in Windows trusted root store
 * 3. Adds hosts file: pd.{shard}.a.pvp.net → 127.0.0.1
 * 4. Starts local HTTPS server on port 443
 * 5. Forwards requests to real Riot server, patches loadout response
 *
 * Riot Support: "playing with skin changers in general game modes
 * will not trigger any penalties or bans."
 *
 * Run AS ADMINISTRATOR (required for port 443 + hosts file).
 *
 * Usage:
 *   node swapper.js <skinUuid>
 *   node swapper.js --reaver
 *   node swapper.js --cleanup
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:https';
import { request as httpsRequest } from 'node:https';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { Valorant } from './src/index.js';

const R = '\x1b[31m'; const G = '\x1b[32m'; const Y = '\x1b[33m';
const C = '\x1b[36m'; const D = '\x1b[2m'; const S = '\x1b[0m';

const DIR = join(homedir(), '.valorant-swapper');
const CA_KEY = join(DIR, 'ca-key.pem');
const CA_CERT = join(DIR, 'ca-cert.pem');
const SRV_KEY = join(DIR, 'server-key.pem');
const SRV_CERT = join(DIR, 'server-cert.pem');
const HOSTS = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\drivers\\etc\\hosts`;
const PORT = 443;

// ── Pure Node.js cert generator (no OpenSSL, no PowerShell) ──
function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true }); }

// Minimal PEM certificate generation using built-in crypto only
function pemEncode(label, der) {
  const b64 = der.toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

function createSelfSignedCert(commonName, days, isCA, signerKey) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  // Build a minimal x509 v3 certificate
  // Serial number (4 bytes random)
  const serial = randomBytes(4);
  
  // Validity
  const now = new Date();
  const expire = new Date(now.getTime() + days * 86400000);
  
  const toDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };

  // Construct TBSCertificate manually (minimal ASN.1 DER)
  const tbs = Buffer.concat([
    // Version [0] EXPLICIT INTEGER 2 (v3)
    Buffer.from('a003020102', 'hex'),
    // Serial number
    Buffer.concat([Buffer.from('02', 'hex'), Buffer.from([serial.length]), serial]),
    // Signature algorithm (sha256WithRSAEncryption)
    Buffer.from('300d06092a864886f70d01010b0500', 'hex'),
    // Issuer
    encodeName(commonName),
    // Validity
    Buffer.concat([
      Buffer.from('30', 'hex'), encodeLength(30),
      encodeTime(now), encodeTime(expire)
    ]),
    // Subject (same as issuer for self-signed)
    encodeName(commonName),
    // Subject public key info
    Buffer.concat([
      Buffer.from('30', 'hex'), encodeLength(pubDer.length + 2 + 13),
      // AlgorithmIdentifier
      Buffer.from('300d06092a864886f70d010101050003', 'hex'),
      // Public key bit string
      Buffer.concat([Buffer.from('03', 'hex'), Buffer.from([pubDer.length + 1]), Buffer.from([0]), pubDer])
    ]),
    // Extensions
    isCA ? Buffer.from('a31d301b0603551d130101ff0408300601ff020100', 'hex') : Buffer.from('a31830160603551d11040f300d820b', 'hex')
  ]);

  // Add SAN for server certs
  let tbsFinal = tbs;
  if (!isCA && commonName.includes('.')) {
    const sanData = Buffer.from('0b' + commonName.split('').map(c => c.charCodeAt(0) > 127 ? '?' : c.charCodeAt(0).toString(16).padStart(2, '0')).join(''), 'hex');
    const sanExt = Buffer.concat([
      Buffer.from('30', 'hex'),
      Buffer.from([sanData.length + 4 + 2]),
      Buffer.from('0603551d11040f300d820b', 'hex'),
      sanData
    ]);
    tbsFinal = Buffer.concat([tbs, sanExt]);
  }

  // Make it fit in a SEQUENCE
  const tbsSeq = Buffer.concat([Buffer.from('30', 'hex'), encodeLength(tbsFinal.length), tbsFinal]);

  // Sign the TBS with issuer key
  const sign = require('crypto').createSign('RSA-SHA256');
  sign.update(tbsSeq);
  const sig = signerKey ? null : sign.sign(privateKey); // Self-sign
  // If signing with a different key (CA signing server cert)
  const finalSig = signerKey ? (() => {
    const s = require('crypto').createSign('RSA-SHA256');
    s.update(tbsSeq);
    return s.sign(signerKey);
  })() : sig;

  // Build the full certificate
  const cert = Buffer.concat([
    tbsSeq,
    // Signature algorithm
    Buffer.from('300d06092a864886f70d01010b0500', 'hex'),
    // Signature bit string
    Buffer.concat([
      Buffer.from('03', 'hex'),
      Buffer.from([finalSig.length + 1]),
      Buffer.from([0]),
      finalSig
    ])
  ]);

  const certPem = pemEncode('CERTIFICATE', Buffer.concat([
    Buffer.from('3082', 'hex'),
    Buffer.from([((cert.length >> 8) & 0xff), (cert.length & 0xff)]),
    cert
  ]));

  return { keyPem, certPem, privateKey };
}

function encodeName(cn) {
  const cnBytes = Buffer.from(cn, 'utf8');
  const cnSeq = Buffer.concat([
    Buffer.from('30', 'hex'), encodeLength(cnBytes.length + 3),
    Buffer.from('130c', 'hex'), Buffer.from([cnBytes.length]),
    cnBytes
  ]);
  return Buffer.concat([
    Buffer.from('30', 'hex'), encodeLength(cnSeq.length),
    cnSeq
  ]);
}

function encodeTime(d) {
  const s = d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([Buffer.from('180f', 'hex'), Buffer.from([b.length]), b]);
}

function encodeLength(len) {
  if (len < 128) return Buffer.from([len]);
  const bytes = [];
  let tmp = len;
  while (tmp > 0) { bytes.unshift(tmp & 0xff); tmp >>= 8; }
  return Buffer.concat([Buffer.from([0x80 | bytes.length]), Buffer.from(bytes)]);
}

// ── Generate certs ──────────────────────────────────────────
function generateCerts(domain) {
  console.log(`  ${Y}Generating certificates (pure Node.js)...${S}`);
  ensureDir();

  // Generate CA if needed
  if (!existsSync(CA_KEY)) {
    console.log(`  ${D}Creating CA...${S}`);
    const ca = createSelfSignedCert('VALORANT Swapper CA', 3650, true, null);
    writeFileSync(CA_KEY, ca.keyPem);
    writeFileSync(CA_CERT, ca.certPem);
    // Save CA private key for signing server cert
    writeFileSync(join(DIR, 'ca-priv.pem'), ca.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    console.log(`  ${G}✅ CA created${S}`);
  }

  // Generate server cert signed by CA
  if (!existsSync(SRV_KEY)) {
    console.log(`  ${D}Creating server cert for ${domain}...${S}`);
    const caPrivRaw = readFileSync(join(DIR, 'ca-priv.pem'), 'utf8');
    const caPriv = require('crypto').createPrivateKey(caPrivRaw);
    const svr = createSelfSignedCert(domain, 365, false, caPriv);
    writeFileSync(SRV_KEY, svr.keyPem);
    writeFileSync(SRV_CERT, svr.certPem);
    console.log(`  ${G}✅ Server cert created${S}`);
  }
}

function installCA() {
  if (!existsSync(CA_CERT)) return false;
  console.log(`  ${Y}Installing CA certificate...${S}`);
  try {
    execSync(`certutil -addstore Root "${CA_CERT}"`, { stdio: 'pipe', timeout: 10000 });
    console.log(`  ${G}✅ CA installed!${S}`);
    return true;
  } catch {
    console.log(`  ${R}❌ Failed. Run as Administrator.${S}`);
    console.log(`  ${D}Manual: certutil -addstore Root "${CA_CERT}"${S}`);
    return false;
  }
}

function removeCA() {
  try {
    const out = execSync(`certutil -hashfile "${CA_CERT}" SHA1`, { encoding: 'utf8', timeout: 5000 });
    const hash = out.split('\n').map(l => l.trim()).filter(l => /^[0-9a-f]{40}$/i.test(l))[0];
    if (hash) { execSync(`certutil -delstore Root "${hash}"`, { stdio: 'pipe' }); console.log(`  ${G}✅ CA removed${S}`); }
  } catch {}
}

function addHosts(domain) {
  try {
    let h = readFileSync(HOSTS, 'utf8');
    if (h.includes(` ${domain}`)) {
      h = h.split('\n').map(l => l.includes(` ${domain}`) ? `127.0.0.1 ${domain}` : l).join('\n');
    } else {
      h += `\n127.0.0.1 ${domain}\n`;
    }
    writeFileSync(HOSTS, h);
    console.log(`  ${G}✅ Hosts: 127.0.0.1 ${domain}${S}`);
  } catch {}
}

function removeHosts(domain) {
  try {
    let h = readFileSync(HOSTS, 'utf8');
    h = h.split('\n').filter(l => !l.trim().endsWith(' ' + domain) && !l.includes(` ${domain}`)).join('\n');
    writeFileSync(HOSTS, h);
    console.log(`  ${G}✅ Hosts entry removed${S}`);
  } catch {}
}

// ── Server ──────────────────────────────────────────────────
function startServer(domain, skinUuid) {
  let patched = 0;
  const server = createServer({
    key: readFileSync(SRV_KEY),
    cert: readFileSync(SRV_CERT)
  }, async (req, res) => {
    const fwd = httpsRequest({
      hostname: domain, port: 443, path: req.url,
      method: req.method,
      headers: { ...req.headers, host: domain, 'accept-encoding': 'identity' },
      rejectUnauthorized: false
    }, (fwdRes) => {
      const chunks = [];
      fwdRes.on('data', c => chunks.push(c));
      fwdRes.on('end', () => {
        let body = Buffer.concat(chunks);
        if (fwdRes.statusCode === 200 && req.url.includes('/playerloadout')) {
          try {
            const lo = JSON.parse(body.toString());
            const old = lo.Guns?.[0]?.SkinID?.slice(0, 8) || '';
            for (const g of lo.Guns || []) g.SkinID = skinUuid;
            body = Buffer.from(JSON.stringify(lo));
            fwdRes.headers['content-length'] = String(body.length);
            console.log(`  ${G}✅ Patched!${S} ${old} → ${skinUuid.slice(0, 8)}…`);
            patched++;
          } catch {}
        }
        res.writeHead(fwdRes.statusCode, fwdRes.headers);
        res.end(body);
      });
    });
    fwdRes.on('error', () => res.writeHead(502).end('Error'));
    req.pipe(fwdReq);
  });

  server.listen(PORT, () => {
    console.log(`\n  ${G}✅ Server on https://${domain}:${PORT}${S}`);
    console.log(`  ${D}Game connects → Local → Real (patched loadout)${S}\n`);
  });
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2];
  if (!arg || arg === '--help') {
    console.log(`\n${C}VALORANT Skin Swapper${S}\n  node swapper.js <uuid>\n  node swapper.js --reaver\n  node swapper.js --cleanup\n`);
    return;
  }
  if (arg === '--cleanup') {
    for (const d of ['pd.na.a.pvp.net', 'pd.br.a.pvp.net', 'pd.eu.a.pvp.net', 'pd.ap.a.pvp.net', 'pd.kr.a.pvp.net'])
      removeHosts(d);
    removeCA();
    return;
  }
  if (arg === '--reaver') {
    const { data } = await (await fetch('https://valorant-api.com/v1/weapons/skins')).json();
    for (const s of data.filter(s => s.displayName.toLowerCase().includes('reaver')))
      console.log(`  ${Y}${s.uuid}${S}  ${G}${s.displayName}${S}`);
    return;
  }

  process.on('SIGINT', () => { cleanup(); process.exit(0); });

  const valo = await Valorant.connect();
  const domain = `pd.${valo.shard}.a.pvp.net`;
  console.log(`\n${C}═══ Swapper ═══${S}\n  Domain: ${domain}\n  Skin: ${arg}\n`);

  try { await valo.equipSkin(arg); console.log(`  ${G}✅ API OK${S}`); }
  catch { console.log(`  ${Y}API rejected, using proxy${S}`); }

  generateCerts(domain);
  installCA();
  addHosts(domain);
  startServer(domain, arg);
}

main().catch(e => { console.error(`\n${R}${e.message}${S}`); process.exit(1); });
