// @ts-nocheck
import { TROPHIES, POWERUP_TYPES } from '../shared/constants.js';

export function getUiElements() {
  return {
    // Main menu
    mainMenu: document.getElementById('mainMenu'),
    mainMenuMeta: document.getElementById('mainMenuMeta'),
    mainPlayBtn: document.getElementById('mainPlayBtn'),
    mainShopBtn: document.getElementById('mainShopBtn'),
    mainBoardBtn: document.getElementById('mainBoardBtn'),
    mainSettingsBtn: document.getElementById('mainSettingsBtn'),
    mainAboutBtn: document.getElementById('mainAboutBtn'),

    // Canvas / containers
    gameShell: document.getElementById('gameShell'),
    canvas: document.getElementById('gameCanvas'),
    glCanvas: document.getElementById('glCanvas'),

    // Game over
    gameOverScreen: document.getElementById('gameOverScreen'),
    statsParagraph: document.getElementById('stats'),
    tryAgainBtn: document.getElementById('tryAgainBtn'),
    goMainMenuBtn: document.getElementById('goMainMenuBtn'),

    // Pause screen + leave confirmation
    pauseScreen: document.getElementById('pauseScreen'),
    pauseSoundBtn: document.getElementById('pauseSoundBtn'),
    resumeBtn: document.getElementById('resumeBtn'),
    leaveGameBtn: document.getElementById('leaveGameBtn'),
    confirmLeaveYesBtn: document.getElementById('confirmLeaveYesBtn'),
    confirmLeaveNoBtn: document.getElementById('confirmLeaveNoBtn'),

    // HUD
    hudLevelEl: document.getElementById('hudLevel'),
    hudTimeEl: document.getElementById('hudTime'),
    hudEnergyEl: document.getElementById('hudEnergy'),
    nextColorSwatchEl: document.getElementById('nextColorSwatch'),
    nextColorNameEl: document.getElementById('nextColorName'),
    igTargetWidgetEl: document.getElementById('igTarget'),
    igTargetSwatchEl: document.getElementById('igTargetSwatch'),
    igEnergyWidgetEl: document.getElementById('igEnergy'),
    igTargetWordEl: document.getElementById('igTargetWord'),
    igEnergyPctEl: document.getElementById('igEnergyPct'),
    livesContainerEl: document.getElementById('livesContainer'),
    livesOverlay: document.getElementById('livesOverlay'),
    activeOverlayEl: document.getElementById('activeOverlay'),
    cashEl: document.getElementById('colorCash'),
    scorePillValue: document.getElementById('scorePillValue'),

    // Ultimate
    ultBtn: document.getElementById('ultBtn'),
    nukeBtn: document.getElementById('nukeBtn'),
    laserTopBtn: document.getElementById('laserTopBtn'),
    nukeTopBtn: document.getElementById('nukeTopBtn'),
    ultLaserBtn: document.getElementById('ultLaserBtn'),
    ultNukeBtn: document.getElementById('ultNukeBtn'),

    // Modals
    openShopBtn: document.getElementById('openShopBtn'),
    openBoardBtn: document.getElementById('openBoardBtn'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    openAboutBtn: document.getElementById('openAboutBtn'),
    musicBtn: document.getElementById('musicBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    aimModeBtn: document.getElementById('aimModeBtn'),

    levelSelectModal: document.getElementById('levelSelectModal'),
    levelSelectGrid: document.getElementById('levelSelectGrid'),
    closeLevelSelectBtn: document.getElementById('closeLevelSelectBtn'),

    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    playerNameInput: document.getElementById('playerNameInput'),
    settingsAimBtn: document.getElementById('settingsAimBtn'),

    aboutModal: document.getElementById('aboutModal'),
    closeAboutBtn: document.getElementById('closeAboutBtn'),

    shopModal: document.getElementById('shopModal'),
    closeShopBtn: document.getElementById('closeShopBtn'),
    trophyGrid: document.getElementById('trophyGrid'),
    shopCashEl: document.getElementById('shopCash'),

    boardModal: document.getElementById('boardModal'),
    closeBoardBtn: document.getElementById('closeBoardBtn'),
    scoreList: document.getElementById('scoreList'),
    sortTimeBtn: document.getElementById('sortTimeBtn'),
    sortCashBtn: document.getElementById('sortCashBtn'),
    sortLevelBtn: document.getElementById('sortLevelBtn'),

    levelUpMessage: document.getElementById('levelUpMessage'),
      centerToast: document.getElementById('centerToast'),
      riftToast: document.getElementById('riftToast'),
    flashOverlay: document.getElementById('flashOverlay'),
    pauseOverlay: document.getElementById('pauseOverlay'),
    startCountdownEl: document.getElementById('startCountdown'),

    // Controls
    desktopControlsHint: document.getElementById('desktopControlsHint'),
    desktopUltStatus: document.getElementById('desktopUltStatus'),
    touchControls: document.getElementById('touchControls'),
    moveStick: document.getElementById('moveStick'),
    moveKnob: document.getElementById('moveKnob'),
    aimStick: document.getElementById('aimStick'),
    aimKnob: document.getElementById('aimKnob'),
    moveZone: document.getElementById('moveZone'),
    aimZone: document.getElementById('aimZone'),
  };
}

export function shortPowerName(type) {
  if (type === POWERUP_TYPES.speed) return 'SPD';
  if (type === POWERUP_TYPES.fireRate) return 'FIRE';
  if (type === POWERUP_TYPES.piercing) return 'PIERCE';
  if (type === POWERUP_TYPES.shotgun) return 'SHGN';
  if (type === POWERUP_TYPES.bounce) return 'BNCE';
  if (type === POWERUP_TYPES.stasis) return 'STAS';
  return type;
}

function powerupAccent(type) {
  if (type === POWERUP_TYPES.speed) return '#ff9b3d';
  if (type === POWERUP_TYPES.fireRate) return '#4fe8ff';
  if (type === POWERUP_TYPES.piercing) return '#b56cff';
  if (type === POWERUP_TYPES.shotgun) return '#ffd54a';
  if (type === POWERUP_TYPES.bounce) return '#4fa8ff';
  if (type === POWERUP_TYPES.stasis) return '#38ffb3';
  return '#66ccff';
}

function renderActivePowerUps(activeOverlayEl, activePowerUps, nowMs) {
  if (!activeOverlayEl) return;
  activeOverlayEl.innerHTML = '';

  if (!Array.isArray(activePowerUps) || activePowerUps.length === 0) return;

  const frag = document.createDocumentFragment();
  for (const p of activePowerUps) {
    const remain = Math.max(0, Math.ceil((p.endTime - nowMs) / 1000));
    const pill = document.createElement('div');
    pill.className = 'igPowerPill';
    pill.dataset.type = String(p.type || '');

    const accent = powerupAccent(p.type);
    pill.style.setProperty('--accent', accent);
    pill.style.setProperty('--accentGlow', hexToRgba(accent, 0.35));

    const label = document.createElement('span');
    label.className = 'igPowerPillLabel';
    label.textContent = String(shortPowerName(p.type)).toUpperCase();

    const value = document.createElement('span');
    value.className = 'igPowerPillValue';
    value.textContent = `${remain}s`;

    pill.append(label, value);
    frag.appendChild(pill);
  }

  activeOverlayEl.appendChild(frag);
}

function formatCashForHud(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '0';

  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(n));

  // Keep exact small numbers.
  if (abs < 1000) return `${sign}${abs}`;

  const units = [
    { v: 1e12, s: 't' },
    { v: 1e9, s: 'b' },
    { v: 1e6, s: 'm' },
    { v: 1e3, s: 'k' },
  ];

  // We want this to stay short for the cockpit frame.
  const maxLen = 5; // e.g. 999k, 1.2m, 12.3m

  for (let i = 0; i < units.length; i++) {
    const { v, s } = units[i];
    if (abs < v) continue;

    // Start with 1 decimal for small leading digits, otherwise 0.
    for (const decimals of abs < 10 * v ? [1, 0] : [0]) {
      const scaled = abs / v;
      const pow = 10 ** decimals;
      const rounded = Math.round(scaled * pow) / pow;

      // If rounding bumps us to the next unit (e.g. 999.9k -> 1.0m), retry using the next unit.
      if (rounded >= 1000 && i > 0) break;

      const txtNum = decimals === 0 ? String(Math.trunc(rounded)) : String(rounded);
      const txt = `${sign}${txtNum}${s}`;
      if (txt.length <= maxLen) return txt;
    }

    // Fall back (always returns something).
    return `${sign}${Math.trunc(abs / v)}${s}`;
  }

  return `${sign}${abs}`;
}

export function renderLives(livesContainerEl, lives) {
  if (!livesContainerEl) return;
  livesContainerEl.innerHTML = '';
  for (let i = 0; i < lives; i++) {
    const span = document.createElement('span');
    span.className = 'heart';
    livesContainerEl.appendChild(span);
  }
}

export function updateHud(ui, state) {
  const {
    level,
    elapsedSeconds,
    nextColor,
    lives,
    energyPercent,
    activePowerUps,
    cash,
    laserText,
    nukeText,
    nowMs,
    laserReady,
    nukeReady,
    laserActive,
    nukeActive,
    laserOwned,
    nukeOwned,
    laserCooldownSeconds,
    nukeCooldownSeconds,
    mouseAimEnabled,
  } = state;

  const levelNum = Number.isFinite(Number(level)) ? Math.max(0, Math.floor(Number(level))) : 0;
  const livesNum = Number.isFinite(Number(lives)) ? Math.max(0, Math.floor(Number(lives))) : 0;

  if (ui.hudLevelEl) ui.hudLevelEl.textContent = String(levelNum);
  if (ui.hudTimeEl) ui.hudTimeEl.textContent = String(Math.max(0, Math.floor(elapsedSeconds)));
  if (ui.hudEnergyEl) {
    const ep = clampPercent(energyPercent);
    ui.hudEnergyEl.textContent = `${ep}%`;
    ui.hudEnergyEl.classList.toggle('energyLow', ep > 0 && ep <= 25);
    ui.hudEnergyEl.classList.toggle('energyCritical', ep > 0 && ep <= 10);
  }

  // NEXT target: rendered by the 3D renderer into the swatch canvas.
  if (ui.nextColorSwatchEl) ui.nextColorSwatchEl.title = nextColor ? `Exposed: ${nextColor}` : 'Exposed';
  if (ui.nextColorNameEl) ui.nextColorNameEl.textContent = nextColor ? String(nextColor).toUpperCase() : '';

  // In-game meters (bigger + more obvious, but still compact)
  if (ui.igTargetWidgetEl) {
    const accent = colorNameToAccent(nextColor);
    ui.igTargetWidgetEl.style.setProperty('--accent', accent);
    ui.igTargetWidgetEl.style.setProperty('--accentGlow', colorNameToAccentGlow(nextColor));

    ui.igTargetWidgetEl.title = nextColor ? `CONSOLE SCAN: ${String(nextColor).toUpperCase()} is EXPOSED` : 'CONSOLE SCAN';

    // Pulse when target color changes.
    if (nextColor !== lastUiNextColor) {
      lastUiNextColor = nextColor;
      if (ui.igTargetWordEl) {
        ui.igTargetWordEl.classList.remove('igPulse');
        // Force reflow to restart animation.
        void ui.igTargetWordEl.offsetWidth;
        ui.igTargetWordEl.classList.add('igPulse');
      }
    }
  }

  if (ui.igEnergyWidgetEl) {
    const ep = clampPercent(energyPercent);
    ui.igEnergyWidgetEl.style.setProperty('--p', String(ep / 100));
    ui.igEnergyWidgetEl.style.setProperty('--accent', energyAccent(ep));
    ui.igEnergyWidgetEl.style.setProperty('--accentGlow', energyAccentGlow(ep));
    ui.igEnergyWidgetEl.classList.toggle('energyCritical', ep <= 20);
    if (ui.igEnergyPctEl) ui.igEnergyPctEl.textContent = `${ep}%`;
  }

  // Level-up pulse on the level pill.
  if (levelNum > 0 && lastUiLevel !== null && levelNum > lastUiLevel) {
    const levelPillEl = ui.hudLevelEl?.closest('.igStat--level');
    if (levelPillEl) pulseHudPill(levelPillEl, 'igLevelUpPulse');
  }
  lastUiLevel = levelNum;

  // If we render the nicer target preview in-game, mirror it into the top bar swatch.
  syncTargetSwatches(ui);

  // Keep the legacy heart rendering (used by non-cockpit themes) but also expose the
  // numeric lives value directly for the cockpit "window".
  renderLives(ui.livesContainerEl, livesNum);
  if (ui.livesContainerEl) ui.livesContainerEl.dataset.livesCount = String(livesNum);

  // Extra-life pulse on the lives pill.
  if (lastUiLives !== null && livesNum > lastUiLives && ui.livesOverlay) {
    pulseHudPill(ui.livesOverlay, 'igLifeGainPulse');
  }
  lastUiLives = livesNum;

  if (ui.activeOverlayEl) {
    const now = typeof nowMs === 'number' ? nowMs : performance.now();
    renderActivePowerUps(ui.activeOverlayEl, activePowerUps, now);
  }

  const cashHudText = formatCashForHud(cash);
  if (ui.cashEl) ui.cashEl.textContent = cashHudText;
  if (ui.scorePillValue) ui.scorePillValue.textContent = cashHudText;

  const cashNum = Number.isFinite(Number(cash)) ? Number(cash) : 0;
  if (lastUiCash !== null && cashNum > lastUiCash) {
    const cashPillEl = ui.cashEl?.closest('.igStat--cash');
    if (cashPillEl) {
      pulseHudPill(cashPillEl, 'igCashGainPulse');
      spawnCashBurst(cashPillEl, cashNum - lastUiCash);
    }
  }
  lastUiCash = cashNum;

  if (typeof laserText === 'string') {
    const laserCooldown = Number(laserCooldownSeconds) || 0;
    const laserLabel = laserCooldown > 0 && !laserActive ? `LASER\n${laserCooldown}s` : laserText;
    setUltButtonLabel(ui.ultBtn, laserLabel);
    setUltButtonLabel(ui.laserTopBtn, laserLabel);
  }
  if (typeof nukeText === 'string') {
    const nukeCooldown = Number(nukeCooldownSeconds) || 0;
    const nukeLabel = nukeCooldown > 0 && !nukeActive ? `NUKE\n${nukeCooldown}s` : nukeText;
    setUltButtonLabel(ui.nukeBtn, nukeLabel);
    setUltButtonLabel(ui.nukeTopBtn, nukeLabel);
  }

  // Make ult buttons visually obvious when ready.
  setUltButtonState(ui.ultBtn, { ready: !!laserReady, active: !!laserActive, cooldownSeconds: Number(laserCooldownSeconds) || 0 });
  setUltButtonState(ui.laserTopBtn, { ready: !!laserReady, active: !!laserActive, cooldownSeconds: Number(laserCooldownSeconds) || 0 });
  setUltButtonState(ui.nukeBtn, { ready: !!nukeReady, active: !!nukeActive, cooldownSeconds: Number(nukeCooldownSeconds) || 0 });
  setUltButtonState(ui.nukeTopBtn, { ready: !!nukeReady, active: !!nukeActive, cooldownSeconds: Number(nukeCooldownSeconds) || 0 });

  // Desktop hint bar: show ult status + aim mode toggle.
  syncAimModeHint(ui, { mouseAimEnabled: !!mouseAimEnabled });
  syncUltStatusHint(ui, {
    laserOwned: !!laserOwned,
    nukeOwned: !!nukeOwned,
    laserActive: !!laserActive,
    nukeActive: !!nukeActive,
    laserReady: !!laserReady,
    nukeReady: !!nukeReady,
    laserCooldownSeconds: Number(laserCooldownSeconds) || 0,
    nukeCooldownSeconds: Number(nukeCooldownSeconds) || 0,
  });
}

let lastUiNextColor = null;
let lastUiLevel = null;
let lastUiLives = null;
let lastUiCash = null;

function pulseHudPill(el, className) {
  if (!el) return;
  el.classList.remove(className);
  // Force reflow to restart animation.
  void el.offsetWidth;
  el.classList.add(className);
  const remove = () => el.classList.remove(className);
  el.addEventListener('animationend', remove, { once: true });
  el.addEventListener('animationcancel', remove, { once: true });
}

function spawnCashBurst(containerEl, delta) {
  if (!containerEl || !Number.isFinite(delta) || delta <= 0) return;
  const el = document.createElement('span');
  el.className = 'igCashBurst';
  el.textContent = `+${formatCashForHud(delta)}`;
  containerEl.appendChild(el);
  const remove = () => el.remove();
  el.addEventListener('animationend', remove, { once: true });
  el.addEventListener('animationcancel', remove, { once: true });
}

function colorNameToAccent(name) {
  const k = typeof name === 'string' ? name.toLowerCase() : '';
  if (k === 'yellow') return '#ffd54a';
  if (k === 'red') return '#ff4d6d';
  if (k === 'green') return '#5dff7b';
  if (k === 'blue') return '#49b6ff';
  if (k === 'black') return '#e6f2ff';
  if (k === 'white') return '#ffffff';
  if (k === 'purple') return '#b56cff';
  if (k === 'brown') return '#c48b5a';
  if (k === 'pink') return '#ff6bd6';
  return '#66ccff';
}

function colorNameToAccentGlow(name) {
  const hex = colorNameToAccent(name);
  return hexToRgba(hex, 0.28);
}

function energyAccent(ep) {
  // Slightly game-y: cyan when healthy, warning red when low.
  if (ep > 55) return '#66ccff';
  if (ep > 25) return '#ffd54a';
  if (ep > 10) return '#ff7a4d';
  return '#ff3b5f';
}

function energyAccentGlow(ep) {
  return hexToRgba(energyAccent(ep), 0.22);
}

function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string') return `rgba(102, 204, 255, ${alpha})`;
  const h = hex.trim().replace('#', '');
  if (h.length !== 6) return `rgba(102, 204, 255, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return `rgba(102, 204, 255, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function syncTargetSwatches(ui) {
  const src = ui.igTargetSwatchEl;
  const dst = ui.nextColorSwatchEl;
  if (!src || !dst || src === dst) return;
  const dctx = dst.getContext('2d');
  if (!dctx) return;
  dctx.clearRect(0, 0, dst.width, dst.height);
  dctx.imageSmoothingEnabled = true;
  dctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, dst.width, dst.height);
}

function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function syncAimModeHint(ui, { mouseAimEnabled }) {
  if (!ui.aimModeBtn) return;
  ui.aimModeBtn.textContent = mouseAimEnabled ? 'MOUSE' : 'Z/X';
  ui.aimModeBtn.setAttribute('aria-pressed', mouseAimEnabled ? 'true' : 'false');
}

function syncUltStatusHint(
  ui,
  {
    laserOwned,
    nukeOwned,
    laserActive,
    nukeActive,
    laserReady,
    nukeReady,
    laserCooldownSeconds,
    nukeCooldownSeconds,
  }
) {
  if (!ui.desktopUltStatus) return;

  const renderOne = (name, key, { owned, active, ready, cooldownSeconds }) => {
    if (!owned) return `${name} <kbd>${key}</kbd>: <span class="ultState ultState--off">BUY</span>`;
    if (active) return `${name} <kbd>${key}</kbd>: <span class="ultState ultState--active">ACTIVE</span>`;
    if (!ready && cooldownSeconds > 0) return `${name} <kbd>${key}</kbd>: <span class="ultState ultState--cooldown">${cooldownSeconds}s</span>`;
    return `${name} <kbd>${key}</kbd>: <span class="ultState ultState--ready">READY</span>`;
  };

  ui.desktopUltStatus.innerHTML =
    renderOne('Laser', 'SPACE', {
      owned: laserOwned,
      active: laserActive,
      ready: laserReady,
      cooldownSeconds: laserCooldownSeconds,
    }) +
    ' <span class="hintSep">|</span> ' +
    renderOne('Nuke', 'SHIFT', {
      owned: nukeOwned,
      active: nukeActive,
      ready: nukeReady,
      cooldownSeconds: nukeCooldownSeconds,
    });
}

function setUltButtonState(buttonEl, { ready, active, cooldownSeconds }) {
  if (!buttonEl) return;
  buttonEl.classList.toggle('isReady', !!ready);
  buttonEl.classList.toggle('isActive', !!active);
  const onCooldown = !active && Number(cooldownSeconds) > 0;
  buttonEl.classList.toggle('isCooldown', onCooldown);
}

function setUltButtonLabel(buttonEl, text) {
  if (!buttonEl) return;

  const [mainLine, keyLine] = String(text).split('\n');

  // Build DOM instead of innerHTML to avoid injection issues.
  buttonEl.textContent = '';

  const mainSpan = document.createElement('span');
  mainSpan.className = 'ultMain';
  mainSpan.textContent = (mainLine ?? '').trim();
  buttonEl.appendChild(mainSpan);

  if (typeof keyLine === 'string' && keyLine.trim().length > 0) {
    const keySpan = document.createElement('span');
    keySpan.className = 'ultKey';
    keySpan.textContent = keyLine.trim();
    buttonEl.appendChild(keySpan);
  }
}

export function pulseNextColor(nextColorSwatchEl) {
  if (!nextColorSwatchEl) return;
  nextColorSwatchEl.classList.remove('pulse');
  // force reflow
  void nextColorSwatchEl.offsetWidth;
  nextColorSwatchEl.classList.add('pulse');
}

export function triggerFlash(flashOverlay) {
  if (!flashOverlay) return;
  flashOverlay.classList.add('active');
  flashOverlay.addEventListener(
    'animationend',
    () => flashOverlay.classList.remove('active'),
    { once: true }
  );
}

export function showLevelUpMessage(levelUpMessage) {
  if (!levelUpMessage) return;
  showCenterMessage(levelUpMessage, 'LEVEL UP!', 1500);
}

export function showCenterMessage(levelUpMessage, text, durationMs = 1200, options = {}) {
  if (!levelUpMessage) return;
  levelUpMessage.textContent = text;
  if (options.accent) levelUpMessage.style.setProperty('--toastAccent', options.accent);
  else levelUpMessage.style.removeProperty('--toastAccent');
  if (options.glow) levelUpMessage.style.setProperty('--toastGlow', options.glow);
  else levelUpMessage.style.removeProperty('--toastGlow');
  levelUpMessage.classList.remove('visible');
  // force reflow
  void levelUpMessage.offsetWidth;
  levelUpMessage.classList.add('visible');
  setTimeout(() => levelUpMessage.classList.remove('visible'), durationMs);
}

export function animatePickupToActive(ui, text) {
  if (!ui?.gameShell) return;
  const el = document.createElement('div');
  el.className = 'pickupFly';
  el.textContent = text;
  ui.gameShell.appendChild(el);

  // Animate from center to the top-right active overlay.
  // Use Web Animations API for reliable playback.
  const shellRect = ui.gameShell.getBoundingClientRect();
  const startX = shellRect.width / 2;
  const startY = shellRect.height / 2;

  // Default target: top-right corner of the game shell
  let endX = Math.max(20, shellRect.width - 44);
  let endY = 30;

  // If active overlay exists and is visible, aim for its center.
  if (ui.activeOverlayEl) {
    const targetRect = ui.activeOverlayEl.getBoundingClientRect();
    if (targetRect.width > 0 && targetRect.height > 0) {
      endX = (targetRect.left - shellRect.left) + targetRect.width / 2;
      endY = (targetRect.top - shellRect.top) + targetRect.height / 2;
    }
  }

  el.style.left = `${startX}px`;
  el.style.top = `${startY}px`;
  el.style.transform = 'translate(-50%, -50%) scale(1)';

  const dx = endX - startX;
  const dy = endY - startY;

  const anim = el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.55)`, opacity: 0.1 },
    ],
    {
      duration: 360,
      easing: 'cubic-bezier(.2,.9,.15,1)',
      fill: 'forwards',
    }
  );

  anim.addEventListener('finish', () => el.remove(), { once: true });
}

export function showGameOver(ui, { timeSeconds, level, cashEarned, bonusCash, unlocked }) {
  if (!ui.gameOverScreen) return;
  ui.gameOverScreen.style.display = 'block';

  const extras = [];
  if (cashEarned > 0) extras.push(`Run CC: +${cashEarned}`);
  if (bonusCash > 0) extras.push(`Prize CC: +${bonusCash}`);
  if (unlocked.length > 0) extras.push(`Unlocked: ${unlocked.join(', ')}`);

  const extraText = extras.length > 0 ? `\n${extras.join('  |  ')}` : '';

  if (ui.statsParagraph) {
    ui.statsParagraph.textContent = `You survived ${timeSeconds.toFixed(2)} seconds and reached Level ${level}.${extraText}`;
  }
}

export function hideGameOver(ui) {
  if (ui.gameOverScreen) ui.gameOverScreen.style.display = 'none';
}

export function openModal(modal) {
  if (!modal) return;
  modal.classList.remove('hidden');
  try {
    modal.setAttribute('aria-hidden', 'false');
  } catch {
    // ignore
  }
  document.body?.classList.add('modal-open');
}

export function closeModal(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  try {
    modal.setAttribute('aria-hidden', 'true');
  } catch {
    // ignore
  }
  const anyOpen = !!document.querySelector('.modal:not(.hidden)');
  if (!anyOpen) document.body?.classList.remove('modal-open');
}

function getTrophyNextCost(basePrice, nextLevel) {
  const lv = Math.max(1, Math.floor(nextLevel || 1));
  return Math.max(1, Math.floor(basePrice * 2 ** (lv - 1)));
}

export function renderShop(ui, trophyLevels, cash, onBuyOrUpgrade) {
  if (!ui.trophyGrid) return;

  if (ui.shopCashEl) ui.shopCashEl.textContent = String(cash);
  ui.trophyGrid.innerHTML = '';

  const levels = trophyLevels && typeof trophyLevels === 'object' ? trophyLevels : {};

  for (const t of TROPHIES) {
    const currentLevel = Math.max(0, Math.floor(Number(levels[t.id] || 0)));
    const maxLevel = Math.max(1, Math.floor(Number(t.maxLevel || 1)));
    const owned = currentLevel > 0;
    const nextLevel = Math.min(maxLevel, currentLevel + 1);
    const canUpgrade = currentLevel < maxLevel;
    const nextCost = canUpgrade ? getTrophyNextCost(t.price, nextLevel) : 0;

    const card = document.createElement('div');
    card.className = 'trophyCard' + (owned ? ' owned' : '');

    const icon = document.createElement('div');
    icon.className = `trophyIcon trophyIcon--${t.id}`;
    icon.textContent = t.icon;

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = t.name;

    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = t.desc || '';

    card.appendChild(icon);
    card.appendChild(name);
    card.appendChild(desc);

    if (owned) {
      const ownedTag = document.createElement('div');
      ownedTag.className = 'ownedTag';
      ownedTag.textContent = currentLevel >= maxLevel ? `MAX ${maxLevel}` : `LVL ${currentLevel}/${maxLevel}`;
      card.appendChild(ownedTag);
    }

    if (canUpgrade) {
      const btn = document.createElement('button');
      btn.textContent = owned ? `UPGRADE (${nextCost} CC)` : `BUY (${nextCost} CC)`;
      btn.disabled = cash < nextCost;
      btn.addEventListener('click', () => onBuyOrUpgrade(t));
      card.appendChild(btn);
    }

    ui.trophyGrid.appendChild(card);
  }
}

export function renderScores(ui, leaderboard, sortBy) {
  if (!ui.scoreList) return;
  ui.scoreList.innerHTML = '';

  if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No runs yet — play a round to record a score.';
    ui.scoreList.appendChild(li);
    return;
  }

  const entries = [...leaderboard];

  // Sort buttons are removed; keep the leaderboard simple and consistent.
  // Best run = highest time survived.
  entries.sort((a, b) => b.timeSeconds - a.timeSeconds);

  entries.slice(0, 10).forEach((e, idx) => {
    const li = document.createElement('li');

    li.className = 'scoreEntry';

    const rank = document.createElement('div');
    rank.className = 'scoreRank';
    rank.textContent = `#${idx + 1}`;

    const main = document.createElement('div');
    main.className = 'scoreMain';

    const time = document.createElement('div');
    time.className = 'scoreTime';
    time.textContent = `${e.timeSeconds.toFixed(2)}s survived`;

    const meta = document.createElement('div');
    meta.className = 'scoreMeta';
    meta.textContent = `Level ${e.level}  •  +${e.cashEarned} CC`;

    main.appendChild(time);
    main.appendChild(meta);

    if (typeof e.endedAt === 'string' && e.endedAt.length > 0) {
      const d = new Date(e.endedAt);
      if (!Number.isNaN(d.getTime())) {
        const date = document.createElement('div');
        date.className = 'scoreDate';
        date.textContent = d.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        main.appendChild(date);
      }
    }

    li.appendChild(rank);
    li.appendChild(main);
    ui.scoreList.appendChild(li);
  });
}
