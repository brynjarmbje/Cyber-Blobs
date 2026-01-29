import { getUiElements } from '../ui/ui.js';
import { createGame } from '../game/game.js';
import { registerServiceWorker } from '../platform/pwa.js';
import { initMusicSystem } from '../platform/audio.js';

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
  overSrc: './CyberBlob-SpaceFlow.mp3',
  stingers: ['./CyberBlob-drum1.mp3', './CyberBlob-whine1.mp3'],
  volumeGame: 0.35,
  volumeMenu: 0.30,
  volumeOver: 0.32,
  stingerVolume: 0.55,
  context: 'menu',
});

function onPlayStateEvent(/** @type {Event} */ e) {
  /** @type {CustomEvent<{ state?: string }>} */
  const ce = /** @type {any} */ (e);
  const state = ce?.detail?.state;
  if (typeof state !== 'string') return;

  if (state === 'menu') music.setContext('menu');
  else if (state === 'gameover') music.setContext('over');
  else music.setContext('game');
}

// Backward compatibility (older builds used cyberblobs:playstate)
window.addEventListener('cyberyolks:playstate', onPlayStateEvent);
window.addEventListener('cyberblobs:playstate', onPlayStateEvent);

createGame(ui).start();
