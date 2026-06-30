/**
 * @file VALORANT Dashboard — Frontend App
 * Shows human-readable skin/weapon names and images everywhere.
 */

// ── State ────────────────────────────────────────────────────
const state = {
  loadout: null,
  /** Map<weaponUuid, { displayName, displayIcon, skins: Map<skinUuid, {displayName, displayIcon, levels, chromas}> }> */
  weaponMap: new Map(),
  allCards: null,
  allTitles: null,
  connected: false,
};

// ── DOM helpers ──────────────────────────────────────────────
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ── Tabs ─────────────────────────────────────────────────────
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    $$('.tab').forEach(t => t.classList.remove('visible'));
    btn.classList.add('active');
    const tab = document.getElementById(`tab-${btn.dataset.tab}`);
    if (tab) tab.classList.add('visible');
  });
});

// ── API helpers ──────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok && data.error) throw new Error(data.error);
  return data;
}
const GET = p => api('GET', p);
const PUT = (p, b) => api('PUT', p, b);

// ── Status ───────────────────────────────────────────────────
async function checkStatus() {
  const dot = $('#statusDot');
  const text = $('#statusText');
  try {
    const s = await GET('/api/status');
    if (s.connected) {
      state.connected = true;
      dot.className = 'dot connected';
      text.textContent = `Connected (${s.region.toUpperCase()})`;
      return s;
    }
    throw new Error('No connection');
  } catch (err) {
    state.connected = false;
    dot.className = 'dot error';
    text.textContent = `Offline`;
    return null;
  }
}

// ── Weapon/skin name resolution ──────────────────────────────
async function loadWeaponMap() {
  try {
    const weapons = await GET('/api/weapons');
    for (const w of weapons) {
      const skinMap = new Map();
      if (w.skins) {
        for (const s of w.skins) {
          skinMap.set(s.uuid, s);
        }
      }
      state.weaponMap.set(w.uuid, {
        displayName: w.displayName,
        displayIcon: w.displayIcon,
        skins: skinMap,
        defaultSkinUuid: w.defaultSkinUuid,
      });
    }
  } catch (err) {
    console.warn('Failed to load weapon map:', err.message);
  }
}

function resolveWeapon(uuid) {
  return state.weaponMap.get(uuid) || null;
}

function resolveSkin(weaponUuid, skinUuid) {
  const weapon = resolveWeapon(weaponUuid);
  return weapon?.skins?.get(skinUuid) || null;
}

// ── Currency names ───────────────────────────────────────────
const CURRENCY_NAMES = {
  '85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741': 'VP',
  '85ca954a-41f2-ce94-9b45-8ca3dd39a00d': 'Radianite',
  'e59aa87c-4cbf-517a-5983-6e81511be9b7': 'Kingdom Credits',
  'f08d4ae3-939c-4576-ab26-09ce1f23bb37': 'Trophy',
};

// ── Image fallback ───────────────────────────────────────────
function imgTag(src, alt, cls = '') {
  const letter = (alt && alt[0]) || '?';
  return `<img src="${src || ''}" alt="${alt}" class="${cls}" loading="lazy"
    onerror="this.onerror=null;this.src='data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#1a2838" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="#4a6a80" font-size="32" font-weight="700">${letter}</text></svg>`)}'">`;
}

