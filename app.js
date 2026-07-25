/**
 * app.js — HSR Custom Team Webapp
 * Core application logic for the Telegram Mini App.
 *
 * Flow:
 *  1. Parse UID + slot + tele_id from URL params (passed by the bot)
 *  2. Verify Telegram user ID matches tele_id param (owner auth)
 *  3. Call API to get default card data
 *  4. Load game_data.json for character/LC picker
 *  5. Render main character panel + 3 teammate slots
 *  6. User configures each teammate → Submit sends data back to bot
 */

'use strict';

/* ── Telegram Mini App SDK ─────────────────────────────────────────── */
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.enableClosingConfirmation();
}

/* ── Constants ─────────────────────────────────────────────────────── */
const API_URL = 'https://ilcapitano01-gi-card-api.hf.space/getcals';

/* ── Aliases ──────────────────────────────────────────────────────────*/
const { Icons, Images, loadGameData, getCharacterList, getLightConeList, getElements, getPaths, getLCPaths } = window.GameDataLoader;

/* ── App State ─────────────────────────────────────────────────────── */
const state = {
  uid:         null,
  slot:        1,
  apiData:     null,    // Raw API response
  gameData:    null,    // { characters, lightCones }
  charList:    [],
  lcList:      [],

  // 3 teammate slots: null = empty
  teammates: [null, null, null],

  // Config modal working state
  config: {
    activeSlot:    -1,
    characterId:   null,
    characterPath: null,
    lightConeId:   null,
    eidolon:       0,
    superimpose:   1,
  },

  // Filter states for pickers
  charFilters: { element: null, path: null, search: '' },
  lcFilters:   { path: null, rarity: null, search: '' },
};

