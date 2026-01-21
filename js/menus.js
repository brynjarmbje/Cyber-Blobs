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
  ui.tryAgainBtn?.addEventListener('click', () => {
    const maxStart = typeof getMaxStartLevelUnlocked === 'function' ? getMaxStartLevelUnlocked() : 0;
    if (maxStart >= 10 && typeof openLevelSelect === 'function') openLevelSelect({ allowBackToMenu: false });
    else if (typeof startRunFromLevel === 'function') startRunFromLevel(1);
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
    if (typeof startRunFromLevel === 'function') startRunFromLevel(lv);
  });

  ui.closeLevelSelectBtn?.addEventListener('click', () => {
    if (typeof closeLevelSelect === 'function') closeLevelSelect();
    if (typeof isInMainMenu === 'function' && isInMainMenu()) return;
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
