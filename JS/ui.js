/* ============ ui.js ============
   Everything that reads or writes the DOM. */

import { CONFIG, QUESTIONS, PORTFOLIO_TRACKS } from './data.js';
import { state, shuffle, rand, chooseOption, resolveInvestment,
         applyInflationAndAdvance, openPortfolio, depositToPortfolio,
         canOpenNewPortfolio, canRealizePortfolio, realizePortfolio,
         investSpecial, skipSpecialInvestment, getSpecialInvestmentType }
         from './game.js';

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

  const netEl = $('netWorthLine');
  if(netEl){
    netEl.textContent = 'סה"כ נטו (עו"ש + תיק): ' + fmt(totalWealth);
  }

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
    portfolioActionBtn.textContent = 'תיק ההשקעות שלי';
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

/* ---------- special investment ---------- */
export function renderSpecialInvestment(inv){
  const chancePct = Math.round(state.specialInvestment.rolledChance * 10) / 10;
  const checking = state.checkingAccount;

  $('mainCard').classList.remove('flash-win','flash-lose');
  $('cardContent').innerHTML =
    '<div class="opp-label">הזדמנות השקעה מיוחדת</div>' +
    '<div class="opp-title-row"><div class="opp-title">'+inv.name+'</div>' +
      '<button class="info-btn" id="oppInfoBtn" type="button">?</button></div>' +
    '<div class="opp-risk">'+inv.risk+'</div>' +
    '<div class="opp-body">' +
      '<div class="gauge" id="oppGauge" style="--pct:'+chancePct+'">' +
        '<div class="gauge-inner"><div class="pct" id="oppPct">'+chancePct+'%</div>' +
        '<div class="pct-lbl">סיכוי הצלחה</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="opp-result" id="oppResult"></div>';

  $('oppInfoBtn').addEventListener('click', () => openInfoModal(inv.name, inv.desc));

  const optWrap = $('options');
  optWrap.innerHTML = '';

  const eligible = CONFIG.specialInvestmentPercentOptions
    .filter(p => checking * p >= CONFIG.specialInvestmentMinAmount);

  if(eligible.length === 0){
    // defensive — renderSlot already fell back if no offer, but if we
    // somehow reach here with no eligible percent, fall back to a question
    const q = QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)];
    renderQuestion(q);
    return;
  }

  eligible.forEach(p => {
    const amount = checking * p;
    const btn = document.createElement('button');
    btn.className = 'option-btn special-invest-btn';
    btn.textContent = Math.round(p*100) + '% — ' + fmt(amount);
    btn.addEventListener('click', () => resolveSpecialInvestment(p));
    optWrap.appendChild(btn);
  });

  const skipBtn = document.createElement('button');
  skipBtn.className = 'btn-skip';
  skipBtn.textContent = 'לא תודה, מדלג';
  skipBtn.addEventListener('click', () => {
    document.querySelectorAll('.option-btn, .btn-skip').forEach(b => b.disabled = true);
    skipSpecialInvestment();
    applyInflationAndAdvance();
  });
  optWrap.appendChild(skipBtn);
}

