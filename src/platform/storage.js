// @ts-nocheck
import { STORAGE_KEYS } from '../shared/constants.js';

function safeParseJson(value, fallback) {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toFiniteNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function loadCash() {
  return toFiniteNumber(localStorage.getItem(STORAGE_KEYS.cash), 0);
}

export function saveCash(cash) {
  localStorage.setItem(STORAGE_KEYS.cash, String(Math.max(0, Math.floor(cash))));
}

export function loadOwnedTrophies() {
  const ids = safeParseJson(localStorage.getItem(STORAGE_KEYS.trophies), []);
  if (!Array.isArray(ids)) return new Set();
  return new Set(ids.filter((x) => typeof x === 'string'));
}

export function saveOwnedTrophies(owned) {
  localStorage.setItem(STORAGE_KEYS.trophies, JSON.stringify(Array.from(owned)));
}

function normalizeTrophyLevels(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || k.length === 0) continue;
    const n = Math.max(0, Math.floor(toFiniteNumber(v, 0)));
    if (n > 0) out[k] = n;
  }
  return out;
}

export function loadTrophyLevels(ownedTrophies) {
  const raw = safeParseJson(localStorage.getItem(STORAGE_KEYS.trophyLevels), null);
  const levels = normalizeTrophyLevels(raw);

  // Backward-compatible migration: previously we only stored owned trophy IDs.
  if (ownedTrophies instanceof Set) {
    for (const id of ownedTrophies) {
      if (typeof id !== 'string') continue;
      if (!levels[id]) levels[id] = 1;
    }
  }

  // If the new schema wasn't present but we have legacy owned trophies, persist once.
  if ((!raw || typeof raw !== 'object') && Object.keys(levels).length > 0) {
    saveTrophyLevels(levels);
  }

  return levels;
}

export function saveTrophyLevels(levels) {
  const normalized = normalizeTrophyLevels(levels);
  localStorage.setItem(STORAGE_KEYS.trophyLevels, JSON.stringify(normalized));
}

function normalizeLeaderboardV2(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      return {
        id: typeof entry.id === 'string' ? entry.id : getUuid(),
        endedAt: typeof entry.endedAt === 'string' ? entry.endedAt : new Date().toISOString(),
        timeSeconds: toFiniteNumber(entry.timeSeconds, NaN),
        level: Math.max(1, Math.floor(toFiniteNumber(entry.level, 1))),
        cashEarned: Math.max(0, Math.floor(toFiniteNumber(entry.cashEarned, 0))),
      };
    })
    .filter((x) => x && Number.isFinite(x.timeSeconds) && x.timeSeconds > 0)
    .slice(0, 200);
}

function migrateLeaderboardLegacyToV2() {
  const legacy = safeParseJson(localStorage.getItem(STORAGE_KEYS.leaderboardLegacy), []);
  if (!Array.isArray(legacy) || legacy.length === 0) return [];

  // Legacy schema: { score: seconds, level, cash }
  return legacy
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const timeSeconds = toFiniteNumber(e.score, NaN);
      if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) return null;
      return {
        id: getUuid(),
        endedAt: new Date().toISOString(),
        timeSeconds,
        level: Math.max(1, Math.floor(toFiniteNumber(e.level, 1))),
        cashEarned: Math.max(0, Math.floor(toFiniteNumber(e.cash, 0))),
      };
    })
    .filter(Boolean);
}

export function loadLeaderboard() {
  const v2 = normalizeLeaderboardV2(
    safeParseJson(localStorage.getItem(STORAGE_KEYS.leaderboard), [])
  );

  if (v2.length > 0) return v2;

  const migrated = migrateLeaderboardLegacyToV2();
  if (migrated.length > 0) {
    saveLeaderboard(migrated);
    return migrated;
  }

  return [];
}

export function saveLeaderboard(entries) {
  localStorage.setItem(STORAGE_KEYS.leaderboard, JSON.stringify(entries.slice(0, 200)));
}

export function addLeaderboardEntry({ timeSeconds, level, cashEarned }) {
  const entry = {
    id: getUuid(),
    endedAt: new Date().toISOString(),
    timeSeconds: toFiniteNumber(timeSeconds, NaN),
    level: Math.max(1, Math.floor(toFiniteNumber(level, 1))),
    cashEarned: Math.max(0, Math.floor(toFiniteNumber(cashEarned, 0))),
  };
  if (!Number.isFinite(entry.timeSeconds) || entry.timeSeconds <= 0) return null;

  const leaderboard = loadLeaderboard();
  leaderboard.push(entry);
  saveLeaderboard(leaderboard);
  return entry;
}

export function loadAchievements() {
  const ids = safeParseJson(localStorage.getItem(STORAGE_KEYS.achievements), []);
  if (!Array.isArray(ids)) return new Set();
  return new Set(ids.filter((x) => typeof x === 'string'));
}

export function saveAchievements(set) {
  localStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify(Array.from(set)));
}

export function loadUltimateType() {
  const v = localStorage.getItem(STORAGE_KEYS.ultimate);
  return v === 'nuke' ? 'nuke' : 'laser';
}

export function saveUltimateType(type) {
  localStorage.setItem(STORAGE_KEYS.ultimate, type === 'nuke' ? 'nuke' : 'laser');
}

export function loadOwnedUltimates() {
  const ids = safeParseJson(localStorage.getItem(STORAGE_KEYS.ultimatesOwned), []);
  if (!Array.isArray(ids)) return new Set();
  return new Set(ids.filter((x) => x === 'laser' || x === 'nuke'));
}

export function saveOwnedUltimates(set) {
  localStorage.setItem(STORAGE_KEYS.ultimatesOwned, JSON.stringify(Array.from(set)));
}

function normalizeUltimateUpgrades(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { laser: 0, nuke: 0 };
  const laser = raw.laser ? 1 : 0;
  const nuke = raw.nuke ? 1 : 0;
  return { laser, nuke };
}

export function loadUltimateUpgrades() {
  const raw = safeParseJson(localStorage.getItem(STORAGE_KEYS.ultimateUpgrades), null);
  return normalizeUltimateUpgrades(raw);
}

export function saveUltimateUpgrades(upgrades) {
  const normalized = normalizeUltimateUpgrades(upgrades);
  localStorage.setItem(STORAGE_KEYS.ultimateUpgrades, JSON.stringify(normalized));
}

// null = not set yet
export function loadMouseAimEnabled() {
  const v = localStorage.getItem(STORAGE_KEYS.mouseAim);
  if (v == null) return null;
  return v !== 'false';
}

export function saveMouseAimEnabled(enabled) {
  localStorage.setItem(STORAGE_KEYS.mouseAim, enabled ? 'true' : 'false');
}

export function loadMaxStartLevel() {
  const v = localStorage.getItem(STORAGE_KEYS.maxStartLevel);
  const n = typeof v === 'string' ? Number(v) : 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function saveMaxStartLevel(level) {
  const n = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  localStorage.setItem(STORAGE_KEYS.maxStartLevel, String(n));
}

export function loadPlayerName() {
  const v = localStorage.getItem(STORAGE_KEYS.playerName);
  if (typeof v !== 'string') return '';
  return v.trim();
}

export function savePlayerName(name) {
  const v = typeof name === 'string' ? name.trim().slice(0, 16) : '';
  if (v.length === 0) {
    localStorage.removeItem(STORAGE_KEYS.playerName);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.playerName, v);
}
