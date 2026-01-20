import { getUiElements } from './ui.js';
import { createGame } from './game.js';
import { registerServiceWorker } from './pwa.js';

const ui = getUiElements();
if (!ui.canvas) {
  throw new Error('Missing #gameCanvas');
}

registerServiceWorker();
createGame(ui).start();