export function resolveSpecialInvestment(percent){
  document.querySelectorAll('.option-btn, .btn-skip').forEach(b => b.disabled = true);

  const cardEl = $('mainCard');
  const gaugeEl = $('oppGauge');
  const resultEl = $('oppResult');

  gaugeEl.classList.add('spinning');
  resultEl.className = 'opp-result pending';
  resultEl.textContent = 'הגלגל מסתובב...';

  const result = investSpecial(percent);

  setTimeout(() => {
    gaugeEl.classList.remove('spinning');
    cardEl.classList.remove('flash-win','flash-lose');
    void cardEl.offsetWidth;

    if(result && result.success){
      resultEl.className = 'opp-result win';
      resultEl.textContent = 'ההשקעה הצליחה! +' + fmt(result.profit);
      cardEl.classList.add('flash-win');
    } else if(result){
      resultEl.className = 'opp-result lose';
      resultEl.textContent = 'ההשקעה נכשלה. הפסדת ' + fmt(Math.abs(result.profit));
      cardEl.classList.add('flash-lose');
    }
  }, 1600);

  setTimeout(() => { applyInflationAndAdvance(); }, 1600 + 1200);
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

/* ---------- portfolio modal (unified) ---------- */
let portfolioModalPendingTrack = null;

export function openPortfolioModal(){
  portfolioModalPendingTrack = null;
  if(state.stockPortfolio && state.stockPortfolio.active){
    renderPortfolioManageStep();
  } else if(!canOpenNewPortfolio()){
    renderPortfolioLockedStep();
  } else {
    renderPortfolioTrackStep();
  }
  $('portfolioModal').classList.add('show');
}

export function closePortfolioModal(){
  $('portfolioModal').classList.remove('show');
}

function renderPortfolioLockedStep(){
  $('portfolioModalTitle').textContent = 'תיק השקעות';
  $('portfolioModalText').innerHTML =
    '<div class="portfolio-locked-note">ניתן לפתוח תיק חדש רק החל מהחודש הבא.</div>';
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

function renderPortfolioManageStep(){
  const grossValue = state.investmentPortfolio;
  const deposited = state.stockPortfolio.totalDeposited;
  const profit = grossValue - deposited;
  const trackLabel = PORTFOLIO_TRACKS[state.stockPortfolio.riskTrack].label;
  const lastReturn = state.stockPortfolio.lastReturnPct;
  const returnText = (lastReturn === null || lastReturn === undefined)
    ? '—'
    : (lastReturn >= 0 ? '+' : '') + (Math.round(lastReturn*1000)/10) + '%';

  const depositedThisTurn = state.stockPortfolio.depositedThisTurn;
  const currentTurn = state.index + 1;
  const canRealizeNow = canRealizePortfolio();
  const monthsToRealize = CONFIG.portfolioRealizeEveryMonths - (currentTurn % CONFIG.portfolioRealizeEveryMonths);

  // special-investment reminder
  const specialInv = getSpecialInvestmentType();
  let specialLine = '';
  if(specialInv){
    specialLine = '<div class="portfolio-special-note">⚡ יש הזדמנות השקעה מיוחדת שממתינה בכרטיס הראשי החודש.</div>';
  }

  let html = '';
  html += '<div class="portfolio-realize-row"><span>מסלול</span><span>' + trackLabel + '</span></div>';
  html += '<div class="portfolio-realize-row"><span>שווי נוכחי</span><span>' + fmt(grossValue) + '</span></div>';
  html += '<div class="portfolio-realize-row"><span>סך הפקדות</span><span>' + fmt(deposited) + '</span></div>';
  html += '<div class="portfolio-realize-row"><span>' + (profit >= 0 ? 'רווח' : 'הפסד') + '</span><span>' + fmt(Math.abs(profit)) + '</span></div>';
  html += '<div class="portfolio-realize-row"><span>תשואה אחרונה</span><span>' + returnText + '</span></div>';
  html += specialLine;

  if(depositedThisTurn){
    html += '<div class="portfolio-locked-note" style="margin-top:12px;">הפקדת כבר החודש. הפקדה נוספת תתאפשר בחודש הבא.</div>';
  } else {
    html += '<button class="btn-primary" id="portfolioDepositBtn" style="margin-top:14px;" type="button">הפקד לתיק</button>';
  }

  if(canRealizeNow){
    html += '<button class="btn-secondary" id="portfolioRealizeOpenBtn" style="margin-top:10px;" type="button">מימוש תיק</button>';
  } else {
    const waitMonths = (depositedThisTurn ? monthsToRealize : (monthsToRealize === 0 ? CONFIG.portfolioRealizeEveryMonths : monthsToRealize));
    const note = depositedThisTurn
      ? 'לא ניתן לממש בחודש שבו הפקדת.'
      : 'ניתן לממש בעוד ' + waitMonths + ' חודשים.';
    html += '<div class="portfolio-locked-note" style="margin-top:12px;">' + note + '</div>';
  }

  $('portfolioModalTitle').textContent = 'תיק ההשקעות שלי';
  $('portfolioModalText').innerHTML = html;

  const depBtn = $('portfolioDepositBtn');
  if(depBtn) depBtn.addEventListener('click', () => renderPortfolioPercentStep(true));

  const realBtn = $('portfolioRealizeOpenBtn');
  if(realBtn) realBtn.addEventListener('click', () => renderPortfolioRealizeStep());
}

function renderPortfolioRealizeStep(){
  const grossValue = state.investmentPortfolio;
  const deposited = state.stockPortfolio.totalDeposited;
  const profit = grossValue - deposited;
  const tax = profit > 0 ? profit * CONFIG.portfolioTaxRate : 0;
  const netReturned = grossValue - tax;

  $('portfolioModalTitle').textContent = 'מימוש תיק ההשקעות';
  $('portfolioModalText').innerHTML =
    '<div class="portfolio-realize-row"><span>שווי התיק</span><span>' + fmt(grossValue) + '</span></div>' +
    '<div class="portfolio-realize-row"><span>סך הפקדות</span><span>' + fmt(deposited) + '</span></div>' +
    '<div class="portfolio-realize-row"><span>' + (profit >= 0 ? 'רווח' : 'הפסד') + '</span><span>' + fmt(Math.abs(profit)) + '</span></div>' +
    '<div class="portfolio-realize-row"><span>מס (10% מהרווח)</span><span>' + fmt(tax) + '</span></div>' +
    '<div class="portfolio-realize-row total"><span>יחזור לעו"ש</span><span>' + fmt(netReturned) + '</span></div>' +
    '<button class="btn-primary" id="portfolioRealizeConfirm" style="margin-top:14px;" type="button">מימוש</button>';

  $('portfolioRealizeConfirm').addEventListener('click', () => {
    realizePortfolio();
    updateStats(true);
    closePortfolioModal();
  });
}

/* ---------- win / lose screens ---------- */
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

/* ---------- month summary ---------- */
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
  const cashFlowAfter  = monthSummary.salaryAfter  - monthSummary.fixedExpensesAfter;

  const percentBefore = ((monthSummary.checkingBefore + monthSummary.investmentPortfolioBefore) / monthSummary.apartmentPriceBefore) * 100;
  const percentAfter  = ((monthSummary.checkingAfter  + monthSummary.investmentPortfolioAfter)  / monthSummary.apartmentPriceAfter)  * 100;

  let html = '';

  // 1) market return line — always shown; says "no portfolio" if none
  if(monthSummary.portfolioReturnPct === null || monthSummary.portfolioReturnPct === undefined){
    html += '<div class="ms-row ms-market neutral">' +
      '<div class="ms-row-top"><span class="ms-dot neutral"></span>' +
      '<span class="ms-label">לא היה תיק השקעות פעיל החודש</span></div>' +
    '</div>';
  } else {
    const pct = monthSummary.portfolioReturnPct;
    const before = monthSummary.investmentPortfolioBefore;
    const after  = monthSummary.investmentPortfolioAfter;
    const delta  = after - before;
    const sentiment = pct > 0 ? 'positive' : (pct < 0 ? 'negative' : 'neutral');
    const pctStr = (pct >= 0 ? '+' : '') + (Math.round(pct*1000)/10) + '%';
    let line;
    if(pct === 0){
      line = 'הבורסה לא זזה החודש';
    } else if(delta > 0){
      line = 'הבורסה עשתה החודש ' + pctStr + ' — הרווחת ' + fmt(delta);
    } else if(delta < 0){
      line = 'הבורסה עשתה החודש ' + pctStr + ' — הפסדת ' + fmt(Math.abs(delta));
    } else {
      line = 'הבורסה עשתה החודש ' + pctStr;
    }
    html += '<div class="ms-row ms-market ' + sentiment + '">' +
      '<div class="ms-row-top"><span class="ms-dot ' + sentiment + '"></span>' +
      '<span class="ms-label">' + line + '</span></div>' +
    '</div>';
  }

  // 2) regular rows
  html += msRow('משכורת', monthSummary.salaryBefore, monthSummary.salaryAfter, true);
  html += msRow('הוצאות', monthSummary.fixedExpensesBefore, monthSummary.fixedExpensesAfter, false);
  html += msRow('תזרים חודשי', cashFlowBefore, cashFlowAfter, true);
  html += msRow('עו"ש', monthSummary.checkingBefore, monthSummary.checkingAfter, true);
  html += msRow('תיק השקעות', monthSummary.investmentPortfolioBefore, monthSummary.investmentPortfolioAfter, true);
  html += msRow('מחיר הדירה', monthSummary.apartmentPriceBefore, monthSummary.apartmentPriceAfter, false);

  // 3) net profit line
  const net = monthSummary.netProfit;
  const netSent = net > 0 ? 'positive' : (net < 0 ? 'negative' : 'neutral');
  const netText = net === 0 ? 'החודש לא היה שינוי נטו'
    : 'החודש ' + (net > 0 ? 'הרווחת ' : 'הפסדת ') + fmt(Math.abs(net));
  html += '<div class="ms-row ms-net ' + netSent + '">' +
    '<div class="ms-row-top"><span class="ms-dot ' + netSent + '"></span>' +
    '<span class="ms-label">' + netText + '</span></div>' +
  '</div>';

  // 4) total % row
  html += '<div class="ms-summary">' + msRow('סה"כ % מהדירה', percentBefore, percentAfter, true, fmtPct) + '</div>';

  $('monthSummaryContent').innerHTML = html;
  $('monthSummaryContinue').disabled = false;
  $('monthSummaryModal').classList.add('show');
}

export function closeMonthSummary(){
  $('monthSummaryModal').classList.remove('show');
}