/* ── DOM refs ──────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const dom = {
  loadingOverlay: $('loading-overlay'),
  loadingText:    document.querySelector('.loading-text'),
  errorScreen:    $('error-screen'),
  errorMsg:       $('error-msg'),
  retryBtn:       $('retry-btn'),
  app:            $('app'),

  // Header
  headerCharIcon: $('header-char-icon'),
  headerCharName: $('header-char-name'),
  headerUID:      $('header-uid'),

  // Main char panel
  charSplash:       $('char-splash'),
  charName:         $('char-name'),
  charEidolon:      $('char-eidolon'),
  charElementBadge: $('char-element-badge'),
  charElementIcon:  $('char-element-icon'),
  charElementName:  $('char-element-name'),
  charPathBadge:    $('char-path-badge'),
  charPathIcon:     $('char-path-icon'),
  charPathName:     $('char-path-name'),
  charRarityStars:  $('char-rarity-stars'),
  charLcIcon:       $('char-lc-icon'),
  charLcNameFull:   $('char-lc-name-full'),
  charLcSI:         $('char-lc-si'),
  charLcName:       $('char-lc-name'),

  // Teammates
  slotEls: [0, 1, 2].map(i => ({
    root:    $(`slot-${i}`),
    addBtn:  document.querySelector(`#slot-${i} .slot-add-btn`),
    filled:  document.querySelector(`#slot-${i} .slot-filled`),
    img:     document.querySelector(`#slot-${i} .slot-char-img`),
    eidBadge:document.querySelector(`#slot-${i} .slot-eidolon-badge`),
    lcImg:   document.querySelector(`#slot-${i} .slot-lc-img`),
    lcSI:    document.querySelector(`#slot-${i} .slot-lc-si-badge`),
    name:    document.querySelector(`#slot-${i} .slot-char-name`),
    editBtn: document.querySelector(`#slot-${i} .slot-edit-btn`),
    removeBtn:document.querySelector(`#slot-${i} .slot-remove-btn`),
  })),

  // Submit
  submitBtn:   $('submit-btn'),
  submitHint:  $('submit-hint'),

  // Char modal
  charModal:       $('char-modal'),
  charModalClose:  $('char-modal-close'),
  charSearch:      $('char-search'),
  elementFilters:  $('element-filters'),
  pathFilters:     $('path-filters'),
  charGrid:        $('char-grid'),

  // LC modal
  lcModal:        $('lc-modal'),
  lcModalClose:   $('lc-modal-close'),
  lcSearch:       $('lc-search'),
  lcPathFilters:  $('lc-path-filters'),
  lcRarityFilters:$('lc-rarity-filters'),
  lcGrid:         $('lc-grid'),

  // Config modal
  configModal:      $('config-modal'),
  configModalClose: $('config-modal-close'),
  configCharRow:    $('config-char-row'),
  configCharIcon:   $('config-char-icon'),
  configCharName:   $('config-char-name'),
  configChangeChar: $('config-change-char'),
  eidolonSelector:  $('eidolon-selector'),
  configLcRow:      $('config-lc-row'),
  configLcIcon:     $('config-lc-icon'),
  configLcName:     $('config-lc-name'),
  configChangeLc:   $('config-change-lc'),
  siSelector:       $('si-selector'),
  configCancel:     $('config-cancel'),
  configSave:       $('config-save'),
};

/* ══════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════ */
async function init() {
  setLoading('Connecting...');

  // Parse URL params
  const params   = new URLSearchParams(window.location.search);
  state.uid      = params.get('uid')     || '800556377'; // fallback for dev
  state.slot     = parseInt(params.get('slot')    || '1', 10);
  const ownerTid = params.get('tele_id');              // owner's Telegram ID

  // ── Owner Auth ────────────────────────────────────────────────────────
  // Telegram.WebApp.initDataUnsafe.user is guaranteed by Telegram's SDK.
  // We compare against the tele_id the bot embedded in the URL.
  // In dev mode (no SDK / no tele_id param) we skip the check.
  if (tg && ownerTid) {
    const teleUser = tg.initDataUnsafe?.user;
    const actualId = teleUser ? String(teleUser.id) : null;
    if (actualId && actualId !== String(ownerTid)) {
      // Someone else opened this URL — block immediately.
      dom.loadingOverlay.classList.add('hidden');
      showError('This card belongs to someone else.\nYou can only configure your own team.');
      // Disable closing confirmation so user can dismiss cleanly
      try { tg.disableClosingConfirmation(); } catch(_) {}
      return;   // Stop init entirely
    }
  }
  // ─────────────────────────────────────────────────────────────────────

  if (dom.headerUID) dom.headerUID.textContent = `UID ${state.uid}`;

  try {
    // Run API call and game data load in parallel
    setLoading('Loading data...');
    const [apiData, gameData] = await Promise.all([
      fetchApiData(state.uid, state.slot),
      loadGameData(text => setLoading(text)),
    ]);

    state.apiData  = apiData;
    state.gameData = gameData;
    state.charList = getCharacterList(gameData);
    state.lcList   = getLightConeList(gameData);

    // Pre-fill teammates from API defaults
    if (apiData.teammates && Array.isArray(apiData.teammates)) {
      apiData.teammates.slice(0, 3).forEach((tm, i) => {
        if (tm.characterId) {
          state.teammates[i] = {
            characterId:          String(tm.characterId),
            lightConeId:          String(tm.lightConeId || ''),
            characterEidolon:     tm.eidolon || 0,
            lightConeSuperimposition: tm.superimposition || 1,
          };
        }
      });
    }

    renderApp();
    hideLoading();
  } catch (err) {
    console.error('Init error:', err);
    showError(err.message || 'Failed to load data. Please try again.');
  }
}

/* ══════════════════════════════════════════════════════════════════════
   API
   ══════════════════════════════════════════════════════════════════════ */
async function fetchApiData(uid, slot) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, slot, benchmark: true }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER — Main App
   ══════════════════════════════════════════════════════════════════════ */
function renderApp() {
  renderMainCharPanel();
  renderAllSlots();
  updateSubmitState();
  bindEvents();
}

