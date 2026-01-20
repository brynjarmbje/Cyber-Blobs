// @ts-nocheck
import { STORAGE_KEYS } from './constants.js';

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
