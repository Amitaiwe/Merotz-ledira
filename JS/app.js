/* ============ app.js ============
   Wires everything together: top-level event listeners that were at
   the bottom of the original inline script (start button, restart
   buttons, modal close handlers). This is the only file that imports
   from both game.js and ui.js as siblings, matching the original
   code's bottom section 1:1. */

import { newGame, proceedAfterMonthSummary } from './game.js';
import { showScreen, closeInfoModal, closeMonthSummary } from './ui.js';

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

$('monthSummaryContinue').addEventListener('click', () => {
  const btn = $('monthSummaryContinue');
  // explicit guard, in addition to the disabled attribute itself, so a
  // double-advance can't happen even if a click somehow fires after the
  // button was already disabled (belt-and-suspenders on top of the
  // browser's native "disabled buttons don't dispatch clicks" behavior)
  if(btn.disabled) return;
  btn.disabled = true;
  closeMonthSummary();
  proceedAfterMonthSummary();
});
