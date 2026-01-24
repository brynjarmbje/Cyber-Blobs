// @ts-nocheck

/**
 * Menu/UI helpers and bindings extracted from game.js to keep gameplay logic focused.
 */

export function syncMainMenuUi(ui, { loadPlayerName } = {}) {
  const name = typeof loadPlayerName === 'function' ? loadPlayerName() : '';
  if (ui?.playerNameInput) {
    ui.playerNameInput.value = name;
  }
}

export function openLevelSelectModal(
  ui,
  { openModal, maxStartLevelUnlocked = 0, startRunFromLevel, allowBackToMenu = true } = {}
) {
  if (!ui?.levelSelectModal || !ui?.levelSelectGrid) {
    if (typeof startRunFromLevel === 'function') startRunFromLevel(1);
    return;
  }

  ui.levelSelectGrid.textContent = '';

  const mkBtn = (lv) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'levelBtn';
    b.dataset.startLevel = String(lv);
    b.textContent = `Level ${lv}`;
    return b;
  };

  // Always allow Level 1.
  ui.levelSelectGrid.appendChild(mkBtn(1));

  const maxLv = Math.max(0, Math.floor(maxStartLevelUnlocked || 0));
  for (let lv = 10; lv <= maxLv; lv += 10) {
    ui.levelSelectGrid.appendChild(mkBtn(lv));
  }

  if (typeof openModal === 'function') openModal(ui.levelSelectModal);

  // Back button behavior.
  if (ui.closeLevelSelectBtn) {
    ui.closeLevelSelectBtn.textContent = allowBackToMenu ? 'Back' : 'Close';
  }
}

/**
 * Installs UI event listeners that are primarily menu/modal related.
 * Keep gameplay input (movement/shooting/joysticks) in game.js.
 */
