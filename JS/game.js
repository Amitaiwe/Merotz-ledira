/* ============ game.js ============
   Game state and game-flow logic: building turns, the central money
   ledger, the daily-choice mechanic (lifestyle drift on fixed
   expenses), investment opportunities, monthly cashflow/inflation,
   and win/lose decisions.

   NOTE: a few lines here still touch the DOM directly (disabling
   buttons to prevent double-clicks, writing the turn counter, reading
   the nickname input) because in the original code these were single
   inline statements inside otherwise pure game-flow functions. Moving
   just those lines into ui.js would have meant passing extra
   parameters through several functions purely to relocate one
   statement each — a structural change beyond "just relocate the
   code", so per the instruction to preserve behavior over strict
   layering, they stay here using the imported `$` helper. This is
   disclosed explicitly in the summary. */

import { CONFIG, QUESTIONS, INVESTMENTS, WIN_QUOTES, LOSE_QUOTES, BANKRUPT_QUOTES } from './data.js';
import { $, fmt, showScreen, updateStats, renderQuestion, renderOpportunity, showToast, showMonthSummary, renderWinScreen, renderLoseScreen } from './ui.js';
import { recordGamePlayed, recordGameWon, saveNickname } from './firebase.js';

export let state = {};

export const rand = (min,max) => Math.random()*(max-min)+min;
export const randInt = (min,max) => Math.floor(rand(min,max+1));
export const pickRandom = arr => arr[Math.floor(Math.random()*arr.length)];

export function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

/* ============ CENTRAL MONEY LEDGER ============
   Every change to the checking account or to fixed expenses goes
   through one of these two functions, tagged with its source
   (currently just a string, for future traceability). This is what
   keeps the different systems that touch money — monthly cashflow,
   investment opportunities, and daily-choice lifestyle drift — from
   silently overlapping or getting mixed into monthSummary in a way
   that can't be traced back to its cause. Nothing else in the
   codebase should mutate state.checkingAccount / state.fixedExpenses
   directly. */
export function applyCheckingChange(amount, source){
  state.checkingAccount = Math.max(0, state.checkingAccount + amount);
}

export function applyExpenseChange(percent, source){
  const next = state.fixedExpenses * (1 + percent);
  state.fixedExpenses = Math.max(CONFIG.minFixedExpenses, next);
}

/* ============ GAME SETUP ============ */
export function buildSlots(){
  const gameLength = CONFIG.maxTurns;
  const numOpportunities = Math.floor(gameLength / CONFIG.opportunityEvery);
  const numQuestions = gameLength - numOpportunities;

  const questionPool = shuffle(QUESTIONS).slice(0, numQuestions);
  const investmentPool = shuffle(INVESTMENTS);

  let slots = [];
  let qi = 0, ii = 0;
  for(let turn=1; turn<=gameLength; turn++){
    if(turn % CONFIG.opportunityEvery === 0){
      slots.push({ type:'opportunity', data: investmentPool[ii % investmentPool.length] });
      ii++;
    } else {
      slots.push({ type:'question', data: questionPool[qi] });
      qi++;
    }
  }
  return { slots, gameLength };
}

export function newGame(){
  const built = buildSlots();
  const nicknameRaw = $('nicknameInput').value.trim();
  state = {
    checkingAccount: CONFIG.startChecking,
    apartmentPrice: CONFIG.startApartmentPrice,
    investmentPortfolio: 0,
    salary: CONFIG.startSalary,
    fixedExpenses: CONFIG.startFixedExpenses,
    monthSummary: null,
    slots: built.slots,
    index: 0,
    total: built.gameLength,
    nickname: nicknameRaw
  };
  recordGamePlayed();
  if(nicknameRaw) saveNickname(nicknameRaw);
  updateStats(false);
  renderSlot();
  showScreen('game');
}

export function renderSlot(){
  const slot = state.slots[state.index];
  $('qCounter').textContent = 'תור ' + (state.index+1);
  if(slot.type === 'question'){
    renderQuestion(slot.data);
  } else {
    renderOpportunity(slot.data);
  }
}

