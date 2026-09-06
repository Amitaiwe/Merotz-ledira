/* ============ game.js ============
   Game state and game-flow logic: building turns, money math, the
   daily-choice mechanic, random events, investment opportunities,
   inflation/turn advancement, win/lose decisions, and the financial
   "character" calculation.

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

import { CONFIG, QUESTIONS, INVESTMENTS, RANDOM_EVENTS, CHARACTER_TYPES, WIN_QUOTES, LOSE_QUOTES, BANKRUPT_QUOTES } from './data.js';
import { $, fmt, showScreen, updateStats, renderQuestion, renderOpportunity, showEventCard, showToast, renderWinScreen, renderLoseScreen } from './ui.js';
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

export function addCapital(delta){
  state.capital = Math.max(0, state.capital + delta);
}

export function computeCharacter(st){
  const tc = st.tierCounts;
  const totalDaily = tc[0]+tc[1]+tc[2]+tc[3];
  const frugalScore = tc[0]*2 + tc[1]*1 + tc[2]*0 + tc[3]*(-2);
  const frugalRatio = totalDaily > 0 ? frugalScore / (totalDaily*2) : 0;

  const investRate = st.numOpportunities > 0 ? st.investCount / st.numOpportunities : 0;
  const avgRiskIndex = st.investCount > 0 ? st.investRiskSum / st.investCount : 0;
  const riskNormalized = avgRiskIndex / (INVESTMENTS.length - 1);
  const adventureScore = investRate*0.5 + riskNormalized*0.5;

  if(st.investCount >= 2 && adventureScore >= 0.55){
    return CHARACTER_TYPES[4]; // ההרפתקן הפיננסי
  }
  if(frugalRatio >= 0.45) return CHARACTER_TYPES[0]; // החסכן האולטימטיבי
  if(frugalRatio >= 0.15) return CHARACTER_TYPES[1]; // המתכנן הפיננסי
  if(frugalRatio > -0.15) return CHARACTER_TYPES[2]; // המאוזן
  return CHARACTER_TYPES[3]; // החי את הרגע
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
  return { slots, gameLength, numOpportunities };
}

export function newGame(){
  const built = buildSlots();
  const nicknameRaw = $('nicknameInput').value.trim();
  state = {
    capital: CONFIG.startCapital,
    price: CONFIG.startPrice,
    slots: built.slots,
    index: 0,
    total: built.gameLength,
    tierCounts: [0,0,0,0],
    numOpportunities: built.numOpportunities,
    investCount: 0,
    investRiskSum: 0,
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

export function chooseOption(tier, btnEl){
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);

  const range = CONFIG.tiers[tier];
  const delta = rand(range.min, range.max);
  addCapital(delta);
  state.tierCounts[tier]++;

  maybeTriggerEvent();
}

/* ---------- random life events ---------- */
export function maybeTriggerEvent(){
  if(Math.random() < CONFIG.eventChance){
    const evt = pickRandom(RANDOM_EVENTS);
    showEventCard(evt);
  } else {
    applyInflationAndAdvance();
  }
}

export function resolveInvestment(inv, chancePct, cost, totalReturn, investBtn, skipBtn){
  investBtn.disabled = true;
  skipBtn.disabled = true;

  state.investCount++;
  state.investRiskSum += INVESTMENTS.indexOf(inv);

  addCapital(-cost);
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
      addCapital(gain);
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

/* ---------- shared flow ---------- */
export function applyInflationAndAdvance(){
  const infl = state.price * rand(CONFIG.inflation.min, CONFIG.inflation.max);
  state.price += infl;

  setTimeout(() => {
    updateStats(true);
    showToast('מחיר הדירה עלה');
  }, 250);

  setTimeout(() => {
    if(state.capital >= state.price){
      finishGame(true);
      return;
    }
    if(state.capital < state.price * CONFIG.bankruptcyThreshold){
      finishGame(false, 'bankrupt');
      return;
    }
    state.index++;
    if(state.index >= state.total){
      finishGame(false, 'timeout');
      return;
    }
    renderSlot();
  }, 1200);
}

export function finishGame(won, reason){
  const type = computeCharacter(state);
  const typeText = type.emoji + ' ' + type.label;
  const turnsTaken = state.index + 1;

  if(won){
    recordGameWon(turnsTaken, state.nickname);
    renderWinScreen(typeText, pickRandom(WIN_QUOTES));
  } else {
    renderLoseScreen(typeText, pickRandom(reason === 'bankrupt' ? BANKRUPT_QUOTES : LOSE_QUOTES));
  }
}
