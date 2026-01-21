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
// - Plays game over music when context === 'over' (optional)
// - Stops all when context === 'off'
// Also supports random "stingers" fired exactly when a loop restarts.
export function initMusicSystem(ui, opts = {}) {
  const storageKey = opts.storageKey || 'cyberblobs_music_enabled_v1';
  const initialEnabled = readBool(storageKey, true);

  const gameSrc = opts.gameSrc || './CyberBlob-Theme_V1.mp3';
  const menuSrc = typeof opts.menuSrc === 'string' ? opts.menuSrc : './CyberBlob-Menu-Theme.mp3';
  const overSrc = typeof opts.overSrc === 'string' ? opts.overSrc : null;
  const stingers = Array.isArray(opts.stingers)
    ? opts.stingers
    : ['./CyberBlob-drum1.mp3', './CyberBlob-whine1.mp3'];

  const volumeGame = clampNumber(opts.volumeGame ?? 0.35, 0, 1);
  const volumeMenu = clampNumber(opts.volumeMenu ?? 0.30, 0, 1);
  const volumeOver = clampNumber(opts.volumeOver ?? 0.32, 0, 1);
  const stingerVolume = clampNumber(opts.stingerVolume ?? 0.55, 0, 1);

  // Stinger frequency controls (stingers are *extras*):
  // - Only evaluated at loop boundaries / restarts so they stay in sync.
  // - Default: ~1 in 10 loops on average.
  const stingerChancePerLoop = clampNumber(opts.stingerChancePerLoop ?? 0.10, 0, 1);
  const stingerMinLoopsBetween = Math.max(0, Math.floor(opts.stingerMinLoopsBetween ?? 6));

  // Try to use WebAudio for near-gapless looping. Some MP3s include encoder padding;
  // trimming silence helps remove audible gaps.
  const preferWebAudio = opts.preferWebAudio !== false;
  const trimSilence = opts.trimSilence !== false;

  let enabled = initialEnabled;
  let context = opts.context === 'menu' || opts.context === 'over' || opts.context === 'off' ? opts.context : 'game';

  /** @type {AudioContext|null} */
  let audioCtx = null;

  const game = createMusicTrack(gameSrc, volumeGame, { preferWebAudio, trimSilence });
  const menu = menuSrc ? createMusicTrack(menuSrc, volumeMenu, { preferWebAudio, trimSilence }) : null;
  const over = overSrc ? createMusicTrack(overSrc, volumeOver, { preferWebAudio, trimSilence }) : null;
  const stingerPool = createStingerPool(stingers, stingerVolume);

  let wasPlayingBeforeHide = false;
  let hiddenContext = context;
  let hiddenTrack = null;

  function activeTrack() {
    if (context === 'game') return game;
    if (context === 'menu') return menu || game;
    if (context === 'over') return over || menu || game;
    return null;
  }

  function canAutoplay(track) {
    return !!track && track.unlocked === true;
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
    if (over) over.pause();
  }

  function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  let lastStingerSrc = null;

  function pickRandomNotSame(arr, getKey) {
    if (!arr || arr.length === 0) return null;
    if (arr.length === 1) return arr[0];

    // Try a few times to avoid repeats.
    for (let i = 0; i < 6; i++) {
      const cand = arr[Math.floor(Math.random() * arr.length)];
      const key = typeof getKey === 'function' ? getKey(cand) : cand;
      if (key !== lastStingerSrc) return cand;
    }
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const loopCounts = { game: 0, menu: 0 };
  const loopsSinceStinger = { game: 9999, menu: 9999 };

  function shouldPlayStinger(trackKey) {
    if (trackKey !== 'game' && trackKey !== 'menu') return false;

    loopCounts[trackKey] += 1;
    loopsSinceStinger[trackKey] += 1;

    // Always keep some space between stingers.
    if (loopsSinceStinger[trackKey] < stingerMinLoopsBetween) return false;

    // Random chance per loop (e.g., 0.10 ≈ 1 out of 10 loops).
    if (Math.random() > stingerChancePerLoop) return false;

    loopsSinceStinger[trackKey] = 0;
    return true;
  }

  function playStinger(trackKey) {
    if (!enabled) return;
    if (!shouldPlayStinger(trackKey)) return;

    const available = stingerPool.filter((s) => s.unlocked);
    const s = pickRandomNotSame(available, (x) => x?.src);
    if (!s) return;

    try {
      s.audio.pause();
      s.audio.currentTime = 0;
      s.audio.volume = s.volume;
    } catch {
      // ignore
    }
    lastStingerSrc = s.src;
    void s.audio.play().catch(() => {});
  }

  async function unlockAudioElement(audio) {
    // iOS/Safari may require a gesture for *each* audio element.
    // We unlock by playing silently for a tick, then pausing and rewinding.
    const prevVol = audio.volume;
    try {
      audio.volume = 0;
      await audio.play();
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // ignore
      }
      audio.volume = prevVol;
      return true;
    } catch {
      try {
        audio.volume = prevVol;
      } catch {
        // ignore
      }
      return false;
    }
  }

  async function unlockAllAudio() {
    // Run only from a user gesture handler.
    if (preferWebAudio) {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await audioCtx.resume();
      } catch {
        // If WebAudio isn't available, we fall back to HTMLAudio.
        audioCtx = null;
      }
    }

    const results = [];

    // Unlock long tracks. Prefer WebAudio unlock (AudioContext.resume) if available.
    if (audioCtx) {
      game.unlocked = true;
      results.push(true);
      if (menu) {
        menu.unlocked = true;
        results.push(true);
      }
      if (over) {
        over.unlocked = true;
        results.push(true);
      }
    } else {
      results.push(await unlockAudioElement(game.audio));
      if (results[results.length - 1]) game.unlocked = true;

      if (menu) {
        results.push(await unlockAudioElement(menu.audio));
        if (results[results.length - 1]) menu.unlocked = true;
      }

      if (over) {
        results.push(await unlockAudioElement(over.audio));
        if (results[results.length - 1]) over.unlocked = true;
      }
    }

    for (const s of stingerPool) {
      const ok = await unlockAudioElement(s.audio);
      if (ok) s.unlocked = true;
    }

    // If we couldn't unlock the active track, we'll keep gesture listeners.
    return results.some(Boolean);
  }

  async function ensurePlaying(track, { restart = false } = {}) {
    if (!enabled || context === 'off' || !track) return false;

    // Stop the other track so we never overlap.
    if (track !== game) game.pause();
    if (menu && track !== menu) menu.pause();
    if (over && track !== over) over.pause();

    const wasStarted = track.hasStarted === true;

    try {
      const ok = await track.play({
        audioCtx,
        restart,
        // Schedule a stinger exactly at loop boundaries.
        onLoop: () => {
          // Only fire if we're still in the right context when the loop boundary hits.
          if (!enabled) return;
          if (track === game && context !== 'game') return;
          if (track === menu && context !== 'menu') return;
          if (track === over && context !== 'over') return;
          playStinger(track === game ? 'game' : 'menu');
        },
      });

      if (!ok) return false;

      track.unlocked = true;
      track.hasStarted = true;

      // Optionally play a stinger at the moment the track (re)starts.
      // This is still gated by the rarity logic above.
      if (restart || !wasStarted) playStinger(track === game ? 'game' : 'menu');

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

    // Unlock all tracks + stingers on first user gesture.
    await unlockAllAudio();

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

    // Try immediately if the active track is unlocked; otherwise wait for gesture.
    const t = activeTrack();
    if (canAutoplay(t)) void ensurePlaying(t, { restart: !t?.hasStarted });
    else addGestureListeners();
  }

  function toggle() {
    setEnabled(!enabled);
  }

  function setContext(nextContext) {
    const next =
      nextContext === 'menu' || nextContext === 'over' || nextContext === 'off' ? nextContext : 'game';
    if (context === next) return;
    context = next;

    if (context === 'off' || !enabled) {
      pauseAll();
      return;
    }

    const t = activeTrack();
    if (canAutoplay(t)) void ensurePlaying(t, { restart: !t?.hasStarted });
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

  if (ui?.musicBtn) {
    ui.musicBtn.addEventListener('click', async () => {
      // Click counts as a gesture and can unlock audio.
      if (!enabled) {
        setEnabled(true);

        await unlockAllAudio();

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
      const t = hiddenContext === 'game' ? game : hiddenContext === 'over' ? (over || menu || game) : (menu || game);
      if (canAutoplay(t)) void ensurePlaying(t, { restart: false });
      else addGestureListeners();
    }
  });

  // Prime.
  setButtonState();
  // Preload so the first play after gesture is fast.
  void game.audio.load?.();
  void menu?.audio.load?.();
  void over?.audio.load?.();
  for (const s of stingerPool) void s.audio.load?.();
  if (enabled && !canAutoplay(activeTrack()) && context !== 'off') addGestureListeners();

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
      overAudio: over?.audio || null,
      stingers: stingerPool.map((s) => s.audio),
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
    unlocked: false,
    pause: () => {
      try {
        audio.pause();
      } catch {
        // ignore
      }
    },
  };
}

function createMusicTrack(src, volume, { preferWebAudio, trimSilence }) {
  const base = createTrack(src, volume);

  // WebAudio playback state
  base._wa = {
    prefer: !!preferWebAudio,
    trimSilence: !!trimSilence,
    buffer: null,
    gain: null,
    source: null,
    startedAt: 0,
    offset: 0,
    duration: 0,
    loopTimer: null,
    onLoop: null,
    loading: null,
  };

  base.play = async ({ audioCtx, restart, onLoop }) => {
    base._wa.onLoop = typeof onLoop === 'function' ? onLoop : null;

    // Prefer WebAudio if we have a running AudioContext.
    if (base._wa.prefer && audioCtx) {
      const ok = await playWebAudioLoop(base, audioCtx, { restart });
      return ok;
    }

    // Fallback to HTMLAudio.
    try {
      if (restart) {
        base.audio.currentTime = 0;
      }
      await base.audio.play();
      return true;
    } catch {
      return false;
    }
  };

  const oldPause = base.pause;
  base.pause = () => {
    stopWebAudio(base);
    oldPause();
  };

  return base;
}

async function playWebAudioLoop(track, audioCtx, { restart }) {
  // Ensure buffer loaded
  if (!track._wa.buffer) {
    if (!track._wa.loading) {
      track._wa.loading = (async () => {
        const res = await fetch(track.audio.src, { cache: 'force-cache' });
        const arr = await res.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arr);
        track._wa.buffer = track._wa.trimSilence ? trimSilenceFromBuffer(audioCtx, decoded) : decoded;
        track._wa.duration = track._wa.buffer.duration || 0;
      })();
    }
    await track._wa.loading;
  }

  const buffer = track._wa.buffer;
  if (!buffer || !track._wa.duration) return false;

  // Stop existing
  stopWebAudio(track);

  if (restart) track._wa.offset = 0;

  const gain = audioCtx.createGain();
  gain.gain.value = clampNumber(track.audio.volume, 0, 1);
  gain.connect(audioCtx.destination);

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = 0;
  source.loopEnd = buffer.duration;
  source.connect(gain);

  const startAt = audioCtx.currentTime + 0.02;
  const offset = track._wa.offset % buffer.duration;
  track._wa.startedAt = startAt;
  track._wa.gain = gain;
  track._wa.source = source;

  // Schedule loop-boundary stingers with a timer (WebAudio itself is seamless).
  scheduleLoopCallback(track, audioCtx);

  try {
    source.start(startAt, offset);
    return true;
  } catch {
    stopWebAudio(track);
    return false;
  }
}

