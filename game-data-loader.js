/**
 * game-data-loader.js
 * Fetches and caches the HSR game data from the fribbels/hsr-optimizer GitHub CDN.
 * Uses sessionStorage to avoid re-fetching within the same session.
 */

const GAME_DATA_URL = 'https://raw.githubusercontent.com/fribbels/hsr-optimizer/main/src/data/game_data.json';
const CACHE_KEY     = 'hsr_game_data_v1';

// Icon base URLs
const ICON_BASE = 'https://raw.githubusercontent.com/fribbels/hsr-optimizer/main/public/assets/icon';
const IMG_BASE  = 'https://raw.githubusercontent.com/fribbels/hsr-optimizer/main/public/assets/image';

const Icons = {
  avatar:    (id)     => `${ICON_BASE}/avatar/${id}.webp`,
  lightCone: (id)     => `${ICON_BASE}/light_cone/${id}.webp`,
  element:   (name)   => `${ICON_BASE}/element/${name}.webp`,
  path:      (name)   => `${ICON_BASE}/path/${name}.webp`,
  relic:     (id, i)  => `${ICON_BASE}/relic/${id}_${i}.webp`,
  property:  (file)   => `${ICON_BASE}/property/${file}`,
};

const Images = {
  charPortrait:  (id) => `${IMG_BASE}/character_portrait/${id}.webp`,
  charPreview:   (id) => `${IMG_BASE}/character_preview/${id}.webp`,
  lcPortrait:    (id) => `${IMG_BASE}/light_cone_portrait/${id}.webp`,
};

let _gameData = null;

/**
 * Returns parsed game data { characters, lightCones, relics }.
 * Caches in sessionStorage after first fetch.
 */
async function loadGameData(onProgress) {
  if (_gameData) return _gameData;

  // Try sessionStorage first
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      _gameData = JSON.parse(cached);
      return _gameData;
    }
  } catch (_) { /* ignore */ }

  // Fetch from CDN
  if (onProgress) onProgress('Fetching game data...');
  const res = await fetch(GAME_DATA_URL);
  if (!res.ok) throw new Error(`Game data fetch failed: ${res.status}`);

  if (onProgress) onProgress('Parsing data...');
  const data = await res.json();

  // Slim down: keep only what we need
  _gameData = {
    characters: data.characters || {},
    lightCones: data.lightCones || {},
    relics:     data.relics     || [],
  };

  // Persist to sessionStorage (may fail if too large — that's OK)
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(_gameData));
  } catch (_) { /* quota exceeded — fine, will re-fetch next time */ }

  return _gameData;
}

/**
 * Returns an array of character objects sorted by rarity desc then name asc.
 * Filters out unreleased characters.
 */
function getCharacterList(gameData) {
  return Object.values(gameData.characters)
    .filter(c => !c.unreleased)
    .sort((a, b) => {
      if (b.rarity !== a.rarity) return b.rarity - a.rarity;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Returns an array of light cone objects sorted by rarity desc then name asc.
 * Filters out unreleased light cones.
 */
function getLightConeList(gameData, pathFilter = null) {
  let lcs = Object.values(gameData.lightCones)
    .filter(lc => !lc.unreleased);

  if (pathFilter) {
    lcs = lcs.filter(lc => lc.path === pathFilter);
  }

  return lcs.sort((a, b) => {
    if (b.rarity !== a.rarity) return b.rarity - a.rarity;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Extracts unique elements from character list.
 */
function getElements(characters) {
  const set = new Set(characters.map(c => c.element));
  return [...set].sort();
}

/**
 * Extracts unique paths from character list.
 */
function getPaths(characters) {
  const set = new Set(characters.map(c => c.path));
  return [...set].sort();
}

/**
 * Extracts unique paths from light cone list.
 */
function getLCPaths(lightCones) {
  const set = new Set(lightCones.map(lc => lc.path));
  return [...set].sort();
}

// Expose globally
window.GameDataLoader = {
  loadGameData,
  getCharacterList,
  getLightConeList,
  getElements,
  getPaths,
  getLCPaths,
  Icons,
  Images,
};
