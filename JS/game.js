/* ============ game.js ============
   Game state and game-flow logic: building turns, the central money
   ledger, the daily-choice mechanic (lifestyle drift on fixed
   expenses), investment opportunities, the stock-portfolio engine,
   special investments, monthly cashflow/inflation, and win/lose
   decisions. */

import { CONFIG, QUESTIONS, INVESTMENTS, WIN_QUOTES, LOSE_QUOTES,
         BANKRUPT_QUOTES, BURNOUT_QUOTES, PORTFOLIO_TRACKS,
         SPECIAL_INVESTMENTS } from './data.js';
import { $, fmt, showScreen, updateStats, renderQuestion,
         renderOpportunity, renderSpecialInvestment, showToast,
         showMonthSummary, renderWinScreen, renderLoseScreen } from './ui.js';
import { recordGamePlayed, recordGameWon, saveNickname } from './firebase.js';
import { saveGame, loadGame, clearSave } from './storage.js';

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

/* ============ CENTRAL MONEY LEDGER ============ */
export function applyCheckingChange(amount, source){
  state.checkingAccount = Math.max(0, state.checkingAccount + amount);
}

export function applyExpenseChange(percent, source){
  const next = state.fixedExpenses * (1 + percent);
  state.fixedExpenses = Math.max(CONFIG.minFixedExpenses, next);
}

export function applyPortfolioChange(amount, source){
  state.investmentPortfolio = Math.max(0, state.investmentPortfolio + amount);
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
    const isSpecialTurn = turn % CONFIG.specialInvestmentEveryMonths === 0;
    if(isSpecialTurn){
      // type is decided at render time — depends on whether the player
      // has at least specialInvestmentMinAmount at that moment
      slots.push({ type:'special', data: null });
    } else if(turn % CONFIG.opportunityEvery === 0){
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
    burnout: 0,
    monthSummary: null,
    stockPortfolio: {
      active: false,
      riskTrack: null,
      totalDeposited: 0,
      openedAtTurn: null,
      lastReturnPct: null,
      depositedThisTurn: false
    },
    portfolioClosedAtTurn: null,
    lastPortfolioRealization: null,
    lastSpecialInvestment: null,
    specialInvestment: {
      active: false,
      type: null,
      offeredAtTurn: null,
      rolledChance: null,
      rolledPayout: null,
      rolledLoss: null
    },
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
  saveGame(state);
}

/* ---------- continueGame: restore from localStorage ---------- */
export function continueGame(){
  const saved = loadGame();
  if(!saved) return false;
  // mutate the live `state` object (do NOT reassign — other modules
  // imported it by reference and would keep pointing at the old object)
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, saved);
  // defensive defaults for fields that may be missing in older saves
  if(!state.stockPortfolio) state.stockPortfolio = { active:false, riskTrack:null, totalDeposited:0, openedAtTurn:null, lastReturnPct:null, depositedThisTurn:false };
  if(state.stockPortfolio.depositedThisTurn === undefined) state.stockPortfolio.depositedThisTurn = false;
  if(!state.specialInvestment) state.specialInvestment = { active:false, type:null, offeredAtTurn:null, rolledChance:null, rolledPayout:null, rolledLoss:null };
  if(state.lastSpecialInvestment === undefined) state.lastSpecialInvestment = null;

  updateStats(false);
  renderSlot();
  showScreen('game');
  return true;
}

/* ============ STOCK PORTFOLIO ENGINE ============ */

function pickWeightedReturn(returns){
  const totalWeight = returns.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * totalWeight;
  for(const r of returns){
    if(roll < r.weight) return r.pct;
    roll -= r.weight;
  }
  return returns[returns.length - 1].pct;
}

export function canOpenNewPortfolio(){
  if(state.stockPortfolio.active) return false;
  if(state.portfolioClosedAtTurn === null) return true;
  return (state.index + 1) > state.portfolioClosedAtTurn;
}

export function openPortfolio(track, percent){
  if(!canOpenNewPortfolio()) return;
  if(track !== 'conservative' && track !== 'risky') return;

  const amount = state.checkingAccount * percent;
  applyCheckingChange(-amount, 'portfolio-open');
  applyPortfolioChange(amount, 'portfolio-open');

  state.stockPortfolio = {
    active: true,
    riskTrack: track,
    totalDeposited: amount,
    openedAtTurn: state.index + 1,
    lastReturnPct: null,
    depositedThisTurn: true
  };
  saveGame(state);
}

