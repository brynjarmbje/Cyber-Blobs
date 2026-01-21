// @ts-nocheck
import {
  COLOR_ORDER,
  COLOR_CASH_VALUES,
  POWERUP_DURATION_MS,
  POWERUP_DROP_CHANCE,
  LIFE_DROP_CHANCE,
  POWERUP_TYPES,
} from './constants.js';

import {
  addLeaderboardEntry,
  loadAchievements,
  loadCash,
  loadLeaderboard,
  loadOwnedUltimates,
  loadOwnedTrophies,
  loadUltimateType,
  loadMouseAimEnabled,
  loadMaxStartLevel,
  saveCash,
  saveMouseAimEnabled,
  saveMaxStartLevel,
  saveOwnedUltimates,
  saveOwnedTrophies,
  saveUltimateType,
} from './storage.js';

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
} from './ui.js';

import { createNeonMap, circleIntersectsRect, resolveCircleVsRect } from './map.js';

import { createRenderer3D } from './renderer3d.js';

import { colorToRGBA, initEnemyBlob, updateEnemyBlob, drawJellyBlobEnemy } from './enemy2d.js';

import { evaluateRunMilestones } from './achievements.js';

export function createGame(ui) {
  const canvas = ui.canvas;
  const ctx = canvas.getContext('2d');

  const renderer3d = createRenderer3D(ui.glCanvas);
  // Let the 3D renderer draw the NEXT enemy preview into the HUD swatch.
  if (renderer3d && typeof renderer3d.setNextEnemyPreviewCanvas === 'function') {
    renderer3d.setNextEnemyPreviewCanvas(ui.nextColorSwatchEl);
  }

  // Viewport size in CSS pixels (canvas backing store is scaled by DPR)
  const world = { w: 800, h: 600, dpr: Math.max(1, Math.floor(globalThis.devicePixelRatio || 1)) };

  // Larger map (world coordinates). Viewport is a window into this via the camera.
  const map = {
    w: 2400,
    h: 1800,
  };

  let currentMap = createNeonMap(map);

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
  let leaderboard = loadLeaderboard();
  let achievements = loadAchievements();
  let ownedUltimates = loadOwnedUltimates();

  function computeTrophyEffects() {
    const effects = {
      startLives: 0,
      powerupDurationBonusMs: 0,
      cashMultiplier: 1,
    };

    // Keep this in sync with constants TROPHIES
    if (ownedTrophies.has('spark')) effects.startLives += 1;
    if (ownedTrophies.has('prism')) effects.powerupDurationBonusMs += 5000;
    if (ownedTrophies.has('nova')) effects.cashMultiplier *= 1.25;

    return effects;
  }

  let trophyEffects = computeTrophyEffects();

  // Run state
  let gameOver = false;
  let level = 1;
  let startTimeMs = 0;
  let runStartCash = cash;

  // Checkpoint starts (unlock every 10 levels reached)
  let maxStartLevelUnlocked = loadMaxStartLevel();
  let nextRunStartLevel = 1;

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
    invulnerableUntil: 0,
  };

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

  function createSfxPool(src, { poolSize = 6, volume = 0.12 } = {}) {
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

  const bulletSfx = createSfxPool('./CyberBlob-SoundFX-bullet.mp3', { poolSize: 6, volume: 0.14 });
  const killSfx = createSfxPool('./CyberBlob-SoundFX-kill-v1.mp3', { poolSize: 5, volume: 0.16 });

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
      new CustomEvent('cyberblobs:playstate', {
        detail: { state },
      })
    );
  }

  function syncPauseUi() {
    if (ui?.pauseOverlay) ui.pauseOverlay.classList.toggle('visible', paused);
    if (ui?.pauseBtn) {
      ui.pauseBtn.classList.toggle('isActive', paused);
      ui.pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      ui.pauseBtn.textContent = paused ? 'RESUME' : 'PAUSE';
      ui.pauseBtn.title = paused ? 'Resume (P / ESC)' : 'Pause (P / ESC)';
    }
  }

  function pauseGame() {
    if (gameOver) return;
    if (paused) return;
    paused = true;
    loopRunning = false;
    syncPauseUi();
    emitPlayState('paused');
  }

  function resumeGame() {
    if (gameOver) return;
    if (!paused) return;
    paused = false;
    syncPauseUi();
    // Reset dt accumulator so we don't jump on resume.
    lastUpdateMs = performance.now();
    emitPlayState('playing');
    requestLoop();
  }

  function togglePause() {
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

    // A couple passes helps with corners.
    for (let pass = 0; pass < 2; pass++) {
      for (const r of currentMap.obstacles) {
        const res = resolveCircleVsRect(nx, ny, radius, r);
        if (res.hit) {
          nx = res.x;
          ny = res.y;
          hit = true;
        }
      }
    }
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
    const laserPrice = 250;
    const nukePrice = 750;

    if (ui.ultLaserBtn) {
      const owned = ult.laser.owned;
      ui.ultLaserBtn.textContent = owned ? 'LASER OWNED' : `BUY LASER (${laserPrice} CC)`;
      ui.ultLaserBtn.disabled = owned || cash < laserPrice;
    }
    if (ui.ultNukeBtn) {
      const owned = ult.nuke.owned;
      ui.ultNukeBtn.textContent = owned ? 'NUKE OWNED' : `BUY NUKE (${nukePrice} CC)`;
      ui.ultNukeBtn.disabled = owned || cash < nukePrice;
    }
  }

  function buyUltimate(type) {
    if (type !== 'laser' && type !== 'nuke') return;
    const price = type === 'laser' ? 250 : 750;
    if (cash < price) return;

    if (type === 'laser' && ult.laser.owned) return;
    if (type === 'nuke' && ult.nuke.owned) return;

    cash -= price;
    cashDirty = true;
    saveCash(cash);

    ownedUltimates.add(type);
    saveOwnedUltimates(ownedUltimates);

    if (type === 'laser') ult.laser.owned = true;
    if (type === 'nuke') ult.nuke.owned = true;

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

    // Nuke: clear entire canvas immediately
    if (enemies.length > 0) {
      // Reward cash for all enemies killed
      for (const e of enemies) {
        addCashForColor(e.color);
        // Keep particles a bit lighter than a full per-enemy burst
        if (Math.random() < 0.35) spawnEnemyDeathParticles(e.x, e.y, e.color);
      }
      enemies = [];
    }

    // Big flash-like burst
    spawnCircleBurst(player.x, player.y, 'rgba(255,255,255,0.75)', 22, 46);
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
    const repulsionFactor = 2.0;
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const e1 = enemies[i];
        const e2 = enemies[j];

        const dx = e2.x - e1.x;
        const dy = e2.y - e1.y;
        const distSq = dx * dx + dy * dy;

        const desiredDist = repulsionFactor * (e1.radius + e2.radius);
        const desiredDistSq = desiredDist * desiredDist;

        if (distSq < desiredDistSq) {
          const dist = Math.sqrt(distSq) || 0.001;
          const overlap = desiredDist - dist;
          const push = overlap / 2;

          const ux = dx / dist;
          const uy = dy / dist;

          e1.x -= ux * push;
          e1.y -= uy * push;
          e2.x += ux * push;
          e2.y += uy * push;
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
    const dur = POWERUP_DURATION_MS + trophyEffects.powerupDurationBonusMs;
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

    for (const p of activePowerUps) {
      if (p.type === POWERUP_TYPES.speed) newSpeed += 2;
      else if (p.type === POWERUP_TYPES.fireRate) newShootDelay = 125;
      else if (p.type === POWERUP_TYPES.piercing) newPiercing = true;
      else if (p.type === POWERUP_TYPES.shotgun) newShotgun = true;
      else if (p.type === POWERUP_TYPES.bounce) newBounce = true;
    }

    player.speed = newSpeed;
    shootDelayMs = newShootDelay;
    piercingShots = newPiercing;
    shotgunActive = newShotgun;
    bounceShots = newBounce;

    // Bonus-room overrides
    if (bonusForcedShotgun) shotgunActive = true;
    if (inBonusRoom) shootDelayMs = Math.min(shootDelayMs, 125);
  }

  function shootBullet() {
    if (shotgunActive) {
      const pellets = 5;
      ensureBulletCapacity(pellets);
      for (let i = 0; i < pellets; i++) {
        const spread = (Math.random() - 0.5) * 0.5;
        const a = aimAngle + spread;
        bullets.push({ x: player.x, y: player.y, vx: Math.cos(a), vy: Math.sin(a), seed: Math.random() * Math.PI * 2 });
      }
      spawnMuzzle(player.x, player.y);
      spawnCircleBurst(player.x, player.y, 'rgba(0,0,0,0.4)', 6, 16);
      bulletSfx.play();
    } else {
      ensureBulletCapacity(1);
      bullets.push({ x: player.x, y: player.y, vx: Math.cos(aimAngle), vy: Math.sin(aimAngle), seed: Math.random() * Math.PI * 2 });
      spawnMuzzle(player.x, player.y);
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
        aimAngle,
        enemies,
        bullets,
        bulletSpeed,
        bulletRadius,
        powerUps,
        obstacles: currentMap?.obstacles || [],
        nextEnemyPreview,
      });
    }

    // Keep 2D canvas only for special effects that we haven't moved to 3D yet.
    // Camera transform: map coords -> viewport
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

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

    // Ultimate visuals
    if (ult.laser.active) {
      const t = clamp((nowMs - ult.laser.startedMs) / ult.laser.durationMs, 0, 1);
      const omega = (ult.laser.laps * Math.PI * 2) / ult.laser.durationMs;
      const a = (nowMs - ult.laser.startedMs) * omega;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const end = rayToBounds(player.x, player.y, dx, dy, map.w, map.h);

      // main beam
      ctx.save();
      ctx.globalAlpha = 0.75 * (1 - t * 0.25);
      ctx.shadowColor = 'rgba(0,255,255,0.9)';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = 'rgba(0,255,255,0.95)';
      ctx.lineCap = 'round';
      ctx.lineWidth = ult.laser.thickness;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // inner hot core
      ctx.globalAlpha = 0.55;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(2, ult.laser.thickness * 0.35);
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
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
      maxStartLevel: maxStartLevelUnlocked,
    });
  }

  function resetRun(startLevel = 1) {
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
    player.lives = clamp(3 + trophyEffects.startLives, 1, maxLives);
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

    emitPlayState('playing');

    // Ensure the loop resumes after Game Over.
    requestLoop();
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
      const hitPad = ult.laser.thickness * 0.6;

      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (!isKillableEnemy(e)) continue;

        const dist = distancePointToSegment(e.x, e.y, player.x, player.y, end.x, end.y);
        if (dist <= e.radius + hitPad) {
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
    if (gameOver || paused) {
      loopRunning = false;
      return;
    }

    const nowMs = performance.now();
    // Normalize all per-tick movement to a 60fps baseline.
    // This prevents 120Hz phones from making the game feel too fast.
    const dtFrames = clamp((nowMs - (lastUpdateMs || nowMs)) / 16.67, 0.5, 2.0);
    lastUpdateMs = nowMs;
    updateTick++;

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
      const speed = e.speed * dtFrames;
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
          player.x = map.w / 2;
          player.y = map.h / 2;
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
  function openShop() {
    openModal(ui.shopModal);
    renderShop(ui, ownedTrophies, cash, buyTrophy);
    syncUltimateShopUi();
  }

  function openBoard() {
    openModal(ui.boardModal);
    leaderboard = loadLeaderboard();
    renderScores(ui, leaderboard, sortBy);
  }

  function buyTrophy(trophy) {
    if (ownedTrophies.has(trophy.id)) return;
    if (cash < trophy.price) return;

    cash -= trophy.price;
    ownedTrophies.add(trophy.id);

    saveCash(cash);
    saveOwnedTrophies(ownedTrophies);

    trophyEffects = computeTrophyEffects();

    renderShop(ui, ownedTrophies, cash, buyTrophy);
    updateHud(ui, buildHudState());
  }

  function closeShop() {
    closeModal(ui.shopModal);
  }

  function closeBoard() {
    closeModal(ui.boardModal);
  }

  function setSort(next) {
    sortBy = next;
    renderScores(ui, leaderboard, sortBy);
  }

  function bindEvents() {
    const shouldIgnoreHotkeys = () => {
      const ae = document.activeElement;
      const tag = ae?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || ae?.isContentEditable) return true;
      if (ui.shopModal && !ui.shopModal.classList.contains('hidden')) return true;
      if (ui.boardModal && !ui.boardModal.classList.contains('hidden')) return true;
      return false;
    };

    window.addEventListener('keydown', (e) => {
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

    ui.tryAgainBtn?.addEventListener('click', () => resetRun(1));

    ui.checkpointRow?.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('button[data-start-level]');
      if (!btn) return;
      const lv = Number(btn.dataset.startLevel);
      if (!Number.isFinite(lv)) return;
      // Only allow unlocked checkpoints.
      if (lv < 10 || lv > maxStartLevelUnlocked) return;
      nextRunStartLevel = lv;
      resetRun(nextRunStartLevel);
    });

    ui.pauseBtn?.addEventListener('click', togglePause);

    ui.openShopBtn?.addEventListener('click', openShop);
    ui.openBoardBtn?.addEventListener('click', openBoard);
    ui.closeShopBtn?.addEventListener('click', closeShop);
    ui.closeBoardBtn?.addEventListener('click', closeBoard);
    ui.goShopFromOver?.addEventListener('click', openShop);
    ui.goScoresFromOver?.addEventListener('click', openBoard);

    ui.sortTimeBtn?.addEventListener('click', () => setSort('time'));
    ui.sortCashBtn?.addEventListener('click', () => setSort('cash'));
    ui.sortLevelBtn?.addEventListener('click', () => setSort('level'));

    // In-game ultimate buttons
    ui.ultBtn?.addEventListener('click', tryActivateLaser);
    ui.nukeBtn?.addEventListener('click', tryActivateNuke);
    ui.laserTopBtn?.addEventListener('click', tryActivateLaser);
    ui.nukeTopBtn?.addEventListener('click', tryActivateNuke);

    // Shop purchases
    ui.ultLaserBtn?.addEventListener('click', () => buyUltimate('laser'));
    ui.ultNukeBtn?.addEventListener('click', () => buyUltimate('nuke'));

    const syncAimModeUi = () => {
      if (!ui.aimModeBtn) return;
      ui.aimModeBtn.textContent = mouseAimEnabled ? 'MOUSE' : 'Z/X';
      ui.aimModeBtn.setAttribute('aria-pressed', mouseAimEnabled ? 'true' : 'false');
      ui.aimModeBtn.title = mouseAimEnabled ? 'Mouse aim enabled (click to use Z/X)' : 'Z/X aim enabled (click to use mouse)';
    };

    syncAimModeUi();

    ui.aimModeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      mouseAimEnabled = !mouseAimEnabled;
      saveMouseAimEnabled(mouseAimEnabled);
      syncAimModeUi();
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

    // Touch controls
    installJoystick(ui.moveStick, ui.moveKnob, axes.move);
    installJoystick(ui.aimStick, ui.aimKnob, axes.aim);

    resetRun(1);
    requestLoop();
  }

  return {
    start,
  };
}