export function installMenuBindings(
  ui,
  {
    getMaxStartLevelUnlocked,
    openLevelSelect,
    startRunFromLevel,
    showMainMenu,
    closeLevelSelect,
    isInMainMenu,

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

    // Aim mode toggles live in the menu/status UI.
    syncAimModeUi,
    toggleMouseAim,

    onPlayerNameInput,
    onSettingsAimToggle,
  } = {}
) {
  function isAudioEnabled() {
    // Reuse the music toggle as the global audio toggle.
    const btn = ui?.musicBtn;
    if (!btn) return true;
    return btn.getAttribute('aria-pressed') !== 'false';
  }

  function createPlopSynth() {
    /** @type {AudioContext|null} */
    let ctx = null;

    function ensureCtx() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      return ctx;
    }

    function play() {
      if (!isAudioEnabled()) return;
      const c = ensureCtx();
      if (!c) return;

      // Resume if needed (mobile autoplay policy).
      if (c.state === 'suspended') {
        try {
          void c.resume();
        } catch {
          // ignore
        }
      }

      const now = c.currentTime;

      // A tiny percussive "plop": falling pitch + short noise puff.
      const master = c.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.16, now + 0.006);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1200, now);
      lp.frequency.exponentialRampToValueAtTime(520, now + 0.10);

      // Tone
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(92, now + 0.10);

      const oscGain = c.createGain();
      oscGain.gain.setValueAtTime(0.0001, now);
      oscGain.gain.exponentialRampToValueAtTime(0.32, now + 0.004);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);

      // Noise puff (very short)
      const noiseLen = Math.floor(c.sampleRate * 0.05);
      const noiseBuf = c.createBuffer(1, noiseLen, c.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        const env = Math.max(0, 1 - t) ** 2;
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const noise = c.createBufferSource();
      noise.buffer = noiseBuf;

      const noiseGain = c.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.10, now + 0.003);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

      // Wire
      osc.connect(oscGain);
      oscGain.connect(lp);

      noise.connect(noiseGain);
      noiseGain.connect(lp);

      lp.connect(master);
      master.connect(c.destination);

      try {
        osc.start(now);
        osc.stop(now + 0.12);
      } catch {
        // ignore
      }
      try {
        noise.start(now);
        noise.stop(now + 0.06);
      } catch {
        // ignore
      }
    }

    return { play };
  }

  const plop = createPlopSynth();

  function createAlphaHitTester(imgSrc) {
    /** @type {{ ready: boolean, w: number, h: number, canvas: HTMLCanvasElement|null, ctx: CanvasRenderingContext2D|null }} */
    const state = { ready: false, w: 0, h: 0, canvas: null, ctx: null };

    const img = new Image();
    img.decoding = 'async';
    img.src = imgSrc;
    img.onload = () => {
      try {
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        if (!w || !h) return;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        state.ready = true;
        state.w = w;
        state.h = h;
        state.canvas = c;
        state.ctx = ctx;
      } catch {
        // ignore
      }
    };

    function parsePx(v) {
      const n = Number(String(v || '').replace('px', '').trim());
      return Number.isFinite(n) ? n : null;
    }

    function getBeforeSizePx(el) {
      // Read the pseudo-element size so we match the rendered art layer.
      const cs = getComputedStyle(el, '::before');
      const w = parsePx(cs.width);
      const h = parsePx(cs.height);
      if (!w || !h) return null;
      return { w, h };
    }

    function hitTest(el, clientX, clientY, { alphaThreshold = 12 } = {}) {
      if (!state.ready || !state.ctx) return true; // fail-open

      const btnRect = el.getBoundingClientRect();
      const beforeSize = getBeforeSizePx(el);
      if (!beforeSize) return true;

      const beforeW = beforeSize.w;
      const beforeH = beforeSize.h;

      const cx = btnRect.left + btnRect.width / 2;
      const cy = btnRect.top + btnRect.height / 2;
      const beforeLeft = cx - beforeW / 2;
      const beforeTop = cy - beforeH / 2;

      // Contain-fit math (same as CSS background-size: contain; background-position: center)
      const scale = Math.min(beforeW / state.w, beforeH / state.h);
      const drawW = state.w * scale;
      const drawH = state.h * scale;
      const offX = (beforeW - drawW) / 2;
      const offY = (beforeH - drawH) / 2;

      const localX = (clientX - (beforeLeft + offX)) / scale;
      const localY = (clientY - (beforeTop + offY)) / scale;

      if (localX < 0 || localY < 0 || localX >= state.w || localY >= state.h) return false;

      const ix = Math.max(0, Math.min(state.w - 1, Math.floor(localX)));
      const iy = Math.max(0, Math.min(state.h - 1, Math.floor(localY)));

      try {
        const d = state.ctx.getImageData(ix, iy, 1, 1).data;
        const a = d[3] || 0;
        return a >= alphaThreshold;
      } catch {
        return true;
      }
    }

    return { hitTest };
  }

  const playAlphaHit = createAlphaHitTester('./assets/play_cyberyolk_button.png');
  const shopAlphaHit = createAlphaHitTester('./assets/shop_button_cyberyolk.png');
  const boardAlphaHit = createAlphaHitTester('./assets/leaderboard_button_cyberyolk.png');
  const settingsAlphaHit = createAlphaHitTester('./assets/settings_button_cyberyolk.png');
  const aboutAlphaHit = createAlphaHitTester('./assets/about_button_cyberyolk.png');
  const closeAlphaHit = createAlphaHitTester('./assets/close_button_cyberyolk.png');

  function installMenuBtnFX(btn, { wobbleChance = 0.25, hitTest } = {}) {
    if (!btn) return;

    let acceptedPress = false;

    const clearFxClasses = () => {
      btn.classList.remove('isPressed');
      btn.classList.remove('isBouncing');
      btn.classList.remove('isWobble');
    };

    btn.addEventListener(
      'pointerdown',
      (e) => {
        acceptedPress = false;
        if (typeof hitTest === 'function') {
          const ok = hitTest(e);
          if (!ok) {
            try {
              e.preventDefault();
              e.stopPropagation();
            } catch {
              // ignore
            }
            return;
          }
        }

        acceptedPress = true;
        btn.classList.remove('isBouncing');
        btn.classList.remove('isWobble');
        btn.classList.add('isPressed');
        plop.play();
      },
      { passive: false }
    );

    const release = () => {
      if (!acceptedPress) return;
      btn.classList.remove('isPressed');

      // Add bounce (and occasionally a tiny wobble) on release.
      btn.classList.remove('isBouncing');
      // Force restart animation.
      void btn.offsetWidth;
      btn.classList.add('isBouncing');

      const doWobble = Math.random() < wobbleChance;
      if (doWobble) {
        btn.classList.remove('isWobble');
        void btn.offsetWidth;
        btn.classList.add('isWobble');
      }
    };

    btn.addEventListener('pointerup', release, { passive: true });
    btn.addEventListener('pointercancel', clearFxClasses, { passive: true });
    btn.addEventListener('pointerleave', clearFxClasses, { passive: true });

    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      btn.classList.add('isPressed');
      plop.play();
    });
    btn.addEventListener('keyup', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      release();
    });

    btn.addEventListener(
      'animationend',
      () => {
        btn.classList.remove('isBouncing');
        btn.classList.remove('isWobble');
      },
      { passive: true }
    );
  }

  // When level select is opened from the Game Over screen, closing it should
  // return to a sensible place (main menu) instead of leaving the game in limbo.
  let levelSelectOpenedFromGameOver = false;

  ui.tryAgainBtn?.addEventListener('click', () => {
    // Ensure the Game Over popup doesn't stay open behind level select.
    if (ui?.gameOverScreen) {
      ui.gameOverScreen.style.display = 'none';
      ui.gameOverScreen.setAttribute('aria-hidden', 'true');
    }

    const maxStart = typeof getMaxStartLevelUnlocked === 'function' ? getMaxStartLevelUnlocked() : 0;
    if (maxStart >= 10 && typeof openLevelSelect === 'function') {
      levelSelectOpenedFromGameOver = true;
      openLevelSelect({ allowBackToMenu: false });
    } else if (typeof startRunFromLevel === 'function') {
      levelSelectOpenedFromGameOver = false;
      startRunFromLevel(1);
    }
  });

  ui.goMainMenuBtn?.addEventListener('click', () => {
    if (typeof showMainMenu === 'function') showMainMenu();
  });

  ui.levelSelectGrid?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button[data-start-level]');
    if (!btn) return;
    const lv = Number(btn.dataset.startLevel);
    if (!Number.isFinite(lv)) return;

    const maxStart = typeof getMaxStartLevelUnlocked === 'function' ? getMaxStartLevelUnlocked() : 0;
    if (lv !== 1 && (lv < 10 || lv > maxStart)) return;
    levelSelectOpenedFromGameOver = false;
    if (typeof startRunFromLevel === 'function') startRunFromLevel(lv);
  });

  ui.closeLevelSelectBtn?.addEventListener('click', () => {
    if (typeof closeLevelSelect === 'function') closeLevelSelect();
    if (typeof isInMainMenu === 'function' && isInMainMenu()) return;

    if (levelSelectOpenedFromGameOver) {
      levelSelectOpenedFromGameOver = false;
      if (typeof showMainMenu === 'function') showMainMenu();
    }
  });

  ui.pauseBtn?.addEventListener('click', () => {
    if (typeof togglePause === 'function') togglePause();
  });

  ui.pauseSoundBtn?.addEventListener('click', () => {
    if (typeof toggleSound === 'function') toggleSound();
  });

  ui.resumeBtn?.addEventListener('click', () => {
    if (typeof togglePause === 'function') togglePause();
  });

  ui.leaveGameBtn?.addEventListener('click', () => {
    if (typeof openLeaveConfirm === 'function') openLeaveConfirm();
  });

  ui.confirmLeaveNoBtn?.addEventListener('click', () => {
    if (typeof closeLeaveConfirm === 'function') closeLeaveConfirm();
  });

  ui.confirmLeaveYesBtn?.addEventListener('click', () => {
    if (typeof confirmLeaveGame === 'function') confirmLeaveGame();
  });

  // Menu dropdown (top-right)
  ui.openShopBtn?.addEventListener('click', () => (typeof openShop === 'function' ? openShop() : undefined));
  ui.openBoardBtn?.addEventListener('click', () => (typeof openBoard === 'function' ? openBoard() : undefined));
  ui.openSettingsBtn?.addEventListener('click', () => (typeof openSettings === 'function' ? openSettings() : undefined));
  ui.openAboutBtn?.addEventListener('click', () => (typeof openAbout === 'function' ? openAbout() : undefined));

  ui.closeShopBtn?.addEventListener('click', () => (typeof closeShop === 'function' ? closeShop() : undefined));
  ui.closeBoardBtn?.addEventListener('click', () => (typeof closeBoard === 'function' ? closeBoard() : undefined));
  ui.closeSettingsBtn?.addEventListener('click', () => (typeof closeSettings === 'function' ? closeSettings() : undefined));
  ui.closeAboutBtn?.addEventListener('click', () => (typeof closeAbout === 'function' ? closeAbout() : undefined));

  // Leaderboard sorting
  ui.sortTimeBtn?.addEventListener('click', () => (typeof setSort === 'function' ? setSort('time') : undefined));
  ui.sortCashBtn?.addEventListener('click', () => (typeof setSort === 'function' ? setSort('cash') : undefined));
  ui.sortLevelBtn?.addEventListener('click', () => (typeof setSort === 'function' ? setSort('level') : undefined));

  // In-game ultimate buttons
  ui.ultBtn?.addEventListener('click', () => (typeof tryActivateLaser === 'function' ? tryActivateLaser() : undefined));
  ui.nukeBtn?.addEventListener('click', () => (typeof tryActivateNuke === 'function' ? tryActivateNuke() : undefined));
  ui.laserTopBtn?.addEventListener('click', () => (typeof tryActivateLaser === 'function' ? tryActivateLaser() : undefined));
  ui.nukeTopBtn?.addEventListener('click', () => (typeof tryActivateNuke === 'function' ? tryActivateNuke() : undefined));

  // Shop purchases
  ui.ultLaserBtn?.addEventListener('click', () => (typeof buyUltimate === 'function' ? buyUltimate('laser') : undefined));
  ui.ultNukeBtn?.addEventListener('click', () => (typeof buyUltimate === 'function' ? buyUltimate('nuke') : undefined));

  if (typeof syncAimModeUi === 'function') syncAimModeUi();

  ui.aimModeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof toggleMouseAim === 'function') toggleMouseAim();
    if (typeof syncAimModeUi === 'function') syncAimModeUi();
  });

  ui.playerNameInput?.addEventListener('input', () => {
    if (typeof onPlayerNameInput === 'function') onPlayerNameInput(ui.playerNameInput?.value);
  });

  ui.settingsAimBtn?.addEventListener('click', () => {
    if (typeof onSettingsAimToggle === 'function') onSettingsAimToggle();
    if (typeof syncAimModeUi === 'function') syncAimModeUi();
  });

  // Main menu buttons
  installMenuBtnFX(ui.mainPlayBtn, {
    wobbleChance: 0.35,
    hitTest: (e) => playAlphaHit.hitTest(ui.mainPlayBtn, e.clientX, e.clientY, { alphaThreshold: 14 }),
  });
  installMenuBtnFX(ui.mainShopBtn, {
    wobbleChance: 0.20,
    hitTest: (e) => shopAlphaHit.hitTest(ui.mainShopBtn, e.clientX, e.clientY, { alphaThreshold: 14 }),
  });
  installMenuBtnFX(ui.mainBoardBtn, {
    wobbleChance: 0.22,
    hitTest: (e) => boardAlphaHit.hitTest(ui.mainBoardBtn, e.clientX, e.clientY, { alphaThreshold: 14 }),
  });
  installMenuBtnFX(ui.mainSettingsBtn, {
    wobbleChance: 0.18,
    hitTest: (e) => settingsAlphaHit.hitTest(ui.mainSettingsBtn, e.clientX, e.clientY, { alphaThreshold: 14 }),
  });
  installMenuBtnFX(ui.mainAboutBtn, {
    wobbleChance: 0.18,
    hitTest: (e) => aboutAlphaHit.hitTest(ui.mainAboutBtn, e.clientX, e.clientY, { alphaThreshold: 14 }),
  });

  // Modal close buttons use the standard mini button styling (no yolk art / no alpha hit-testing).

  ui.mainPlayBtn?.addEventListener('click', () => {
    const maxStart = typeof getMaxStartLevelUnlocked === 'function' ? getMaxStartLevelUnlocked() : 0;
    if (maxStart >= 10 && typeof openLevelSelect === 'function') openLevelSelect({ allowBackToMenu: true });
    else if (typeof startRunFromLevel === 'function') startRunFromLevel(1);
  });

  ui.mainShopBtn?.addEventListener('click', () => (typeof openShop === 'function' ? openShop() : undefined));
  ui.mainBoardBtn?.addEventListener('click', () => (typeof openBoard === 'function' ? openBoard() : undefined));
  ui.mainSettingsBtn?.addEventListener('click', () => (typeof openSettings === 'function' ? openSettings() : undefined));
  ui.mainAboutBtn?.addEventListener('click', () => (typeof openAbout === 'function' ? openAbout() : undefined));
}

