/* ============ game.js ============
   Game state and game-flow logic: building turns, the central money
   ledger, the daily-choice mechanic (lifestyle drift on fixed
   expenses), investment opportunities, monthly cashflow/inflation,
   and win/lose decisions. */

import { CONFIG, QUESTIONS, WIN_QUOTES, LOSE_QUOTES, BANKRUPT_QUOTES, BURNOUT_QUOTES, PORTFOLIO_TRACKS, SPECIAL_INVESTMENTS } from './data.js';
import { $, fmt, showScreen, updateStats, renderQuestion, renderOpportunity, showToast, showMonthSummary, renderWinScreen, renderLoseScreen, renderSpecialInvestmentDecision } from './ui.js';
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
  // B2.3: המערכת הישנה של הזדמנות כל 5 תורים בוטלה.
  // כל התורים הם שאלות; הזדמנויות מיוחדות מגיעות אך ורק דרך
  // maybeGenerateSpecialInvestment() בחודשים 6/12/18/...
  const gameLength = CONFIG.maxTurns;
  const questionPool = shuffle(QUESTIONS).slice(0, Math.min(gameLength, QUESTIONS.length));
  let slots = [];
  for(let turn=1; turn<=gameLength; turn++){
    slots.push({ type:'question', data: questionPool[(turn-1) % questionPool.length] });
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
      lastReturnPct: null
    },
    portfolioClosedAtTurn: null,
    lastPortfolioRealization: null,
    specialInvestment: {
      active: false,
      type: null,
      offeredAtTurn: null
    },
    specialInvestmentDecision: null,
    specialInvestmentResult: null,
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

/* ============ STOCK PORTFOLIO ENGINE (V1.8, phase A) ============ */
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
    lastReturnPct: null
  };
}

export function depositToPortfolio(percent){
  if(!state.stockPortfolio.active) return;

  const amount = state.checkingAccount * percent;
  applyCheckingChange(-amount, 'portfolio-deposit');
  applyPortfolioChange(amount, 'portfolio-deposit');
  state.stockPortfolio.totalDeposited += amount;
}

export function canRealizePortfolio(){
  if(!state.stockPortfolio.active) return false;
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
    grossValue,
    profit,
    tax,
    netReturned
  };

  state.portfolioClosedAtTurn = state.index + 1;
  state.stockPortfolio = {
    active: false,
    riskTrack: null,
    totalDeposited: 0,
    openedAtTurn: null,
    lastReturnPct: null
  };
}

function applyPortfolioMonthlyReturn(){
  if(!state.stockPortfolio.active) return;
  const track = PORTFOLIO_TRACKS[state.stockPortfolio.riskTrack];
  const returnPct = pickWeightedReturn(track.returns);
  applyPortfolioChange(state.investmentPortfolio * returnPct, 'portfolio-return');
  state.stockPortfolio.lastReturnPct = returnPct;
}

/* ============ SPECIAL INVESTMENT (B2.1 + B2.2 + B2.3) ============ */
export function isSpecialInvestmentMonth(){
  return (state.index + 1) % CONFIG.specialInvestmentEveryMonths === 0;
}

function pickWeightedSpecialInvestment(){
  const totalWeight = SPECIAL_INVESTMENTS.reduce((sum, inv) => sum + inv.appearanceWeight, 0);
  let roll = Math.random() * totalWeight;
  for(const inv of SPECIAL_INVESTMENTS){
    if(roll < inv.appearanceWeight) return inv;
    roll -= inv.appearanceWeight;
  }
  return SPECIAL_INVESTMENTS[SPECIAL_INVESTMENTS.length - 1];
}

function maybeGenerateSpecialInvestment(){
  if(!isSpecialInvestmentMonth()){
    state.specialInvestment = { active: false, type: null, offeredAtTurn: null };
    return;
  }
  const inv = pickWeightedSpecialInvestment();
  state.specialInvestment = {
    active: true,
    type: inv.key,
    offeredAtTurn: state.index + 1
  };
}

/* --- B2.2: חישובי סכום ומימון --- */
export function computeSpecialInvestmentAmount(){
  if(!state.specialInvestment.active) return 0;
  const totalWealth = state.checkingAccount + state.investmentPortfolio;
  const remainingGap = Math.max(state.apartmentPrice - totalWealth, state.apartmentPrice * 0.15);
  const costPct = 0.10;
  let cost = costPct * remainingGap;
  cost = Math.max(cost, 1000);
  return Math.round(cost);
}

