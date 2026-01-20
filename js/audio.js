// @ts-nocheck

// Backwards-compatible wrapper (single track).
export function initMusic(ui, opts = {}) {
  const system = initMusicSystem(ui, {
    storageKey: opts.storageKey,
    volumeGame: opts.volume,
    gameSrc: opts.src,
    // No menu track by default.
    menuSrc: null,
    stingers: [],
  });

  // Preserve the old API surface.
  return {
    audio: system._debug?.gameAudio,
    isEnabled: system.isEnabled,
    isActive: () => system.getContext() !== 'off',
    toggle: system.toggle,
    play: system.play,
    pause: system.pause,
    setEnabled: system.setEnabled,
    setActive: (active) => system.setContext(active ? 'game' : 'off'),
  };
}

// Dual-track music system:
// - Plays gameplay music when context === 'game'
// - Plays menu music when context === 'menu'
// - Stops all when context === 'off'
// Also supports random "stingers" fired exactly when a loop restarts.
export function initMusicSystem(ui, opts = {}) {
  const storageKey = opts.storageKey || 'cyberblobs_music_enabled_v1';
  const initialEnabled = readBool(storageKey, true);

  const gameSrc = opts.gameSrc || './CyberBlob-Theme_V1.mp3';
  const menuSrc = typeof opts.menuSrc === 'string' ? opts.menuSrc : './CyberBlob-Menu-Theme.mp3';
  const stingers = Array.isArray(opts.stingers)
    ? opts.stingers
    : ['./CyberBlob-drum1.mp3', './CyberBlob-whine1.mp3'];

  const volumeGame = clampNumber(opts.volumeGame ?? 0.35, 0, 1);
  const volumeMenu = clampNumber(opts.volumeMenu ?? 0.30, 0, 1);
  const stingerVolume = clampNumber(opts.stingerVolume ?? 0.55, 0, 1);

  let enabled = initialEnabled;
  let context = opts.context === 'menu' || opts.context === 'off' ? opts.context : 'game';
  let unlocked = false;

  const game = createTrack(gameSrc, volumeGame);
  const menu = menuSrc ? createTrack(menuSrc, volumeMenu) : null;

  let wasPlayingBeforeHide = false;
  let hiddenContext = context;
  let hiddenTrack = null;

  function activeTrack() {
    if (context === 'game') return game;
    if (context === 'menu') return menu || game;
    return null;
  }

  function setButtonState() {
    const btn = ui?.musicBtn;
    if (!btn) return;
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.classList.toggle('isMuted', !enabled);
    btn.textContent = enabled ? 'MUSIC ON' : 'MUSIC OFF';
    btn.title = enabled ? 'Music enabled (tap to mute)' : 'Music muted (tap to enable)';
  }

  function pauseAll() {
    game.pause();
    if (menu) menu.pause();
  }

  function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function playStinger() {
    if (!enabled || !unlocked) return;
    const src = pickRandom(stingers);
    if (!src) return;

    const a = new Audio(src);
    a.loop = false;
    a.preload = 'auto';
    a.volume = stingerVolume;
    // Fire and forget.
    void a.play().catch(() => {});
  }

  async function ensurePlaying(track, { restart = false } = {}) {
    if (!enabled || context === 'off' || !track) return false;

    // Stop the other track so we never overlap.
    if (track !== game) game.pause();
    if (menu && track !== menu) menu.pause();

    if (restart) {
      try {
        track.audio.currentTime = 0;
      } catch {
        // ignore
      }
    }

    // If starting from the beginning (fresh start or loop restart), fire a stinger.
    const isAtStart = (track.audio.currentTime || 0) < 0.08;
    if (isAtStart) playStinger();

    try {
      await track.audio.play();
      unlocked = true;
      track.hasStarted = true;
      return true;
    } catch {
      return false;
    }
  }

  function addGestureListeners() {
    for (const t of gestureTargets(ui)) {
      t.addEventListener('pointerdown', onFirstGesture, { passive: true });
      t.addEventListener('touchstart', onFirstGesture, { passive: true });
      t.addEventListener('keydown', onFirstGesture, { passive: true });
    }
  }

  function removeGestureListeners() {
    for (const t of gestureTargets(ui)) {
      t.removeEventListener('pointerdown', onFirstGesture);
      t.removeEventListener('touchstart', onFirstGesture);
      t.removeEventListener('keydown', onFirstGesture);
    }
  }

  async function onFirstGesture() {
    if (!enabled || context === 'off') return;
    const t = activeTrack();
    const ok = await ensurePlaying(t, { restart: !t?.hasStarted });
    if (ok) removeGestureListeners();
  }

  function setEnabled(nextEnabled) {
    enabled = !!nextEnabled;
    writeBool(storageKey, enabled);
    setButtonState();

    if (!enabled) {
      pauseAll();
      return;
    }

    // Try immediately if already unlocked; otherwise wait for gesture.
    const t = activeTrack();
    if (unlocked) void ensurePlaying(t, { restart: !t?.hasStarted });
    else addGestureListeners();
  }

  function toggle() {
    setEnabled(!enabled);
  }

  function setContext(nextContext) {
    const next = nextContext === 'menu' || nextContext === 'off' ? nextContext : 'game';
    if (context === next) return;
    context = next;

    if (context === 'off' || !enabled) {
      pauseAll();
      return;
    }

    const t = activeTrack();
    if (unlocked) void ensurePlaying(t, { restart: !t?.hasStarted });
    else addGestureListeners();
  }

  function getContext() {
    return context;
  }

  function play() {
    const t = activeTrack();
    return ensurePlaying(t, { restart: !t?.hasStarted });
  }

  function pause() {
    pauseAll();
  }

  // Hook up looping + stinger on loop restarts.
  game.audio.addEventListener('ended', () => {
    if (!enabled || context !== 'game') return;
    // Restart from beginning; stinger fires at restart.
    void ensurePlaying(game, { restart: true });
  });
  if (menu) {
    menu.audio.addEventListener('ended', () => {
      if (!enabled || context !== 'menu') return;
      void ensurePlaying(menu, { restart: true });
    });
  }

  if (ui?.musicBtn) {
    ui.musicBtn.addEventListener('click', async () => {
      // Click counts as a gesture and can unlock audio.
      if (!enabled) {
        setEnabled(true);
        const t = activeTrack();
        const ok = await ensurePlaying(t, { restart: !t?.hasStarted });
        if (ok) removeGestureListeners();
        return;
      }
      setEnabled(false);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!enabled || context === 'off') return;

    if (document.hidden) {
      hiddenContext = context;
      hiddenTrack = activeTrack();
      wasPlayingBeforeHide = !!hiddenTrack && !hiddenTrack.audio.paused;
      pauseAll();
      return;
    }

    // Resume same context without forcing a restart.
    if (wasPlayingBeforeHide) {
      const t = (hiddenContext === 'game' ? game : (menu || game));
      if (unlocked) void ensurePlaying(t, { restart: false });
      else addGestureListeners();
    }
  });

  // Prime.
  setButtonState();
  // Preload so the first play after gesture is fast.
  void game.audio.load?.();
  void menu?.audio.load?.();
  if (enabled && !unlocked && context !== 'off') addGestureListeners();

  return {
    isEnabled: () => enabled,
    toggle,
    setEnabled,
    setContext,
    getContext,
    play,
    pause,
    // For debugging/back-compat only.
    _debug: {
      gameAudio: game.audio,
      menuAudio: menu?.audio || null,
    },
  };
}

function createTrack(src, volume) {
  const audio = new Audio(src);
  audio.loop = false;
  audio.preload = 'auto';
  audio.volume = clampNumber(volume, 0, 1);
  return {
    audio,
    hasStarted: false,
    pause: () => {
      try {
        audio.pause();
      } catch {
        // ignore
      }
    },
  };
}

function gestureTargets(ui) {
  return [ui?.musicBtn, ui?.gameShell, ui?.canvas, document].filter(Boolean);
}

function readBool(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === '1' || v === 'true';
  } catch {
    return fallback;
  }
}

function writeBool(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // ignore
  }
}

function clampNumber(v, min, max) {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