// ── Overview Tab ─────────────────────────────────────────────
async function renderOverview() {
  const statsEl = $('#overviewStats');
  const cardsEl = $('#overviewCards');

  try {
    const [status, loadout] = await Promise.all([GET('/api/status'), GET('/api/loadout')]);
    state.loadout = loadout;
    let walletData = null;
    try { walletData = await GET('/api/wallet'); } catch {}

    let html = `
      <div class="stat-card"><div class="label">Region</div><div class="value">${status.region.toUpperCase()}</div></div>
      <div class="stat-card"><div class="label">Shard</div><div class="value">${status.shard.toUpperCase()}</div></div>
      <div class="stat-card"><div class="label">Loadout</div><div class="value">v${loadout.Version}</div></div>
      <div class="stat-card"><div class="label">Account Level</div><div class="value">${loadout.Identity.AccountLevel}</div></div>
      <div class="stat-card"><div class="label">Weapons</div><div class="value">${loadout.Guns.length}</div></div>
      <div class="stat-card"><div class="label">Sprays</div><div class="value">${loadout.Sprays.length}</div></div>
    `;

    if (walletData?.Balances) {
      html += Object.entries(walletData.Balances).map(([id, amt]) =>
        `<div class="stat-card"><div class="label">${CURRENCY_NAMES[id] || '??'}</div><div class="value">${amt.toLocaleString()}</div></div>`
      ).join('');
    }

    statsEl.innerHTML = html;

    // Resolve player card name
    let cardName = loadout.Identity.PlayerCardID;
    let titleName = loadout.Identity.PlayerTitleID;
    try {
      const cards = await GET('/api/cards');
      const found = cards.results.find(c => c.uuid === loadout.Identity.PlayerCardID);
      if (found) cardName = found.displayName;
    } catch {}
    try {
      const titles = await GET('/api/titles');
      const found = titles.results.find(t => t.uuid === loadout.Identity.PlayerTitleID);
      if (found) titleName = found.titleText || found.displayName;
    } catch {}

    cardsEl.innerHTML = `
      <div class="loadout-id-card">
        <div class="id-item"><div class="id-label">Player Card</div><div class="id-value">${cardName}</div></div>
        <div class="id-item"><div class="id-label">Player Title</div><div class="id-value">${titleName}</div></div>
        <div class="id-item"><div class="id-label">Incognito</div><div class="id-value">${loadout.Incognito ? 'Yes' : 'No'}</div></div>
      </div>
    `;
  } catch (err) {
    statsEl.innerHTML = `<div class="stat-card" style="grid-column:1/-1;color:var(--accent)">⚠ ${err.message}</div>`;
  }
}

// ── Loadout Tab (now with skin images & names!) ─────────────
async function renderLoadout() {
  const identityEl = $('#loadoutIdentity');
  const weaponsEl = $('#loadoutWeapons');

  try {
    const loadout = await GET('/api/loadout');
    state.loadout = loadout;

    // Resolve card/title names for the identity section
    let cardName = loadout.Identity.PlayerCardID;
    let titleName = loadout.Identity.PlayerTitleID;
    try {
      const cards = await GET('/api/cards');
      const found = cards.results.find(c => c.uuid === loadout.Identity.PlayerCardID);
      if (found) cardName = found.displayName;
    } catch {}
    try {
      const titles = await GET('/api/titles');
      const found = titles.results.find(t => t.uuid === loadout.Identity.PlayerTitleID);
      if (found) titleName = found.titleText || found.displayName;
    } catch {}

    identityEl.innerHTML = `
      <div class="loadout-id-card">
        <div class="id-item"><div class="id-label">Player Card</div><div class="id-value">${cardName}</div></div>
        <div class="id-item"><div class="id-label">Player Title</div><div class="id-value">${titleName}</div></div>
        <div class="id-item"><div class="id-label">Level Border</div><div class="id-value">${loadout.Identity.PreferredLevelBorderID.slice(0, 16)}…</div></div>
      </div>
    `;

    // Build weapon cards with resolved skin names & icons
    weaponsEl.innerHTML = loadout.Guns.map(gun => {
      const weapon = resolveWeapon(gun.ID);
      const weaponName = weapon?.displayName || gun.ID.slice(0, 8) + '…';
      const weaponIcon = weapon?.displayIcon || '';

      // Find the actual skin name & icon
      let skinName = 'Unknown Skin';
      let skinIcon = '';
      if (weapon?.skins) {
        const skin = weapon.skins.get(gun.SkinID);
        if (skin) {
          skinName = skin.displayName;
          skinIcon = skin.displayIcon || '';
        } else {
          // Try to get at least something from the default skin
          const defaultSkin = weapon.skins.get(weapon.defaultSkinUuid);
          if (defaultSkin) skinIcon = defaultSkin.displayIcon || '';
        }
      }

      return `
        <div class="weapon-card">
          <div class="wicon">${imgTag(weaponIcon, weaponName)}</div>
          <div class="info">
            <div class="wname">${weaponName}</div>
            <div class="wskin-badge">${skinName}</div>
            <div class="wsub">Chroma: ${gun.ChromaID.slice(0, 12)}…</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    identityEl.innerHTML = `<p class="hint">⚠ ${err.message}</p>`;
  }
}

// ── Skins Tab ────────────────────────────────────────────────
async function initSkins() {
  $('#skinsSearchBtn').addEventListener('click', searchSkins);
  $('#skinsSearch').addEventListener('keydown', e => { if (e.key === 'Enter') searchSkins(); });
  await searchSkins();
}

async function searchSkins() {
  const q = $('#skinsSearch').value.trim();
  const resultsEl = $('#skinsResults');
  const equipEl = $('#equipArea');

  resultsEl.innerHTML = '<p class="hint">🔍 Loading skins…</p>';

  try {
    const data = q
      ? await GET(`/api/skins?q=${encodeURIComponent(q)}`)
      : await GET('/api/skins');
    const results = (data.results || []).slice(0, 60);

    if (results.length === 0) { resultsEl.innerHTML = '<p class="hint">No skins found.</p>'; return; }

    resultsEl.innerHTML = results.map(skin => `
      <div class="cosmetic-card" data-uuid="${skin.uuid}" data-name="${skin.displayName.replace(/"/g, '&quot;')}">
        ${imgTag(skin.displayIcon, skin.displayName)}
        <div class="name">${skin.displayName}</div>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.cosmetic-card').forEach(el => {
      el.addEventListener('click', async () => {
        const uuid = el.dataset.uuid;
        const name = el.dataset.name;
        equipEl.className = 'equip-area';
        equipEl.innerHTML = `⏳ Equipping "${name}"…`;

        try {
          const result = await PUT('/api/equip-skin', { uuid });
          equipEl.className = 'equip-area success';
          equipEl.innerHTML = `✅ Equipped "${name}"! (v${result.loadout.Version})`;
          resultsEl.querySelectorAll('.cosmetic-card').forEach(c => c.classList.remove('selected'));
          el.classList.add('selected');
        } catch (err) {
          equipEl.className = 'equip-area error';
          equipEl.innerHTML = `❌ ${err.message}`;
        }
      });
    });
  } catch (err) {
    resultsEl.innerHTML = `<p class="hint">Error: ${err.message}</p>`;
  }
}

