
'use strict';

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.enableClosingConfirmation();
}


const API_URL = 'https://ilcapitano01-gi-card-api.hf.space/getcals';

const {
  Icons,
  Images,
  loadGameData,
  getCharacterList,
  getLightConeList,
  getElements,
  getPaths,
  getLCPaths,
} = window.GameDataLoader;

const state = {
  uid:         null,
  slot:        1,
  chatId:      null,   // Origin group chat_id (from startParam)
  messageId:   null,   // Origin message_id to edit after submission
  botApiUrl:   null,   // Loaded from config.json at runtime
  botUsername: null,
  apiData:     null,   // Raw API response
  gameData:    null,   // { characters, lightCones }
  charList:    [],
  lcList:      [],

  teammates: [null, null, null],

  config: {
    activeSlot:    -1,
    characterId:   null,
    characterPath: null,
    lightConeId:   null,
    eidolon:       0,
    superimpose:   1,
  },

  charFilters: { element: null, path: null, search: '', showUnreleased: true },
  lcFilters:   { path: null, rarity: null, search: '', showUnreleased: true },
};

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

  // Unreleased toggles
  charUnreleasedCb: $('char-unreleased-cb'),
  lcUnreleasedCb:   $('lc-unreleased-cb'),

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

async function init() {
  setLoading('Connecting...');
  

  try {
    const cfgRes = await fetch('./config.json');
    const cfg    = await cfgRes.json();
    state.botApiUrl = cfg.api_url || null;
  } catch (_) {
    console.warn('config.json not found or invalid — direct API posting disabled');
  }

  // ── Parse startParam (Direct Link: t.me/bot/team?startapp=...) 
  // Format: {uid}-{slot}-{chatId}-{messageId}-{botUsername}
  // URL params are the fallback (for local dev / web_app buttons)
  const params     = new URLSearchParams(window.location.search);
  const startParam = tg?.initDataUnsafe?.start_param;

  let sUid  = params.get('uid');
  let sSlot = params.get('slot');
  let sChat = params.get('chat_id');
  let sMsg  = params.get('message_id');
  let sBot  = params.get('bot');

  if (startParam) {
    const parts = startParam.split('_');
    // parts: [uid, slot, chatId, messageId, botUsername]
    if (parts.length >= 4) {
      sUid  = parts[0];
      sSlot = parts[1];
      sChat = parts[2];
      sMsg  = parts[3];
      sBot  = parts.slice(4).join('_'); // bot username
    }
  }

  state.uid        = sUid  || '800556377';
  state.slot       = parseInt(sSlot || '1', 10);
  state.chatId     = sChat  ? parseInt(sChat, 10)  : null;
  state.messageId  = sMsg   ? parseInt(sMsg, 10)   : null;
  state.botUsername = sBot  || null;

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
    state.charList = getCharacterList(gameData, state.charFilters.showUnreleased);
    state.lcList   = getLightConeList(gameData, null, state.lcFilters.showUnreleased);

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


async function fetchApiData(uid, slot) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, slot, benchmark: true }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

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

  // Unreleased toggles
  dom.charUnreleasedCb.addEventListener('change', () => {
    state.charFilters.showUnreleased = dom.charUnreleasedCb.checked;
    state.charList = getCharacterList(state.gameData, state.charFilters.showUnreleased);
    buildCharFilterChips();
    renderCharGrid();
  });
  dom.lcUnreleasedCb.addEventListener('change', () => {
    state.lcFilters.showUnreleased = dom.lcUnreleasedCb.checked;
    state.lcList = getLightConeList(state.gameData, null, state.lcFilters.showUnreleased);
    buildLCFilterChips();
    renderLCGrid();
  });
}

function removeTeammate(i) {
  state.teammates[i] = null;
  renderSlot(i, null);
  updateSubmitState();
}


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

let _charModalOrigin = 'direct'; // 'direct' | 'config'

function openCharModalFromConfig() {
  _charModalOrigin = 'config';
  state.charFilters = { element: null, path: null, search: '', showUnreleased: state.charFilters.showUnreleased };
  dom.charSearch.value = '';
  dom.charUnreleasedCb.checked = state.charFilters.showUnreleased;
  state.charList = getCharacterList(state.gameData, state.charFilters.showUnreleased);
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

let _lcModalOrigin = 'config';

function openLCModalFromConfig() {
  _lcModalOrigin = 'config';
  state.lcFilters = { path: state.config.characterPath, rarity: null, search: '', showUnreleased: state.lcFilters.showUnreleased };
  dom.lcSearch.value = '';
  dom.lcUnreleasedCb.checked = state.lcFilters.showUnreleased;
  state.lcList = getLightConeList(state.gameData, null, state.lcFilters.showUnreleased);
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
  const allLCs = getLightConeList(state.gameData, null, state.lcFilters.showUnreleased);
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
  let list = getLightConeList(state.gameData, path, state.lcFilters.showUnreleased);

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

async function submitData() {
  const ready = state.teammates.every(Boolean);
  if (!ready) return;

  const teleUser = tg?.initDataUnsafe?.user;
  const teleId   = teleUser?.id || null;

  // ── Option A: Direct POST to bot API (works from groups, silent) ───────
  if (state.botApiUrl && state.chatId && state.messageId && tg?.initData) {
    setLoading('Generating card\u2026');
    try {
      const body = {
        slot:       state.slot,
        teammates:  state.teammates.map(tm => ({
          characterId:              tm.characterId,
          lightCone:                tm.lightConeId,
          characterEidolon:         tm.characterEidolon,
          lightConeSuperimposition: tm.lightConeSuperimposition,
        })),
        chat_id:    state.chatId,
        message_id: state.messageId,
        tele_id:    teleId,
        init_data:  tg.initData,
      };

      const res = await fetch(state.botApiUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      // Success — close the webapp, group message is updated silently
      tg.close();
      return;
    } catch (err) {
      hideLoading();
      showError('Failed to generate card:\n' + err.message);
      return;
    }
  }

  // ── Option B: Dev / fallback — log to console ──────────────────────────
  const payload = {
    slot: state.slot,
    teammates: state.teammates.map(tm => ({
      characterId:             tm.characterId,
      lightCone:               tm.lightConeId,
      characterEidolon:        tm.characterEidolon,
      lightConeSuperimposition: tm.lightConeSuperimposition,
    })),
  };
  console.log('[DEV] submitData payload:', payload);
  alert('Dev mode — no API URL in config.json\n' + JSON.stringify(payload, null, 2));
}


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

document.addEventListener('DOMContentLoaded', init);
