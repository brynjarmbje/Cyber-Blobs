import { getUiElements } from './ui.js';
import { createGame } from './game.js';
import { registerServiceWorker } from './pwa.js';
import { initMusicSystem } from './audio.js';

const ui = getUiElements();
if (!ui.canvas) {
  throw new Error('Missing #gameCanvas');
}

registerServiceWorker();

// Music system (requires a user gesture on mobile).
// Plays gameplay music while playing; otherwise plays menu music.
const music = initMusicSystem(ui, {
  gameSrc: './CyberBlob-Theme_V1.mp3',
  menuSrc: './CyberBlob-Menu-Theme.mp3',
  stingers: ['./CyberBlob-drum1.mp3', './CyberBlob-whine1.mp3'],
  volumeGame: 0.35,
  volumeMenu: 0.30,
  stingerVolume: 0.55,
  context: 'game',
});

window.addEventListener('cyberblobs:playstate', (e) => {
  /** @type {CustomEvent<{ state?: 'playing' | 'menu' | 'paused' | string }>} */
  const ce = /** @type {any} */ (e);
  const state = ce?.detail?.state;
  music.setContext(state === 'playing' ? 'game' : 'menu');
});

createGame(ui).start();