// ── Cards Tab ────────────────────────────────────────────────
async function initCards() {
  $('#cardsSearchBtn').addEventListener('click', searchCards);
  $('#cardsSearch').addEventListener('keydown', e => { if (e.key === 'Enter') searchCards(); });
  await searchCards();
}

async function searchCards() {
  const q = $('#cardsSearch').value.trim();
  const el = $('#cardsResults');
  const equipEl = $('#cardEquipArea');

  el.innerHTML = '<p class="hint">🔍 Loading cards…</p>';

  try {
    const data = await GET(`/api/cards?q=${encodeURIComponent(q)}`);
    const results = (data.results || []).slice(0, 60);
    if (results.length === 0) { el.innerHTML = '<p class="hint">No cards found.</p>'; return; }

    el.innerHTML = results.map(card => `
      <div class="cosmetic-card" data-uuid="${card.uuid}" data-name="${card.displayName.replace(/"/g, '&quot;')}">
        ${imgTag(card.smallArt || card.displayIcon, card.displayName)}
        <div class="name">${card.displayName}</div>
      </div>
    `).join('');

    el.querySelectorAll('.cosmetic-card').forEach(c => {
      c.addEventListener('click', async () => {
        const uuid = c.dataset.uuid;
        const name = c.dataset.name;
        equipEl.className = 'equip-area';
        equipEl.innerHTML = `⏳ Setting card "${name}"…`;

        try {
          await PUT('/api/player-card', { uuid });
          equipEl.className = 'equip-area success';
          equipEl.innerHTML = `✅ Card set to "${name}"!`;
          el.querySelectorAll('.cosmetic-card').forEach(x => x.classList.remove('selected'));
          c.classList.add('selected');
        } catch (err) {
          equipEl.className = 'equip-area error';
          equipEl.innerHTML = `❌ ${err.message}`;
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="hint">Error: ${err.message}</p>`;
  }
}

// ── Titles Tab ───────────────────────────────────────────────
async function initTitles() {
  $('#titlesSearchBtn').addEventListener('click', searchTitles);
  $('#titlesSearch').addEventListener('keydown', e => { if (e.key === 'Enter') searchTitles(); });
  await searchTitles();
}

async function searchTitles() {
  const q = $('#titlesSearch').value.trim();
  const el = $('#titlesResults');
  const equipEl = $('#titleEquipArea');

  el.innerHTML = '<p class="hint">🔍 Loading titles…</p>';

  try {
    const data = await GET(`/api/titles?q=${encodeURIComponent(q)}`);
    const results = (data.results || []).slice(0, 100);
    if (results.length === 0) { el.innerHTML = '<p class="hint">No titles found.</p>'; return; }

    el.innerHTML = results.map(t => `
      <div class="list-item" data-uuid="${t.uuid}" data-name="${(t.titleText || t.displayName || '').replace(/"/g, '&quot;')}">
        ${t.titleText || t.displayName || '(Unnamed)'}
      </div>
    `).join('');

    el.querySelectorAll('.list-item').forEach(item => {
      item.addEventListener('click', async () => {
        const uuid = item.dataset.uuid;
        const name = item.dataset.name;
        equipEl.className = 'equip-area';
        equipEl.innerHTML = `⏳ Setting title "${name}"…`;

        try {
          await PUT('/api/player-title', { uuid });
          equipEl.className = 'equip-area success';
          equipEl.innerHTML = `✅ Title set to "${name}"!`;
          el.querySelectorAll('.list-item').forEach(x => x.classList.remove('selected'));
          item.classList.add('selected');
        } catch (err) {
          equipEl.className = 'equip-area error';
          equipEl.innerHTML = `❌ ${err.message}`;
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="hint">Error: ${err.message}</p>`;
  }
}

// ── Store Tab ────────────────────────────────────────────────
async function renderStore() {
  const el = $('#storeContent');
  el.innerHTML = '<p class="hint">🔄 Loading store…</p>';

  try {
    const store = await GET('/api/store');
    let html = '';

    if (store.FeaturedBundle?.Bundle) {
      const b = store.FeaturedBundle;
      html += `<div class="store-section">
        <h3>🌟 Featured Bundle</h3>
        <p style="font-size:13px;color:var(--fg-muted)">Bundle ID: ${b.Bundle.DataAssetID}</p>
        <p style="font-size:13px;color:var(--fg-muted)">${Math.round(b.BundleRemainingDurationInSeconds / 3600)}h remaining</p>
      </div>`;
    }

    if (store.SkinsPanelLayout?.SingleItemOffers) {
      const s = store.SkinsPanelLayout;
      html += `<div class="store-section"><h3>🔄 Daily Offers</h3><div style="display:flex;flex-wrap:wrap;gap:6px">`;
      for (const offer of s.SingleItemOffers) {
        html += `<span style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-pill);padding:6px 14px;font-size:11px;font-weight:500">${offer.slice(0, 12)}…</span>`;
      }
      html += `</div><p style="color:var(--fg-muted);font-size:12px;margin-top:8px">${Math.round(s.SingleItemOffersRemainingDurationInSeconds / 3600)}h remaining</p></div>`;
    }

    if (store.BonusStore) {
      html += `<div class="store-section"><h3>🌙 Night Market Active</h3>
        <p style="color:var(--fg-muted);font-size:13px">${store.BonusStore.BonusStoreOffers?.length || 0} offers</p></div>`;
    }

    if (!html) html = '<p class="hint">Store data unavailable — launch VALORANT and play a match, then refresh.</p>';
    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = `<p class="hint">Store not available yet. Launch VALORANT and play at least one match, then refresh.</p>`;
  }
}

// ── Inventory Tab ────────────────────────────────────────────
async function renderInventory() {
  const el = $('#inventoryContent');
  el.innerHTML = '<p class="hint">🔄 Loading inventory…</p>';

  try {
    const inv = await GET('/api/inventory');
    const ents = inv.Entitlements || inv.entitlements || [];
    el.innerHTML = `
      <div class="stats-row">
        <div class="stat-card"><div class="label">Total Items</div><div class="value">${ents.length.toLocaleString()}</div></div>
      </div>
      <div class="list-view">
        ${ents.slice(0, 40).map(e => `
          <div class="list-item" style="cursor:default;display:flex;justify-content:space-between">
            <span>${(e.TypeID || '').slice(0, 10)}…</span>
            <span style="color:var(--fg-muted);font-size:11px">${(e.ItemID || '').slice(0, 14)}…</span>
          </div>
        `).join('')}
      </div>
      ${ents.length > 40 ? `<p class="hint">… and ${ents.length - 40} more items</p>` : ''}
    `;
  } catch (err) {
    el.innerHTML = `<p class="hint">${err.message}</p>`;
  }
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  // Pre-load weapon/skin data for name resolution
  await loadWeaponMap();

  const status = await checkStatus();
  if (!status) {
    $('#overviewStats').innerHTML = '<div class="stat-card" style="grid-column:1/-1;color:var(--accent)">⚠ Riot Client not detected. Start Riot Client and refresh.</div>';
  }

  // Render all tabs (parallel where possible)
  await Promise.all([
    renderOverview(),
    renderLoadout(),
    initSkins(),
    initCards(),
    initTitles(),
  ]);

  // Lazy-load slower endpoints
  renderStore();
  renderInventory();
}

init().catch(console.error);
