/* ============ game.js ============ */

import { CONFIG, QUESTIONS, WIN_QUOTES, LOSE_QUOTES,
         BANKRUPT_QUOTES, BURNOUT_QUOTES, PORTFOLIO_TRACKS,
         SPECIAL_INVESTMENTS } from './data.js';
import { $, fmt, showScreen, updateStats, renderQuestion,
         renderSpecialInvestment, showToast,
         showMonthSummary, renderWinScreen, renderLoseScreen,
         turnToDate } from './ui.js';
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

function freshStats(){
  return {
    totalSalaryEarned: 0,
    totalExpensesPaid: 0,
    specialInvestments: [],
    totalSpecialProfit: 0,
    totalSpecialSuccess: 0,
    totalSpecialFail: 0,
    portfolioDeposits: 0,
    portfolioWithdrawals: 0,
    portfolioMarketReturns: 0,
    portfolioTax: 0,
    totalRealizations: 0
  };
}

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

export function buildSlots(){
  const gameLength = CONFIG.maxTurns;
  let slots = [];
  for(let turn=1; turn<=gameLength; turn++){
    const isSpecialTurn = turn % CONFIG.specialInvestmentEveryMonths === 0;
    slots.push({ type: isSpecialTurn ? 'special' : 'question', data: null });
  }
  const questionPool = shuffle(QUESTIONS);
  let qi = 0;
  for(const slot of slots){
    if(slot.type === 'question'){
      slot.data = questionPool[qi % questionPool.length];
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
      active: false, riskTrack: null, totalDeposited: 0,
      openedAtTurn: null, lastReturnPct: null, depositedThisTurn: false
    },
    portfolioClosedAtTurn: null,
    lastPortfolioRealization: null,
    lastSpecialInvestment: null,
    specialInvestment: {
      active: false, type: null, offeredAtTurn: null,
      rolledChance: null, rolledPayout: null, rolledLoss: null
    },
    slots: built.slots,
    index: 0,
    total: built.gameLength,
    nickname: nicknameRaw,
    stats: freshStats()
  };
  recordGamePlayed();
  if(nicknameRaw) saveNickname(nicknameRaw);
  maybeGenerateSpecialInvestment();
  updateStats(false);
  renderSlot();
  showScreen('game');
  saveGame(state);
}

export function continueGame(){
  const saved = loadGame();
  if(!saved) return false;
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, saved);
  if(!state.stockPortfolio) state.stockPortfolio = { active:false, riskTrack:null, totalDeposited:0, openedAtTurn:null, lastReturnPct:null, depositedThisTurn:false };
  if(state.stockPortfolio.depositedThisTurn === undefined) state.stockPortfolio.depositedThisTurn = false;
  if(!state.specialInvestment) state.specialInvestment = { active:false, type:null, offeredAtTurn:null, rolledChance:null, rolledPayout:null, rolledLoss:null };
  if(state.lastSpecialInvestment === undefined) state.lastSpecialInvestment = null;
  if(!state.stats) state.stats = freshStats();
  updateStats(false);
  renderSlot();
  showScreen('game');
  return true;
}

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
  state.stats.portfolioDeposits += amount;
  state.stockPortfolio = {
    active: true, riskTrack: track, totalDeposited: amount,
    openedAtTurn: state.index + 1, lastReturnPct: null, depositedThisTurn: true
  };
  saveGame(state);
}

export function depositToPortfolio(percent){
  if(!state.stockPortfolio.active) return;
  if(state.stockPortfolio.depositedThisTurn) return;
  const amount = state.checkingAccount * percent;
  applyCheckingChange(-amount, 'portfolio-deposit');
  applyPortfolioChange(amount, 'portfolio-deposit');
  state.stockPortfolio.totalDeposited += amount;
  state.stockPortfolio.depositedThisTurn = true;
  state.stats.portfolioDeposits += amount;
  saveGame(state);
}

