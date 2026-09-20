/* ============ app.js ============
   Wires everything together: top-level event listeners (start screen,
   continue/new game, restart buttons, modal close handlers). */

import { newGame, continueGame, proceedAfterMonthSummary } from './game.js';
import { hasSave, clearSave } from './storage.js';
import { showScreen, closeInfoModal, closeMonthSummary,
         openPortfolioModal, closePortfolioModal } from './ui.js';

const $ = id => document.getElementById(id);

/* ---------- start screen: continue / new ---------- */
function initStartScreen(){
  const contBtn = $('continueBtn');
  const newBtn  = $('newGameBtn');

  if(hasSave()){
    contBtn.style.display = 'block';
    newBtn.textContent = 'משחק חדש';
  } else {
    contBtn.style.display = 'none';
    newBtn.textContent = 'מתחילים';
  }

  contBtn.onclick = () => {
    if(!continueGame()) newGame();
  };

  newBtn.onclick = () => {
    clearSave();
    newGame();
  };
}

initStartScreen();

/* ---------- restart buttons on win/lose screens ---------- */
$('winRestart').addEventListener('click', () => {
  // return to start; initStartScreen will refresh on next visit
  showScreen('start');
  initStartScreen();
});
$('loseRestart').addEventListener('click', () => {
  showScreen('start');
  initStartScreen();
});

/* ---------- info modal ---------- */
$('infoModalClose').addEventListener('click', closeInfoModal);
$('infoModal').addEventListener('click', (e) => {
  if(e.target.id === 'infoModal') closeInfoModal();
});

/* ---------- how to play ---------- */
$('howToClose').addEventListener('click', () => {
  $('howToModal').classList.remove('show');
});

/* ---------- month summary continue ---------- */
$('monthSummaryContinue').addEventListener('click', () => {
  const btn = $('monthSummaryContinue');
  if(btn.disabled) return;
  btn.disabled = true;
  closeMonthSummary();
  proceedAfterMonthSummary();
});

/* ---------- unified portfolio modal ---------- */
$('portfolioActionBtn').addEventListener('click', openPortfolioModal);
$('portfolioModalClose').addEventListener('click', closePortfolioModal);
$('portfolioModal').addEventListener('click', (e) => {
  if(e.target.id === 'portfolioModal') closePortfolioModal();
});
