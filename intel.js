/**
 * @file VALORANT Live Match Intel — Console App
 *
 * Watches for an active game and prints everything:
 * agents, loadouts, map, round info, teams, and more.
 *
 * Usage: node intel.js
 * Keep VALORANT running and jump into a match.
 */

import { Valorant } from './src/index.js';

// ── Colors ───────────────────────────────────────────────────
const R = '\x1b[31m'; const G = '\x1b[32m'; const Y = '\x1b[33m';
const B = '\x1b[34m'; const M = '\x1b[35m'; const C = '\x1b[36m';
const W = '\x1b[37m'; const D = '\x1b[2m'; const S = '\x1b[0m';

// ── Agent UUID → Name mapping ───────────────────────────────
const AGENTS = {};

async function loadAgents() {
  try {
    const res = await fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
    const data = await res.json();
    if (data.status === 200) {
      for (const a of data.data) {
        AGENTS[a.uuid] = a.displayName;
      }
    }
  } catch {}
}

// ── Helpers ──────────────────────────────────────────────────
function agentName(uuid) {
  return AGENTS[uuid] || uuid?.slice(0, 8) + '…' || 'Unknown';
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function section(title) {
  console.log(`\n${C}═══ ${title} ═══${S}`);
}

function kv(key, value) {
  console.log(`  ${D}${key}:${S} ${value}`);
}

// ── Fetch metadata for weapon names ──────────────────────────
const WEAPON_NAMES = {};
async function loadWeaponNames() {
  try {
    const res = await fetch('https://valorant-api.com/v1/weapons');
    const data = await res.json();
    if (data.status === 200) {
      for (const w of data.data) {
        WEAPON_NAMES[w.uuid] = w.displayName;
      }
    }
  } catch {}
}

function weaponName(uuid) {
  return WEAPON_NAMES[uuid] || uuid?.slice(0, 8) + '…' || 'Unknown';
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`${C}
   ╔════════════════════════════════════╗
   ║   VALORANT Live Match Intel        ║
   ║   Waiting for an active game...    ║
   ╚════════════════════════════════════╝${S}\n`);

  // Load agent & weapon names
  await Promise.all([loadAgents(), loadWeaponNames()]);
  kv('Agents loaded', Object.keys(AGENTS).length);
  kv('Weapons loaded', Object.keys(WEAPON_NAMES).length);

  // Connect
  const valo = await Valorant.connect();
  kv('Connected', `${valo.region.toUpperCase()} / ${valo.shard}`);

  // ── Poll for current game ──────────────────────────────
  let lastMatchId = null;

  while (true) {
    try {
      const player = await valo.getCurrentGamePlayer();
      console.log(player)

      if (player.MatchID && player.MatchID !== lastMatchId) {
        lastMatchId = player.MatchID;
        await renderMatch(valo, player);
      } else if (!player.MatchID) {
        // Not in a match — clear display
        if (lastMatchId !== null) {
          console.clear();
          console.log(`${Y}⏸  Left match. Waiting for next game...${S}\n`);
          lastMatchId = null;
        }
      }
    } catch (err) {
      if (lastMatchId !== null) {
        console.clear();
        console.log(`${Y}⏸  Left match. Waiting...${S}\n`);
        lastMatchId = null;
      }
    }

    // Poll every 3 seconds
    await new Promise(r => setTimeout(r, 3000));
  }
}

