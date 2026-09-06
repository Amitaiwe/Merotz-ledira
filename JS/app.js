/* ============ app.js ============
   Wires everything together: top-level event listeners that were at
   the bottom of the original inline script (start button, restart
   buttons, modal close handlers). This is the only file that imports
   from both game.js and ui.js as siblings, matching the original
   code's bottom section 1:1. */

import { newGame } from './game.js';
import { showScreen, closeInfoModal } from './ui.js';

const $ = id => document.getElementById(id);

$('startBtn').addEventListener('click', newGame);
$('winRestart').addEventListener('click', () => showScreen('start'));
$('loseRestart').addEventListener('click', () => showScreen('start'));

$('infoModalClose').addEventListener('click', closeInfoModal);
$('infoModal').addEventListener('click', (e) => {
  if(e.target.id === 'infoModal') closeInfoModal();
});

$('howToClose').addEventListener('click', () => {
  $('howToModal').classList.remove('show');
});