/* ---------- daily choice: shifts fixed expenses only, never checking ---------- */
export function chooseOption(tier, btnEl){
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);

  const impact = CONFIG.expenseImpact[tier];
  const percent = rand(impact.min, impact.max);
  applyExpenseChange(percent, 'daily-choice');

  applyInflationAndAdvance();
}

export function resolveInvestment(inv, chancePct, cost, totalReturn, investBtn, skipBtn){
  investBtn.disabled = true;
  skipBtn.disabled = true;

  applyCheckingChange(-cost, 'investment');
  updateStats(true);

  const cardEl = $('mainCard');
  const gaugeEl = $('oppGauge');
  const pctEl = $('oppPct');
  const resultEl = $('oppResult');

  gaugeEl.classList.add('spinning');
  resultEl.className = 'opp-result pending';

  let dots = 0;
  const dotsTimer = setInterval(() => {
    dots = (dots+1) % 4;
    pctEl.textContent = '·'.repeat(dots || 1);
    resultEl.textContent = 'בודק תוצאה' + '.'.repeat(dots+1);
  }, 260);

  const success = Math.random()*100 < chancePct;
  const waitTime = 1600 + Math.random()*500;

  setTimeout(() => {
    clearInterval(dotsTimer);
    gaugeEl.classList.remove('spinning');
    pctEl.textContent = chancePct + '%';

    cardEl.classList.remove('flash-win','flash-lose');
    void cardEl.offsetWidth;

    if(success){
      const gain = totalReturn - cost;
      applyCheckingChange(gain, 'investment');
      resultEl.className = 'opp-result win';
      resultEl.textContent = 'ההשקעה הצליחה! +' + fmt(gain);
      cardEl.classList.add('flash-win');
    } else {
      resultEl.className = 'opp-result lose';
      resultEl.textContent = 'ההשקעה נכשלה. הכסף אבד.';
      cardEl.classList.add('flash-lose');
    }
    updateStats(true);
  }, waitTime);

  setTimeout(() => {
    applyInflationAndAdvance();
  }, waitTime + 1200);
}

/* ---------- shared flow: monthly cashflow + apartment-price inflation ---------- */
export function applyInflationAndAdvance(){
  const salaryBefore = state.salary;
  const fixedExpensesBefore = state.fixedExpenses;
  const checkingBefore = state.checkingAccount;
  const investmentPortfolioBefore = state.investmentPortfolio;
  const apartmentPriceBefore = state.apartmentPrice;

  state.salary *= (1 + rand(CONFIG.salaryGrowth.min, CONFIG.salaryGrowth.max));
  const monthlyCashFlow = state.salary - state.fixedExpenses;
  applyCheckingChange(monthlyCashFlow, 'monthly-cashflow');

  state.apartmentPrice *= (1 + rand(CONFIG.inflation.min, CONFIG.inflation.max));

  state.monthSummary = {
    salaryBefore, salaryAfter: state.salary,
    fixedExpensesBefore, fixedExpensesAfter: state.fixedExpenses,
    checkingBefore, checkingAfter: state.checkingAccount,
    investmentPortfolioBefore, investmentPortfolioAfter: state.investmentPortfolio,
    apartmentPriceBefore, apartmentPriceAfter: state.apartmentPrice
  };

  setTimeout(() => {
    updateStats(true);
    showToast('מחיר הדירה עלה');
    showMonthSummary(state.monthSummary);
  }, 250);
}

export function proceedAfterMonthSummary(){
  const totalWealth = state.checkingAccount + state.investmentPortfolio;
  if(totalWealth >= state.apartmentPrice){
    finishGame(true);
    return;
  }
  if(totalWealth < state.apartmentPrice * CONFIG.bankruptcyThreshold){
    finishGame(false, 'bankrupt');
    return;
  }
  state.index++;
  if(state.index >= state.total){
    finishGame(false, 'timeout');
    return;
  }
  renderSlot();
}

export function finishGame(won, reason){
  const turnsTaken = state.index + 1;

  if(won){
    recordGameWon(turnsTaken, state.nickname);
    renderWinScreen(pickRandom(WIN_QUOTES));
  } else {
    renderLoseScreen(pickRandom(reason === 'bankrupt' ? BANKRUPT_QUOTES : LOSE_QUOTES));
  }
}
