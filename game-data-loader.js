
(function () {
  'use strict';

  const GAME_DATA_URL = 'https://raw.githubusercontent.com/fribbels/hsr-optimizer/main/src/data/game_data.json';
  const CACHE_KEY     = 'hsr_game_data_v1';

  const ICON_BASE = 'https://raw.githubusercontent.com/fribbels/hsr-optimizer/main/public/assets/icon';
  const IMG_BASE  = 'https://raw.githubusercontent.com/fribbels/hsr-optimizer/main/public/assets/image';

  const Icons = {
    avatar:    (id)    => `${ICON_BASE}/avatar/${id}.webp`,
    lightCone: (id)    => `${ICON_BASE}/light_cone/${id}.webp`,
    element:   (name)  => `${ICON_BASE}/element/${name}.webp`,
    path:      (name)  => `${ICON_BASE}/path/${name}.webp`,
    relic:     (id, i) => `${ICON_BASE}/relic/${id}_${i}.webp`,
    property:  (file)  => `${ICON_BASE}/property/${file}`,
  };

  const Images = {
    charPortrait: (id) => `${IMG_BASE}/character_portrait/${id}.webp`,
    charPreview:  (id) => `${IMG_BASE}/character_preview/${id}.webp`,
    lcPortrait:   (id) => `${IMG_BASE}/light_cone_portrait/${id}.webp`,
  };

  let _gameData = null;

  async function loadGameData(onProgress) {
    if (_gameData) return _gameData;

    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        _gameData = JSON.parse(cached);
        return _gameData;
      }
    } catch (_) { /* ignore */ }

    if (onProgress) onProgress('Fetching game data...');
    const res = await fetch(GAME_DATA_URL);
    if (!res.ok) throw new Error(`Game data fetch failed: ${res.status}`);

    if (onProgress) onProgress('Parsing data...');
    const data = await res.json();

    _gameData = {
      characters: data.characters || {},
      lightCones: data.lightCones || {},
      relics:     data.relics     || [],
    };

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(_gameData));
    } catch (_) { /* quota exceeded — fine */ }

    return _gameData;
  }

  function getCharacterList(gameData) {
    return Object.values(gameData.characters)
      .filter(c => !c.unreleased)
      .sort((a, b) => b.rarity !== a.rarity ? b.rarity - a.rarity : a.name.localeCompare(b.name));
  }

  function getLightConeList(gameData, pathFilter = null) {
    let lcs = Object.values(gameData.lightCones).filter(lc => !lc.unreleased);
    if (pathFilter) lcs = lcs.filter(lc => lc.path === pathFilter);
    return lcs.sort((a, b) => b.rarity !== a.rarity ? b.rarity - a.rarity : a.name.localeCompare(b.name));
  }

  function getElements(characters) {
    return [...new Set(characters.map(c => c.element))].sort();
  }

  function getPaths(characters) {
    return [...new Set(characters.map(c => c.path))].sort();
  }

  function getLCPaths(lightCones) {
    return [...new Set(lightCones.map(lc => lc.path))].sort();
  }
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
})();