export function depositToPortfolio(percent){
  if(!state.stockPortfolio.active) return;
  if(state.stockPortfolio.depositedThisTurn) return; // once per month

  const amount = state.checkingAccount * percent;
  applyCheckingChange(-amount, 'portfolio-deposit');
  applyPortfolioChange(amount, 'portfolio-deposit');
  state.stockPortfolio.totalDeposited += amount;
  state.stockPortfolio.depositedThisTurn = true;
  saveGame(state);
}

export function canRealizePortfolio(){
  if(!state.stockPortfolio.active) return false;
  if(state.stockPortfolio.depositedThisTurn) return false; // no realize in the same month as a deposit
  return (state.index + 1) % CONFIG.portfolioRealizeEveryMonths === 0;
}

export function realizePortfolio(){
  if(!canRealizePortfolio()) return;

  const grossValue = state.investmentPortfolio;
  const profit = grossValue - state.stockPortfolio.totalDeposited;
  const tax = profit > 0 ? profit * CONFIG.portfolioTaxRate : 0;
  const netReturned = grossValue - tax;

  applyPortfolioChange(-grossValue, 'portfolio-realize');
  applyCheckingChange(netReturned, 'portfolio-realize');

  state.lastPortfolioRealization = {
    turn: state.index + 1,
    grossValue, profit, tax, netReturned
  };
  state.portfolioClosedAtTurn = state.index + 1;
  state.stockPortfolio = {
    active: false, riskTrack: null, totalDeposited: 0,
    openedAtTurn: null, lastReturnPct: null, depositedThisTurn: false
  };
  saveGame(state);
}

function applyPortfolioMonthlyReturn(){
  if(!state.stockPortfolio.active) return;
  const track = PORTFOLIO_TRACKS[state.stockPortfolio.riskTrack];
  const returnPct = pickWeightedReturn(track.returns);
  applyPortfolioChange(state.investmentPortfolio * returnPct, 'portfolio-return');
  state.stockPortfolio.lastReturnPct = returnPct;
}

/* ============ SPECIAL INVESTMENT ============ */
export function isSpecialInvestmentMonth(){
  return (state.index + 1) % CONFIG.specialInvestmentEveryMonths === 0;
}

function pickWeightedSpecialInvestment(){
  const totalWeight = SPECIAL_INVESTMENTS.reduce((s,inv) => s + inv.appearanceWeight, 0);
  let roll = Math.random() * totalWeight;
  for(const inv of SPECIAL_INVESTMENTS){
    if(roll < inv.appearanceWeight) return inv;
    roll -= inv.appearanceWeight;
  }
  return SPECIAL_INVESTMENTS[SPECIAL_INVESTMENTS.length - 1];
}

function maybeGenerateSpecialInvestment(){
  if(!isSpecialInvestmentMonth()){
    state.specialInvestment = { active:false, type:null, offeredAtTurn:null, rolledChance:null, rolledPayout:null, rolledLoss:null };
    return;
  }
  if(state.checkingAccount < CONFIG.specialInvestmentMinAmount){
    // no offer — renderSlot will fall back to a plain question
    state.specialInvestment = { active:false, type:null, offeredAtTurn:null, rolledChance:null, rolledPayout:null, rolledLoss:null };
    return;
  }
  const inv = pickWeightedSpecialInvestment();
  const rolledChance = rand(inv.chanceRange[0], inv.chanceRange[1]);
  const rolledPayout = rand(inv.payoutRange[0], inv.payoutRange[1]);
  const rolledLoss   = rand(inv.lossRange[0],   inv.lossRange[1]);
  state.specialInvestment = {
    active: true,
    type: inv.key,
    offeredAtTurn: state.index + 1,
    rolledChance, rolledPayout, rolledLoss
  };
}

export function investSpecial(percent){
  if(!state.specialInvestment.active) return null;
  const inv = SPECIAL_INVESTMENTS.find(i => i.key === state.specialInvestment.type);
  if(!inv) return null;

  const amount = state.checkingAccount * percent;
  if(amount <= 0) return null;

  applyCheckingChange(-amount, 'special-investment');
  const success = Math.random() * 100 < state.specialInvestment.rolledChance;
  const multiplier = success ? state.specialInvestment.rolledPayout : state.specialInvestment.rolledLoss;
  const returned = amount * multiplier;
  applyCheckingChange(returned, 'special-investment');

  const result = {
    type: inv.key,
    name: inv.name,
    amount,
    success,
    multiplier,
    returned,
    profit: returned - amount,
    chancePct: state.specialInvestment.rolledChance
  };
  state.lastSpecialInvestment = result;
  state.specialInvestment = { active:false, type:null, offeredAtTurn:null, rolledChance:null, rolledPayout:null, rolledLoss:null };
  updateStats(true);
  saveGame(state);
  return result;
}

