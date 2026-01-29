// @ts-nocheck
import {
  COLOR_ORDER,
  COLOR_CASH_VALUES,
  POWERUP_DURATION_MS,
  POWERUP_DROP_CHANCE,
  LIFE_DROP_CHANCE,
  POWERUP_TYPES,
  TROPHIES,
} from '../shared/constants.js';

import {
  addLeaderboardEntry,
  loadAchievements,
  loadCash,
  loadLeaderboard,
  loadOwnedUltimates,
  loadOwnedTrophies,
  loadTrophyLevels,
  loadPlayerName,
  loadUltimateType,
  loadUltimateUpgrades,
  loadMouseAimEnabled,
  loadMaxStartLevel,
  saveCash,
  saveMouseAimEnabled,
  saveMaxStartLevel,
  saveOwnedUltimates,
  saveOwnedTrophies,
  saveTrophyLevels,
  savePlayerName,
  saveUltimateType,
  saveUltimateUpgrades,
} from '../platform/storage.js';

import {
  updateHud,
  pulseNextColor,
  triggerFlash,
  showCenterMessage,
  animatePickupToActive,
  showGameOver,
  hideGameOver,
  renderShop,
  renderScores,
  openModal,
  closeModal,
} from '../ui/ui.js';

import { createNeonMap, circleIntersectsRect, resolveCircleVsRect } from './map.js';

import { createRenderer3D } from './renderer3d.js';

import { colorToRGBA, initEnemyBlob, updateEnemyBlob, drawJellyBlobEnemy } from './enemy2d.js';

import { evaluateRunMilestones } from '../ui/achievements.js';

import { syncMainMenuUi, openLevelSelectModal, installMenuBindings, createMenuActions } from '../ui/menus.js';

