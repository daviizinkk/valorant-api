/**
 * @file VALORANT Skin Swapper — local HTTPS using Windows cert store
 *
 * Run AS ADMINISTRATOR. Uses PowerShell's built-in cert generation.
 *
 * Usage:  node swapper.js <skinUuid>
 *         node swapper.js --reaver
 *         node swapper.js --cleanup
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:https';
import { request as httpsRequest } from 'node:https';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { Valorant } from './src/index.js';

const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', C = '\x1b[36m', D = '\x1b[2m', S = '\x1b[0m';
const DIR = join(homedir(), '.valorant-swapper');
const PFX = join(DIR, 'server.pfx');
const CA_CERT = join(DIR, 'ca-cert.cer');
const HOSTS = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\drivers\\etc\\hosts`;
const PORT = 443, PWD = 'swapper123';

function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true }); }

function execPS(script, name) {
  ensureDir();
  const psFile = join(DIR, `${name || 's'}.ps1`);
  writeFileSync(psFile, script, 'utf8');
  return execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { encoding: 'utf8', timeout: 30000 });
}

function generateCerts(domain) {
  ensureDir();
  if (existsSync(PFX)) { console.log(`  ${D}Certs exist${S}`); return; }
  console.log(`  ${Y}Creating certificates...${S}`);

  execPS(`
$ca = New-SelfSignedCertificate -DnsName "VALORANT Swapper CA" -CertStoreLocation Cert:\\LocalMachine\\My -KeyUsage CertSign -NotAfter (Get-Date).AddYears(10) -Type Custom -TextExtension @("2.5.29.19={text}ca=1")
$root = Get-Item Cert:\\LocalMachine\\Root
$root.Open("ReadWrite")
$root.Add($ca)
$root.Close()
Export-Certificate -Cert $ca -FilePath "${CA_CERT}" -Type CERT | Out-Null
`, 'ca');
  console.log(`  ${G}✅ CA cert ready${S}`);

  execPS(`
$ca = Get-ChildItem Cert:/LocalMachine/My | Where-Object { $_.DnsNameList -contains "VALORANT Swapper CA" } | Select-Object -First 1
$cert = New-SelfSignedCertificate -DnsName "${domain}","*.${domain.split('.').slice(1).join('.')}" -CertStoreLocation Cert:/LocalMachine/My -Signer $ca -NotAfter (Get-Date).AddYears(1)
$pwd = ConvertTo-SecureString -String "${PWD}" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "${PFX}" -Password $pwd | Out-Null
`, 'server');
  console.log(`  ${G}✅ Server cert ready${S}`);
}

function removeCerts() {
  execPS(`
Get-ChildItem Cert:/LocalMachine/My, Cert:/LocalMachine/Root | Where-Object { $_.Subject -like "*Swapper*" } | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem Cert:/LocalMachine/My | Where-Object { $_.DnsNameList -like "*pd.*" } | Remove-Item -Force -ErrorAction SilentlyContinue
Write-Output "ok"
`, 'clean');
}

function addHosts(domain) {
  try {
    let h = readFileSync(HOSTS, 'utf8');
    if (h.includes(` ${domain}`)) h = h.split('\n').map(l => l.includes(` ${domain}`) ? `127.0.0.1 ${domain}` : l).join('\n');
    else h += `\n127.0.0.1 ${domain}\n`;
    writeFileSync(HOSTS, h);
    console.log(`  ${G}✅ Hosts: 127.0.0.1 ${domain}${S}`);
  } catch {}
}
function removeHosts(d) { try { let h = readFileSync(HOSTS, 'utf8'); writeFileSync(HOSTS, h.split('\n').filter(l => !l.includes(d)).join('\n')); } catch {} }

function startServer(domain, skinUuid) {
  let patched = 0;
  const server = createServer({ pfx: readFileSync(PFX), passphrase: PWD }, async (req, res) => {
    const fwd = httpsRequest({
      hostname: domain, port: 443, path: req.url, method: req.method,
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
    fwd.on('error', () => { try { res.writeHead(502).end('Error'); } catch {} });
    req.pipe(fwd);
  });
  server.listen(PORT, () => { console.log(`\n  ${G}✅ Server on https://${domain}:${PORT}${S}\n`); });
}

async function main() {
  const arg = process.argv[2];
  if (!arg || arg === '--help') { console.log(`\nSwapper\n  node swapper.js <uuid>\n  node swapper.js --reaver\n  node swapper.js --cleanup\n`); return; }

  if (arg === '--cleanup') {
    for (const d of ['pd.na.a.pvp.net', 'pd.br.a.pvp.net', 'pd.eu.a.pvp.net', 'pd.ap.a.pvp.net', 'pd.kr.a.pvp.net']) removeHosts(d);
    removeCerts();
    console.log(`  ${G}✅ Cleaned${S}`); return;
  }

  if (arg === '--reaver') {
    const { data } = await (await fetch('https://valorant-api.com/v1/weapons/skins')).json();
    for (const s of data.filter(s => s.displayName.toLowerCase().includes('reaver')))
      console.log(`  ${Y}${s.uuid}${S}  ${G}${s.displayName}${S}`);
    return;
  }

  process.on('SIGINT', () => {
    for (const d of ['pd.na.a.pvp.net', 'pd.br.a.pvp.net', 'pd.eu.a.pvp.net', 'pd.ap.a.pvp.net', 'pd.kr.a.pvp.net']) removeHosts(d);
    removeCerts();
    process.exit(0);
  });

  const valo = await Valorant.connect();
  const domain = `pd.${valo.shard}.a.pvp.net`;
  console.log(`\n${C}═══ Swapper ═══${S}\n  Domain: ${domain}\n  Skin: ${arg}\n`);
  try { await valo.equipSkin(arg); console.log(`  ${G}✅ API OK${S}`); } catch { console.log(`  ${Y}API rejected${S}`); }

  generateCerts(domain);
  addHosts(domain);
  startServer(domain, arg);
}

main().catch(e => { console.error(`\n${R}${e.message}${S}`); process.exit(1); });
