// @ts-nocheck

export function initMusic(ui, opts = {}) {
  const src = opts.src || './CyberBlob-Theme_V1.mp3';
  const storageKey = opts.storageKey || 'cyberblobs_music_enabled_v1';
  const initialEnabled = readBool(storageKey, true);
  const initialActive = typeof opts.active === 'boolean' ? opts.active : true;

  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = clampNumber(opts.volume ?? 0.35, 0, 1);

  let enabled = initialEnabled;
  let active = initialActive;
  let unlocked = false;
  let wasPlayingBeforeHide = false;

  const setButtonState = () => {
    const btn = ui?.musicBtn;
    if (!btn) return;
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.classList.toggle('isMuted', !enabled);
    btn.textContent = enabled ? 'MUSIC ON' : 'MUSIC OFF';
    btn.title = enabled ? 'Music enabled (tap to mute)' : 'Music muted (tap to enable)';
  };

  const tryPlay = async () => {
    if (!enabled || !active) return false;
    try {
      await audio.play();
      unlocked = true;
      return true;
    } catch {
      return false;
    }
  };

  const pause = () => {
    try {
      audio.pause();
    } catch {
      // ignore
    }
  };

  const onFirstGesture = async () => {
    if (!enabled || !active) return;
    await tryPlay();
    if (unlocked) removeGestureListeners();
  };

  const gestureTargets = [
    ui?.gameShell,
    ui?.canvas,
    document,
  ].filter(Boolean);

  const addGestureListeners = () => {
    for (const t of gestureTargets) {
      t.addEventListener('pointerdown', onFirstGesture, { passive: true });
      t.addEventListener('touchstart', onFirstGesture, { passive: true });
      t.addEventListener('keydown', onFirstGesture, { passive: true });
    }
  };

  const removeGestureListeners = () => {
    for (const t of gestureTargets) {
      t.removeEventListener('pointerdown', onFirstGesture);
      t.removeEventListener('touchstart', onFirstGesture);
      t.removeEventListener('keydown', onFirstGesture);
    }
  };

  const setEnabled = (nextEnabled) => {
    enabled = !!nextEnabled;
    writeBool(storageKey, enabled);
    setButtonState();

    if (!enabled) {
      pause();
      return;
    }

    // If already unlocked, we can usually resume immediately.
    // Otherwise wait for the next gesture.
    if (unlocked) {
      void tryPlay();
    } else {
      addGestureListeners();
    }
  };

  const setActive = (nextActive) => {
    active = !!nextActive;
    if (!active) {
      pause();
      return;
    }

    if (enabled) {
      if (unlocked) void tryPlay();
      else addGestureListeners();
    }
  };

  const toggle = () => setEnabled(!enabled);

  if (ui?.musicBtn) {
    ui.musicBtn.addEventListener('click', async () => {
      // Clicking counts as a gesture, so it can unlock audio.
      if (!enabled) {
        setEnabled(true);
        await tryPlay();
        if (unlocked) removeGestureListeners();
        return;
      }
      setEnabled(false);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!enabled || !active) return;

    if (document.hidden) {
      wasPlayingBeforeHide = !audio.paused;
      pause();
      return;
    }

    if (wasPlayingBeforeHide) {
      // Attempt resume; if blocked (rare after unlock), gesture will handle it.
      void tryPlay();
    }
  });

  // Prime.
  setButtonState();
  if (enabled && active) addGestureListeners();

  return {
    audio,
    isEnabled: () => enabled,
    isActive: () => active,
    toggle,
    play: tryPlay,
    pause,
    setEnabled,
    setActive,
  };
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