function renderMainCharPanel() {
  const d = state.apiData;
  if (!d || !d.character) return;
  const char = d.character;
  const lc   = d.lightCone;

  // Header
  const headerImg = document.createElement('img');
  headerImg.src = char.icon || Icons.avatar(char.id);
  headerImg.alt = char.name;
  headerImg.style.cssText = 'width:100%;height:100%;object-fit:cover;object-position:top';
  dom.headerCharIcon.innerHTML = '';
  dom.headerCharIcon.appendChild(headerImg);
  dom.headerCharName.textContent = char.name;

  // Splash
  dom.charSplash.src = char.splashArt || Images.charPreview(char.id);
  dom.charSplash.alt = char.name;

  // Name + rarity
  dom.charName.textContent = char.name;
  dom.charRarityStars.innerHTML = '';
  const stars = char.rarity || 5;
  for (let i = 0; i < stars; i++) {
    const s = document.createElement('span');
    s.className = `rarity-star${stars === 4 ? ' r4' : ''}`;
    s.textContent = '★';
    dom.charRarityStars.appendChild(s);
  }

  // Eidolon
  dom.charEidolon.textContent = `E${char.eidolon || 0}`;

  // Element badge
  if (char.element) {
    dom.charElementIcon.src = char.element.icon || Icons.element(char.element.name || char.element);
    dom.charElementName.textContent = char.element.name || char.element;
  }

  // Path badge
  if (char.path) {
    dom.charPathIcon.src = char.path.icon || Icons.path(char.path.name || char.path);
    dom.charPathName.textContent = char.path.name || char.path;
  }

  // Light Cone
  if (lc) {
    dom.charLcIcon.src    = lc.icon || Icons.lightCone(lc.id);
    dom.charLcNameFull.textContent = lc.name || '—';
    dom.charLcSI.textContent = `S${lc.superimpose || 1}`;
    dom.charLcName.textContent = lc.name || '—';
  }
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER — Teammate Slots
   ══════════════════════════════════════════════════════════════════════ */
function renderAllSlots() {
  state.teammates.forEach((tm, i) => renderSlot(i, tm));
}

function renderSlot(i, tm) {
  const s = dom.slotEls[i];
  s.root.classList.toggle('filled', !!tm);

  if (!tm) {
    s.addBtn.classList.remove('hidden');
    s.filled.classList.add('hidden');
    return;
  }

  s.addBtn.classList.add('hidden');
  s.filled.classList.remove('hidden');

  // Character avatar
  s.img.src = Icons.avatar(tm.characterId);
  s.img.alt = getCharName(tm.characterId);

  // Eidolon badge
  s.eidBadge.textContent = `E${tm.characterEidolon}`;

  // Light cone
  if (tm.lightConeId) {
    s.lcImg.src = Icons.lightCone(tm.lightConeId);
    s.lcImg.alt = getLCName(tm.lightConeId);
  } else {
    s.lcImg.src = '';
  }
  s.lcSI.textContent = `S${tm.lightConeSuperimposition}`;

  // Name
  s.name.textContent = getCharName(tm.characterId);
}

function getCharName(id) {
  if (!id || !state.gameData) return id || '?';
  const c = state.gameData.characters[id];
  return c ? c.name : id;
}

function getLCName(id) {
  if (!id || !state.gameData) return id || '?';
  const lc = state.gameData.lightCones[id];
  return lc ? lc.name : id;
}

/* ══════════════════════════════════════════════════════════════════════
   SUBMIT STATE
   ══════════════════════════════════════════════════════════════════════ */
function updateSubmitState() {
  const filled = state.teammates.filter(Boolean).length;
  const ready  = filled === 3;
  dom.submitBtn.disabled = !ready;
  if (ready) {
    dom.submitHint.textContent = 'All teammates set — ready to generate!';
    dom.submitHint.classList.add('ready');
  } else {
    dom.submitHint.textContent = `Fill ${3 - filled} more teammate slot${3 - filled > 1 ? 's' : ''} to generate`;
    dom.submitHint.classList.remove('ready');
  }
}

/* ══════════════════════════════════════════════════════════════════════
   EVENTS
   ══════════════════════════════════════════════════════════════════════ */
function bindEvents() {
  // Slot add buttons
  dom.slotEls.forEach((s, i) => {
    s.addBtn.addEventListener('click', () => openConfigModal(i, null));
    s.editBtn.addEventListener('click', (e) => { e.stopPropagation(); openConfigModal(i, state.teammates[i]); });
    s.removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeTeammate(i); });
    s.filled.addEventListener('click', () => openConfigModal(i, state.teammates[i]));
  });

  // Submit
  dom.submitBtn.addEventListener('click', submitData);
  dom.retryBtn.addEventListener('click', () => { location.reload(); });

  // Modal close buttons & backdrops
  dom.charModal.querySelector('.modal-backdrop').addEventListener('click', closeCharModal);
  dom.charModalClose.addEventListener('click', closeCharModal);
  dom.lcModal.querySelector('.modal-backdrop').addEventListener('click', closeLCModal);
  dom.lcModalClose.addEventListener('click', closeLCModal);
  dom.configModal.querySelector('.modal-backdrop').addEventListener('click', closeConfigModal);
  dom.configModalClose.addEventListener('click', closeConfigModal);
  dom.configCancel.addEventListener('click', closeConfigModal);

  // Config — change char/lc buttons
  dom.configChangeChar.addEventListener('click', openCharModalFromConfig);
  dom.configChangeLc.addEventListener('click',   openLCModalFromConfig);

  // Eidolon selector
  dom.eidolonSelector.querySelectorAll('.rank-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dom.eidolonSelector.querySelectorAll('.rank-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.config.eidolon = parseInt(btn.dataset.rank, 10);
    });
  });

  // Superimposition selector
  dom.siSelector.querySelectorAll('.rank-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dom.siSelector.querySelectorAll('.rank-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.config.superimpose = parseInt(btn.dataset.rank, 10);
    });
  });

  // Save config
  dom.configSave.addEventListener('click', saveConfig);

  // Char search + filters
  dom.charSearch.addEventListener('input', debounce(() => {
    state.charFilters.search = dom.charSearch.value.toLowerCase().trim();
    renderCharGrid();
  }, 200));

  // LC search
  dom.lcSearch.addEventListener('input', debounce(() => {
    state.lcFilters.search = dom.lcSearch.value.toLowerCase().trim();
    renderLCGrid();
  }, 200));
}

