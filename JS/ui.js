/* ============ ui.js ============
   Everything that reads or writes the DOM: screen switching, number
   updates, rendering questions/opportunities/events, toasts, modals,
   and the win/lose screen writes extracted from the original finishGame().

   NOTE ON SCOPE SHARING: the original code was one script with a single
   shared closure, so game logic and DOM code freely called each other
   directly. Splitting it into modules without changing behavior means
   ui.js and game.js import from each other (a circular dependency) —
   ui.js needs game.js's chooseOption/resolveInvestment/applyInflationAndAdvance
   as click handlers, and game.js needs ui.js's render/update functions to
   drive the screen. This is safe in ES modules because every cross-call
   happens inside a function body (button click, timer), never at the
   top level of either module, so both modules are fully loaded before
   any of these bindings are actually used. */

import { CONFIG } from './data.js';
import { state, shuffle, rand, chooseOption, resolveInvestment, applyInflationAndAdvance, addCapital } from './game.js';

export const $ = id => document.getElementById(id);
export const fmt = n => Math.round(n).toLocaleString('he-IL') + ' ₪';

export function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
}

export function updateStats(animate){
  const capEl = $('capitalNum');
  const priceEl = $('priceNum');
  const pctEl = $('capitalPct');
  capEl.textContent = fmt(state.capital);
  priceEl.textContent = fmt(state.price);

  const rawPct = (state.capital/state.price)*100;
  pctEl.textContent = Math.round(rawPct) + '% ממחיר הדירה';

  const barPct = Math.max(4, Math.min(100, rawPct));
  $('trackFill').style.width = barPct + '%';
  $('trackMarker').style.right = barPct + '%';

  $('salaryNum').textContent = fmt(state.salary);
  $('expensesNum').textContent = fmt(state.fixedExpenses);
  $('cashFlowNum').textContent = fmt(state.salary - state.fixedExpenses);
  $('portfolioNum').textContent = fmt(state.investmentPortfolio);

  if(animate){
    capEl.classList.remove('flash-mint');
    void capEl.offsetWidth;
    capEl.classList.add('flash-mint');
  }
}

/* ---------- regular question ---------- */
export function renderQuestion(q){
  $('mainCard').classList.remove('flash-win','flash-lose');
  $('cardContent').innerHTML =
    '<div class="q-emoji">'+q.emoji+'</div>' +
    '<div class="q-text">'+q.text+'</div>';

  const optWrap = $('options');
  optWrap.innerHTML = '';
  const shuffledOpts = shuffle(q.options.map((text, tier) => ({ text, tier })));
  shuffledOpts.forEach(({text, tier}) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = text;
    btn.addEventListener('click', () => chooseOption(tier, btn));
    optWrap.appendChild(btn);
  });
}

/* ---------- random life events ---------- */
export function showEventCard(evt){
  const range = evt.positive ? CONFIG.eventPositive : CONFIG.eventNegative;
  const delta = rand(range.min, range.max);
  addCapital(delta);

  const cardEl = $('mainCard');
  cardEl.classList.remove('flash-win','flash-lose');
  $('cardContent').innerHTML =
    '<div class="event-label '+(evt.positive?'positive':'negative')+'">אירוע בלתי צפוי</div>' +
    '<div class="event-emoji">'+evt.emoji+'</div>' +
    '<div class="event-title">'+evt.title+'</div>' +
    '<div class="event-amt '+(evt.positive?'positive':'negative')+'">' + (evt.positive?'+':'−') + fmt(Math.abs(delta)) + '</div>';

  const optWrap = $('options');
  optWrap.innerHTML = '';
  const contBtn = document.createElement('button');
  contBtn.className = 'btn-invest';
  contBtn.textContent = 'המשך';
  contBtn.addEventListener('click', () => {
    contBtn.disabled = true;
    applyInflationAndAdvance();
  });
  optWrap.appendChild(contBtn);

  updateStats(true);
  void cardEl.offsetWidth;
  cardEl.classList.add(evt.positive ? 'flash-win' : 'flash-lose');
}

/* ---------- investment opportunity ---------- */
export function renderOpportunity(inv){
  $('mainCard').classList.remove('flash-win','flash-lose');
  const chancePct = Math.round(rand(inv.chance[0], inv.chance[1]));
  const payoutMult = rand(inv.payout[0], inv.payout[1]);
  const costPct = rand(inv.cost[0], inv.cost[1]) / 100;
  const remainingGap = Math.max(state.price - state.capital, state.price * 0.15);
  let cost = costPct * remainingGap;
  cost = Math.min(cost, state.capital * CONFIG.investCostShareOfCapitalCap);
  cost = Math.max(cost, state.capital * 0.05);
  const totalReturn = cost * payoutMult;
  const netProfit = totalReturn - cost;

  $('cardContent').innerHTML =
    '<div class="opp-label">הזדמנות השקעה</div>' +
    '<div class="opp-title-row"><div class="opp-title">'+inv.name+'</div><button class="info-btn" id="oppInfoBtn" type="button">?</button></div>' +
    '<div class="opp-risk">'+inv.risk+'</div>' +
    '<div class="opp-body">' +
      '<div class="gauge" id="oppGauge" style="--pct:'+chancePct+'">' +
        '<div class="gauge-inner"><div class="pct" id="oppPct">'+chancePct+'%</div><div class="pct-lbl">סיכוי הצלחה</div></div>' +
      '</div>' +
      '<div class="opp-figures">' +
        '<div class="row cost"><div class="lbl">עלות השקעה</div><div class="amt">'+fmt(cost)+'</div></div>' +
        '<div class="row gain"><div class="lbl">בהצלחה תקבל (ברוטו)</div><div class="amt">'+fmt(totalReturn)+'</div></div>' +
        '<div class="row net"><div class="lbl">רווח נטו בהצלחה</div><div class="amt">+'+fmt(netProfit)+'</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="opp-result" id="oppResult"></div>';

  $('oppInfoBtn').addEventListener('click', () => openInfoModal(inv.name, inv.desc));

  const optWrap = $('options');
  optWrap.innerHTML = '';

  const investBtn = document.createElement('button');
  investBtn.className = 'btn-invest';
  investBtn.textContent = 'משקיע';
  investBtn.addEventListener('click', () => resolveInvestment(inv, chancePct, cost, totalReturn, investBtn, skipBtn));

  const skipBtn = document.createElement('button');
  skipBtn.className = 'btn-skip';
  skipBtn.textContent = 'לא תודה, נשאר בטוח';
  skipBtn.addEventListener('click', () => {
    investBtn.disabled = true;
    skipBtn.disabled = true;
    applyInflationAndAdvance();
  });

  optWrap.appendChild(investBtn);
  optWrap.appendChild(skipBtn);
}

