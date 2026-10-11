/*
 * storage.js — safe LocalStorage persistence.
 *
 * LocalStorage can be missing (private mode, file:// in some browsers),
 * full, or contain corrupted/hand-edited JSON. Every read is therefore
 * validated and repaired field by field, and every write is wrapped so a
 * storage failure can never crash the game.
 */
(function (root) {
  'use strict';

  const KEYS = Object.freeze({
    progress: 'robotMaze.progress.v1',
    results: 'robotMaze.results.v1',
    observations: 'robotMaze.observations.v1',
    settings: 'robotMaze.settings.v1'
  });

  const LEVEL_COUNT = 12;
  const MAX_RESULT_ROWS = 2000;

  function getStore() {
    try {
      const store = root.localStorage;
      const probe = '__robotMazeProbe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return store;
    } catch (err) {
      return null;
    }
  }

  // In-memory fallback so the game still works when LocalStorage is unavailable.
  const memoryStore = new Map();
  const store = getStore();
  const isPersistent = store !== null;

  function readRaw(key) {
    try {
      return store ? store.getItem(key) : (memoryStore.has(key) ? memoryStore.get(key) : null);
    } catch (err) { return null; }
  }

  function writeRaw(key, value) {
    try {
      if (store) store.setItem(key, value); else memoryStore.set(key, value);
      return true;
    } catch (err) {
      memoryStore.set(key, value);
      return false;
    }
  }

  function readJSON(key) {
    const raw = readRaw(key);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch (err) { return null; }
  }

  function writeJSON(key, value) { return writeRaw(key, JSON.stringify(value)); }

  function removeKey(key) {
    try { if (store) store.removeItem(key); } catch (err) { /* ignore */ }
    memoryStore.delete(key);
  }

  const toInt = (value, min, max, fallback) =>
    (Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback);
  const toText = (value, maxLength) => (typeof value === 'string' ? value.slice(0, maxLength) : '');

  /* ---------------- Campaign progress ---------------- */

  function defaultProgress() {
    return { unlockedLevel: 1, levels: {}, finishedCampaign: false };
  }

  function sanitizeLevelRecord(record) {
    if (!record || typeof record !== 'object') return null;
    if (record.completed !== true) return null;
    return {
      completed: true,
      bestStars: toInt(record.bestStars, 1, 3, 1),
      bestScore: toInt(record.bestScore, 0, 100000, 0),
      bestMoves: toInt(record.bestMoves, 0, 100000, 0),
      foundShortest: record.foundShortest === true
    };
  }

  function loadProgress() {
    const data = readJSON(KEYS.progress);
    const progress = defaultProgress();
    if (!data || typeof data !== 'object') return progress;
    progress.unlockedLevel = toInt(data.unlockedLevel, 1, LEVEL_COUNT, 1);
    progress.finishedCampaign = data.finishedCampaign === true;
    if (data.levels && typeof data.levels === 'object') {
      for (let id = 1; id <= LEVEL_COUNT; id++) {
        const record = sanitizeLevelRecord(data.levels[id]);
        if (record) progress.levels[id] = record;
      }
    }
    // A completed level always unlocks the next one, even if the saved number was damaged.
    for (let id = 1; id <= LEVEL_COUNT; id++) {
      if (progress.levels[id]) progress.unlockedLevel = Math.max(progress.unlockedLevel, Math.min(LEVEL_COUNT, id + 1));
    }
    return progress;
  }

  function saveProgress(progress) { return writeJSON(KEYS.progress, progress); }

  /** Merges one finished level into progress, keeping the best values. */
  function recordLevelCompletion(progress, levelId, result) {
    const previous = progress.levels[levelId];
    progress.levels[levelId] = {
      completed: true,
      bestStars: Math.max(previous ? previous.bestStars : 0, result.stars),
      bestScore: Math.max(previous ? previous.bestScore : 0, result.score),
      bestMoves: previous ? Math.min(previous.bestMoves, result.moves) : result.moves,
      foundShortest: (previous && previous.foundShortest) || result.extraMoves === 0
    };
    progress.unlockedLevel = Math.max(progress.unlockedLevel, Math.min(LEVEL_COUNT, levelId + 1));
    if (levelId === LEVEL_COUNT) progress.finishedCampaign = true;
    saveProgress(progress);
    return progress;
  }

  function summarizeProgress(progress) {
    const records = Object.values(progress.levels);
    return {
      levelsCompleted: records.length,
      totalStars: records.reduce((sum, r) => sum + r.bestStars, 0),
      bestScore: records.reduce((sum, r) => sum + r.bestScore, 0),
      shortestChallenges: records.filter(r => r.foundShortest).length,
      currentLevel: progress.unlockedLevel
    };
  }

  /* ---------------- Experiment results (one row per finished maze) ---------------- */

  const RESULT_FIELDS = [
    'timestamp', 'player', 'mazeId', 'mazeName', 'mode', 'rows', 'cols', 'openCells', 'reachableCells',
    'shortestPath', 'playerPath', 'extraMoves', 'hintsUsed', 'undos', 'seconds', 'foundShortest', 'solutionShown'
  ];

  function sanitizeResultRow(row) {
    if (!row || typeof row !== 'object') return null;
    const clean = {
      timestamp: toText(row.timestamp, 40),
      player: toText(row.player, 40),
      mazeId: toText(String(row.mazeId === undefined ? '' : row.mazeId), 40),
      mazeName: toText(row.mazeName, 60),
      mode: toText(row.mode, 20),
      rows: toInt(row.rows, 0, 1000, 0),
      cols: toInt(row.cols, 0, 1000, 0),
      openCells: toInt(row.openCells, 0, 1e6, 0),
      reachableCells: toInt(row.reachableCells, 0, 1e6, 0),
      shortestPath: toInt(row.shortestPath, 0, 1e6, 0),
      playerPath: toInt(row.playerPath, 0, 1e6, 0),
      extraMoves: toInt(row.extraMoves, 0, 1e6, 0),
      hintsUsed: toInt(row.hintsUsed, 0, 1e6, 0),
      undos: toInt(row.undos, 0, 1e6, 0),
      seconds: toInt(row.seconds, 0, 1e7, 0),
      foundShortest: row.foundShortest === true,
      solutionShown: row.solutionShown === true
    };
    return clean.mazeId ? clean : null;
  }

  function loadResults() {
    const data = readJSON(KEYS.results);
    if (!Array.isArray(data)) return [];
    return data.map(sanitizeResultRow).filter(Boolean);
  }

  function addResult(row) {
    const rows = loadResults();
    const clean = sanitizeResultRow(row);
    if (!clean) return rows;
    rows.push(clean);
    while (rows.length > MAX_RESULT_ROWS) rows.shift();
    writeJSON(KEYS.results, rows);
    return rows;
  }

  function clearResults() { removeKey(KEYS.results); }

  /* ---------------- Detective observations ---------------- */

  function loadObservations() {
    const data = readJSON(KEYS.observations);
    const result = {};
    if (!data || typeof data !== 'object') return result;
    for (const [key, value] of Object.entries(data)) {
      if (!/^exp[1-9]$/.test(key) || !value || typeof value !== 'object') continue;
      result[key] = {
        prediction: toText(value.prediction, 500),
        happened: toText(value.happened, 500),
        learned: toText(value.learned, 500)
      };
    }
    return result;
  }

  function saveObservations(observations) { return writeJSON(KEYS.observations, observations); }

  /* ---------------- Settings ---------------- */

  function loadSettings() {
    const data = readJSON(KEYS.settings) || {};
    return {
      soundOn: data.soundOn === true, // muted by default
      playerName: toText(data.playerName, 40)
    };
  }

  function saveSettings(settings) { return writeJSON(KEYS.settings, settings); }

  function resetProgress() { removeKey(KEYS.progress); }

  const api = {
    KEYS, LEVEL_COUNT, RESULT_FIELDS, isPersistent,
    loadProgress, saveProgress, recordLevelCompletion, summarizeProgress, resetProgress,
    loadResults, addResult, clearResults, sanitizeResultRow,
    loadObservations, saveObservations, loadSettings, saveSettings
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MazeStorage = api;
})(typeof window !== 'undefined' ? window : globalThis);