function removeTeammate(i) {
  state.teammates[i] = null;
  renderSlot(i, null);
  updateSubmitState();
}

/* ══════════════════════════════════════════════════════════════════════
   CONFIG MODAL
   ══════════════════════════════════════════════════════════════════════ */
function openConfigModal(slotIndex, existingTeammate) {
  state.config.activeSlot = slotIndex;

  if (existingTeammate) {
    state.config.characterId   = existingTeammate.characterId;
    state.config.lightConeId   = existingTeammate.lightConeId;
    state.config.eidolon       = existingTeammate.characterEidolon;
    state.config.superimpose   = existingTeammate.lightConeSuperimposition;

    const char = state.gameData?.characters[existingTeammate.characterId];
    state.config.characterPath = char?.path || null;
  } else {
    state.config.characterId   = null;
    state.config.lightConeId   = null;
    state.config.eidolon       = 0;
    state.config.superimpose   = 1;
    state.config.characterPath = null;
  }

  refreshConfigUI();
  showModal(dom.configModal);
}

function refreshConfigUI() {
  const cfg = state.config;

  // Character row
  if (cfg.characterId) {
    const char = state.gameData?.characters[cfg.characterId];
    dom.configCharIcon.src  = Icons.avatar(cfg.characterId);
    dom.configCharName.textContent = char?.name || cfg.characterId;
  } else {
    dom.configCharIcon.src  = '';
    dom.configCharName.textContent = 'Select character';
  }

  // Eidolon
  dom.eidolonSelector.querySelectorAll('.rank-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.rank, 10) === cfg.eidolon);
  });

  // LC row
  if (cfg.lightConeId) {
    const lc = state.gameData?.lightCones[cfg.lightConeId];
    dom.configLcIcon.src  = Icons.lightCone(cfg.lightConeId);
    dom.configLcName.textContent = lc?.name || cfg.lightConeId;
  } else {
    dom.configLcIcon.src  = '';
    dom.configLcName.textContent = 'Select light cone';
  }

  // Superimposition
  dom.siSelector.querySelectorAll('.rank-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.rank, 10) === cfg.superimpose);
  });
}