// ── Render match info ────────────────────────────────────────
async function renderMatch(valo, player) {
  console.clear();

  console.log(`${R}
   ╔════════════════════════════════════╗
   ║        🎮  MATCH FOUND!            ║
   ╚════════════════════════════════════╝${S}\n`);

  kv('Match ID', player.MatchID);
  kv('PUUID', player.Subject || player.puuid || '…');
  kv('Team', player.TeamID || '—');
  kv('Captain', player.IsCaptain ? 'Yes' : 'No');
  console.log('');

  // ── Fetch full match data ──────────────────────────────
  let match;
  try {
    match = await valo.getCurrentGameMatch(player.MatchID);
  } catch (err) {
    console.log(`${R}✗ Could not fetch match data: ${err.message}${S}`);
    return;
  }

  // ── Map info ───────────────────────────────────────────
  section('Map');
  kv('ID', match.MapID || '—');
  kv('Mode', match.GameMode || '—');
  kv('Queue', match.QueueID || '—');
  kv('Provisioning Flow', match.ProvisioningFlow || '—');

  if (match.GamePhase) {
    kv('Phase', match.GamePhase);
  }
  if (match.RoundTimer) {
    kv('Round Timer', formatTime(match.RoundTimer));
  }

  // ─── Teams ─────────────────────────────────────────────
  if (match.Teams && match.Teams.length > 0) {
    section('Teams');
    for (const team of match.Teams) {
      const side = team.TeamID === 'Red' ? '🔴' : '🔵';
      console.log(`  ${side} ${team.TeamID || 'Unknown'}`);
      if (team.RoundsPlayed !== undefined) kv('  Rounds won', team.RoundsPlayed);
      if (team.Score !== undefined) kv('  Score', team.Score);
      if (team.NumPlayers !== undefined) kv('  Players', team.NumPlayers);
    }
  }

  // ─── Players / Agents / Loadouts ──────────────────────
  if (match.Players && match.Players.length > 0) {
    section(`Players (${match.Players.length})`);

    for (const p of match.Players) {
      const name = p.Subject?.slice(0, 8) || 'Unknown';
      const agent = agentName(p.CharacterID);
      const team = p.TeamID === 'Red' ? '🔴' : '🔵';
      const level = p.AccountLevel !== undefined ? `Lv${p.AccountLevel}` : '';

      console.log(`  ${team} ${G}${agent}${S} ${D}(${name})${S} ${level ? Y + level + S : ''}`);

      // Loadout
      if (p.Loadout?.Items) {
        const weapons = Object.entries(p.Loadout.Items)
          .filter(([slot]) => !slot.startsWith('Armor') && !slot.startsWith('Ability'))
          .map(([slot, item]) => `${weaponName(item.ID)}${item.SocketID ? ' (' + item.SocketID + ')' : ''}`);

        if (weapons.length > 0) {
          console.log(`    ${D}Weapons:${S} ${weapons.join(', ')}`);
        }
      }

      // Player title if available
      if (p.PlayerTitleID) {
        console.log(`    ${D}Title:${S} ${p.PlayerTitleID.slice(0, 12)}…`);
      }
    }
  }

  // ─── Fetch Loadouts (detailed per-player) ──────────────
  section('Detailed Loadouts');
  try {
    const loadouts = await valo.getCurrentGameLoadouts(player.MatchID);

    if (loadouts.Loadouts) {
      for (const entry of loadouts.Loadouts) {
        const playerId = entry.Subject || 'Unknown';
        console.log(`\n  ${C}Player: ${playerId.slice(0, 12)}…${S}`);

        if (entry.Loadout?.Items) {
          for (const [slot, item] of Object.entries(entry.Loadout.Items)) {
            const name = weaponName(item.ID);
            console.log(`    ${slot}: ${G}${name}${S}`);
            if (item.SkinID) {
              console.log(`      ${D}Skin:${S} ${item.SkinID.slice(0, 12)}…`);
            }
          }
        }
      }
    } else {
      console.log(`  ${D}No loadout data available${S}`);
    }
  } catch (err) {
    console.log(`  ${D}Loadouts: ${err.message}${S}`);
  }

  // ─── Abilities / Cooldowns ──────────────────────────────
  if (match.CharacterData) {
    section('Abilities');
    // The structure varies — show what's available
    for (const [cid, data] of Object.entries(match.CharacterData)) {
      console.log(`  ${agentName(cid)}`);
      if (data.UltimatePoints !== undefined) kv('  Ult points', data.UltimatePoints);
      if (data.UltimateUsed !== undefined) kv('  Ults used', data.UltimateUsed);
    }
  }

  // ─── Coaching ──────────────────────────────────────────
  if (match.CoachTeam) {
    section('Coaching');
    for (const [cid, info] of Object.entries(match.CoachTeam)) {
      console.log(`  Coach for ${cid}: ${JSON.stringify(info)}`);
    }
  }

  // ─── Timestamps ────────────────────────────────────────
  section('Timing');
  if (match.GameStartTime) {
    const start = new Date(match.GameStartTime * 1000);
    kv('Started', start.toLocaleTimeString());
  }
  if (match.ServerTickRate) {
    kv('Server Tick Rate', `${match.ServerTickRate} Hz`);
  }

  console.log(`\n${D}🔄 Auto-refreshing every 3s... (Ctrl+C to quit)${S}`);
}

main().catch(err => {
  console.error(`${R}Fatal:${S} ${err.message}`);
  process.exit(1);
});