function stopWebAudio(track) {
  const wa = track?._wa;
  if (!wa) return;

  // Update offset if we were playing.
  try {
    if (wa.source && wa.duration) {
      const now = (track._wa_ctx_currentTime || 0);
      // We can't access currentTime directly here without ctx; offset will be reset on resume.
      // This function is used mainly for "pause" semantics, where loop continuity is not critical.
    }
  } catch {
    // ignore
  }

  if (wa.loopTimer) {
    clearTimeout(wa.loopTimer);
    wa.loopTimer = null;
  }

  try {
    wa.source?.stop?.();
  } catch {
    // ignore
  }

  try {
    wa.source?.disconnect?.();
  } catch {
    // ignore
  }

  try {
    wa.gain?.disconnect?.();
  } catch {
    // ignore
  }

  wa.source = null;
  wa.gain = null;
}

function scheduleLoopCallback(track, audioCtx) {
  const wa = track?._wa;
  if (!wa || !wa.source || !wa.duration) return;

  if (wa.loopTimer) {
    clearTimeout(wa.loopTimer);
    wa.loopTimer = null;
  }

  const onLoop = wa.onLoop;
  if (typeof onLoop !== 'function') return;

  // First boundary from current offset.
  const bufferDur = wa.duration;
  const startedAt = wa.startedAt;
  const offset = wa.offset % bufferDur;
  const firstIn = Math.max(0.01, bufferDur - offset);

  const scheduleNext = (inSeconds) => {
    wa.loopTimer = setTimeout(() => {
      try {
        onLoop();
      } finally {
        scheduleNext(bufferDur);
      }
    }, Math.max(10, Math.floor(inSeconds * 1000)));
  };

  // Align to the loop boundary.
  // Account for the startAt scheduling delay.
  const now = audioCtx.currentTime;
  const timeUntilStart = Math.max(0, startedAt - now);
  scheduleNext(timeUntilStart + firstIn);
}

