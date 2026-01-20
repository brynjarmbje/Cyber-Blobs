import { getUiElements } from './ui.js';
import { createGame } from './game.js';
import { registerServiceWorker } from './pwa.js';
import { initMusic } from './audio.js';

const ui = getUiElements();
if (!ui.canvas) {
  throw new Error('Missing #gameCanvas');
}

registerServiceWorker();

// Theme music (requires a user gesture on mobile). The controller will
// auto-start on the first tap/click if enabled.
const music = initMusic(ui, { src: './CyberBlob-Theme_V1.mp3', volume: 0.35, active: false });

// Only play music while actively playing (paused/gameover => stop).
window.addEventListener('cyberblobs:playstate', (e) => {
  const state = e?.detail?.state;
  music.setActive(state === 'playing');
});

createGame(ui).start();
