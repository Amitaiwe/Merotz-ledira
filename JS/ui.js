/* ============ ui.js ============
   Everything that reads or writes the DOM: screen switching, number
   updates, rendering questions/investment opportunities, toasts,
   modals, and the win/lose screen writes extracted from the original
   finishGame().

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

import { CONFIG, PORTFOLIO_TRACKS } from './data.js';
import { state, shuffle, rand, chooseOption, resolveInvestment, applyInflationAndAdvance, openPortfolio, depositToPortfolio } from './game.js';

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
  capEl.textContent = fmt(state.checkingAccount);
  priceEl.textContent = fmt(state.apartmentPrice);

  const totalWealth = state.checkingAccount + state.investmentPortfolio;
  const rawPct = (totalWealth/state.apartmentPrice)*100;
  pctEl.textContent = Math.round(rawPct) + '% ממחיר הדירה';

  const barPct = Math.max(4, Math.min(100, rawPct));
  $('trackFill').style.width = barPct + '%';
  $('trackMarker').style.right = barPct + '%';

  $('salaryNum').textContent = fmt(state.salary);
  $('expensesNum').textContent = fmt(state.fixedExpenses);
  $('cashFlowNum').textContent = fmt(state.salary - state.fixedExpenses);
  $('portfolioNum').textContent = fmt(state.investmentPortfolio);

  const portfolioActionBtn = $('portfolioActionBtn');
  const portfolioMetaEl = $('portfolioMeta');
  if(state.stockPortfolio && state.stockPortfolio.active){
    portfolioActionBtn.textContent = 'הפקד עוד';
    const trackLabel = PORTFOLIO_TRACKS[state.stockPortfolio.riskTrack].label;
    const lastReturn = state.stockPortfolio.lastReturnPct;
    const returnText = (lastReturn === null || lastReturn === undefined)
      ? ''
      : (' · תשואה אחרונה: ' + (lastReturn >= 0 ? '+' : '') + (Math.round(lastReturn*1000)/10) + '%');
    portfolioMetaEl.textContent = '(' + trackLabel + ')' + returnText;
  } else {
    portfolioActionBtn.textContent = 'פתח תיק השקעות';
    portfolioMetaEl.textContent = '';
  }

  const burnoutClamped = Math.max(0, Math.min(100, state.burnout || 0));
  $('burnoutFill').style.width = Math.max(2, burnoutClamped) + '%';
  $('burnoutPct').textContent = Math.round(burnoutClamped) + '%';
  const burnoutFillEl = $('burnoutFill');
  burnoutFillEl.classList.remove('burnout-mid','burnout-high');
  if(burnoutClamped >= 75) burnoutFillEl.classList.add('burnout-high');
  else if(burnoutClamped >= 50) burnoutFillEl.classList.add('burnout-mid');

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

/* ---------- investment opportunity ---------- */
export function renderOpportunity(inv){
  $('mainCard').classList.remove('flash-win','flash-lose');
  const chancePct = Math.round(rand(inv.chance[0], inv.chance[1]));
  const payoutMult = rand(inv.payout[0], inv.payout[1]);
  const costPct = rand(inv.cost[0], inv.cost[1]) / 100;
  const totalWealth = state.checkingAccount + state.investmentPortfolio;
  const remainingGap = Math.max(state.apartmentPrice - totalWealth, state.apartmentPrice * 0.15);
  let cost = costPct * remainingGap;
  cost = Math.min(cost, state.checkingAccount * CONFIG.investCostShareOfCapitalCap);
  cost = Math.max(cost, state.checkingAccount * 0.05);
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

/* ---------- portfolio modal (open / deposit) ---------- */
let portfolioModalPendingTrack = null;

export function openPortfolioModal(){
  portfolioModalPendingTrack = null;
  if(state.stockPortfolio && state.stockPortfolio.active){
    renderPortfolioPercentStep(true);
  } else {
    renderPortfolioTrackStep();
  }
  $('portfolioModal').classList.add('show');
}

export function closePortfolioModal(){
  $('portfolioModal').classList.remove('show');
}

function renderPortfolioTrackStep(){
  $('portfolioModalTitle').textContent = 'פתיחת תיק השקעות';
  $('portfolioModalText').innerHTML =
    '<div class="portfolio-track-btn" data-track="conservative">' +
      '<div class="pt-title">סולידי</div>' +
      '<div class="pt-sub">תנודתיות נמוכה, טווח תשואה מצומצם</div>' +
    '</div>' +
    '<div class="portfolio-track-btn" data-track="risky">' +
      '<div class="pt-title">מסוכן</div>' +
      '<div class="pt-sub">תנודתיות גבוהה, פוטנציאל תשואה גבוה יותר</div>' +
    '</div>';
  $('portfolioModalText').querySelectorAll('.portfolio-track-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      portfolioModalPendingTrack = btn.dataset.track;
      renderPortfolioPercentStep(false);
    });
  });
}