function trimSilenceFromBuffer(audioCtx, buffer) {
  // Remove leading/trailing near-silence to reduce MP3 padding gaps.
  // Conservative threshold to avoid cutting quiet intros/outros.
  const threshold = 1e-4;
  const minKeep = Math.min(buffer.length, Math.floor(buffer.sampleRate * 0.20));

  const ch0 = buffer.getChannelData(0);
  const len = buffer.length;

  let start = 0;
  while (start < len - minKeep && Math.abs(ch0[start]) < threshold) start++;

  let end = len - 1;
  while (end > start + minKeep && Math.abs(ch0[end]) < threshold) end--;

  // Add a tiny pad so we don't cut transients.
  const pad = Math.floor(buffer.sampleRate * 0.01);
  start = Math.max(0, start - pad);
  end = Math.min(len - 1, end + pad);

  const newLen = Math.max(1, end - start + 1);
  if (newLen >= len * 0.995) return buffer;

  const out = audioCtx.createBuffer(buffer.numberOfChannels, newLen, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(start, start + newLen));
  }
  return out;
}

function createStingerPool(srcList, volume) {
  const pool = [];
  for (const src of Array.isArray(srcList) ? srcList : []) {
    if (typeof src !== 'string' || src.trim().length === 0) continue;
    const audio = new Audio(src);
    audio.loop = false;
    audio.preload = 'auto';
    audio.volume = clampNumber(volume, 0, 1);
    pool.push({ src, audio, unlocked: false, volume: clampNumber(volume, 0, 1) });
  }
  return pool;
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