export function skipSpecialInvestment(){
  state.specialInvestment = { active:false, type:null, offeredAtTurn:null, rolledChance:null, rolledPayout:null, rolledLoss:null };
}

export function getSpecialInvestmentType(){
  if(!state.specialInvestment.active) return null;
  return SPECIAL_INVESTMENTS.find(i => i.key === state.specialInvestment.type) || null;
}

/* ============ RENDER SLOT ============ */
export function renderSlot(){
  const slot = state.slots[state.index];
  $('qCounter').textContent = 'תור ' + (state.index+1);
  if(slot.type === 'question'){
    renderQuestion(slot.data);
  } else if(slot.type === 'opportunity'){
    renderOpportunity(slot.data);
  } else if(slot.type === 'special'){
    if(state.specialInvestment.active){
      const inv = getSpecialInvestmentType();
      if(inv) renderSpecialInvestment(inv);
      else renderQuestion(QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)]);
    } else {
      // no offer (insufficient funds) — fall back to a plain question
      renderQuestion(QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)]);
    }
  }
}

/* ---------- daily choice ---------- */
export function chooseOption(tier, btnEl){
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);

  const fixedExpensesBeforeChoice = state.fixedExpenses;

  const impact = CONFIG.expenseImpact[tier];
  const percent = rand(impact.min, impact.max);
  applyExpenseChange(percent, 'daily-choice');

  state.burnout = Math.max(0, Math.min(100, state.burnout + CONFIG.burnoutDeltas[tier]));
  updateStats(true);

  if(state.burnout >= CONFIG.burnoutLoseThreshold){
    setTimeout(() => finishGame(false, 'burnout'), 400);
    return;
  }

  applyInflationAndAdvance(fixedExpensesBeforeChoice);
}

/* ---------- regular investment ---------- */
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

/* ---------- shared flow: monthly cashflow + inflation ---------- */
export function applyInflationAndAdvance(fixedExpensesBeforeOverride){
  const salaryBefore = state.salary;
  const fixedExpensesBefore = (fixedExpensesBeforeOverride !== undefined)
    ? fixedExpensesBeforeOverride
    : state.fixedExpenses;
  const checkingBefore = state.checkingAccount;
  const investmentPortfolioBefore = state.investmentPortfolio;
  const apartmentPriceBefore = state.apartmentPrice;

  state.salary *= (1 + rand(CONFIG.salaryGrowth.min, CONFIG.salaryGrowth.max));
  const monthlyCashFlow = state.salary - state.fixedExpenses;
  applyCheckingChange(monthlyCashFlow, 'monthly-cashflow');

  state.apartmentPrice *= (1 + rand(CONFIG.inflation.min, CONFIG.inflation.max));

  // portfolio monthly return — only if there is an active portfolio
  const hadActivePortfolio = state.stockPortfolio.active;
  applyPortfolioMonthlyReturn();

  // special-investment offer generation — only on the 6/12/18... months
  maybeGenerateSpecialInvestment();

  state.monthSummary = {
    salaryBefore, salaryAfter: state.salary,
    fixedExpensesBefore, fixedExpensesAfter: state.fixedExpenses,
    checkingBefore, checkingAfter: state.checkingAccount,
    investmentPortfolioBefore, investmentPortfolioAfter: state.investmentPortfolio,
    apartmentPriceBefore, apartmentPriceAfter: state.apartmentPrice,
    portfolioReturnPct: hadActivePortfolio ? state.stockPortfolio.lastReturnPct : null,
    netProfit:
      (state.checkingAccount - checkingBefore) +
      (state.investmentPortfolio - investmentPortfolioBefore)
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
  // reset the per-month deposit flag for the new turn
  if(state.stockPortfolio){
    state.stockPortfolio.depositedThisTurn = false;
  }
  saveGame(state);
  renderSlot();
}

export function finishGame(won, reason){
  const turnsTaken = state.index + 1;

  clearSave(); // no "continue" after a finished game

  if(won){
    recordGameWon(turnsTaken, state.nickname);
    renderWinScreen(pickRandom(WIN_QUOTES));
  } else {
    const quotePool = reason === 'burnout' ? BURNOUT_QUOTES
      : reason === 'bankrupt' ? BANKRUPT_QUOTES
      : LOSE_QUOTES;
    renderLoseScreen(pickRandom(quotePool), reason);
  }
}