function renderPortfolioPercentStep(isDeposit){
  $('portfolioModalTitle').textContent = isDeposit ? 'הפקדה לתיק' : 'כמה להשקיע?';
  const available = state.checkingAccount;
  $('portfolioModalText').innerHTML =
    '<div class="portfolio-pct-btn" data-pct="0.5">' +
      '<div class="pt-title">50% מהעו"ש</div>' +
      '<div class="pt-sub">' + fmt(available*0.5) + '</div>' +
    '</div>' +
    '<div class="portfolio-pct-btn" data-pct="0.9">' +
      '<div class="pt-title">90% מהעו"ש</div>' +
      '<div class="pt-sub">' + fmt(available*0.9) + '</div>' +
    '</div>';
  $('portfolioModalText').querySelectorAll('.portfolio-pct-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pct = parseFloat(btn.dataset.pct);
      if(isDeposit){
        depositToPortfolio(pct);
      } else {
        openPortfolio(portfolioModalPendingTrack, pct);
      }
      updateStats(true);
      closePortfolioModal();
    });
  });
}

/* ---------- win / lose screens (DOM-writing part of the original finishGame) ---------- */
export function renderWinScreen(quote){
  $('winCapital').textContent = fmt(state.checkingAccount + state.investmentPortfolio);
  $('winPrice').textContent = fmt(state.apartmentPrice);
  $('winQuote').textContent = quote;
  showScreen('win');
}

export function renderLoseScreen(quote, reason){
  $('loseCapital').textContent = fmt(state.checkingAccount + state.investmentPortfolio);
  $('losePrice').textContent = fmt(state.apartmentPrice);
  $('loseTitle').textContent = reason === 'burnout' ? 'נשברת מעומס' : 'הדירה ברחה לך';
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

function fmtPct(n){
  return Math.round(n) + '%';
}

function msRow(label, before, after, higherIsGood, formatter){
  const fmtFn = formatter || fmt;
  const sentiment = msSentiment(before, after, higherIsGood);
  const delta = after - before;
  const deltaText = delta === 0 ? fmtFn(0) : (delta > 0 ? '+' : '−') + fmtFn(Math.abs(delta));
  return '<div class="ms-row">' +
    '<div class="ms-row-top">' +
      '<span class="ms-dot ' + sentiment + '"></span>' +
      '<span class="ms-label">' + label + '</span>' +
    '</div>' +
    '<div class="ms-values">' +
      '<span class="ms-before">' + fmtFn(before) + '</span>' +
      '<span class="ms-sep">•</span>' +
      '<span class="ms-after ' + sentiment + '">' + fmtFn(after) + '</span>' +
    '</div>' +
    '<div class="ms-delta ' + sentiment + '">' + deltaText + '</div>' +
  '</div>';
}

export function showMonthSummary(monthSummary){
  const cashFlowBefore = monthSummary.salaryBefore - monthSummary.fixedExpensesBefore;
  const cashFlowAfter = monthSummary.salaryAfter - monthSummary.fixedExpensesAfter;

  const percentBefore = ((monthSummary.checkingBefore + monthSummary.investmentPortfolioBefore) / monthSummary.apartmentPriceBefore) * 100;
  const percentAfter = ((monthSummary.checkingAfter + monthSummary.investmentPortfolioAfter) / monthSummary.apartmentPriceAfter) * 100;

  let html = '';
  html += msRow('משכורת', monthSummary.salaryBefore, monthSummary.salaryAfter, true);
  html += msRow('הוצאות', monthSummary.fixedExpensesBefore, monthSummary.fixedExpensesAfter, false);
  html += msRow('תזרים חודשי', cashFlowBefore, cashFlowAfter, true);
  html += msRow('עו"ש', monthSummary.checkingBefore, monthSummary.checkingAfter, true);
  html += msRow('תיק השקעות', monthSummary.investmentPortfolioBefore, monthSummary.investmentPortfolioAfter, true);
  html += msRow('מחיר הדירה', monthSummary.apartmentPriceBefore, monthSummary.apartmentPriceAfter, false);
  html += '<div class="ms-summary">' + msRow('סה"כ % מהדירה', percentBefore, percentAfter, true, fmtPct) + '</div>';

  $('monthSummaryContent').innerHTML = html;
  $('monthSummaryContinue').disabled = false;
  $('monthSummaryModal').classList.add('show');
}

export function closeMonthSummary(){
  $('monthSummaryModal').classList.remove('show');
}