export function getExpectedPortfolioNet(){
  if(!state.stockPortfolio.active) return 0;
  const grossValue = state.investmentPortfolio;
  const profit = grossValue - state.stockPortfolio.totalDeposited;
  const tax = profit > 0 ? profit * CONFIG.portfolioTaxRate : 0;
  return Math.max(0, grossValue - tax);
}

export function canFundSpecialInvestment(fundingSource){
  if(!state.specialInvestment.active) return false;
  const amount = computeSpecialInvestmentAmount();
  if(fundingSource === 'checking'){
    return state.checkingAccount >= amount;
  }
  if(fundingSource === 'portfolio'){
    return state.stockPortfolio.active && getExpectedPortfolioNet() >= amount;
  }
  return false;
}

export function decideSpecialInvestmentFunding(fundingSource){
  if(!state.specialInvestment.active) return null;
  const amount = computeSpecialInvestmentAmount();

  if(fundingSource === 'portfolio'){
    if(!canFundSpecialInvestment('portfolio')) return null;
    realizePortfolio(); // ← B1 בדיוק כפי שהוא
  } else if(fundingSource === 'checking'){
    if(!canFundSpecialInvestment('checking')) return null;
  } else {
    return null;
  }

  applyCheckingChange(-amount, 'special-investment-funding');

  const inv = SPECIAL_INVESTMENTS.find(i => i.key === state.specialInvestment.type);
  const decision = {
    key: inv.key,
    name: inv.name,
    desc: inv.desc,
    amount,
    fundingSource,
    decidedAtTurn: state.index + 1
  };
  state.specialInvestmentDecision = decision;
  return decision;
}

/* --- B2.3: הגרלת outcome + הכרעה --- */
function pickWeightedOutcome(outcomes){
  const totalWeight = outcomes.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * totalWeight;
  for(const o of outcomes){
    if(roll < o.weight) return o.multiplier;
    roll -= o.weight;
  }
  return outcomes[outcomes.length - 1].multiplier;
}

export function resolveSpecialInvestment(){
  const decision = state.specialInvestmentDecision;
  if(!decision || decision.declined) return null;

  const inv = SPECIAL_INVESTMENTS.find(i => i.key === decision.key);
  const multiplier = pickWeightedOutcome(inv.outcomes);
  const payout = Math.round(decision.amount * multiplier);
  const profit = payout - decision.amount;

  // רווח/הפסד מיוחד — לא כפוף למס 10% של הבורסה
  applyCheckingChange(payout, 'special-investment-payout');

  state.specialInvestmentResult = {
    key: inv.key,
    name: inv.name,
    amount: decision.amount,
    fundingSource: decision.fundingSource,
    multiplier,
    payout,
    profit,
    turn: state.index + 1
  };

  state.specialInvestment = { active: false, type: null, offeredAtTurn: null };
  state.specialInvestmentDecision = null;

  updateStats(true);
  return state.specialInvestmentResult;
}

export function declineSpecialInvestment(){
  if(!state.specialInvestment.active) return false;
  state.specialInvestmentDecision = {
    amount: computeSpecialInvestmentAmount(),
    fundingSource: null,
    declined: true,
    decidedAtTurn: state.index + 1
  };
  state.specialInvestment = { active: false, type: null, offeredAtTurn: null };
  return true;
}

/* ============ RENDER / FLOW ============ */
export function renderSlot(){
  const slot = state.slots[state.index];
  $('qCounter').textContent = 'תור ' + (state.index+1);

  if(state.specialInvestment.active && isSpecialInvestmentMonth()){
    const inv = SPECIAL_INVESTMENTS.find(i => i.key === state.specialInvestment.type);
    if(inv){
      renderSpecialInvestmentDecision(inv);
      return;
    }
  }

  if(slot.type === 'question'){
    renderQuestion(slot.data);
  } else {
    renderOpportunity(slot.data);
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

/* ---------- monthly cashflow + inflation ---------- */
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

  applyPortfolioMonthlyReturn();
  maybeGenerateSpecialInvestment();

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
    const quotePool = reason === 'burnout' ? BURNOUT_QUOTES
      : reason === 'bankrupt' ? BANKRUPT_QUOTES
      : LOSE_QUOTES;
    renderLoseScreen(pickRandom(quotePool), reason);
  }
}