export function createGame(ui) {
  const canvas = ui.canvas;
  const ctx = canvas.getContext('2d');

  const renderer3d = createRenderer3D(ui.glCanvas);
  // Let the 3D renderer draw the NEXT enemy preview into the HUD swatch.
  if (renderer3d && typeof renderer3d.setNextEnemyPreviewCanvas === 'function') {
    renderer3d.setNextEnemyPreviewCanvas(ui.igTargetSwatchEl || ui.nextColorSwatchEl);
  }

  // Viewport size in CSS pixels (canvas backing store is scaled by DPR)
  const world = { w: 800, h: 600, dpr: Math.max(1, Math.floor(globalThis.devicePixelRatio || 1)) };

  // Larger map (world coordinates). Viewport is a window into this via the camera.
  const map = {
    w: 2400,
    h: 1800,
  };

  let currentMap = createNeonMap(map);

  // Asteroid visuals: draw in 2D with a satisfying, animated blob-like style.
  // We keep gameplay collisions as rectangles; this is purely a visual layer.
  const USE_2D_ASTEROIDS = true;

  // Camera top-left in map coordinates.
  const camera = {
    x: 0,
    y: 0,
    deadzoneRadius: 140,
    followLerp: 0.18,
  };

  // Persistent profile state
  let cash = loadCash();
  let ownedTrophies = loadOwnedTrophies();
  let trophyLevels = loadTrophyLevels(ownedTrophies);
  let leaderboard = loadLeaderboard();
  let achievements = loadAchievements();
  let ownedUltimates = loadOwnedUltimates();
  let ultimateUpgrades = loadUltimateUpgrades();

  function computeTrophyEffects() {
    const effects = {
      startLives: 0,
      powerupDurationBonusMs: 0,
      powerupDurationByType: {},
      cashMultiplier: 1,
      energyDrainMultiplier: 1,
    };

    for (const t of TROPHIES) {
      const lvRaw = trophyLevels?.[t.id];
      const level = Math.max(0, Math.floor(Number(lvRaw || 0))) || (ownedTrophies.has(t.id) ? 1 : 0);
      if (level <= 0) continue;

      const eff = t.effect || {};
      if (typeof eff.startLives === 'number') effects.startLives += eff.startLives * level;
      if (typeof eff.powerupDurationBonusMs === 'number') {
        effects.powerupDurationBonusMs += eff.powerupDurationBonusMs * level;
      }
      if (eff.powerupDurationByType && typeof eff.powerupDurationByType === 'object') {
        for (const [type, bonusMs] of Object.entries(eff.powerupDurationByType)) {
          const ms = Number(bonusMs);
          if (!Number.isFinite(ms) || ms === 0) continue;
          effects.powerupDurationByType[type] = (effects.powerupDurationByType[type] || 0) + ms * level;
        }
      }
      if (typeof eff.cashMultiplier === 'number' && eff.cashMultiplier > 0) {
        effects.cashMultiplier *= eff.cashMultiplier ** level;
      }
      if (typeof eff.energyDrainMultiplier === 'number' && eff.energyDrainMultiplier > 0) {
        effects.energyDrainMultiplier *= eff.energyDrainMultiplier ** level;
      }
    }

    return effects;
  }

  let trophyEffects = computeTrophyEffects();

  // Run state
  let gameOver = false;
  let level = 1;
  let startTimeMs = 0;
  let runStartCash = cash;
  let inMainMenu = true;
  let startCountdownActive = false;
  let startCountdownToken = 0;

  // Checkpoint starts (unlock every 10 levels reached)
  let maxStartLevelUnlocked = loadMaxStartLevel();
  let nextRunStartLevel = 1;

  function showMainMenu() {
    cancelStartCountdown();
    closeLeaveConfirm();
    setPauseScreenVisible(false);
    inMainMenu = true;
    paused = false;
    loopRunning = false;
    syncPauseUi();
    hideGameOver(ui);
    closeModal(ui.levelSelectModal);
    closeModal(ui.settingsModal);
    closeModal(ui.aboutModal);
    // Keep board/shop modals closed from menu entry.
    closeModal(ui.shopModal);
    closeModal(ui.boardModal);
    if (ui?.mainMenu) ui.mainMenu.style.display = 'grid';
    document.body.classList.remove('menuHidden');
    emitPlayState('menu');
    syncMainMenuUi(ui, { loadPlayerName });
  }

  function setStartCountdownVisible(visible, text = '') {
    const el = ui?.startCountdownEl;
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('hidden', !visible);
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function cancelStartCountdown() {
    startCountdownToken++;
    startCountdownActive = false;
    setStartCountdownVisible(false, '');
  }

  function sleepMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function hideMainMenu() {
    inMainMenu = false;
    if (ui?.mainMenu) ui.mainMenu.style.display = 'none';
    document.body.classList.add('menuHidden');
  }

  function openLevelSelect({ allowBackToMenu = true } = {}) {
    openLevelSelectModal(ui, {
      openModal,
      maxStartLevelUnlocked,
      startRunFromLevel,
      allowBackToMenu,
    });
  }

  function startRunFromLevel(startLevel) {
    const lv = Number.isFinite(startLevel) ? Math.max(1, Math.floor(startLevel)) : 1;
    nextRunStartLevel = lv;
    hideMainMenu();
    closeModal(ui.levelSelectModal);
    closeModal(ui.settingsModal);
    closeModal(ui.aboutModal);
    // Reset gameplay state, but don't start the loop yet.
    resetRun(lv, { autoStart: false });

    // Start sequence (placeholder for future fancy intro animation).
    void (async () => {
      const token = ++startCountdownToken;
      startCountdownActive = true;
      paused = false;
      loopRunning = false;
      syncPauseUi();
      emitPlayState('playing');

      // Show 3-2-1-GO.
      for (let s = 3; s >= 1; s--) {
        if (token !== startCountdownToken) return;
        setStartCountdownVisible(true, String(s));
        await sleepMs(650);
      }
      if (token !== startCountdownToken) return;

      setStartCountdownVisible(false, '');
      startCountdownActive = false;

      // Ensure the run timer starts at the actual gameplay start.
      startTimeMs = performance.now();
      updateHud(ui, buildHudState());

      requestLoop();
    })();
  }

  function checkpointForLevel(lv) {
    const n = Math.floor(lv / 10) * 10;
    return n >= 10 ? n : 0;
  }

  function maybeUnlockCheckpoint(lv) {
    const cp = checkpointForLevel(lv);
    if (cp > maxStartLevelUnlocked) {
      maxStartLevelUnlocked = cp;
      saveMaxStartLevel(maxStartLevelUnlocked);
    }
  }

  // Visual scale (boost sizes on small screens)
  let sizeScale = 1;

  // Player
  const player = {
    x: world.w / 2,
    y: world.h / 2,
    radius: 10,
    speed: 3,
    color: 'magenta',
    lives: 3,
    energy: 100,
    invulnerableUntil: 0,
  };

  // Capsule energy/fuel (movement). Refills by docking to crystal asteroids.
  const ENERGY_MAX = 100;
  const ENERGY_DRAIN_PER_SEC = 4;
  const ENERGY_EMPTY_SPEED_MULT = 0.18;
  const ENERGY_DOCK_RANGE = 26;
  const ENERGY_AUTO_DOCK_THRESHOLD = 0.25;
  const ENERGY_AUTO_DOCK_IDLE_MS = 650;
  const ENERGY_CONNECT_MS = 2000;
  const ENERGY_RECHARGE_MS = 4000;
  const ENERGY_TOUCH_PAD = 14; // Docking UX tolerances (helps mobile stick drift + "almost touching" cases).
  const ENERGY_CONNECT_MOVE_EPS = 0.85; // world-units per frame (~60fps baseline)

  // Visual hint: when we hit full energy, tell the 3D renderer to do a brief surge.
  let energyFullFxUntilMs = 0;
  // Global enemy slow (from STASIS powerup)
  let enemySpeedMult = 1;

  let dockRequested = false;
  let dockAutoEligibleSinceMs = -Infinity;
  let dockLastPromptMs = -Infinity;

  const energyDock = {
    phase: 'idle',
    obstacleIndex: -1,
    ox: 0,
    oy: 0,
    fieldRadius: 0,
    connectEndsAtMs: 0,
    chargeStartedAtMs: 0,
    chargeStartEnergy: 0,
    chargeEndsAtMs: 0,
  };

  function seeded01(seed) {
    const n = Math.sin(seed * 999.123) * 43758.5453;
    return n - Math.floor(n);
  }

  function obstacleHasCrystals(r, i) {
    const ow = Math.max(1, r.w);
    const oh = Math.max(1, r.h);
    const ox = r.x + ow / 2;
    const oy = r.y + oh / 2;
    const seed = seeded01((ox * 0.013 + oy * 0.017 + i * 0.11) * 100.0);
    const crystalChance = seeded01(seed + 6.6);
    const crystalCount = crystalChance > 0.72 ? 3 : crystalChance > 0.58 ? 2 : crystalChance > 0.48 ? 1 : 0;
    return crystalCount > 0;
  }

  // Cache per-obstacle visual data so asteroids feel stable and "hand-crafted".
  const asteroidVisuals = new Map();
  function getAsteroidVisual(i, r) {
    const existing = asteroidVisuals.get(i);
    const ow = Math.max(1, r.w);
    const oh = Math.max(1, r.h);
    const ox = r.x + ow / 2;
    const oy = r.y + oh / 2;
    const seed = seeded01((ox * 0.013 + oy * 0.017 + i * 0.11) * 100.0);
    if (existing && existing.seed === seed) return existing;

    const baseR = Math.min(ow, oh) * 0.56;
    // Fewer nodes + stronger radial variation reads more "rocky" and pointy.
    const nodes = 12 + Math.floor(seeded01(seed + 2.2) * 6);
    const nodeData = [];
    for (let k = 0; k < nodes; k++) {
      const a = (k / nodes) * Math.PI * 2;
      const rVar = seeded01(seed + 10.7 + k * 1.31);
      // Bias towards occasional spikes.
      const spike = seeded01(seed + 12.9 + k * 1.97);
      const br = 0.62 + 0.78 * Math.pow(rVar, 0.78) + 0.35 * Math.max(0, spike - 0.62);
      nodeData.push({ a, br });
    }

    // Crystal deposit anchors (embedded glows)
    const deposits = [];
    const depCount = 2 + Math.floor(seeded01(seed + 6.9) * 2); // 2..3
    for (let k = 0; k < depCount; k++) {
      const a = seeded01(seed + 30.1 + k * 2.7) * Math.PI * 2;
      const rr = 0.28 + 0.36 * seeded01(seed + 31.7 + k * 1.9);
      deposits.push({
        a,
        rr,
        s: 0.55 + 0.55 * seeded01(seed + 32.9 + k * 1.4),
      });
    }

    // Speckles (deterministic) for rock grit
    const speckles = [];
    const speckCount = 26 + Math.floor(seeded01(seed + 40.2) * 26);
    for (let k = 0; k < speckCount; k++) {
      const a = seeded01(seed + 41.1 + k * 1.19) * Math.PI * 2;
      const rr = Math.sqrt(seeded01(seed + 42.7 + k * 2.13)) * 0.95;
      speckles.push({
        a,
        rr,
        r: 0.6 + seeded01(seed + 43.9 + k * 3.3) * 1.6,
        o: 0.06 + seeded01(seed + 44.4 + k * 0.9) * 0.12,
      });
    }

    const v = { seed, baseR, nodes, nodeData, deposits, speckles };
    asteroidVisuals.set(i, v);
    return v;
  }

  function isBorderObstacle(r) {
    const kind = r.kind || 'wall';
    if (kind === 'border') return true;
    // Map border colliders can be giant rectangles.
    if (r.w > map.w * 0.8 || r.h > map.h * 0.8) return true;
    return false;
  }

  function drawAsteroids2D(nowMs) {
    const obs = currentMap?.obstacles || [];
    const lowEnergy = player.energy / ENERGY_MAX <= 0.25;

    const nearestCrystal = lowEnergy ? findNearestCrystalAsteroidTarget() : null;
    const nearestCrystalIdx = nearestCrystal ? nearestCrystal.i : -1;

    for (let i = 0; i < obs.length; i++) {
      const r = obs[i];
      if (!r || isBorderObstacle(r)) continue;

      const ow = Math.max(1, r.w);
      const oh = Math.max(1, r.h);
      const ox = r.x + ow / 2;
      const oy = r.y + oh / 2;

      const v = getAsteroidVisual(i, r);
      const baseR = v.baseR;

      // Subtle "alive" animation (keep it low so rocks feel solid).
      const wobA = 0.5 + 0.5 * Math.sin(nowMs / 980 + v.seed * 12.1);
      const wobB = 0.5 + 0.5 * Math.sin(nowMs / 610 + v.seed * 5.9);
      const wob = 0.020 * wobA + 0.012 * wobB;

      // Build smooth blob path via quadratic midpoints.
      const pts = [];
      for (let k = 0; k < v.nodeData.length; k++) {
        const n = v.nodeData[k];
        const nr = baseR * (0.84 + 0.38 * n.br) * (1 + wob * Math.sin(n.a * 2.6 + nowMs / 900));
        pts.push({ x: ox + Math.cos(n.a) * nr, y: oy + Math.sin(n.a) * nr });
      }

      const rockHue = 210 + 28 * seeded01(v.seed + 9.1);
      const rockLight = 10 + 16 * seeded01(v.seed + 9.9);
      const baseCol = `hsl(${rockHue}, 22%, ${rockLight}%)`;

      const lightX = ox - baseR * 0.45;
      const lightY = oy - baseR * 0.55;
      const g = ctx.createRadialGradient(lightX, lightY, baseR * 0.08, ox, oy, baseR * 1.25);
      g.addColorStop(0.0, 'rgba(255,255,255,0.50)');
      g.addColorStop(0.18, baseCol);
      g.addColorStop(1.0, 'rgba(4,6,10,0.92)');

      ctx.save();
      ctx.fillStyle = g;
      ctx.beginPath();
      // Polygon path + miter joins gives a faceted/rocky silhouette.
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 6;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.fill();

      // Rock grit
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 1;
      for (const s of v.speckles) {
        const sx = ox + Math.cos(s.a) * baseR * s.rr;
        const sy = oy + Math.sin(s.a) * baseR * s.rr;
        ctx.globalAlpha = s.o;
        ctx.fillStyle = 'rgba(220,235,255,1)';
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Rim light (depth)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = lowEnergy ? 'rgba(120,220,255,0.20)' : 'rgba(200,230,255,0.16)';
      ctx.stroke();
      ctx.restore();

      // Subtle contour
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = 1.15;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Crystals: embedded glowing deposits + a few shard highlights.
      const hasCrystals = obstacleHasCrystals(r, i);
      if (hasCrystals) {
        const crystalPulse = 0.55 + 0.45 * Math.sin(nowMs / 260 + v.seed * 9.1);
        const flick = 0.55 + 0.45 * Math.sin(nowMs / 120 + v.seed * 6.7);
        const glowBoost = lowEnergy ? 1.55 : 1.0;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < v.deposits.length; k++) {
          const d = v.deposits[k];
          const px = ox + Math.cos(d.a) * baseR * d.rr;
          const py = oy + Math.sin(d.a) * baseR * d.rr;
          const rr = baseR * (0.26 + 0.22 * d.s);

          const gg = ctx.createRadialGradient(px, py, 0, px, py, rr * 1.55);
          gg.addColorStop(0.0, `rgba(150,245,255,${(0.68 + 0.20 * crystalPulse) * glowBoost})`);
          gg.addColorStop(0.35, `rgba(60,170,255,${(0.38 + 0.20 * flick) * glowBoost})`);
          gg.addColorStop(1.0, 'rgba(0,0,0,0)');
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.ellipse(px, py, rr * (1.05 + 0.08 * crystalPulse), rr * (0.78 + 0.08 * flick), d.a, 0, Math.PI * 2);
          ctx.fill();

          // Protruding shards (pointy crystal feel)
          const shardCount = 3 + Math.floor(seeded01(v.seed + 61.2 + k * 2.9) * 2); // 3..4
          for (let s = 0; s < shardCount; s++) {
            const rs = seeded01(v.seed + 62.7 + k * 7.1 + s * 3.3);
            const aa =
              d.a +
              (rs - 0.5) * 1.15 +
              0.25 * Math.sin(nowMs / 700 + v.seed * 6.2 + s * 1.7);
            const len = rr * (0.95 + 1.05 * seeded01(v.seed + 63.3 + k * 5.7 + s * 2.1));
            const wid = rr * (0.16 + 0.14 * seeded01(v.seed + 64.9 + k * 4.4 + s * 2.6));

            const bx = px + Math.cos(aa) * rr * 0.20;
            const by = py + Math.sin(aa) * rr * 0.20;
            const tx = bx + Math.cos(aa) * len;
            const ty = by + Math.sin(aa) * len;
            const nx = -Math.sin(aa);
            const ny = Math.cos(aa);

            const cPulse = 0.55 + 0.45 * Math.sin(nowMs / 240 + v.seed * 9.1 + s);
            ctx.globalAlpha = (0.14 + 0.18 * cPulse) * glowBoost;
            ctx.fillStyle = 'rgba(235,255,255,0.95)';
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(bx + nx * wid, by + ny * wid);
            ctx.lineTo(bx - nx * wid, by - ny * wid);
            ctx.closePath();
            ctx.fill();

            // Tiny bright edge stroke
            ctx.globalAlpha = (0.10 + 0.10 * cPulse) * glowBoost;
            ctx.strokeStyle = 'rgba(120,235,255,0.85)';
            ctx.lineWidth = 1.1;
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      // Nearest crystal target ring when low energy.
      if (lowEnergy && i === nearestCrystalIdx) {
        const pulse = 0.5 + 0.5 * Math.sin(nowMs / 220);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 2 + 2 * pulse;
        ctx.strokeStyle = `rgba(120, 235, 255, ${0.28 + 0.32 * pulse})`;
        ctx.beginPath();
        ctx.arc(ox, oy, baseR * (1.05 + 0.12 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  function dockFieldRadiusForObstacle(r) {
    const ow = Math.max(1, r.w);
    const oh = Math.max(1, r.h);
    const base = Math.min(ow, oh);
    return clamp(base * 1.85, 140, 340);
  }

  // Nearest crystal asteroid (by distance), regardless of whether it's currently dockable.
  function findNearestCrystalAsteroidTarget() {
    const obs = currentMap?.obstacles || [];
    let best = null;
    let bestD2 = Infinity;

    for (let i = 0; i < obs.length; i++) {
      const r = obs[i];
      if (!r || isBorderObstacle(r)) continue;
      if (!obstacleHasCrystals(r, i)) continue;

      const ox = r.x + Math.max(1, r.w) / 2;
      const oy = r.y + Math.max(1, r.h) / 2;
      const dx = player.x - ox;
      const dy = player.y - oy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { i, r, ox, oy };
      }
    }

    return best;
  }

  function findNearestCrystalDockTarget() {
    const obs = currentMap?.obstacles || [];
    let best = null;
    let bestD2 = Infinity;

    for (let i = 0; i < obs.length; i++) {
      const r = obs[i];
      if (!r) continue;

      // Skip giant border colliders (top/bottom/left/right walls).
      if (r.w > map.w * 0.8 || r.h > map.h * 0.8) continue;
      if (!obstacleHasCrystals(r, i)) continue;

      const hit = circleIntersectsRect(player.x, player.y, player.radius + ENERGY_DOCK_RANGE, r);
      if (!hit) continue;

      const ox = r.x + Math.max(1, r.w) / 2;
      const oy = r.y + Math.max(1, r.h) / 2;
      const dx = player.x - ox;
      const dy = player.y - oy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { i, r, ox, oy };
      }
    }

    return best;
  }

  function findNearestCrystalTouchTarget() {
    const obs = currentMap?.obstacles || [];
    let best = null;
    let bestD2 = Infinity;

    for (let i = 0; i < obs.length; i++) {
      const r = obs[i];
      if (!r) continue;

      if (isBorderObstacle(r)) continue;
      if (!obstacleHasCrystals(r, i)) continue;

      // Must be physically touching the asteroid.
      const touch = circleIntersectsRect(player.x, player.y, player.radius + ENERGY_TOUCH_PAD, r);
      if (!touch) continue;

      const ox = r.x + Math.max(1, r.w) / 2;
      const oy = r.y + Math.max(1, r.h) / 2;
      const dx = player.x - ox;
      const dy = player.y - oy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { i, r, ox, oy };
      }
    }

    return best;
  }

  function clearEnergyDock() {
    energyDock.phase = 'idle';
    energyDock.obstacleIndex = -1;
    energyDock.ox = 0;
    energyDock.oy = 0;
    energyDock.fieldRadius = 0;
    energyDock.connectEndsAtMs = 0;
    energyDock.chargeStartedAtMs = 0;
    energyDock.chargeStartEnergy = 0;
    energyDock.chargeEndsAtMs = 0;
  }

  function requestEnergyDock() {
    dockRequested = true;
  }

  function startEnergyDock(target, nowMs) {
    energyDock.phase = 'connecting';
    energyDock.obstacleIndex = target.i;
    energyDock.ox = target.ox;
    energyDock.oy = target.oy;
    energyDock.fieldRadius = dockFieldRadiusForObstacle(target.r);
    energyDock.connectEndsAtMs = nowMs + ENERGY_CONNECT_MS;
    energyDock.chargeEndsAtMs = 0;

    dockAutoEligibleSinceMs = -Infinity;
    dockRequested = false;

    showCenterMessage(ui.centerToast || ui.riftToast, 'CONNECTING…', ENERGY_CONNECT_MS);
  }

  function isPlayerTouchingDockObstacle() {
    const idx = energyDock.obstacleIndex;
    if (idx < 0) return false;
    const r = currentMap?.obstacles?.[idx];
    if (!r) return false;
    if (!obstacleHasCrystals(r, idx)) return false;
    return circleIntersectsRect(player.x, player.y, player.radius + ENERGY_TOUCH_PAD, r);
  }

  function isPlayerInsideDockField() {
    const dx = player.x - energyDock.ox;
    const dy = player.y - energyDock.oy;
    return dx * dx + dy * dy <= energyDock.fieldRadius * energyDock.fieldRadius;
  }

  function updateEnergyDock(nowMs, { wantsMove }) {
    if (inBonusRoom) {
      if (energyDock.phase !== 'idle') clearEnergyDock();
      dockRequested = false;
      dockAutoEligibleSinceMs = -Infinity;
      return;
    }

    if (energyDock.phase === 'idle') {
      const target = findNearestCrystalDockTarget();
      const desktopLike = window.matchMedia?.('(hover:hover) and (pointer:fine)')?.matches;
      const touchLike = !desktopLike;

      if (dockRequested) {
        dockRequested = false;
        if (target && player.energy < ENERGY_MAX - 0.01) {
          startEnergyDock(target, nowMs);
        } else {
          showCenterMessage(ui.centerToast || ui.riftToast, 'NO CRYSTAL LINK AVAILABLE', 650);
        }
      }

      const canDockHere = !!target && player.energy < ENERGY_MAX - 0.01;
      if (canDockHere) {
        const energyRatio = clamp(player.energy / ENERGY_MAX, 0, 1);

        // Touch-friendly auto-dock:
        // On mobile/touch devices, start connecting automatically when the player is still and
        // physically touching a crystal asteroid. No E required.
        if (touchLike) {
          const touchTarget = findNearestCrystalTouchTarget();
          if (touchTarget && !wantsMove) {
            if (!Number.isFinite(dockAutoEligibleSinceMs)) dockAutoEligibleSinceMs = nowMs;
            // Small debounce to avoid accidental triggers when sliding along edges.
            if (nowMs - dockAutoEligibleSinceMs >= 120) {
              startEnergyDock(touchTarget, nowMs);
            }
          } else {
            dockAutoEligibleSinceMs = -Infinity;
          }
        } else {
          // Desktop auto-dock stays as a low-energy assist.
          if (energyRatio <= ENERGY_AUTO_DOCK_THRESHOLD && !wantsMove) {
            if (!Number.isFinite(dockAutoEligibleSinceMs)) dockAutoEligibleSinceMs = nowMs;
            if (nowMs - dockAutoEligibleSinceMs >= ENERGY_AUTO_DOCK_IDLE_MS) {
              startEnergyDock(target, nowMs);
            }
          } else {
            dockAutoEligibleSinceMs = -Infinity;
          }
        }
      } else {
        dockAutoEligibleSinceMs = -Infinity;
      }

      return;
    }

    if (energyDock.phase === 'connecting') {
      // Player can move to escape, but moving (or stepping away) cancels the connection.
      // Allow a tiny bit of movement drift (mobile sticks / touch jitter).
      if (wantsMove || !isPlayerTouchingDockObstacle()) {
        clearEnergyDock();
        showCenterMessage(ui.centerToast || ui.riftToast, 'CONNECTION ABORTED', 550);
        return;
      }
      if (nowMs >= energyDock.connectEndsAtMs) {
        energyDock.phase = 'charging';
        energyDock.chargeStartedAtMs = nowMs;
        energyDock.chargeStartEnergy = player.energy;
        energyDock.chargeEndsAtMs = nowMs + ENERGY_RECHARGE_MS;
        showCenterMessage(ui.centerToast || ui.riftToast, 'FIELD ONLINE — STAY INSIDE', 900);
      }
      return;
    }

    if (energyDock.phase === 'charging') {
      if (!isPlayerInsideDockField()) {
        clearEnergyDock();
        showCenterMessage(ui.centerToast || ui.riftToast, 'CONNECTION LOST', 700);
        return;
      }

      // While inside the field, energy ramps up to 50% (cap), but only hitting 100%
      // if the player stays inside for the full charge duration.
      const capEnergy = ENERGY_MAX * 0.5;
      const startE = energyDock.chargeStartEnergy;
      const rampMs = ENERGY_RECHARGE_MS * 0.5;
      const elapsed = Math.max(0, nowMs - energyDock.chargeStartedAtMs);
      const t = clamp(elapsed / Math.max(1, rampMs), 0, 1);
      const rampTarget = startE >= capEnergy ? startE : (startE + (capEnergy - startE) * t);
      player.energy = Math.max(player.energy, Math.min(capEnergy, rampTarget));

      if (nowMs >= energyDock.chargeEndsAtMs) {
        player.energy = ENERGY_MAX;
        energyFullFxUntilMs = Math.max(energyFullFxUntilMs, nowMs + 950);
        clearEnergyDock();
        showCenterMessage(ui.centerToast || ui.riftToast, 'ENERGY FULL', 850);
        return;
      }
    }
  }

  // Aim / input
  let aimAngle = 0;
  const AIM_STEP = Math.PI / 24;
  const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    w: false,
    a: false,
    s: false,
    d: false,
    z: false,
    x: false,
    e: false,
  };

  // Touch joystick axes (range -1..1)
  const axes = {
    move: { x: 0, y: 0, active: false },
    aim: { x: 0, y: 0, active: false },
  };

  // Desktop mouse aim (optional)
  const mouseAimDefault =
    globalThis.matchMedia?.('(pointer: fine)')?.matches &&
    globalThis.matchMedia?.('(hover: hover)')?.matches;
  let mouseAimEnabled = (() => {
    const stored = loadMouseAimEnabled();
    if (stored == null) return !!mouseAimDefault;
    return !!stored;
  })();
  let mouseAimCanvasX = 0;
  let mouseAimCanvasY = 0;
  let mouseAimClientX = 0;
  let mouseAimClientY = 0;
  let canvasRect = null;
  const refreshCanvasRect = () => {
    canvasRect = canvas.getBoundingClientRect();
  };
  let lastMouseAimInputMs = -Infinity;
  const MOUSE_AIM_ACTIVE_WINDOW_MS = 2000;

  // Enemies / bullets / particles
  let enemies = [];
  let bullets = [];
  // Renderer uses fixed-size instanced meshes for bullets; keep gameplay bullets within that limit.
  const MAX_BULLETS = 256;
  let bulletSpeed = 5;
  let bulletRadius = 3;
  let bulletHitRadius = bulletRadius * 1.35;
  let particles = [];

  function ensureBulletCapacity(addCount = 1) {
    const want = bullets.length + Math.max(0, Math.floor(addCount));
    if (want <= MAX_BULLETS) return;
    const removeCount = want - MAX_BULLETS;
    if (removeCount <= 0) return;
    // Drop the oldest bullets first so new shots always show up.
    bullets.splice(0, Math.min(removeCount, bullets.length));
  }

  // Automatic shooting
  let shootDelayMs = 250;
  let lastShotTimeMs = 0;

  // Movement intent for renderer VFX (thruster flames). Updated each tick in update().
  let lastWantsMove = false;
  let lastMoveIntentX = 0;
  let lastMoveIntentY = 0;

  function createSfxPool(src, { poolSize = 6, volume = 0.09 } = {}) {
    const pool = [];
    for (let i = 0; i < poolSize; i++) {
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = volume;
      pool.push(a);
    }

    let idx = 0;
    let unlocked = false;

    async function unlockAll() {
      // Must be called from a user gesture.
      let anyOk = false;
      for (const a of pool) {
        const prevVol = a.volume;
        try {
          a.volume = 0;
          await a.play();
          a.pause();
          try {
            a.currentTime = 0;
          } catch {
            // ignore
          }
          a.volume = prevVol;
          anyOk = true;
        } catch {
          try {
            a.volume = prevVol;
          } catch {
            // ignore
          }
        }
      }
      unlocked = anyOk;
      return unlocked;
    }

    // Unlock on first interaction (mobile autoplay policy).
    const unlockOnce = () => {
      void unlockAll();
    };
    for (const t of [ui?.gameShell, ui?.canvas, document].filter(Boolean)) {
      t.addEventListener('pointerdown', unlockOnce, { once: true, passive: true });
      t.addEventListener('touchstart', unlockOnce, { once: true, passive: true });
    }

    function isAudioEnabled() {
      // Reuse the music toggle as the global audio toggle.
      const btn = ui?.musicBtn;
      if (!btn) return true;
      return btn.getAttribute('aria-pressed') !== 'false';
    }

    function play() {
      if (!unlocked) return;
      if (!isAudioEnabled()) return;
      const a = pool[idx++ % pool.length];
      try {
        a.pause();
        a.currentTime = 0;
      } catch {
        // ignore
      }
      a.volume = volume;
      void a.play().catch(() => {});
    }

    return { play };
  }

  const bulletSfx = createSfxPool('./CyberBlob-SoundFX-bullet.mp3', { poolSize: 6, volume: 0.085 });
  const killSfx = createSfxPool('./CyberBlob-SoundFX-kill-v1.mp3', { poolSize: 5, volume: 0.10 });

  // Powerups
  let powerUps = [];
  let activePowerUps = []; // { type, endTime }
  let piercingShots = false;
  let shotgunActive = false;
  let bounceShots = false;
  const maxLives = 6;

  // Rift / bonus room
  // Testing-friendly: keep the rift open longer so it's easier to find.
  const RIFT_LIFETIME_MS = 60000;
  const BONUS_ROOM_DURATION_MS = 20000;
  let rift = null; // { x, y, radius, spawnedMs, expiresMs }
  let nextRiftAtLevel = 0;
  let inBonusRoom = false;
  let bonusEndsAtMs = 0;
  let bonusNextSpawnAtMs = 0;
  let bonusForcedShotgun = false;
  let mainWorldSnapshot = null;

  // Color order for this level
  let levelColors = [];
  let levelNextColorIndex = 0;

  // Level spawning (trickle)
  let levelSpawn = null;

  // Persist cash occasionally
  let cashDirty = false;
  let lastCashSaveMs = 0;

  // Leaderboard sorting UI state
  let sortBy = 'time';

  // Ultimates (purchasable)
  const ult = {
    laser: {
      owned: ownedUltimates.has('laser'),
      upgraded: !!ultimateUpgrades?.laser,
      cooldownMs: 30000,
      lastUsedMs: -Infinity,
      active: false,
      startedMs: 0,
      durationMs: 6500,
      thickness: 12,
      laps: 2,
    },
    nuke: {
      owned: ownedUltimates.has('nuke'),
      upgraded: !!ultimateUpgrades?.nuke,
      cooldownMs: 60000,
      lastUsedMs: -Infinity,
      active: false,
      startedMs: 0,
      durationMs: 350,
    },
  };

  // Animation loop guard (prevents double RAF loops; allows restart after Game Over)
  let loopRunning = false;
  let lastUpdateMs = 0;
  let updateTick = 0;
  let paused = false;

  function emitPlayState(state) {
    // state: 'playing' | 'paused' | 'gameover'
    window.dispatchEvent(
      new CustomEvent('cyberyolks:playstate', {
        detail: { state },
      })
    );
  }

  function setPauseScreenVisible(visible) {
    const el = ui?.pauseScreen;
    if (!el) return;
    el.style.display = visible ? 'block' : 'none';
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function openLeaveConfirm() {
    if (!ui?.pauseScreen) return;
    ui.pauseScreen.classList.add('isConfirmingLeave');
  }

  function closeLeaveConfirm() {
    if (!ui?.pauseScreen) return;
    ui.pauseScreen.classList.remove('isConfirmingLeave');
  }

  function confirmLeaveGame() {
    closeLeaveConfirm();
    setPauseScreenVisible(false);
    showMainMenu();
  }

  function syncPauseUi() {
    if (ui?.pauseBtn) {
      ui.pauseBtn.classList.toggle('isActive', paused);
      ui.pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      ui.pauseBtn.textContent = paused ? 'RESUME' : 'PAUSE';
      ui.pauseBtn.title = paused ? 'Resume (P / ESC)' : 'Pause (P / ESC)';
    }
  }

  function isSoundEnabled() {
    const btn = ui?.musicBtn;
    if (!btn) return true;
    return btn.getAttribute('aria-pressed') !== 'false';
  }

  function syncSoundUi() {
    const enabled = isSoundEnabled();

    if (ui?.pauseSoundBtn) {
      ui.pauseSoundBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      ui.pauseSoundBtn.classList.toggle('isMuted', !enabled);
      ui.pauseSoundBtn.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
      ui.pauseSoundBtn.title = enabled ? 'Sound enabled (tap to mute)' : 'Sound muted (tap to enable)';
    }
  }

  function toggleSound() {
    // Music button is the canonical audio toggle; SFX reads its aria state too.
    ui?.musicBtn?.click?.();
    syncSoundUi();
  }

  function pauseGame() {
    if (gameOver) return;
    if (inMainMenu) return;
    if (startCountdownActive) return;
    if (paused) return;
    paused = true;
    loopRunning = false;
    closeLeaveConfirm();
    setPauseScreenVisible(true);
    syncSoundUi();
    syncPauseUi();
    emitPlayState('paused');
  }

  function resumeGame() {
    if (gameOver) return;
    if (inMainMenu) return;
    if (startCountdownActive) return;
    if (!paused) return;
    paused = false;
    closeLeaveConfirm();
    setPauseScreenVisible(false);
    syncPauseUi();
    // Reset dt accumulator so we don't jump on resume.
    lastUpdateMs = performance.now();
    emitPlayState('playing');
    requestLoop();
  }

  function togglePause() {
    if (startCountdownActive) return;
    if (paused) resumeGame();
    else pauseGame();
  }

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function distancePointToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;

    const abLenSq = abx * abx + aby * aby;
    if (abLenSq <= 1e-6) return Math.hypot(px - ax, py - ay);

    let t = (apx * abx + apy * aby) / abLenSq;
    t = clamp(t, 0, 1);
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
  }

  function rayToBounds(x, y, dx, dy, boundsW, boundsH) {
    // Returns the end point where a ray from (x,y) in direction (dx,dy) hits the map bounds.
    // Assumes dx,dy not both 0.
    const eps = 1e-6;
    const candidates = [];

    if (Math.abs(dx) > eps) {
      const tx1 = (0 - x) / dx;
      const tx2 = (boundsW - x) / dx;
      if (tx1 > 0) candidates.push(tx1);
      if (tx2 > 0) candidates.push(tx2);
    }
    if (Math.abs(dy) > eps) {
      const ty1 = (0 - y) / dy;
      const ty2 = (boundsH - y) / dy;
      if (ty1 > 0) candidates.push(ty1);
      if (ty2 > 0) candidates.push(ty2);
    }

    const t = candidates.length ? Math.min(...candidates) : 0;
    return { x: x + dx * t, y: y + dy * t };
  }

  function ensureMapSize() {
    if (inBonusRoom) return;
    // Grow-only so resizing the browser won't shrink the world.
    map.w = Math.max(map.w, Math.floor(world.w * 3));
    map.h = Math.max(map.h, Math.floor(world.h * 3));

    if (currentMap.w !== map.w || currentMap.h !== map.h) {
      currentMap = createNeonMap(map);
    }
  }

  function resolveCircleVsObstacles(x, y, radius) {
    let nx = x;
    let ny = y;
    let hit = false;

    const maxX = Math.max(radius, map.w - radius);
    const maxY = Math.max(radius, map.h - radius);

    // A couple passes helps with corners.
    for (let pass = 0; pass < 2; pass++) {
      nx = clamp(nx, radius, maxX);
      ny = clamp(ny, radius, maxY);
      for (const r of currentMap.obstacles) {
        const res = resolveCircleVsRect(nx, ny, radius, r);
        if (res.hit) {
          nx = res.x;
          ny = res.y;
          hit = true;

          // If an obstacle pushes us out toward the map edge, keep it in-bounds.
          nx = clamp(nx, radius, maxX);
          ny = clamp(ny, radius, maxY);
        }
      }
    }

    nx = clamp(nx, radius, maxX);
    ny = clamp(ny, radius, maxY);
    return { x: nx, y: ny, hit };
  }

  function canCircleFit(x, y, radius) {
    for (const r of currentMap.obstacles) {
      if (circleIntersectsRect(x, y, radius, r)) return false;
    }
    return true;
  }

  function clampCameraToMap() {
    camera.x = clamp(camera.x, 0, Math.max(0, map.w - world.w));
    camera.y = clamp(camera.y, 0, Math.max(0, map.h - world.h));
  }

  function updateCamera() {
    // Deadzone circle centered on the viewport; camera moves only when player exits it.
    const viewCx = world.w / 2;
    const viewCy = world.h / 2;

    const px = player.x - camera.x;
    const py = player.y - camera.y;

    const dx = px - viewCx;
    const dy = py - viewCy;
    const dist = Math.hypot(dx, dy);

    let targetX = camera.x;
    let targetY = camera.y;

    const r = camera.deadzoneRadius;
    if (dist > r && dist > 1e-6) {
      const overflow = dist - r;
      const ux = dx / dist;
      const uy = dy / dist;
      targetX += ux * overflow;
      targetY += uy * overflow;
    }

    targetX = clamp(targetX, 0, Math.max(0, map.w - world.w));
    targetY = clamp(targetY, 0, Math.max(0, map.h - world.h));

    camera.x += (targetX - camera.x) * camera.followLerp;
    camera.y += (targetY - camera.y) * camera.followLerp;
    clampCameraToMap();
  }

  function isKillableEnemy(e) {
    if (inBonusRoom) return true;
    const nextTargetColor = levelColors[levelNextColorIndex];
    return !!nextTargetColor && e.color === nextTargetColor;
  }

  function randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function scheduleNextRiftFromLevel(lv) {
    nextRiftAtLevel = Math.max(1, Math.floor(lv)) + randInt(6, 10);
  }

  function createBonusMap({ w, h }) {
    const border = 28;
    const obstacles = [];
    obstacles.push({ x: 0, y: 0, w, h: border });
    obstacles.push({ x: 0, y: h - border, w, h: border });
    obstacles.push({ x: 0, y: 0, w: border, h });
    obstacles.push({ x: w - border, y: 0, w: border, h });
    return { w, h, obstacles, kind: 'bonus' };
  }

  function spawnRift(nowMs) {
    const radius = 18 * sizeScale;
    const margin = radius + 44;
    const minDist = 280;

    let x = map.w / 2;
    let y = map.h / 2;

    for (let tries = 0; tries < 260; tries++) {
      const cx = margin + Math.random() * (map.w - margin * 2);
      const cy = margin + Math.random() * (map.h - margin * 2);

      const dx = cx - player.x;
      const dy = cy - player.y;
      if (dx * dx + dy * dy < minDist * minDist) continue;
      if (!canCircleFit(cx, cy, radius + 2)) continue;

      x = cx;
      y = cy;
      break;
    }

    rift = {
      x,
      y,
      radius,
      spawnedMs: nowMs,
      expiresMs: nowMs + RIFT_LIFETIME_MS,
    };

    showCenterMessage(ui.riftToast || ui.centerToast, 'A RIFT HAS OPENED', 1400);
  }

  function enterBonusRoom(nowMs) {
    if (inBonusRoom) return;

    mainWorldSnapshot = {
      mapW: map.w,
      mapH: map.h,
      currentMap,
      cameraX: camera.x,
      cameraY: camera.y,
      playerX: player.x,
      playerY: player.y,
      enemies,
      bullets,
      particles,
      powerUps,
      activePowerUps,
      levelSpawn,
      levelColors,
      levelNextColorIndex,
    };

    inBonusRoom = true;
    bonusForcedShotgun = true;
    bonusEndsAtMs = nowMs + BONUS_ROOM_DURATION_MS;
    bonusNextSpawnAtMs = nowMs;
    rift = null;

    const bonusW = Math.max(1200, Math.floor(world.w * 1.85));
    const bonusH = Math.max(900, Math.floor(bonusW * 0.75));
    map.w = bonusW;
    map.h = bonusH;
    currentMap = createBonusMap(map);

    enemies = [];
    bullets = [];
    particles = [];
    powerUps = [];
    activePowerUps = [];
    levelSpawn = null;
    levelColors = [];
    levelNextColorIndex = 0;

    player.x = map.w / 2;
    player.y = map.h / 2;
    player.invulnerableUntil = nowMs + 450;
    camera.x = clamp(player.x - world.w / 2, 0, Math.max(0, map.w - world.w));
    camera.y = clamp(player.y - world.h / 2, 0, Math.max(0, map.h - world.h));

    showCenterMessage(ui.riftToast || ui.centerToast, 'BONUS ROOM!', 900);
  }

  function exitBonusRoom(nowMs) {
    if (!inBonusRoom) return;
    if (!mainWorldSnapshot) {
      inBonusRoom = false;
      bonusForcedShotgun = false;
      return;
    }

    // Restore world snapshot (keep cash/time/achievements as-is)
    map.w = mainWorldSnapshot.mapW;
    map.h = mainWorldSnapshot.mapH;
    currentMap = mainWorldSnapshot.currentMap;
    camera.x = mainWorldSnapshot.cameraX;
    camera.y = mainWorldSnapshot.cameraY;
    player.x = mainWorldSnapshot.playerX;
    player.y = mainWorldSnapshot.playerY;
    player.invulnerableUntil = nowMs + 900;

    enemies = mainWorldSnapshot.enemies;
    bullets = mainWorldSnapshot.bullets;
    particles = mainWorldSnapshot.particles;
    powerUps = mainWorldSnapshot.powerUps;
    activePowerUps = mainWorldSnapshot.activePowerUps;
    levelSpawn = mainWorldSnapshot.levelSpawn;
    levelColors = mainWorldSnapshot.levelColors;
    levelNextColorIndex = mainWorldSnapshot.levelNextColorIndex;

    inBonusRoom = false;
    bonusForcedShotgun = false;
    bonusEndsAtMs = 0;
    bonusNextSpawnAtMs = 0;
    mainWorldSnapshot = null;

    showCenterMessage(ui.riftToast || ui.centerToast, 'RETURNED', 700);
  }

  function advanceNextColorIfCleared() {
    const nextTargetColor = levelColors[levelNextColorIndex];
    if (!nextTargetColor) return;
    const pendingForColor = levelSpawn?.pendingByColor?.[nextTargetColor] || 0;
    if (!enemies.some((en) => en.color === nextTargetColor) && pendingForColor <= 0) {
      levelNextColorIndex++;
      pulseNextColor(ui.nextColorSwatchEl);
    }
  }

  function killEnemyByIndex(enemyIndex, hitX, hitY) {
    const e = enemies[enemyIndex];
    if (!e) return;
    killSfx.play();
    spawnEnemyDeathParticles(e.x, e.y, e.color);
    spawnHitSuccess(hitX, hitY, e.color);
    addCashForColor(e.color);
    enemies.splice(enemyIndex, 1);
    maybeSpawnPowerUp(e.x, e.y);
    advanceNextColorIfCleared();
  }

  function getUltimateText(nowMs) {
    // Legacy helper retained but no longer used.
    return 'READY';
  }

  function getCooldownText(nowMs, cooldownMs, lastUsedMs) {
    const remaining = cooldownMs - (nowMs - lastUsedMs);
    if (remaining <= 0) return '';
    return `${Math.ceil(remaining / 1000)}s`;
  }

  function getLaserButtonText(nowMs) {
    const showKeyHint = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    if (!ult.laser.owned) return 'LASER';
    if (ult.laser.active) return showKeyHint ? 'LASER\nSPACE' : 'LASER';
    const cd = getCooldownText(nowMs, ult.laser.cooldownMs, ult.laser.lastUsedMs);
    if (!showKeyHint) return cd ? `LASER ${cd}` : 'LASER';
    return cd ? `LASER ${cd}\nSPACE` : 'LASER\nSPACE';
  }

  function getNukeButtonText(nowMs) {
    const showKeyHint = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    if (!ult.nuke.owned) return 'NUKE';
    if (ult.nuke.active) return showKeyHint ? 'NUKE\nSHIFT' : 'NUKE';
    const cd = getCooldownText(nowMs, ult.nuke.cooldownMs, ult.nuke.lastUsedMs);
    if (!showKeyHint) return cd ? `NUKE ${cd}` : 'NUKE';
    return cd ? `NUKE ${cd}\nSHIFT` : 'NUKE\nSHIFT';
  }

  function syncUltimateButtonsVisibility() {
    // Desktop buttons
    if (ui.laserTopBtn) ui.laserTopBtn.classList.toggle('hidden', !ult.laser.owned);
    if (ui.nukeTopBtn) ui.nukeTopBtn.classList.toggle('hidden', !ult.nuke.owned);

    // Mobile buttons
    if (ui.ultBtn) ui.ultBtn.classList.toggle('hidden', !ult.laser.owned);
    if (ui.nukeBtn) ui.nukeBtn.classList.toggle('hidden', !ult.nuke.owned);
  }

  function syncUltimateShopUi() {
    const laserPrice = 500;
    const nukePrice = 1500;
    const laserUpgradePrice = laserPrice * 3;
    const nukeUpgradePrice = nukePrice * 3;

    if (ui.ultLaserBtn) {
      const owned = ult.laser.owned;
      const upgraded = !!ult.laser.upgraded;
      if (!owned) {
        ui.ultLaserBtn.textContent = `BUY LASER (${laserPrice} CC)`;
        ui.ultLaserBtn.disabled = cash < laserPrice;
      } else if (!upgraded) {
        ui.ultLaserBtn.textContent = `UPGRADE LASER (${laserUpgradePrice} CC)`;
        ui.ultLaserBtn.disabled = cash < laserUpgradePrice;
      } else {
        ui.ultLaserBtn.textContent = 'LASER MK2';
        ui.ultLaserBtn.disabled = true;
      }
    }
    if (ui.ultNukeBtn) {
      const owned = ult.nuke.owned;
      const upgraded = !!ult.nuke.upgraded;
      if (!owned) {
        ui.ultNukeBtn.textContent = `BUY NUKE (${nukePrice} CC)`;
        ui.ultNukeBtn.disabled = cash < nukePrice;
      } else if (!upgraded) {
        ui.ultNukeBtn.textContent = `UPGRADE NUKE (${nukeUpgradePrice} CC)`;
        ui.ultNukeBtn.disabled = cash < nukeUpgradePrice;
      } else {
        ui.ultNukeBtn.textContent = 'NUKE MK2';
        ui.ultNukeBtn.disabled = true;
      }
    }
  }

  function buyUltimate(type) {
    if (type !== 'laser' && type !== 'nuke') return;
    const basePrice = type === 'laser' ? 500 : 1500;
    const owned = type === 'laser' ? ult.laser.owned : ult.nuke.owned;
    const upgraded = type === 'laser' ? !!ult.laser.upgraded : !!ult.nuke.upgraded;

    // Purchase if not owned, otherwise upgrade once.
    if (!owned) {
      if (cash < basePrice) return;
      cash -= basePrice;
      cashDirty = true;
      saveCash(cash);

      ownedUltimates.add(type);
      saveOwnedUltimates(ownedUltimates);

      if (type === 'laser') ult.laser.owned = true;
      if (type === 'nuke') ult.nuke.owned = true;
    } else if (!upgraded) {
      const upgradePrice = basePrice * 3;
      if (cash < upgradePrice) return;
      cash -= upgradePrice;
      cashDirty = true;
      saveCash(cash);

      ultimateUpgrades = { ...(ultimateUpgrades || { laser: 0, nuke: 0 }) };
      ultimateUpgrades[type] = 1;
      saveUltimateUpgrades(ultimateUpgrades);

      if (type === 'laser') ult.laser.upgraded = true;
      if (type === 'nuke') ult.nuke.upgraded = true;
    } else {
      return;
    }

    syncUltimateButtonsVisibility();
    syncUltimateShopUi();
    updateHud(ui, buildHudState());
  }

  function tryActivateLaser() {
    if (gameOver) return;
    if (!ult.laser.owned) return;

    const nowMs = performance.now();
    const remaining = ult.laser.cooldownMs - (nowMs - ult.laser.lastUsedMs);
    if (ult.laser.active || remaining > 0) return;

    ult.laser.active = true;
    ult.laser.startedMs = nowMs;
    ult.laser.lastUsedMs = nowMs;
    spawnCircleBurst(player.x, player.y, 'rgba(0,255,255,0.45)', 10, 24);
  }

  function tryActivateNuke() {
    if (gameOver) return;
    if (!ult.nuke.owned) return;

    const nowMs = performance.now();
    const remaining = ult.nuke.cooldownMs - (nowMs - ult.nuke.lastUsedMs);
    if (ult.nuke.active || remaining > 0) return;

    ult.nuke.active = true;
    ult.nuke.startedMs = nowMs;
    ult.nuke.lastUsedMs = nowMs;

    const isMk2 = !!ult.nuke.upgraded;

    // Base NUKE: local blast (smaller area). MK2: clears the whole map.
    const baseRadius = Math.max(220, Math.min(world.w, world.h) * 0.45) * sizeScale;
    const radius = isMk2 ? Infinity : baseRadius;

    if (enemies.length > 0) {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        const distSq = dx * dx + dy * dy;
        if (radius !== Infinity && distSq > radius * radius) continue;

        addCashForColor(e.color);
        if (Math.random() < 0.45) spawnEnemyDeathParticles(e.x, e.y, e.color);
        enemies.splice(i, 1);
      }
    }

    // Big flash-like burst (bigger for MK2)
    spawnCircleBurst(player.x, player.y, 'rgba(255,255,255,0.78)', isMk2 ? 34 : 22, isMk2 ? 70 : 46);
    if (!isMk2) spawnCircleBurst(player.x, player.y, 'rgba(0,255,255,0.20)', baseRadius * 0.18, baseRadius * 0.34);
  }

  function getNonOverlappingSpawn(spawnRadius = 8 * sizeScale) {
    let x;
    let y;
    let tries = 0;

    const view = {
      left: camera.x,
      top: camera.y,
      right: camera.x + world.w,
      bottom: camera.y + world.h,
    };
    const pad = 60;

    while (true) {
      tries++;
      if (tries > 1000) {
        x = clamp(player.x + spawnRadius, spawnRadius, map.w - spawnRadius);
        y = clamp(player.y + spawnRadius, spawnRadius, map.h - spawnRadius);
        break;
      }

      const edgeRand = Math.random();
      if (edgeRand < 0.25) {
        // top of viewport
        x = view.left + Math.random() * (view.right - view.left);
        y = view.top - pad;
      } else if (edgeRand < 0.5) {
        // bottom of viewport
        x = view.left + Math.random() * (view.right - view.left);
        y = view.bottom + pad;
      } else if (edgeRand < 0.75) {
        // left of viewport
        x = view.left - pad;
        y = view.top + Math.random() * (view.bottom - view.top);
      } else {
        // right of viewport
        x = view.right + pad;
        y = view.top + Math.random() * (view.bottom - view.top);
      }

      // Clamp spawn to map bounds (still slightly offscreen if near map edges)
      x = clamp(x, spawnRadius, map.w - spawnRadius);
      y = clamp(y, spawnRadius, map.h - spawnRadius);

      let overlaps = false;

      // Avoid spawning inside walls
      if (!canCircleFit(x, y, spawnRadius + 2)) overlaps = true;

      for (const e of enemies) {
        const distSq = (x - e.x) ** 2 + (y - e.y) ** 2;
        const radSum = (spawnRadius + e.radius) ** 2;
        if (distSq < radSum) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) break;
    }

    return { x, y };
  }

  function spawnEnemiesForLevel() {
    enemies = [];

    const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(n)));

    // Enemy count scales with level (no early hard cap), but keep an upper cap for performance.
    // Level 1 -> 4 enemies, Level 30 -> 33 enemies.
    const enemyCount = clampInt(3 + level, 4, 48);

    // Palette size grows slowly; too many colors makes progression overly long.
    const colorCount = clampInt(3 + Math.floor(level / 6), 3, 7);

    // Pick a palette (subset of COLOR_ORDER) and sort it by COLOR_ORDER so the UI/target feels consistent.
    const shuffled = [...COLOR_ORDER].sort(() => Math.random() - 0.5);
    const palette = shuffled.slice(0, colorCount);
    palette.sort((c1, c2) => COLOR_ORDER.indexOf(c1) - COLOR_ORDER.indexOf(c2));

    // Allocate how many enemies of each color will spawn this level.
    // Ensure at least 1 per palette color so the sequence is always completable.
    const pendingByColor = Object.create(null);
    for (const c of palette) pendingByColor[c] = 1;
    let remaining = enemyCount - palette.length;
    while (remaining-- > 0) {
      const c = palette[Math.floor(Math.random() * palette.length)];
      pendingByColor[c]++;
    }

    levelColors = palette;
    levelNextColorIndex = 0;

    const minDim = Math.max(1, Math.min(world.w, world.h));
    const isPhoneLayout = minDim <= 520 || Math.min(window.innerWidth, window.innerHeight) <= 600;

    const baseEnemyRadius = (isPhoneLayout ? 7.6 : 8) * sizeScale;
    // Careful speed ramp: small increase per level with low per-enemy variance.
    // Keep early levels close to the old average (~1.5), and ramp gently.
    const baseSpeed = Math.min(2.1, 1.35 + level * 0.015);
    const spawnIntervalMs = clampInt(520 - level * 6, 240, 520);

    const spawnOneEnemy = (color) => {
      // Skewed size distribution: most are near-normal, some are big, huge ones are rare.
      // (Bigger ones also move a bit slower.)
      const roll = Math.random();
      let sizeFactor;
      if (roll < 0.02) {
        // Huge (rare)
        sizeFactor = 1.75 + Math.random() * 0.60;
      } else if (roll < 0.12) {
        // Big (uncommon)
        sizeFactor = 1.25 + Math.random() * 0.50;
      } else {
        // Normal (common)
        sizeFactor = 0.90 + Math.random() * 0.25;
      }

      const radius = baseEnemyRadius * sizeFactor;
      const { x, y } = getNonOverlappingSpawn(radius);
      const wobblePhase = Math.random() * Math.PI * 2;

      const perEnemyVariance = 0.97 + Math.random() * 0.06;
      const bigSlowdown = 1 / Math.pow(sizeFactor, 0.35);
      const speed = baseSpeed * perEnemyVariance * bigSlowdown;

      // Gooey shape variety: different node counts, breathing, squish, and slight asymmetry.
      const isHuge = sizeFactor >= 1.75;
      const isBig = sizeFactor >= 1.25;
      const blobNodesCount = isHuge
        ? 22 + Math.floor(Math.random() * 5)
        : isBig
          ? 19 + Math.floor(Math.random() * 5)
          : 16 + Math.floor(Math.random() * 6);
      const blobNoiseScale = isHuge ? 0.78 + Math.random() * 0.10 : isBig ? 0.90 + Math.random() * 0.15 : 1.0 + Math.random() * 0.25;
      const blobSquishScale = isHuge ? 0.75 + Math.random() * 0.10 : isBig ? 0.85 + Math.random() * 0.15 : 0.95 + Math.random() * 0.20;
      const blobBiasMag = isHuge ? 0.04 + Math.random() * 0.04 : 0.06 + Math.random() * 0.06;
      const blobBiasAngle = Math.random() * Math.PI * 2;
      const blobNoiseMulA = 2.0 + Math.random() * 1.2;
      const blobNoiseMulB = 3.4 + Math.random() * 1.8;
      const blobNoiseTimeA = 300 + Math.random() * 180;
      const blobNoiseTimeB = 160 + Math.random() * 130;

      enemies.push({
        x,
        y,
        prevX: x,
        prevY: y,
        vx: 0,
        vy: 0,
        radius,
        color,
        speed,
        wobblePhase,
        blobSeed: Math.random() * 1000,
        blobNodesCount,
        blobNoiseScale,
        blobNoiseMulA,
        blobNoiseMulB,
        blobNoiseTimeA,
        blobNoiseTimeB,
        blobBiasMag,
        blobBiasAngle,
        blobSquishScale,
        blobNodes: null,
        blobLastMs: 0,
      });
    };

    const pickSpawnColor = () => {
      // Weighted toward earlier colors so progress doesn't stall early.
      const weighted = [];
      for (let i = 0; i < palette.length; i++) {
        const c = palette[i];
        const k = pendingByColor[c] || 0;
        if (k <= 0) continue;
        const w = Math.max(1, palette.length - i);
        for (let n = 0; n < w; n++) weighted.push(c);
      }
      if (weighted.length === 0) return null;
      return weighted[Math.floor(Math.random() * weighted.length)];
    };

    // Spawn a small initial burst so the level never starts empty.
    const initialBurst = clampInt(4 + Math.floor(level / 10), 4, 8);
    const nowMs = performance.now();
    for (let i = 0; i < Math.min(initialBurst, enemyCount); i++) {
      const c = pickSpawnColor() || palette[0];
      spawnOneEnemy(c);
      pendingByColor[c]--;
    }

    const pendingTotal = Object.values(pendingByColor).reduce((a, b) => a + b, 0);
    levelSpawn = {
      pendingTotal,
      pendingByColor,
      palette,
      spawnIntervalMs,
      nextSpawnAtMs: nowMs + spawnIntervalMs,
      spawnOneEnemy,
      pickSpawnColor,
    };

    // If the first target color isn't currently present (rare but possible), advance to the next available.
    advanceNextColorIfCleared();
  }

  function updateSpawnTrickle(nowMs) {
    if (!levelSpawn) return;
    if (levelSpawn.pendingTotal <= 0) return;
    if (nowMs < levelSpawn.nextSpawnAtMs) return;

    const c = levelSpawn.pickSpawnColor();
    if (!c) {
      levelSpawn.pendingTotal = 0;
      return;
    }

    levelSpawn.spawnOneEnemy(c);
    levelSpawn.pendingByColor[c] = Math.max(0, (levelSpawn.pendingByColor[c] || 0) - 1);
    levelSpawn.pendingTotal = Math.max(0, levelSpawn.pendingTotal - 1);

    // Slight jitter so the cadence feels organic.
    const jitter = 0.85 + Math.random() * 0.30;
    levelSpawn.nextSpawnAtMs = nowMs + levelSpawn.spawnIntervalMs * jitter;

    // If we just spawned the last of a color, it may allow the target to advance later.
    advanceNextColorIfCleared();
  }

  function separateEnemies() {
    const baseRepulsionFactor = 2.0;
    const priorityRepulsionFactor = 2.35;
    const priorityPushShare = 0.25;
    const otherPushShare = 1 - priorityPushShare;
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const e1 = enemies[i];
        const e2 = enemies[j];

        const e1Priority = isKillableEnemy(e1);
        const e2Priority = isKillableEnemy(e2);
        const repulsionFactor = e1Priority !== e2Priority ? priorityRepulsionFactor : baseRepulsionFactor;

        const dx = e2.x - e1.x;
        const dy = e2.y - e1.y;
        const distSq = dx * dx + dy * dy;

        const desiredDist = repulsionFactor * (e1.radius + e2.radius);
        const desiredDistSq = desiredDist * desiredDist;

        if (distSq < desiredDistSq) {
          const dist = Math.sqrt(distSq) || 0.001;
          const overlap = desiredDist - dist;
          const push = overlap;

          const ux = dx / dist;
          const uy = dy / dist;

          // If one enemy is the current killable "food" target, let it shove through the crowd.
          // Priority enemy moves less; other enemy yields more.
          const e1Share = e1Priority && !e2Priority ? priorityPushShare : e2Priority && !e1Priority ? otherPushShare : 0.5;
          const e2Share = 1 - e1Share;

          e1.x -= ux * push * e1Share;
          e1.y -= uy * push * e1Share;
          e2.x += ux * push * e2Share;
          e2.y += uy * push * e2Share;
        }
      }
    }
  }

  function spawnCircleBurst(x, y, color, minR, maxR) {
    for (let i = 0; i < 8; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 1,
        maxLife: 1,
        radius: minR + Math.random() * (maxR - minR),
        color,
      });
    }
  }

  function spawnEnemyDeathParticles(x, y, color) {
    for (let i = 0; i < 18; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        life: 1,
        maxLife: 1,
        radius: 10 + Math.random() * 4,
        color,
      });
    }
  }

  function spawnMuzzle(x, y) {
    for (let i = 0; i < 4; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        life: 1,
        maxLife: 1,
        radius: 3 + Math.random() * 2,
        color: 'rgba(0,0,0,0.6)',
      });
    }
  }

  function updateParticles(dtFrames = 1) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dtFrames;
      p.y += p.vy * dtFrames;
      p.life -= 0.04 * dtFrames;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function spawnHitSuccess(x, y, color) {
    spawnCircleBurst(x, y, color === 'black' ? 'rgba(255,255,255,0.7)' : colorToRGBA(color, 0.8), 8, 18);
  }

  function spawnHitBlocked(x, y) {
    spawnCircleBurst(x, y, 'rgba(0,0,0,0.35)', 4, 10);
  }

  function spawnBounceEffect(x, y) {
    spawnCircleBurst(x, y, 'rgba(30,144,255,0.5)', 5, 12);
  }

  function spawnBulletVanishEffect(x, y) {
    // A small, bright-ish pop so disappear events feel intentional.
    spawnCircleBurst(x, y, 'rgba(255,255,255,0.22)', 4, 10);
    spawnCircleBurst(x, y, 'rgba(0,255,255,0.12)', 6, 14);
  }

  function addCashForColor(color) {
    const val = COLOR_CASH_VALUES[color] || 1;
    cash += Math.max(1, Math.round(val * trophyEffects.cashMultiplier));
    cashDirty = true;
  }

  function maybeSpawnPowerUp(x, y) {
    if (Math.random() < LIFE_DROP_CHANCE) {
      powerUps.push({ x, y, radius: 9 * sizeScale, type: POWERUP_TYPES.life });
    }
    if (Math.random() < POWERUP_DROP_CHANCE) {
      const types = [
        POWERUP_TYPES.speed,
        POWERUP_TYPES.fireRate,
        POWERUP_TYPES.piercing,
        POWERUP_TYPES.shotgun,
        POWERUP_TYPES.bounce,
        POWERUP_TYPES.stasis,
      ];
      const type = types[Math.floor(Math.random() * types.length)];
      powerUps.push({ x, y, radius: 8 * sizeScale, type });
    }
  }

  function activatePowerUp(type) {
    // Announce pickup (center toast + fly into active overlay)
    const label = String(type).toUpperCase();
    showCenterMessage(ui.centerToast, label, 520);
    animatePickupToActive(ui, label);

    if (type === POWERUP_TYPES.life) {
      if (player.lives < maxLives) player.lives++;
      spawnCircleBurst(player.x, player.y, 'rgba(255,0,80,0.7)', 10, 26);
      return;
    }

    const existing = activePowerUps.find((p) => p.type === type);
    const perTypeBonus = trophyEffects.powerupDurationByType?.[type] || 0;
    const dur = POWERUP_DURATION_MS + trophyEffects.powerupDurationBonusMs + perTypeBonus;
    if (existing) existing.endTime = performance.now() + dur;
    else activePowerUps.push({ type, endTime: performance.now() + dur });
  }

  function updateActivePowerUps() {
    const now = performance.now();
    for (let i = activePowerUps.length - 1; i >= 0; i--) {
      if (activePowerUps[i].endTime < now) activePowerUps.splice(i, 1);
    }

    let newSpeed = 3;
    let newShootDelay = 250;
    let newPiercing = false;
    let newShotgun = false;
    let newBounce = false;
    let newEnemySpeedMult = 1;

    for (const p of activePowerUps) {
      if (p.type === POWERUP_TYPES.speed) newSpeed += 2;
      else if (p.type === POWERUP_TYPES.fireRate) newShootDelay = 125;
      else if (p.type === POWERUP_TYPES.piercing) newPiercing = true;
      else if (p.type === POWERUP_TYPES.shotgun) newShotgun = true;
      else if (p.type === POWERUP_TYPES.bounce) newBounce = true;
      else if (p.type === POWERUP_TYPES.stasis) newEnemySpeedMult = Math.min(newEnemySpeedMult, 0.22);
    }

    player.speed = newSpeed;
    shootDelayMs = newShootDelay;
    piercingShots = newPiercing;
    shotgunActive = newShotgun;
    bounceShots = newBounce;
    enemySpeedMult = newEnemySpeedMult;

    // Bonus-room overrides
    if (bonusForcedShotgun) shotgunActive = true;
    if (inBonusRoom) shootDelayMs = Math.min(shootDelayMs, 125);
  }

  function shootBullet() {
    const muzzleDist = player.radius + bulletRadius + 6;
    if (shotgunActive) {
      const pellets = 5;
      ensureBulletCapacity(pellets);
      for (let i = 0; i < pellets; i++) {
        const spread = (Math.random() - 0.5) * 0.5;
        const a = aimAngle + spread;
        const mx = player.x + Math.cos(a) * muzzleDist;
        const my = player.y + Math.sin(a) * muzzleDist;
        bullets.push({ x: mx, y: my, vx: Math.cos(a), vy: Math.sin(a), seed: Math.random() * Math.PI * 2 });
      }
      const mx = player.x + Math.cos(aimAngle) * muzzleDist;
      const my = player.y + Math.sin(aimAngle) * muzzleDist;
      spawnMuzzle(mx, my);
      spawnCircleBurst(mx, my, 'rgba(0,0,0,0.4)', 6, 16);
      bulletSfx.play();
    } else {
      ensureBulletCapacity(1);
      const mx = player.x + Math.cos(aimAngle) * muzzleDist;
      const my = player.y + Math.sin(aimAngle) * muzzleDist;
      bullets.push({ x: mx, y: my, vx: Math.cos(aimAngle), vy: Math.sin(aimAngle), seed: Math.random() * Math.PI * 2 });
      spawnMuzzle(mx, my);
      bulletSfx.play();
    }
  }

  function draw() {
    const nowMs = performance.now();
    // Keep the coordinate system in CSS pixels
    ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
    ctx.clearRect(0, 0, world.w, world.h);

    // 3D render pass (map + entities) in a WebGL overlay canvas.
    // Gameplay remains 2D; we just render everything with lighting.
    if (renderer3d) {
      // Add a color field to powerups for 3D visuals
      for (const p of powerUps) {
        if (!p.color) {
          p.color =
            p.type === POWERUP_TYPES.speed
              ? 'orange'
              : p.type === POWERUP_TYPES.fireRate
                ? 'cyan'
                : p.type === POWERUP_TYPES.piercing
                  ? 'purple'
                  : p.type === POWERUP_TYPES.shotgun
                    ? 'gold'
                    : p.type === POWERUP_TYPES.bounce
                      ? 'dodgerblue'
                      : p.type === POWERUP_TYPES.stasis
                        ? 'springgreen'
                      : 'crimson';
        }
      }

      const nextTargetColor = levelColors[levelNextColorIndex];
      const nextEnemyPreview = nextTargetColor
        ? enemies.find((e) => e && e.color === nextTargetColor) || { color: nextTargetColor, blobSeed: 0, vx: 0, vy: 0 }
        : null;

      renderer3d.render({
        nowMs,
        world,
        cam: camera,
        map,
        player,
        thrusting: lastWantsMove,
        moveIntentX: lastMoveIntentX,
        moveIntentY: lastMoveIntentY,
        energyRatio: clamp(player.energy / ENERGY_MAX, 0, 1),
        energyFullFxUntilMs,
        aimAngle,
        enemies,
        bullets,
        bulletSpeed,
        bulletRadius,
        powerUps,
        obstacles: USE_2D_ASTEROIDS ? [] : (currentMap?.obstacles || []),
        nextEnemyPreview,
      });
    }

    // Keep 2D canvas only for special effects that we haven't moved to 3D yet.
    // Camera transform: map coords -> viewport
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Asteroids + crystal deposits (2D visual layer)
    if (USE_2D_ASTEROIDS) {
      drawAsteroids2D(nowMs);
    }

    // Low-energy guidance: show an edge pointer towards the nearest crystal asteroid.
    // Only show when low energy and the target is off-screen.
    if (player.energy / ENERGY_MAX <= 0.25) {
      const target = findNearestCrystalAsteroidTarget();
      if (target && typeof target.ox === 'number' && typeof target.oy === 'number') {
        const vx = target.ox - camera.x;
        const vy = target.oy - camera.y;
        const margin = 46;
        const onScreen = vx >= margin && vx <= world.w - margin && vy >= margin && vy <= world.h - margin;
        if (!onScreen) {
          const cx = world.w * 0.5;
          const cy = world.h * 0.5;
          let dx = vx - cx;
          let dy = vy - cy;
          const len = Math.hypot(dx, dy) || 1;
          dx /= len;
          dy /= len;

          // Place pointer along the viewport edge with padding.
          const maxX = cx - margin;
          const maxY = cy - margin;
          const t = Math.min(
            maxX / Math.max(0.001, Math.abs(dx)),
            maxY / Math.max(0.001, Math.abs(dy))
          );
          const px = cx + dx * t;
          const py = cy + dy * t;

          const pulse = 0.5 + 0.5 * Math.sin(nowMs / 170);
          const size = 14 + pulse * 5;

          ctx.save();
          // Draw in screen space (undo camera translation for this element).
          ctx.translate(camera.x, camera.y);
          ctx.translate(px, py);
          ctx.rotate(Math.atan2(dy, dx));

          ctx.globalAlpha = 0.65 + pulse * 0.25;
          ctx.fillStyle = 'rgba(0,255,255,0.85)';
          ctx.shadowColor = 'rgba(0,255,255,0.9)';
          ctx.shadowBlur = 18;

          // Simple chevron/arrow.
          ctx.beginPath();
          ctx.moveTo(size, 0);
          ctx.lineTo(-size * 0.8, size * 0.7);
          ctx.lineTo(-size * 0.55, 0);
          ctx.lineTo(-size * 0.8, -size * 0.7);
          ctx.closePath();
          ctx.fill();

          // Small ring behind arrow.
          ctx.globalAlpha = 0.18 + pulse * 0.12;
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 18 + pulse * 6, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
        }
      }
    }

    // Rift (2D effect pass so we don't need 3D changes)
    if (rift && !inBonusRoom) {
      const t = (nowMs - rift.spawnedMs) / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
      const r0 = rift.radius * (0.92 + 0.16 * pulse);

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(0,255,255,0.85)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(180,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(rift.x, rift.y, r0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.setLineDash([7, 7]);
      ctx.lineDashOffset = -t * 24;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(rift.x, rift.y, r0 * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Little center spark
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(0,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(rift.x, rift.y, 4 + 2.5 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Crystal energy field (while charging)
    if (energyDock.phase === 'charging') {
      const t = nowMs / 450;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      ctx.save();
      ctx.globalAlpha = 0.18 + pulse * 0.16;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(0,255,255,0.85)';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = 'rgba(180,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(energyDock.ox, energyDock.oy, energyDock.fieldRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.10 + pulse * 0.10;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = -t * 18;
      ctx.strokeStyle = 'rgba(255,255,255,0.70)';
      ctx.beginPath();
      ctx.arc(energyDock.ox, energyDock.oy, energyDock.fieldRadius * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Ultimate visuals
    if (ult.laser.active) {
      const t = clamp((nowMs - ult.laser.startedMs) / ult.laser.durationMs, 0, 1);
      const omega = (ult.laser.laps * Math.PI * 2) / ult.laser.durationMs;
      const a = (nowMs - ult.laser.startedMs) * omega;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const end = rayToBounds(player.x, player.y, dx, dy, map.w, map.h);
      const isMk2 = !!ult.laser.upgraded;
      const end2 = isMk2 ? rayToBounds(player.x, player.y, -dx, -dy, map.w, map.h) : null;

      // main beam
      ctx.save();
      const beamAlpha = 0.75 * (1 - t * 0.25);
      ctx.shadowColor = 'rgba(0,255,255,0.9)';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = 'rgba(0,255,255,0.95)';
      ctx.lineCap = 'round';
      ctx.lineWidth = ult.laser.thickness;

      ctx.globalAlpha = beamAlpha;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      if (end2) {
        ctx.globalAlpha = beamAlpha * 0.95;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(end2.x, end2.y);
        ctx.stroke();
      }

      // inner hot core
      const coreAlpha = 0.55;
      ctx.globalAlpha = coreAlpha;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(2, ult.laser.thickness * 0.35);
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      if (end2) {
        ctx.globalAlpha = coreAlpha * 0.95;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(end2.x, end2.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (ult.nuke.active) {
      const t = clamp((nowMs - ult.nuke.startedMs) / ult.nuke.durationMs, 0, 1);
      const r = Math.min(world.w, world.h) * (0.15 + t * 0.85);
      ctx.save();
      ctx.globalAlpha = 0.22 * (1 - t * 0.7);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 14;
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.shadowBlur = 26;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // NOTE: player/enemies/bullets/powerups are rendered in 3D now.

    // Particles
    for (const p of particles) {
      const lifeRatio = p.life / p.maxLife;
      ctx.globalAlpha = lifeRatio;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * lifeRatio, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function triggerGameOver() {
    gameOver = true;
    loopRunning = false;
    paused = false;
    syncPauseUi();
    emitPlayState('gameover');

    const timeSeconds = (performance.now() - startTimeMs) / 1000;
    const cashEarned = Math.max(0, cash - runStartCash);

    // Milestone prizes
    const { unlocked, bonusCash } = evaluateRunMilestones(
      { timeSeconds, level, cashEarned },
      achievements
    );

    if (bonusCash > 0) {
      cash += bonusCash;
      cashDirty = true;
    }

    // Save leaderboard + cash
    addLeaderboardEntry({ timeSeconds, level, cashEarned });
    leaderboard = loadLeaderboard();

    saveCash(cash);
    cashDirty = false;

    showGameOver(ui, {
      timeSeconds,
      level,
      cashEarned,
      bonusCash,
      unlocked,
    });
  }

  function resetRun(startLevel = 1, { autoStart = true } = {}) {
    gameOver = false;
    hideGameOver(ui);

    // Always reset bonus/portal state when starting a run.
    inBonusRoom = false;
    bonusForcedShotgun = false;
    bonusEndsAtMs = 0;
    bonusNextSpawnAtMs = 0;
    mainWorldSnapshot = null;
    rift = null;

    paused = false;
    syncPauseUi();

    // If you died while a modal was open, reset should always get you back to gameplay.
    closeModal(ui.shopModal);
    closeModal(ui.boardModal);

    bullets = [];
    particles = [];
    powerUps = [];
    activePowerUps = [];

    level = Math.max(1, Math.floor(startLevel));
    scheduleNextRiftFromLevel(level);
    trophyEffects = computeTrophyEffects();
    player.lives = clamp(1 + trophyEffects.startLives, 1, maxLives);
    player.energy = ENERGY_MAX;
    clearEnergyDock();
    player.invulnerableUntil = 0;

    ensureMapSize();
    player.x = map.w / 2;
    player.y = map.h / 2;
    camera.x = clamp(player.x - world.w / 2, 0, Math.max(0, map.w - world.w));
    camera.y = clamp(player.y - world.h / 2, 0, Math.max(0, map.h - world.h));

    startTimeMs = performance.now();
    runStartCash = cash;

    // Ultimate activity resets per run (cooldowns persist)
    ult.laser.active = false;
    ult.laser.startedMs = 0;
    ult.nuke.active = false;
    ult.nuke.startedMs = 0;

    spawnEnemiesForLevel();
    showCenterMessage(ui.levelUpMessage, `LEVEL ${level}`, 850);
    updateHud(ui, buildHudState());

    if (autoStart) {
      emitPlayState('playing');
      // Ensure the loop resumes after Game Over.
      requestLoop();
    }
  }

  function buildHudState() {
    const elapsedSeconds = (performance.now() - startTimeMs) / 1000;
    const next = levelColors[levelNextColorIndex];
    const nowMs = performance.now();

    const laserReady =
      !!ult?.laser?.owned &&
      !ult.laser.active &&
      nowMs - (ult.laser.lastUsedMs || 0) >= (ult.laser.cooldownMs || 0);
    const nukeReady =
      !!ult?.nuke?.owned &&
      !ult.nuke.active &&
      nowMs - (ult.nuke.lastUsedMs || 0) >= (ult.nuke.cooldownMs || 0);

    const laserOwned = !!ult?.laser?.owned;
    const nukeOwned = !!ult?.nuke?.owned;
    const laserRemainingMs = laserOwned
      ? Math.max(0, (ult.laser.cooldownMs || 0) - (nowMs - (ult.laser.lastUsedMs || 0)))
      : 0;
    const nukeRemainingMs = nukeOwned
      ? Math.max(0, (ult.nuke.cooldownMs || 0) - (nowMs - (ult.nuke.lastUsedMs || 0)))
      : 0;
    const laserCooldownSeconds = laserOwned && !ult.laser.active && laserRemainingMs > 0 ? Math.ceil(laserRemainingMs / 1000) : 0;
    const nukeCooldownSeconds = nukeOwned && !ult.nuke.active && nukeRemainingMs > 0 ? Math.ceil(nukeRemainingMs / 1000) : 0;

    return {
      level,
      elapsedSeconds,
      nextColor: next,
      lives: player.lives,
      energyPercent: (player.energy / ENERGY_MAX) * 100,
      activePowerUps,
      cash,
      nowMs,
      laserText: getLaserButtonText(nowMs),
      nukeText: getNukeButtonText(nowMs),
      laserReady,
      nukeReady,
      laserActive: !!ult?.laser?.active,
      nukeActive: !!ult?.nuke?.active,
      laserOwned,
      nukeOwned,
      laserCooldownSeconds,
      nukeCooldownSeconds,
      mouseAimEnabled,
    };
  }

  function triggerLifeLostFx() {
    ui.gameShell?.classList.remove('shake');
    // force reflow
    void ui.gameShell?.offsetWidth;
    ui.gameShell?.classList.add('shake');
    setTimeout(() => ui.gameShell?.classList.remove('shake'), 320);

    ui.livesOverlay?.classList.remove('lifeLost');
    void ui.livesOverlay?.offsetWidth;
    ui.livesOverlay?.classList.add('lifeLost');
    setTimeout(() => ui.livesOverlay?.classList.remove('lifeLost'), 360);
  }

  function updateUltimate(nowMs) {
    if (ult.laser.active) {
      const elapsed = nowMs - ult.laser.startedMs;
      if (elapsed >= ult.laser.durationMs) {
        ult.laser.active = false;
        return;
      }

      const omega = (ult.laser.laps * Math.PI * 2) / ult.laser.durationMs;
      const a = elapsed * omega;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const end = rayToBounds(player.x, player.y, dx, dy, map.w, map.h);
      const end2 = ult.laser.upgraded ? rayToBounds(player.x, player.y, -dx, -dy, map.w, map.h) : null;
      const hitPad = ult.laser.thickness * 0.6;

      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (!isKillableEnemy(e)) continue;

        const d1 = distancePointToSegment(e.x, e.y, player.x, player.y, end.x, end.y);
        const d2 = end2 ? distancePointToSegment(e.x, e.y, player.x, player.y, end2.x, end2.y) : Infinity;
        if (Math.min(d1, d2) <= e.radius + hitPad) {
          killEnemyByIndex(i, e.x, e.y);
        }
      }
    }

    if (ult.nuke.active) {
      const elapsed = nowMs - ult.nuke.startedMs;
      if (elapsed >= ult.nuke.durationMs) {
        ult.nuke.active = false;
      }
    }
  }

  function update() {
    if (gameOver || paused || inMainMenu) {
      loopRunning = false;
      return;
    }

    const nowMs = performance.now();
    // Normalize all per-tick movement to a 60fps baseline.
    // This prevents 120Hz phones from making the game feel too fast.
    const dtFrames = clamp((nowMs - (lastUpdateMs || nowMs)) / 16.67, 0.5, 2.0);
    lastUpdateMs = nowMs;
    updateTick++;

    const dtSeconds = dtFrames / 60;

    // Rift expiration / bonus timer
    if (inBonusRoom) {
      if (nowMs >= bonusEndsAtMs) {
        exitBonusRoom(nowMs);
      }
    } else {
      if (rift && nowMs >= rift.expiresMs) {
        rift = null;
        showCenterMessage(ui.riftToast || ui.centerToast, 'THE RIFT CLOSED', 800);
      }
    }

    // Input -> movement
    let moveX = 0;
    let moveY = 0;

    if (axes.move.active) {
      moveX = axes.move.x * player.speed * dtFrames;
      moveY = axes.move.y * player.speed * dtFrames;
    } else {
      if (keys.ArrowUp || keys.w) moveY = -player.speed * dtFrames;
      if (keys.ArrowDown || keys.s) moveY = player.speed * dtFrames;
      if (keys.ArrowLeft || keys.a) moveX = -player.speed * dtFrames;
      if (keys.ArrowRight || keys.d) moveX = player.speed * dtFrames;
    }

    const moveMag = Math.hypot(moveX, moveY);
    // For docking logic, ignore tiny drift.
    const wantsMove = moveMag > ENERGY_CONNECT_MOVE_EPS;
    lastWantsMove = wantsMove;
    lastMoveIntentX = moveX;
    lastMoveIntentY = moveY;
    updateEnergyDock(nowMs, { wantsMove });

    const inRechargeField = energyDock.phase === 'charging';
    const speedMult = !inRechargeField && player.energy <= 0.0001 ? ENERGY_EMPTY_SPEED_MULT : 1;
    moveX *= speedMult;
    moveY *= speedMult;

    // Drain only outside the energy field.
    if (!inRechargeField && !inBonusRoom && wantsMove && player.energy > 0) {
      const drainMult = typeof trophyEffects?.energyDrainMultiplier === 'number' && trophyEffects.energyDrainMultiplier > 0
        ? trophyEffects.energyDrainMultiplier
        : 1;
      player.energy = Math.max(0, player.energy - ENERGY_DRAIN_PER_SEC * drainMult * dtSeconds);
    }

    // Aim priority:
    // 1) Right stick (touch)
    // 2) Mouse aim (desktop option)
    // 3) Z/X fallback
    const aimMag = Math.hypot(axes.aim.x, axes.aim.y);
    if (axes.aim.active && aimMag > 0.2) {
      aimAngle = Math.atan2(axes.aim.y, axes.aim.x);
    } else if (mouseAimEnabled && nowMs - lastMouseAimInputMs <= MOUSE_AIM_ACTIVE_WINDOW_MS) {
      if (!canvasRect) refreshCanvasRect();
      // Convert to canvas-relative coords once per frame (avoid layout reads in mousemove handlers).
      mouseAimCanvasX = mouseAimClientX - canvasRect.left;
      mouseAimCanvasY = mouseAimClientY - canvasRect.top;
      const wx = camera.x + mouseAimCanvasX;
      const wy = camera.y + mouseAimCanvasY;
      aimAngle = Math.atan2(wy - player.y, wx - player.x);
    } else {
      if (keys.z) aimAngle -= AIM_STEP * dtFrames;
      if (keys.x) aimAngle += AIM_STEP * dtFrames;
    }
    if (aimAngle > Math.PI) aimAngle -= Math.PI * 2;
    else if (aimAngle < -Math.PI) aimAngle += Math.PI * 2;

    // Player movement with obstacle collision (slide-y)
    {
      const prevX = player.x;
      const prevY = player.y;

      let nx = prevX + moveX;
      let ny = prevY + moveY;

      // Clamp to map bounds first
      nx = clamp(nx, player.radius, map.w - player.radius);
      ny = clamp(ny, player.radius, map.h - player.radius);

      // Resolve obstacles (full move)
      const res = resolveCircleVsObstacles(nx, ny, player.radius);
      nx = res.x;
      ny = res.y;

      // If we hit, try sliding: X then Y
      if (res.hit) {
        const resX = resolveCircleVsObstacles(prevX + moveX, prevY, player.radius);
        const resY = resolveCircleVsObstacles(prevX, prevY + moveY, player.radius);
        const dx1 = resX.x - prevX;
        const dy1 = resX.y - prevY;
        const dx2 = resY.x - prevX;
        const dy2 = resY.y - prevY;
        const d1 = dx1 * dx1 + dy1 * dy1;
        const d2 = dx2 * dx2 + dy2 * dy2;
        if (d1 > d2) {
          nx = resX.x;
          ny = resX.y;
        } else {
          nx = resY.x;
          ny = resY.y;
        }
      }

      player.x = nx;
      player.y = ny;
    }

    // Rift pickup (enter bonus room)
    if (!inBonusRoom && rift) {
      const dx = player.x - rift.x;
      const dy = player.y - rift.y;
      const rad = player.radius + rift.radius;
      if (dx * dx + dy * dy < rad * rad) {
        enterBonusRoom(nowMs);
      }
    }

    // Auto shooting (time-based already)
    if (nowMs - lastShotTimeMs > shootDelayMs) {
      shootBullet();
      lastShotTimeMs = nowMs;
    }

    updateActivePowerUps();

    // Cash persistence debounce
    if (cashDirty && nowMs - lastCashSaveMs > 1000) {
      saveCash(cash);
      cashDirty = false;
      lastCashSaveMs = nowMs;
    }

    // Camera follows after player moves
    updateCamera();

    // Level spawn trickle (spawns arrive over time)
    if (!inBonusRoom) {
      updateSpawnTrickle(nowMs);
    } else {
      // Bonus room: spawn a lot of enemies fast.
      const cap = 44;
      const spawnEveryMs = 110;
      if (nowMs >= bonusNextSpawnAtMs && enemies.length < cap) {
        const color = COLOR_ORDER[Math.floor(Math.random() * COLOR_ORDER.length)];
        const radius = (8.5 + Math.random() * 4.0) * sizeScale;
        const { x, y } = getNonOverlappingSpawn(radius);
        const speed = 1.55 + Math.random() * 0.45;

        const sizeFactor = clamp(radius / (8.5 * sizeScale), 0.9, 1.7);
        const isBig = sizeFactor >= 1.25;
        const blobNodesCount = isBig ? 19 + Math.floor(Math.random() * 5) : 16 + Math.floor(Math.random() * 6);
        const blobNoiseScale = isBig ? 0.90 + Math.random() * 0.15 : 1.0 + Math.random() * 0.25;
        const blobSquishScale = isBig ? 0.85 + Math.random() * 0.15 : 0.95 + Math.random() * 0.20;
        const blobBiasMag = 0.05 + Math.random() * 0.06;
        const blobBiasAngle = Math.random() * Math.PI * 2;
        const blobNoiseMulA = 2.0 + Math.random() * 1.2;
        const blobNoiseMulB = 3.4 + Math.random() * 1.8;
        const blobNoiseTimeA = 260 + Math.random() * 160;
        const blobNoiseTimeB = 140 + Math.random() * 120;

        enemies.push({
          x,
          y,
          prevX: x,
          prevY: y,
          vx: 0,
          vy: 0,
          radius,
          color,
          speed,
          wobblePhase: Math.random() * Math.PI * 2,
          blobSeed: Math.random() * 1000,
          blobNodesCount,
          blobNoiseScale,
          blobNoiseMulA,
          blobNoiseMulB,
          blobNoiseTimeA,
          blobNoiseTimeB,
          blobBiasMag,
          blobBiasAngle,
          blobSquishScale,
          blobNodes: null,
          blobLastMs: 0,
        });

        bonusNextSpawnAtMs = nowMs + spawnEveryMs;
      }
    }

    // Bullets
    if (bullets.length > MAX_BULLETS) {
      // Safety trim in case any other logic ever pushes bullets.
      bullets.splice(0, bullets.length - MAX_BULLETS);
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const step = bulletSpeed * dtFrames;
      const maxSubSteps = 4;
      const subSteps = Math.min(maxSubSteps, Math.max(1, Math.ceil(step / (bulletRadius * 1.25))));
      const subStep = step / subSteps;

      let removed = false;
      for (let s = 0; s < subSteps; s++) {
        const beforeX = b.x;
        const beforeY = b.y;
        b.x += b.vx * subStep;
        b.y += b.vy * subStep;

        // Bullet vs obstacles (asteroids)
        let hitIdx = -1;
        let hitRect = null;
        for (let oi = 0; oi < currentMap.obstacles.length; oi++) {
          const r = currentMap.obstacles[oi];
          if (circleIntersectsRect(b.x, b.y, bulletRadius, r)) {
            hitIdx = oi;
            hitRect = r;
            break;
          }
        }

        if (hitRect) {
          if (!bounceShots) {
            spawnBulletVanishEffect(b.x, b.y);
            bullets.splice(i, 1);
            removed = true;
            break;
          }

          // Prevent endless bounce spam if we re-touch the same obstacle immediately.
          if (b.lastBounceObs === hitIdx && nowMs - (b.lastBounceMs || 0) < 60) {
            const pushed = resolveCircleVsRect(b.x, b.y, bulletRadius, hitRect);
            if (pushed.hit) {
              b.x = pushed.x;
              b.y = pushed.y;
            }
            b.x += b.vx * 0.25;
            b.y += b.vy * 0.25;
            continue;
          }

          // Determine a reliable surface normal.
          let nx = 0;
          let ny = 0;
          const rx1 = hitRect.x;
          const ry1 = hitRect.y;
          const rx2 = hitRect.x + hitRect.w;
          const ry2 = hitRect.y + hitRect.h;

          // Prefer the side we entered from based on previous position.
          if (!circleIntersectsRect(beforeX, beforeY, bulletRadius, hitRect)) {
            if (beforeX < rx1) nx = -1;
            else if (beforeX > rx2) nx = 1;
            if (beforeY < ry1) ny = -1;
            else if (beforeY > ry2) ny = 1;
          }

          // Fallback: choose minimal penetration direction.
          if (nx === 0 && ny === 0) {
            const leftPen = Math.abs(b.x - rx1);
            const rightPen = Math.abs(rx2 - b.x);
            const topPen = Math.abs(b.y - ry1);
            const botPen = Math.abs(ry2 - b.y);
            const minPen = Math.min(leftPen, rightPen, topPen, botPen);
            if (minPen === leftPen) nx = -1;
            else if (minPen === rightPen) nx = 1;
            else if (minPen === topPen) ny = -1;
            else ny = 1;
          }

          // Reflect velocity on the axis/axes we hit.
          if (nx !== 0) b.vx *= -1;
          if (ny !== 0) b.vy *= -1;

          // Push fully out of the obstacle and bias a bit outward.
          const pushed = resolveCircleVsRect(b.x, b.y, bulletRadius, hitRect);
          if (pushed.hit) {
            b.x = pushed.x;
            b.y = pushed.y;
          } else {
            // Safety: if resolve didn't detect (shouldn't happen), revert.
            b.x = beforeX;
            b.y = beforeY;
          }

          b.x += nx * 0.6;
          b.y += ny * 0.6;
          b.x += b.vx * 0.35;
          b.y += b.vy * 0.35;

          // Extra pass in case we clipped a corner / neighboring rect.
          const pushed2 = resolveCircleVsObstacles(b.x, b.y, bulletRadius);
          if (pushed2.hit) {
            b.x = pushed2.x;
            b.y = pushed2.y;
          }

          b.lastBounceObs = hitIdx;
          b.lastBounceMs = nowMs;
          spawnBounceEffect(b.x, b.y);
        }
      }

      if (removed) continue;

      // Map bounds behavior
      if (bounceShots) {
        let bounced = false;
        if (b.x <= 0 || b.x >= map.w) {
          b.vx *= -1;
          b.x = clamp(b.x, 0, map.w);
          bounced = true;
        }
        if (b.y <= 0 || b.y >= map.h) {
          b.vy *= -1;
          b.y = clamp(b.y, 0, map.h);
          bounced = true;
        }
        if (bounced) spawnBounceEffect(b.x, b.y);
      } else {
        if (b.x < 0 || b.x > map.w || b.y < 0 || b.y > map.h) {
          spawnBulletVanishEffect(b.x, b.y);
          bullets.splice(i, 1);
          continue;
        }
      }
    }

    // Enemies chase + wobble + obstacle steering
    for (const e of enemies) {
      if (typeof e.prevX !== 'number') {
        e.prevX = e.x;
        e.prevY = e.y;
        e.vx = 0;
        e.vy = 0;
      }

      const baseAngle = Math.atan2(player.y - e.y, player.x - e.x);
      const wobble = Math.sin(nowMs / 300 + e.wobblePhase) * 0.8;
      const isPriority = isKillableEnemy(e);
      const prioritySpeedMult = 1.18;
      const speed = e.speed * dtFrames * (enemySpeedMult || 1) * (isPriority ? prioritySpeedMult : 1);
      const desiredX = Math.cos(baseAngle) * speed + Math.cos(baseAngle + Math.PI / 2) * wobble;
      const desiredY = Math.sin(baseAngle) * speed + Math.sin(baseAngle + Math.PI / 2) * wobble;

      const tryDirs = [
        0,
        Math.PI / 6,
        -Math.PI / 6,
        Math.PI / 3,
        -Math.PI / 3,
        Math.PI / 2,
        -Math.PI / 2,
      ];

      let moved = false;
      for (const da of tryDirs) {
        const ca = Math.atan2(desiredY, desiredX) + da;
        const mag = Math.hypot(desiredX, desiredY);
        const stepX = Math.cos(ca) * mag;
        const stepY = Math.sin(ca) * mag;
        const nx = clamp(e.x + stepX, e.radius, map.w - e.radius);
        const ny = clamp(e.y + stepY, e.radius, map.h - e.radius);
        if (canCircleFit(nx, ny, e.radius)) {
          e.x = nx;
          e.y = ny;
          moved = true;
          break;
        }
      }

      if (!moved) {
        // If fully stuck, nudge out of walls
        const res = resolveCircleVsObstacles(e.x, e.y, e.radius);
        e.x = res.x;
        e.y = res.y;
      }

      // Velocity for jelly squish (per-frame)
      // Normalize to "per 60fps frame" units so visuals stay consistent across refresh rates.
      e.vx = (e.x - e.prevX) / dtFrames;
      e.vy = (e.y - e.prevY) / dtFrames;
      e.prevX = e.x;
      e.prevY = e.y;

      updateEnemyBlob(e, nowMs);
    }

    // Separate enemies is O(n^2). Throttle slightly when the screen is crowded.
    if (enemies.length <= 32 || (updateTick & 1) === 0) {
      separateEnemies();
    }

    // Ultimate can clear threats before collisions
    updateUltimate(nowMs);

    // Enemy collision with player
    for (const e of enemies) {
      const distSq = (player.x - e.x) ** 2 + (player.y - e.y) ** 2;
      const radSum = (player.radius + e.radius) ** 2;
      if (distSq < radSum) {
        const now = performance.now();
        if (now > player.invulnerableUntil) {
          player.lives--;
          triggerLifeLostFx();
          player.invulnerableUntil = now + 1500;
          triggerFlash(ui.flashOverlay);
          spawnCircleBurst(player.x, player.y, 'rgba(255,255,255,0.7)', 14, 28);
          if (player.lives <= 0) {
            triggerGameOver();
            return;
          }

          // Losing a life behaves like taking damage: stay in place,
          // but shove slightly away to avoid immediately re-overlapping.
          let dx = player.x - e.x;
          let dy = player.y - e.y;
          let d = Math.hypot(dx, dy);
          if (d < 0.001) {
            const a = now * 0.0037;
            dx = Math.cos(a);
            dy = Math.sin(a);
            d = 1;
          }
          dx /= d;
          dy /= d;
          const push = player.radius + e.radius + 8;
          const nx = clamp(player.x + dx * push, player.radius, map.w - player.radius);
          const ny = clamp(player.y + dy * push, player.radius, map.h - player.radius);
          const pushed = resolveCircleVsObstacles(nx, ny, player.radius);
          player.x = pushed.x;
          player.y = pushed.y;

          player.energy = ENERGY_MAX * 0.2;
          clearEnergyDock();
        }
      }
    }

    // Bullet-enemy collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      let removed = false;

      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const distSq = (b.x - e.x) ** 2 + (b.y - e.y) ** 2;
        const radSum = (bulletHitRadius + e.radius) ** 2;

        if (distSq < radSum) {
          const killable = isKillableEnemy(e);
          if (killable) {
            killEnemyByIndex(j, b.x, b.y);

            // Only remove bullet if not piercing
            if (!piercingShots) {
              bullets.splice(i, 1);
              removed = true;
            }

            break;
          } else {
            spawnHitBlocked(b.x, b.y);
            if (!piercingShots) {
              bullets.splice(i, 1);
              removed = true;
            }
            break;
          }
        }
      }

      if (removed) continue;
    }

    // All enemies cleared (including any pending trickle spawns)
    if (!inBonusRoom && enemies.length === 0 && (!levelSpawn || levelSpawn.pendingTotal <= 0)) {
      level++;
      maybeUnlockCheckpoint(level);
      showCenterMessage(ui.levelUpMessage, `LEVEL ${level}`, 850);
      spawnEnemiesForLevel();

      // Rift spawns every ~6–10 levels.
      if (!rift && level >= nextRiftAtLevel) {
        spawnRift(nowMs);
        scheduleNextRiftFromLevel(level);
      }
    }

    // Powerup pickup
    for (let p = powerUps.length - 1; p >= 0; p--) {
      const pup = powerUps[p];
      const distSq = (player.x - pup.x) ** 2 + (player.y - pup.y) ** 2;
      const radSum = (player.radius + pup.radius) ** 2;
      if (distSq < radSum) {
        activatePowerUp(pup.type);
        powerUps.splice(p, 1);
      }
    }

    updateParticles(dtFrames);
    updateHud(ui, buildHudState());
    draw();
    requestAnimationFrame(update);
  }

  function requestLoop() {
    if (loopRunning) return;
    loopRunning = true;
    lastUpdateMs = performance.now();
    requestAnimationFrame(update);
  }

  // UI bindings
  const menuActions = createMenuActions(ui, {
    openModal,
    closeModal,
    renderShop,
    renderScores,
    loadLeaderboard,

    getOwnedTrophies: () => ownedTrophies,
    getTrophyLevels: () => trophyLevels,
    getCash: () => cash,
    buyTrophy: buyOrUpgradeTrophy,
    syncUltimateShopUi,

    isGameOver: () => gameOver,
    getLeaderboard: () => leaderboard,
    setLeaderboard: (v) => {
      leaderboard = v;
    },
    getSortBy: () => sortBy,
    setSortBy: (v) => {
      sortBy = v;
    },

    getMouseAimEnabled: () => mouseAimEnabled,
  });

  function getTrophyNextCost(basePrice, nextLevel) {
    const lv = Math.max(1, Math.floor(nextLevel || 1));
    return Math.max(1, Math.floor(basePrice * 2 ** (lv - 1)));
  }

  function buyOrUpgradeTrophy(trophy) {
    if (!trophy || typeof trophy !== 'object') return;
    const id = trophy.id;
    if (typeof id !== 'string' || id.length === 0) return;

    const maxLevel = Math.max(1, Math.floor(Number(trophy.maxLevel || 1)));
    const current = Math.max(0, Math.floor(Number(trophyLevels?.[id] || 0))) || (ownedTrophies.has(id) ? 1 : 0);
    if (current >= maxLevel) return;

    const nextLevel = Math.min(maxLevel, current + 1);
    const cost = getTrophyNextCost(trophy.price, nextLevel);
    if (cash < cost) return;

    cash -= cost;
    cashDirty = true;
    saveCash(cash);

    trophyLevels = { ...(trophyLevels || {}) };
    trophyLevels[id] = nextLevel;
    saveTrophyLevels(trophyLevels);

    ownedTrophies.add(id);
    saveOwnedTrophies(ownedTrophies);

    trophyEffects = computeTrophyEffects();

    renderShop(ui, trophyLevels, cash, buyOrUpgradeTrophy);
    updateHud(ui, buildHudState());
  }

  const openShop = menuActions.openShop;
  const openBoard = menuActions.openBoard;
  const openSettings = menuActions.openSettings;
  const openAbout = menuActions.openAbout;
  const closeShop = menuActions.closeShop;
  const closeBoard = menuActions.closeBoard;
  const closeSettings = menuActions.closeSettings;
  const closeAbout = menuActions.closeAbout;
  const setSort = menuActions.setSort;

  function bindEvents() {
    const shouldIgnoreHotkeys = () => {
      const ae = document.activeElement;
      const tag = ae?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || ae?.isContentEditable) return true;
      if (ui.shopModal && !ui.shopModal.classList.contains('hidden')) return true;
      if (ui.boardModal && !ui.boardModal.classList.contains('hidden')) return true;
      if (ui.settingsModal && !ui.settingsModal.classList.contains('hidden')) return true;
      if (ui.aboutModal && !ui.aboutModal.classList.contains('hidden')) return true;
      if (ui.levelSelectModal && !ui.levelSelectModal.classList.contains('hidden')) return true;
      if (inMainMenu) return true;
      if (startCountdownActive) return true;
      return false;
    };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'e' || e.key === 'E') {
        if (shouldIgnoreHotkeys()) return;
        e.preventDefault();
        if (!e.repeat) requestEnergyDock();
        return;
      }
      if (e.key === 'p' || e.key === 'P' || e.code === 'Escape') {
        if (shouldIgnoreHotkeys()) return;
        e.preventDefault();
        if (!e.repeat) togglePause();
        return;
      }
      if (e.code === 'Space') {
        if (shouldIgnoreHotkeys()) return;
        e.preventDefault();
        if (!e.repeat) tryActivateLaser();
        return;
      }
      if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (shouldIgnoreHotkeys()) return;
        e.preventDefault();
        if (!e.repeat) tryActivateNuke();
        return;
      }
      if (Object.prototype.hasOwnProperty.call(keys, e.key)) {
        // Avoid browser scroll / focus movement while playing.
        e.preventDefault();
        keys[e.key] = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        return;
      }
      if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
        return;
      }
      if (Object.prototype.hasOwnProperty.call(keys, e.key)) {
        e.preventDefault();
        keys[e.key] = false;
      }
    });

    const syncAimModeUi = () => {
      if (!ui.aimModeBtn) return;
      ui.aimModeBtn.textContent = mouseAimEnabled ? 'MOUSE' : 'Z/X';
      ui.aimModeBtn.setAttribute('aria-pressed', mouseAimEnabled ? 'true' : 'false');
      ui.aimModeBtn.title = mouseAimEnabled
        ? 'Mouse aim enabled (click to use Z/X)'
        : 'Z/X aim enabled (click to use mouse)';
    };

    installMenuBindings(ui, {
      getMaxStartLevelUnlocked: () => maxStartLevelUnlocked || 0,
      openLevelSelect,
      startRunFromLevel,
      showMainMenu,
      closeLevelSelect: () => closeModal(ui.levelSelectModal),
      isInMainMenu: () => inMainMenu,

      togglePause,

      toggleSound,

      openLeaveConfirm,
      closeLeaveConfirm,
      confirmLeaveGame,

      openShop,
      openBoard,
      openSettings,
      openAbout,
      closeShop,
      closeBoard,
      closeSettings,
      closeAbout,

      setSort,

      tryActivateLaser,
      tryActivateNuke,
      buyUltimate,

      syncAimModeUi,
      toggleMouseAim: () => {
        mouseAimEnabled = !mouseAimEnabled;
        saveMouseAimEnabled(mouseAimEnabled);
      },

      onPlayerNameInput: (v) => {
        savePlayerName(v);
        syncMainMenuUi(ui, { loadPlayerName });
      },
      onSettingsAimToggle: () => {
        mouseAimEnabled = !mouseAimEnabled;
        saveMouseAimEnabled(mouseAimEnabled);
        if (ui.settingsAimBtn) {
          ui.settingsAimBtn.textContent = mouseAimEnabled ? 'AIM: MOUSE' : 'AIM: Z/X';
          ui.settingsAimBtn.setAttribute('aria-pressed', mouseAimEnabled ? 'true' : 'false');
        }
      },
    });

    const updateMouseAimFromEvent = (e) => {
      if (!mouseAimEnabled) return;
      // Only treat actual mouse movement as mouse-aim input.
      if (e.pointerType && e.pointerType !== 'mouse') return;
      mouseAimClientX = e.clientX;
      mouseAimClientY = e.clientY;
      lastMouseAimInputMs = performance.now();
    };

    canvas.addEventListener('pointermove', updateMouseAimFromEvent, { passive: true });
    // Fallback for older browsers that don't fully support Pointer Events.
    canvas.addEventListener('mousemove', (e) => {
      updateMouseAimFromEvent({ clientX: e.clientX, clientY: e.clientY, pointerType: 'mouse' });
    }, { passive: true });

    canvas.addEventListener('pointerenter', () => {
      refreshCanvasRect();
    }, { passive: true });

    window.addEventListener('scroll', refreshCanvasRect, { passive: true });
  }

  function installJoystick(stickEl, knobEl, axis) {
    if (!stickEl || !knobEl) return;

    let pointerId = null;

    const setKnob = (nx, ny) => {
      const r = stickEl.clientWidth / 2;
      const k = r * 0.55;
      knobEl.style.transform = `translate(calc(-50% + ${nx * k}px), calc(-50% + ${ny * k}px))`;
    };

    const updateFromEvent = (e) => {
      const rect = stickEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const r = rect.width / 2;
      const max = r * 0.55;
      const mag = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(max, mag);
      const ux = (dx / mag) * clamped;
      const uy = (dy / mag) * clamped;
      axis.x = ux / max;
      axis.y = uy / max;
      axis.active = true;
      setKnob(axis.x, axis.y);
    };

    const reset = () => {
      axis.x = 0;
      axis.y = 0;
      axis.active = false;
      knobEl.style.transform = 'translate(-50%, -50%)';
    };

    stickEl.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      stickEl.setPointerCapture(pointerId);
      updateFromEvent(e);
      e.preventDefault();
    });
    stickEl.addEventListener('pointermove', (e) => {
      if (pointerId !== e.pointerId) return;
      updateFromEvent(e);
      e.preventDefault();
    });
    stickEl.addEventListener('pointerup', (e) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      reset();
      e.preventDefault();
    });
    stickEl.addEventListener('pointercancel', () => {
      pointerId = null;
      reset();
    });
  }

  function resizeCanvasToCssSize() {
    const cssW = Math.max(320, Math.floor(canvas.clientWidth || 800));
    const cssH = Math.max(240, Math.floor(canvas.clientHeight || 600));
    const dpr = Math.max(1, Math.floor(globalThis.devicePixelRatio || 1));

    if (cssW === world.w && cssH === world.h && dpr === world.dpr) return;

    world.w = cssW;
    world.h = cssH;
    world.dpr = dpr;

    ensureMapSize();

    const minDim = Math.max(1, Math.min(world.w, world.h));
    // On phones the UI takes more vertical space and the player needs more forward visibility.
    // A smaller deadzone makes the camera follow sooner (player stays closer to center).
    const isPhoneLayout = minDim <= 520 || Math.min(window.innerWidth, window.innerHeight) <= 600;
    camera.deadzoneRadius = isPhoneLayout
      ? clamp(minDim * 0.16, 64, 160)
      : clamp(minDim * 0.22, 90, 200);

    // Slightly snappier follow on phones (still smooth).
    camera.followLerp = isPhoneLayout ? 0.22 : 0.18;

    // Size scaling: keep things readable on phones, but don't let entities get too big.
    // (Phone playfield is smaller, so oversized entities feel cramped.)
    sizeScale = isPhoneLayout ? clamp(480 / minDim, 1, 1.20) : clamp(520 / minDim, 1, 1.30);

    const basePlayerRadius = isPhoneLayout ? 9.5 : 10;
    const baseEnemyRadius = isPhoneLayout ? 7.6 : 8;
    const basePowerupRadius = isPhoneLayout ? 7.6 : 8;
    const baseLifeRadius = isPhoneLayout ? 8.6 : 9;

    player.radius = basePlayerRadius * sizeScale;
    bulletRadius = 3 * sizeScale;
    bulletHitRadius = bulletRadius + 1.25 * sizeScale;
    bulletSpeed = 5 * (0.9 + 0.1 * sizeScale);

    for (const e of enemies) e.radius = baseEnemyRadius * sizeScale;
    for (const p of powerUps) p.radius = (p.type === POWERUP_TYPES.life ? baseLifeRadius : basePowerupRadius) * sizeScale;

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    if (ui.glCanvas) {
      ui.glCanvas.width = Math.floor(cssW * dpr);
      ui.glCanvas.height = Math.floor(cssH * dpr);
    }

    if (renderer3d) renderer3d.setSize(cssW, cssH, dpr);

    // Clamp to the larger map, then let the camera settle.
    player.x = clamp(player.x, player.radius, map.w - player.radius);
    player.y = clamp(player.y, player.radius, map.h - player.radius);
    clampCameraToMap();
    updateCamera();

    // Keep cached rect in sync (used for mouse aim).
    refreshCanvasRect();
  }

  function start() {
    bindEvents();

    // Hide/show ultimate buttons based on purchases
    syncUltimateButtonsVisibility();

    // Responsive canvas sizing (bigger playfield on big screens)
    resizeCanvasToCssSize();
    window.addEventListener('resize', resizeCanvasToCssSize);

    // Mobile browsers (especially iOS Safari) can change the visual viewport
    // (URL bar collapse/expand, keyboard) without reliably emitting window resize.
    // Keep canvas size + input rect in sync.
    const vv = globalThis.visualViewport;
    if (vv && vv.addEventListener) {
      vv.addEventListener('resize', resizeCanvasToCssSize);
      vv.addEventListener('scroll', () => {
        resizeCanvasToCssSize();
        refreshCanvasRect();
      }, { passive: true });
    }

    // Touch controls
    installJoystick(ui.moveStick, ui.moveKnob, axes.move);
    installJoystick(ui.aimStick, ui.aimKnob, axes.aim);

    // Boot into the main menu. Game starts after player chooses a level.
    showMainMenu();
  }

  return {
    start,
  };
}
