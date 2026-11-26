/**
 * 本地进度。所有数据只存在这台设备的 localStorage 里。
 */

const STORAGE_KEY = 'pocket-arcade:v1';

const DEFAULT_STATE = {
  version: 1,
  sokoban: {
    best: {},
    lastLevel: 1,
  },
  tetris: {
    highScore: 0,
    lastScore: 0,
    bestLines: 0,
  },
  settings: {
    sound: true,
    haptics: true,
  },
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function mergeState(raw) {
  const base = cloneDefaults();
  if (!raw || typeof raw !== 'object') return base;
  if (raw.sokoban && typeof raw.sokoban === 'object') {
    base.sokoban.best = raw.sokoban.best && typeof raw.sokoban.best === 'object' ? raw.sokoban.best : {};
    base.sokoban.lastLevel = clampLevel(raw.sokoban.lastLevel);
  }
  if (raw.tetris && typeof raw.tetris === 'object') {
    base.tetris.highScore = numberOr(raw.tetris.highScore, 0);
    base.tetris.lastScore = numberOr(raw.tetris.lastScore, 0);
    base.tetris.bestLines = numberOr(raw.tetris.bestLines, 0);
  }
  if (raw.settings && typeof raw.settings === 'object') {
    base.settings.sound = raw.settings.sound !== false;
    base.settings.haptics = raw.settings.haptics !== false;
  }
  return base;
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clampLevel(value) {
  const level = Math.floor(numberOr(value, 1));
  return Math.max(1, Math.min(24, level));
}

function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    return mergeState(JSON.parse(raw));
  } catch {
    return cloneDefaults();
  }
}

export const state = read();

export function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 无痕模式或存储已满时，游戏仍然可以在内存里继续。
  }
}

export function update(mutator) {
  mutator(state);
  save();
}

export function setSetting(key, value) {
  if (key !== 'sound' && key !== 'haptics') return;
  state.settings[key] = Boolean(value);
  save();
}

export function resetProgress() {
  const settings = { ...state.settings };
  const fresh = cloneDefaults();
  state.sokoban = fresh.sokoban;
  state.tetris = fresh.tetris;
  state.settings = settings;
  save();
}

export function setLastLevel(level) {
  state.sokoban.lastLevel = clampLevel(level);
  save();
}

/**
 * @param {number} id
 * @param {number} moves
 * @param {number} pushes
 * @returns {{firstClear: boolean, newBest: boolean}}
 */
export function completeSokobanLevel(id, moves, pushes) {
  const key = String(id);
  const previous = state.sokoban.best[key];
  const firstClear = !previous;
  const newBest = !previous || moves < previous.moves;
  if (newBest) {
    state.sokoban.best[key] = {
      moves,
      pushes: previous && !newBest ? previous.pushes : pushes,
    };
  }
  save();
  return { firstClear, newBest };
}

export function sokobanBest(id) {
  return state.sokoban.best[String(id)] || null;
}

export function sokobanCompletedCount() {
  return Object.keys(state.sokoban.best).length;
}

export function recordTetrisRun(score, lines, level) {
  const previousHigh = state.tetris.highScore;
  const isNewBest = score > previousHigh;
  if (isNewBest) state.tetris.highScore = score;
  state.tetris.lastScore = score;
  state.tetris.bestLines = Math.max(state.tetris.bestLines, lines);
  state.tetris.lastLevel = level;
  save();
  return { isNewBest, previousHigh };
}
