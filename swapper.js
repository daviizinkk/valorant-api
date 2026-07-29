/**
 * @file VALORANT Skin Swapper — search skins, equip owned ones
 *
 * Safe usage only. Does NOT modify hosts file or intercept traffic.
 *
 * Usage:  node swapper.js <skinUuid>    # Equip a skin (must own it)
 *         node swapper.js --reaver      # Look up skin UUIDs
 *         node swapper.js --cleanup     # Remove any leftover hosts entries
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { Valorant } from './src/index.js';

const G = '\x1b[32m', Y = '\x1b[33m', C = '\x1b[36m', S = '\x1b[0m';
const HOSTS = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\drivers\\etc\\hosts`;

function removeHosts() {
  try {
    const h = readFileSync(HOSTS, 'utf8');
    const cleaned = h.split('\n').filter(l => !l.includes('a.pvp.net')).join('\n');
    if (cleaned !== h) { writeFileSync(HOSTS, cleaned); console.log('  Cleaned hosts'); }
  } catch {}
}

async function main() {
  const arg = process.argv[2];
  if (!arg || arg === '--help') {
    console.log(`\n${C}Swapper${S}\n  node swapper.js --reaver\n  node swapper.js <uuid>  (must own the skin)\n`);
    return;
  }
  if (arg === '--cleanup') { removeHosts(); return; }
  if (arg === '--reaver') {
    const { data } = await (await fetch('https://valorant-api.com/v1/weapons/skins')).json();
    for (const s of data.filter(s => s.displayName.toLowerCase().includes('reaver')))
      console.log(`  ${Y}${s.uuid}${S}  ${G}${s.displayName}${S}`);
    return;
  }

  const valo = await Valorant.connect();
  try {
    await valo.equipSkin(arg);
    console.log(`  ${G}✅ Equipped!${S}`);
  } catch (e) {
    console.log(`  ${Y}Can't equip:${S} ${e.message}`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