/**
 * Creates the common modal/menu actions (shop/board/settings/about + sorting).
 * Keeps the small UI-only state (gameOverHiddenByMenu) inside the menu layer.
 */
export function createMenuActions(
  ui,
  {
    openModal,
    closeModal,
    renderShop,
    renderScores,
    loadLeaderboard,

    getOwnedTrophies,
    getTrophyLevels,
    getCash,
    buyTrophy,
    syncUltimateShopUi,

    isGameOver,
    getLeaderboard,
    setLeaderboard,
    getSortBy,
    setSortBy,

    getMouseAimEnabled,
  } = {}
) {
  let gameOverHiddenByMenu = false;

  const hideInGameDropdownMenu = () => {
    const menu = document.getElementById('menu');
    try {
      menu?.removeAttribute?.('open');
    } catch {
      // ignore
    }
  };

  const maybeHideGameOverOverlay = () => {
    if (!ui?.gameOverScreen) return;
    const over = typeof isGameOver === 'function' ? !!isGameOver() : false;
    if (!over) return;
    if (ui.gameOverScreen.style.display === 'none') return;
    ui.gameOverScreen.style.display = 'none';
    gameOverHiddenByMenu = true;
  };

  const maybeRestoreGameOverOverlay = () => {
    if (!ui?.gameOverScreen) return;
    const over = typeof isGameOver === 'function' ? !!isGameOver() : false;
    if (!over) return;
    if (!gameOverHiddenByMenu) return;
    ui.gameOverScreen.style.display = 'block';
    gameOverHiddenByMenu = false;
  };

  function openShop() {
    maybeHideGameOverOverlay();
    if (typeof openModal === 'function') openModal(ui.shopModal);
    if (typeof renderShop === 'function') {
      let trophyLevels = typeof getTrophyLevels === 'function' ? getTrophyLevels() : null;
      if (!trophyLevels || typeof trophyLevels !== 'object') {
        const trophies = typeof getOwnedTrophies === 'function' ? getOwnedTrophies() : new Set();
        trophyLevels = {};
        if (trophies instanceof Set) {
          for (const id of trophies) {
            if (typeof id === 'string' && id.length > 0) trophyLevels[id] = 1;
          }
        }
      }
      const cash = typeof getCash === 'function' ? getCash() : 0;
      renderShop(ui, trophyLevels, cash, buyTrophy);
    }
    if (typeof syncUltimateShopUi === 'function') syncUltimateShopUi();
  }

  function closeShop() {
    if (typeof closeModal === 'function') closeModal(ui.shopModal);
    maybeRestoreGameOverOverlay();
  }

  function openBoard() {
    maybeHideGameOverOverlay();
    if (typeof openModal === 'function') openModal(ui.boardModal);
    const loaded = typeof loadLeaderboard === 'function' ? loadLeaderboard() : [];
    if (typeof setLeaderboard === 'function') setLeaderboard(loaded);
    if (typeof renderScores === 'function') {
      const lb = typeof getLeaderboard === 'function' ? getLeaderboard() : loaded;
      const sortBy = typeof getSortBy === 'function' ? getSortBy() : 'time';
      renderScores(ui, lb, sortBy);
    }
  }

  function closeBoard() {
    if (typeof closeModal === 'function') closeModal(ui.boardModal);
    maybeRestoreGameOverOverlay();
  }

  function setSort(next) {
    if (typeof setSortBy === 'function') setSortBy(next);
    if (typeof renderScores === 'function') {
      const lb = typeof getLeaderboard === 'function' ? getLeaderboard() : [];
      const sortBy = typeof getSortBy === 'function' ? getSortBy() : next;
      renderScores(ui, lb, sortBy);
    }
  }

  function openSettings() {
    hideInGameDropdownMenu();
    if (typeof openModal === 'function') openModal(ui.settingsModal);

    // Sync aim label.
    if (ui?.settingsAimBtn) {
      const enabled = typeof getMouseAimEnabled === 'function' ? !!getMouseAimEnabled() : false;
      ui.settingsAimBtn.textContent = enabled ? 'AIM: MOUSE' : 'AIM: Z/X';
      ui.settingsAimBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
  }

  function closeSettings() {
    if (typeof closeModal === 'function') closeModal(ui.settingsModal);
  }

  function openAbout() {
    hideInGameDropdownMenu();
    if (typeof openModal === 'function') openModal(ui.aboutModal);
  }

  function closeAbout() {
    if (typeof closeModal === 'function') closeModal(ui.aboutModal);
  }

  return {
    openShop,
    closeShop,
    openBoard,
    closeBoard,
    setSort,
    openSettings,
    closeSettings,
    openAbout,
    closeAbout,
  };
}