function closeConfigModal() {
  hideModal(dom.configModal);
}

function saveConfig() {
  const cfg = state.config;
  if (!cfg.characterId) {
    shakeElement(dom.configCharRow);
    return;
  }
  if (!cfg.lightConeId) {
    shakeElement(dom.configLcRow);
    return;
  }
  state.teammates[cfg.activeSlot] = {
    characterId:          cfg.characterId,
    lightConeId:          cfg.lightConeId,
    characterEidolon:     cfg.eidolon,
    lightConeSuperimposition: cfg.superimpose,
  };
  renderSlot(cfg.activeSlot, state.teammates[cfg.activeSlot]);
  updateSubmitState();
  closeConfigModal();
}

/* ══════════════════════════════════════════════════════════════════════
   CHARACTER PICKER MODAL
   ══════════════════════════════════════════════════════════════════════ */
let _charModalOrigin = 'direct'; // 'direct' | 'config'

function openCharModalFromConfig() {
  _charModalOrigin = 'config';
  state.charFilters = { element: null, path: null, search: '' };
  dom.charSearch.value = '';
  buildCharFilterChips();
  renderCharGrid();
  hideModal(dom.configModal);
  showModal(dom.charModal);
}

function closeCharModal() {
  hideModal(dom.charModal);
  if (_charModalOrigin === 'config') showModal(dom.configModal);
}

function buildCharFilterChips() {
  // Elements
  const elements = getElements(state.charList);
  dom.elementFilters.innerHTML = '';
  elements.forEach(el => {
    const chip = makeChip(el, Icons.element(el), state.charFilters.element === el, () => {
      state.charFilters.element = state.charFilters.element === el ? null : el;
      buildCharFilterChips();
      renderCharGrid();
    });
    dom.elementFilters.appendChild(chip);
  });

  // Paths
  const paths = getPaths(state.charList);
  dom.pathFilters.innerHTML = '';
  paths.forEach(p => {
    const chip = makeChip(p, Icons.path(p), state.charFilters.path === p, () => {
      state.charFilters.path = state.charFilters.path === p ? null : p;
      buildCharFilterChips();
      renderCharGrid();
    });
    dom.pathFilters.appendChild(chip);
  });
}

function renderCharGrid() {
  const { element, path, search } = state.charFilters;
  let list = state.charList;

  if (element) list = list.filter(c => c.element === element);
  if (path)    list = list.filter(c => c.path    === path);
  if (search)  list = list.filter(c => c.name.toLowerCase().includes(search));

  dom.charGrid.innerHTML = '';

  if (list.length === 0) {
    dom.charGrid.innerHTML = '<div class="picker-empty">No characters found</div>';
    return;
  }

  list.forEach((char, idx) => {
    const item = createPickerItem({
      imgUrl:   Icons.avatar(char.id),
      name:     char.name,
      rarity:   char.rarity,
      overlayIconUrl: Icons.element(char.element),
      selected: state.config.characterId === char.id,
      delay:    Math.min(idx * 0.015, 0.3),
      onClick:  () => selectCharacter(char),
    });
    dom.charGrid.appendChild(item);
  });
}

