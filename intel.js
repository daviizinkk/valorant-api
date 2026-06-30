/**
 * @file VALORANT Live Match Intel — Console App
 *
 * Watches for an active game and prints everything:
 * agents, loadouts, map, teams, and more.
 *
 * Usage: node intel.js
 */

import { Valorant } from './src/index.js';

// ── Colors ───────────────────────────────────────────────────
const R = '\x1b[31m'; const G = '\x1b[32m'; const Y = '\x1b[33m';
const C = '\x1b[36m'; const D = '\x1b[2m'; const S = '\x1b[0m';

// ── Agent UUID → Name ────────────────────────────────────────
const AGENTS = {};
async function loadAgents() {
  try {
    const res = await fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
    const { data } = await res.json();
    if (data) for (const a of data) AGENTS[a.uuid] = a.displayName;
  } catch {}
}

// ── Weapon UUID → Name ──────────────────────────────────────
const WEAPONS = {};
async function loadWeapons() {
  try {
    const res = await fetch('https://valorant-api.com/v1/weapons');
    const { data } = await res.json();
    if (data) for (const w of data) WEAPONS[w.uuid] = w.displayName;
  } catch {}
}

function agentName(uuid) { return AGENTS[uuid] || uuid?.slice(0, 8); }
function weaponName(uuid) { return WEAPONS[uuid] || uuid?.slice(0, 8); }

function section(title) { console.log(`\n${C}═══ ${title} ═══${S}`); }
function kv(k, v) { console.log(`  ${D}${k}:${S} ${v}`); }

// ── Map ID to readable name ──────────────────────────────────
function mapName(id) {
  const map = id?.split('/').pop();
  return map || '—';
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`${C}
   ╔════════════════════════════════════╗
   ║   VALORANT Live Match Intel        ║
   ║   Waiting for an active game...    ║
   ╚════════════════════════════════════╝${S}\n`);

  await Promise.all([loadAgents(), loadWeapons()]);
  kv('Metadata loaded', `${Object.keys(AGENTS).length} agents, ${Object.keys(WEAPONS).length} weapons`);

  const valo = await Valorant.connect();
  kv('Connected', `${valo.region.toUpperCase()}`);

  let lastMatchId = null;

  while (true) {
    try {
      const cg = await valo.getCurrentGamePlayer();

      if (cg.MatchID && cg.MatchID !== lastMatchId) {
        lastMatchId = cg.MatchID;
        await renderMatch(valo, cg);
      } else if (!cg.MatchID) {
        if (lastMatchId !== null) {
          console.clear();
          console.log(`${Y}⏸  Left match. Waiting for next game...${S}\n`);
          lastMatchId = null;
        }
      }

      // Also check pre-game (agent select)
      try {
        const pg = await valo.getPregamePlayer();
        if (pg.MatchID && pg.MatchID !== lastMatchId) {
          lastMatchId = pg.MatchID;
          await renderPregame(valo, pg);
        }
      } catch {}
    } catch {
      if (lastMatchId !== null) {
        console.clear();
        console.log(`${Y}⏸  Left match.${S}\n`);
        lastMatchId = null;
      }
    }

    await new Promise(r => setTimeout(r, 3000));
  }
}

// ── Render match ─────────────────────────────────────────────
async function renderMatch(valo, player) {
  console.clear();

  console.log(`${R}
   ╔════════════════════════════════════╗
   ║           🎮  IN GAME              ║
   ╚════════════════════════════════════╝${S}\n`);

  let match;
  try { match = await valo.getCurrentGameMatch(player.MatchID); }
  catch (err) { console.log(`${R}✗ ${err.message}${S}`); return; }

  kv('Match ID', player.MatchID.slice(0, 12) + '…');

  // ── Map ─────────────────────────────────────────────────
  section('Map');
  kv('Map', mapName(match.MapID));
  kv('Mode', match.ProvisioningFlow || match.ModeID || '—');
  if (match.GamePhase) kv('Phase', match.GamePhase);
  if (match.RoundTimer) kv('Time', formatTime(match.RoundTimer));

  // ── Players with agents & levels ─────────────────────────
  if (match.Players?.length) {
    section(`Players (${match.Players.length})`);
    for (const p of match.Players) {
      const team = p.TeamID === 'Red' ? '🔴' : '🔵';
      const agent = agentName(p.CharacterID);
      const level = p.AccountLevel !== undefined ? `Lv${p.AccountLevel}` : '';
      const title = p.PlayerTitleID ? p.PlayerTitleID.slice(0, 6) + '…' : '';

      console.log(`  ${team} ${G}${agent}${S}  ${Y}${level}${S} ${D}${title}${S}`);
    }
  }

  // ── Loadout (only bought weapons) ────────────────────────
  if (match.Players?.length) {
    section('Loadout (bought weapons)');
    for (const p of match.Players) {
      const agent = agentName(p.CharacterID);
      const level = p.AccountLevel !== undefined ? `Lv${p.AccountLevel}` : '';
      console.log(`\n  ${agent} ${D}${level}${S}`);

      const items = p.Loadout?.Items;
      if (items) {
        const slots = Object.entries(items).filter(
          ([slot]) => !slot.startsWith('Ability') && !slot.startsWith('Passive')
        );

        for (const [slot, item] of slots) {
          const wName = weaponName(item.ID);
          const skin = item.SkinID ? item.SkinID.slice(0, 6) + '…' : '';
          // Armor shows as a separate item, show it compactly
          if (slot === 'Armor') {
            console.log(`    🛡️  ${wName}${skin ? ' (' + skin + ')' : ''}`);
          } else {
            console.log(`    🔫 ${wName}${skin ? ' (' + skin + ')' : ''}`);
          }
        }
      }
    }
  }

  console.log(`\n${D}🔄 Refreshing every 3s... (Ctrl+C to quit)${S}`);
}

// ── Render pre-game (agent select) ────────────────────────────
async function renderPregame(valo, pg) {
  console.clear();

  console.log(`${R}
   ╔════════════════════════════════════╗
   ║       ⚔️  AGENT SELECT             ║
   ╚════════════════════════════════════╝${S}\n`);

  kv('Match ID', pg.MatchID.slice(0, 12) + '…');

  let match;
  try { match = await valo.getPregameMatch(pg.MatchID); }
  catch { return; }

  if (match.MapID) section('Map');
  kv('Map', mapName(match.MapID));

  if (match.AllyTeam?.Players?.length || match.EnemyTeam?.Players?.length) {
    const total = (match.AllyTeam?.Players?.length || 0) + (match.EnemyTeam?.Players?.length || 0);
    section(`Players (${total})`);

    if (match.AllyTeam?.Players) {
      console.log(`  ${C}Team${S}`);
      for (const p of match.AllyTeam.Players) {
        const agent = agentName(p.CharacterID);
        const level = p.AccountLevel !== undefined ? `Lv${p.AccountLevel}` : '';
        console.log(`    ${agent || 'TBD'}  ${Y}${level}${S} ${D}${p.Subject?.slice(0, 6)}${S}`);
      }
    }
  }

  console.log(`\n${D}🔄 Refreshing every 3s... (Ctrl+C to quit)${S}`);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

main().catch(err => {
  console.error(`${R}Fatal:${S} ${err.message}`);
  process.exit(1);
});
