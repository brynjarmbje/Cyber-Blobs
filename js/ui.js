// @ts-nocheck
import { TROPHIES, POWERUP_TYPES } from './constants.js';

export function getUiElements() {
  return {
    // Canvas / containers
    gameShell: document.getElementById('gameShell'),
    canvas: document.getElementById('gameCanvas'),
    glCanvas: document.getElementById('glCanvas'),

    // Game over
    gameOverScreen: document.getElementById('gameOverScreen'),
    statsParagraph: document.getElementById('stats'),
    tryAgainBtn: document.getElementById('tryAgainBtn'),
    checkpointRow: document.getElementById('checkpointRow'),

    // HUD
    hudLevelEl: document.getElementById('hudLevel'),
    hudTimeEl: document.getElementById('hudTime'),
    nextColorSwatchEl: document.getElementById('nextColorSwatch'),
    nextColorNameEl: document.getElementById('nextColorName'),
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
    musicBtn: document.getElementById('musicBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    mouseAimBtn: document.getElementById('mouseAimBtn'),

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

    goShopFromOver: document.getElementById('goShopFromOver'),
    goScoresFromOver: document.getElementById('goScoresFromOver'),

    levelUpMessage: document.getElementById('levelUpMessage'),
    centerToast: document.getElementById('centerToast'),
    flashOverlay: document.getElementById('flashOverlay'),
    pauseOverlay: document.getElementById('pauseOverlay'),

    // Controls
    desktopControlsHint: document.getElementById('desktopControlsHint'),
    touchControls: document.getElementById('touchControls'),
    moveStick: document.getElementById('moveStick'),
    moveKnob: document.getElementById('moveKnob'),
    aimStick: document.getElementById('aimStick'),
    aimKnob: document.getElementById('aimKnob'),
  };
}

export function shortPowerName(type) {
  if (type === POWERUP_TYPES.speed) return 'SPD';
  if (type === POWERUP_TYPES.fireRate) return 'FIRE';
  if (type === POWERUP_TYPES.piercing) return 'PIERCE';
  if (type === POWERUP_TYPES.shotgun) return 'SHGN';
  if (type === POWERUP_TYPES.bounce) return 'BNCE';
  return type;
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
    activePowerUps,
    cash,
    laserText,
    nukeText,
    nowMs,
  } = state;

  if (ui.hudLevelEl) ui.hudLevelEl.textContent = String(level);
  if (ui.hudTimeEl) ui.hudTimeEl.textContent = String(Math.max(0, Math.floor(elapsedSeconds)));

  // NEXT target: rendered by the 3D renderer into the swatch canvas.
  if (ui.nextColorSwatchEl) ui.nextColorSwatchEl.title = nextColor ? `Target: ${nextColor}` : 'Target';
  if (ui.nextColorNameEl) ui.nextColorNameEl.textContent = nextColor ? String(nextColor).toUpperCase() : '';

  renderLives(ui.livesContainerEl, lives);

  if (ui.activeOverlayEl) {
    const now = typeof nowMs === 'number' ? nowMs : performance.now();
    ui.activeOverlayEl.textContent =
      activePowerUps.length === 0
        ? ''
        : activePowerUps
            .map((p) => {
              const remain = Math.max(0, Math.ceil((p.endTime - now) / 1000));
              return `${shortPowerName(p.type)} ${remain}s`;
            })
            .join(' • ');
  }

  if (ui.cashEl) ui.cashEl.textContent = String(cash);
  if (ui.scorePillValue) ui.scorePillValue.textContent = String(cash);

  if (typeof laserText === 'string') {
    setUltButtonLabel(ui.ultBtn, laserText);
    setUltButtonLabel(ui.laserTopBtn, laserText);
  }
  if (typeof nukeText === 'string') {
    setUltButtonLabel(ui.nukeBtn, nukeText);
    setUltButtonLabel(ui.nukeTopBtn, nukeText);
  }
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

export function showCenterMessage(levelUpMessage, text, durationMs = 1200) {
  if (!levelUpMessage) return;
  levelUpMessage.textContent = text;
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

export function showGameOver(ui, { timeSeconds, level, cashEarned, bonusCash, unlocked, maxStartLevel }) {
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

  if (ui.checkpointRow) {
    ui.checkpointRow.textContent = '';

    const maxLv = Number.isFinite(maxStartLevel) ? Math.max(0, Math.floor(maxStartLevel)) : 0;
    if (maxLv >= 10) {
      const label = document.createElement('div');
      label.className = 'checkpointLabel';
      label.textContent = 'Start next run at:';
      ui.checkpointRow.appendChild(label);

      for (let lv = 10; lv <= maxLv; lv += 10) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'checkpointBtn';
        btn.dataset.startLevel = String(lv);
        btn.textContent = `Level ${lv}`;
        ui.checkpointRow.appendChild(btn);
      }
    }
  }
}

export function hideGameOver(ui) {
  if (ui.gameOverScreen) ui.gameOverScreen.style.display = 'none';
}

export function openModal(modal) {
  modal?.classList.remove('hidden');
}

export function closeModal(modal) {
  modal?.classList.add('hidden');
}

export function renderShop(ui, ownedTrophies, cash, onBuy) {
  if (!ui.trophyGrid) return;

  if (ui.shopCashEl) ui.shopCashEl.textContent = String(cash);
  ui.trophyGrid.innerHTML = '';

  for (const t of TROPHIES) {
    const owned = ownedTrophies.has(t.id);

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

    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = `${t.price} CC`;

    card.appendChild(icon);
    card.appendChild(name);
    card.appendChild(desc);
    card.appendChild(price);

    if (owned) {
      const ownedTag = document.createElement('div');
      ownedTag.className = 'ownedTag';
      ownedTag.textContent = 'OWNED';
      card.appendChild(ownedTag);
    } else {
      const btn = document.createElement('button');
      btn.textContent = 'BUY';
      btn.addEventListener('click', () => onBuy(t));
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

  if (sortBy === 'cash') {
    entries.sort((a, b) => b.cashEarned - a.cashEarned);
  } else if (sortBy === 'level') {
    entries.sort((a, b) => b.level - a.level);
  } else {
    // time (default): best time = highest seconds
    entries.sort((a, b) => b.timeSeconds - a.timeSeconds);
  }

  entries.slice(0, 10).forEach((e) => {
    const li = document.createElement('li');
    li.textContent = `${e.timeSeconds.toFixed(2)}s  |  L${e.level}  |  +${e.cashEarned} CC`;
    ui.scoreList.appendChild(li);
  });
}