function selectCharacter(char) {
  state.config.characterId   = char.id;
  state.config.characterPath = char.path;
  // Auto-reset LC if path mismatch
  if (state.config.lightConeId) {
    const lc = state.gameData?.lightCones[state.config.lightConeId];
    if (lc && lc.path !== char.path) {
      state.config.lightConeId = null;
    }
  }
  closeCharModal();
}

/* ══════════════════════════════════════════════════════════════════════
   LIGHT CONE PICKER MODAL
   ══════════════════════════════════════════════════════════════════════ */
let _lcModalOrigin = 'config';

function openLCModalFromConfig() {
  _lcModalOrigin = 'config';
  state.lcFilters = { path: state.config.characterPath, rarity: null, search: '' };
  dom.lcSearch.value = '';
  buildLCFilterChips();
  renderLCGrid();
  hideModal(dom.configModal);
  showModal(dom.lcModal);
}

function closeLCModal() {
  hideModal(dom.lcModal);
  if (_lcModalOrigin === 'config') showModal(dom.configModal);
}

function buildLCFilterChips() {
  const allLCs = getLightConeList(state.gameData);
  const paths  = getLCPaths(allLCs);

  dom.lcPathFilters.innerHTML = '';
  paths.forEach(p => {
    const chip = makeChip(p, Icons.path(p), state.lcFilters.path === p, () => {
      state.lcFilters.path = state.lcFilters.path === p ? null : p;
      buildLCFilterChips();
      renderLCGrid();
    });
    dom.lcPathFilters.appendChild(chip);
  });

  // Rarity chips
  dom.lcRarityFilters.innerHTML = '';
  [5, 4, 3].forEach(r => {
    const btn = document.createElement('button');
    btn.className = `filter-chip rarity-${r}${state.lcFilters.rarity === r ? ' active' : ''}`;
    btn.innerHTML = '★'.repeat(r);
    btn.addEventListener('click', () => {
      state.lcFilters.rarity = state.lcFilters.rarity === r ? null : r;
      buildLCFilterChips();
      renderLCGrid();
    });
    dom.lcRarityFilters.appendChild(btn);
  });
}

function renderLCGrid() {
  const { path, rarity, search } = state.lcFilters;
  let list = getLightConeList(state.gameData, path);

  if (rarity) list = list.filter(lc => lc.rarity === rarity);
  if (search) list = list.filter(lc => lc.name.toLowerCase().includes(search));

  dom.lcGrid.innerHTML = '';

  if (list.length === 0) {
    dom.lcGrid.innerHTML = '<div class="picker-empty">No light cones found</div>';
    return;
  }

  list.forEach((lc, idx) => {
    const item = createPickerItem({
      imgUrl:  Icons.lightCone(lc.id),
      name:    lc.name,
      rarity:  lc.rarity,
      selected: state.config.lightConeId === lc.id,
      delay:   Math.min(idx * 0.012, 0.3),
      onClick: () => selectLightCone(lc),
      isLC:    true,
    });
    dom.lcGrid.appendChild(item);
  });
}

function selectLightCone(lc) {
  state.config.lightConeId = lc.id;
  closeLCModal();
}

/* ══════════════════════════════════════════════════════════════════════
   SUBMIT
   ══════════════════════════════════════════════════════════════════════ */
function submitData() {
  const ready = state.teammates.every(Boolean);
  if (!ready) return;

  const payload = {
    slot: state.slot,
    teammates: state.teammates.map(tm => ({
      characterId:             tm.characterId,
      lightCone:               tm.lightConeId,
      characterEidolon:        tm.characterEidolon,
      lightConeSuperimposition: tm.lightConeSuperimposition,
    })),
  };

  const jsonStr = JSON.stringify(payload);

  if (tg && tg.sendData) {
    tg.sendData(jsonStr);
  } else {
    // Dev fallback
    console.log('[DEV] sendData payload:', jsonStr);
    alert('Dev mode — payload:\n' + JSON.stringify(payload, null, 2));
  }
}