export function showToast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 900);
}

/* ---------- info modal ---------- */
export function openInfoModal(title, text){
  $('infoModalTitle').textContent = title;
  $('infoModalText').textContent = text;
  $('infoModal').classList.add('show');
}

export function closeInfoModal(){
  $('infoModal').classList.remove('show');
}

/* ---------- win / lose screens (DOM-writing part of the original finishGame) ---------- */
export function renderWinScreen(typeText, quote){
  $('winCapital').textContent = fmt(state.capital);
  $('winPrice').textContent = fmt(state.price);
  $('winType').textContent = typeText;
  $('winQuote').textContent = quote;
  showScreen('win');
}

export function renderLoseScreen(typeText, quote){
  $('loseCapital').textContent = fmt(state.capital);
  $('losePrice').textContent = fmt(state.price);
  $('loseType').textContent = typeText;
  $('loseQuote').textContent = quote;
  showScreen('lose');
}

/* ---------- month summary modal (V1.8 step 1B) ----------
   Reads only fields already present on the monthSummary object handed
   to it by game.js (state.monthSummary) — no independent recomputation
   of salary/expenses/checking/price. The one derived value, monthly
   cash flow, is computed purely as salaryBefore-fixedExpensesBefore /
   salaryAfter-fixedExpensesAfter from those same already-authoritative
   fields (not re-simulated), so it can never drift from the engine.

   No arrow characters are used anywhere, per the explicit "no arrows"
   requirement — direction/meaning is conveyed by color only:
   green = this change moved the player closer to the apartment,
   red = this change moved the player further away,
   neutral = unchanged. Which direction counts as "good" is field-
   specific (salary up = good, expenses up = bad, etc.), never a
   blanket "number went up = green" rule. */

function msSentiment(before, after, higherIsGood){
  if(after === before) return 'neutral';
  const wentUp = after > before;
  const isGood = higherIsGood ? wentUp : !wentUp;
  return isGood ? 'positive' : 'negative';
}

function msRow(label, before, after, higherIsGood){
  const sentiment = msSentiment(before, after, higherIsGood);
  const delta = after - before;
  const deltaText = delta === 0 ? fmt(0) : (delta > 0 ? '+' : '−') + fmt(Math.abs(delta));
  return '<div class="ms-row">' +
    '<div class="ms-row-top">' +
      '<span class="ms-dot ' + sentiment + '"></span>' +
      '<span class="ms-label">' + label + '</span>' +
    '</div>' +
    '<div class="ms-values">' +
      '<span class="ms-before">' + fmt(before) + '</span>' +
      '<span class="ms-sep">•</span>' +
      '<span class="ms-after ' + sentiment + '">' + fmt(after) + '</span>' +
    '</div>' +
    '<div class="ms-delta ' + sentiment + '">' + deltaText + '</div>' +
  '</div>';
}

export function showMonthSummary(monthSummary){
  const cashFlowBefore = monthSummary.salaryBefore - monthSummary.fixedExpensesBefore;
  const cashFlowAfter = monthSummary.salaryAfter - monthSummary.fixedExpensesAfter;

  let html = '';
  html += msRow('משכורת', monthSummary.salaryBefore, monthSummary.salaryAfter, true);
  html += msRow('הוצאות', monthSummary.fixedExpensesBefore, monthSummary.fixedExpensesAfter, false);
  html += msRow('תזרים חודשי', cashFlowBefore, cashFlowAfter, true);
  html += msRow('עו"ש', monthSummary.checkingBefore, monthSummary.checkingAfter, true);
  html += msRow('תיק השקעות', monthSummary.investmentPortfolioBefore, monthSummary.investmentPortfolioAfter, true);
  html += msRow('מחיר הדירה', monthSummary.apartmentPriceBefore, monthSummary.apartmentPriceAfter, false);

  $('monthSummaryContent').innerHTML = html;
  $('monthSummaryContinue').disabled = false;
  $('monthSummaryModal').classList.add('show');
}

export function closeMonthSummary(){
  $('monthSummaryModal').classList.remove('show');
}