export function canRealizePortfolio(){
  if(!state.stockPortfolio.active) return false;
  if(state.stockPortfolio.depositedThisTurn) return false;
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
  state.lastPortfolioRealization = { turn: state.index + 1, grossValue, profit, tax, netReturned };
  state.portfolioClosedAtTurn = state.index + 1;
  state.stats.portfolioWithdrawals += netReturned;
  state.stats.portfolioTax += tax;
  state.stats.totalRealizations += 1;
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
  const gain = state.investmentPortfolio * returnPct;
  applyPortfolioChange(gain, 'portfolio-return');
  state.stockPortfolio.lastReturnPct = returnPct;
  state.stats.portfolioMarketReturns += gain;
}

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
    state.specialInvestment = { active:false, type:null, offeredAtTurn:null, rolledChance:null, rolledPayout:null, rolledLoss:null };
    return;
  }
  const inv = pickWeightedSpecialInvestment();
  const rolledChance = rand(inv.chanceRange[0], inv.chanceRange[1]);
  const rolledPayout = rand(inv.payoutRange[0], inv.payoutRange[1]);
  const rolledLoss   = rand(inv.lossRange[0],   inv.lossRange[1]);
  state.specialInvestment = {
    active: true, type: inv.key, offeredAtTurn: state.index + 1,
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
    type: inv.key, name: inv.name, amount, success, multiplier,
    returned, profit: returned - amount,
    chancePct: state.specialInvestment.rolledChance,
    turn: state.index + 1
  };
  state.lastSpecialInvestment = result;
  state.specialInvestment = { active:false, type:null, offeredAtTurn:null, rolledChance:null, rolledPayout:null, rolledLoss:null };
  state.stats.specialInvestments.push({ turn: result.turn, name: inv.name, profit: result.profit });
  state.stats.totalSpecialProfit += result.profit;
  if(success) state.stats.totalSpecialSuccess++;
  else state.stats.totalSpecialFail++;
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

export function renderSlot(){
  const slot = state.slots[state.index];
  const turn = state.index + 1;
  const date = turnToDate(turn);
  $('qCounter').textContent = 'תור ' + turn + ' · ' + date.monthName + ' ' + date.year;

  if(slot.type === 'question'){
    renderQuestion(slot.data);
  } else if(slot.type === 'special'){
    if(state.specialInvestment.active){
      const inv = getSpecialInvestmentType();
      if(inv) renderSpecialInvestment(inv);
      else renderQuestion(QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)]);
    } else {
      renderQuestion(QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)]);
    }
  }
}

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

export function applyInflationAndAdvance(fixedExpensesBeforeOverride){
  const salaryBefore = state.salary;
  const fixedExpensesBefore = (fixedExpensesBeforeOverride !== undefined)
    ? fixedExpensesBeforeOverride
    : state.fixedExpenses;
  const checkingBefore = state.checkingAccount;
  const investmentPortfolioBefore = state.investmentPortfolio;
  const apartmentPriceBefore = state.apartmentPrice;

  // automatic inflation on fixed expenses
  const autoInflationPct = rand(CONFIG.autoExpenseInflation.min, CONFIG.autoExpenseInflation.max);
  applyExpenseChange(autoInflationPct, 'auto-inflation');

  state.salary *= (1 + rand(CONFIG.salaryGrowth.min, CONFIG.salaryGrowth.max));
  const monthlyCashFlow = state.salary - state.fixedExpenses;
  applyCheckingChange(monthlyCashFlow, 'monthly-cashflow');
  state.apartmentPrice *= (1 + rand(CONFIG.inflation.min, CONFIG.inflation.max));

  state.stats.totalSalaryEarned += state.salary;
  state.stats.totalExpensesPaid += state.fixedExpenses;

  const hadActivePortfolio = state.stockPortfolio.active;
  applyPortfolioMonthlyReturn();

  const specialSnapshot = state.lastSpecialInvestment;

  state.monthSummary = {
    salaryBefore, salaryAfter: state.salary,
    fixedExpensesBefore, fixedExpensesAfter: state.fixedExpenses,
    checkingBefore, checkingAfter: state.checkingAccount,
    investmentPortfolioBefore, investmentPortfolioAfter: state.investmentPortfolio,
    apartmentPriceBefore, apartmentPriceAfter: state.apartmentPrice,
    portfolioReturnPct: hadActivePortfolio ? state.stockPortfolio.lastReturnPct : null,
    netProfit:
      (state.checkingAccount - checkingBefore) +
      (state.investmentPortfolio - investmentPortfolioBefore),
    specialInvestment: specialSnapshot
  };
  state.lastSpecialInvestment = null;

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
  if(state.stockPortfolio){
    state.stockPortfolio.depositedThisTurn = false;
  }
  maybeGenerateSpecialInvestment();
  saveGame(state);
  renderSlot();
}

export function finishGame(won, reason){
  const turnsTaken = state.index + 1;
  clearSave();
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