/* ══════════════════════════════════════════════════════════════════════
   HELPERS — Picker Item
   ══════════════════════════════════════════════════════════════════════ */
function createPickerItem({ imgUrl, name, rarity, overlayIconUrl, selected, delay, onClick, isLC }) {
  const item = document.createElement('div');
  item.className = `picker-item r${rarity}${selected ? ' selected' : ''}`;
  item.style.animationDelay = `${delay}s`;

  const wrap = document.createElement('div');
  wrap.className = 'picker-item-img-wrap';

  const img = document.createElement('img');
  img.className   = 'picker-item-img';
  img.src         = imgUrl;
  img.alt         = name;
  img.loading     = 'lazy';
  img.onerror     = () => { img.style.opacity = '0.3'; };

  const bar = document.createElement('div');
  bar.className = 'picker-rarity-bar';

  wrap.appendChild(img);
  wrap.appendChild(bar);

  if (overlayIconUrl) {
    const elIcon = document.createElement('img');
    elIcon.className = 'picker-element-icon';
    elIcon.src = overlayIconUrl;
    elIcon.alt = '';
    wrap.appendChild(elIcon);
  }

  const label = document.createElement('div');
  label.className   = 'picker-item-name';
  label.textContent = name;

  item.appendChild(wrap);
  item.appendChild(label);

  item.addEventListener('click', onClick);
  return item;
}

/* ── Filter Chip helper ─────────────────────────────────────────────── */
function makeChip(label, iconUrl, active, onClick) {
  const chip = document.createElement('button');
  chip.className = `filter-chip${active ? ' active' : ''}`;
  if (iconUrl) {
    const icon = document.createElement('img');
    icon.src = iconUrl;
    icon.alt = label;
    chip.appendChild(icon);
  }
  chip.append(document.createTextNode(label));
  chip.addEventListener('click', onClick);
  return chip;
}

/* ══════════════════════════════════════════════════════════════════════
   MODAL HELPERS
   ══════════════════════════════════════════════════════════════════════ */
function showModal(el) {
  el.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Re-trigger animation
  const sheet = el.querySelector('.modal-sheet');
  if (sheet) { sheet.style.animation = 'none'; requestAnimationFrame(() => { sheet.style.animation = ''; }); }
}

function hideModal(el) {
  el.classList.add('hidden');
  // Only restore scroll if no other modals are open
  const anyOpen = [dom.charModal, dom.lcModal, dom.configModal].some(m => !m.classList.contains('hidden'));
  if (!anyOpen) document.body.style.overflow = '';
}

/* ══════════════════════════════════════════════════════════════════════
   LOADING / ERROR
   ══════════════════════════════════════════════════════════════════════ */
function setLoading(text) {
  if (dom.loadingText) dom.loadingText.textContent = text;
  dom.loadingOverlay.classList.remove('hidden');
  dom.app.classList.add('hidden');
  dom.errorScreen.classList.add('hidden');
}

function hideLoading() {
  dom.loadingOverlay.style.opacity = '0';
  setTimeout(() => {
    dom.loadingOverlay.classList.add('hidden');
    dom.loadingOverlay.style.opacity = '';
    dom.app.classList.remove('hidden');
  }, 400);
}

function showError(msg) {
  dom.loadingOverlay.classList.add('hidden');
  dom.app.classList.add('hidden');
  dom.errorMsg.textContent = msg;
  dom.errorScreen.classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════════════ */
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function shakeElement(el) {
  el.style.animation = 'none';
  el.style.border = '1px solid #e8533e';
  requestAnimationFrame(() => {
    el.style.animation = 'shake 0.4s ease';
  });
  setTimeout(() => {
    el.style.border = '';
    el.style.animation = '';
  }, 500);
}

// Inject shake keyframes if not present
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%,100% { transform: translateX(0); }
  20%,60%  { transform: translateX(-6px); }
  40%,80%  { transform: translateX(6px); }
}`;
document.head.appendChild(shakeStyle);

/* ══════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
