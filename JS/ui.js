/* ============ ui.js ============ */

import { CONFIG, QUESTIONS, PORTFOLIO_TRACKS } from './data.js';
import { state, shuffle, rand, chooseOption,
         applyInflationAndAdvance, openPortfolio, depositToPortfolio,
         canOpenNewPortfolio, canRealizePortfolio, realizePortfolio,
         investSpecial, skipSpecialInvestment, getSpecialInvestmentType }
         from './game.js';

export const $ = id => document.getElementById(id);
export const fmt = n => Math.round(n).toLocaleString('he-IL') + ' ₪';

const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

export function turnToDate(turn){
  const totalMonths = turn - 1;
  const startMonthIdx = CONFIG.startMonth || 0;
  const startYear = CONFIG.startYear || 2027;
  const monthIdx = (startMonthIdx + totalMonths) % 12;
  const year = startYear + Math.floor((startMonthIdx + totalMonths) / 12);
  return { monthName: MONTHS_HE[monthIdx], year, monthIdx };
}

export function formatDuration(turns){
  const totalMonths = Math.max(0, turns - 1);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if(years === 0){
    if(months === 0) return 'חודש';
    if(months === 1) return 'חודש';
    return months + ' חודשים';
  }
  let yearText;
  if(years === 1) yearText = 'שנה';
  else if(years === 2) yearText = 'שנתיים';
  else yearText = years + ' שנים';
  if(months === 0) return yearText;
  if(months === 1) return yearText + ' וחודש';
  return yearText + ' ו-' + months + ' חודשים';
}

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
    let returnText = '';
    if(lastReturn !== null && lastReturn !== undefined){
      const sign = lastReturn >= 0 ? '+' : '-';
      const absPct = Math.abs(Math.round(lastReturn*1000)/10);
      returnText = ' · תשואה אחרונה: ' + sign + absPct + '%';
    }
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

export function renderSpecialInvestment(inv){
  const chancePct = Math.round(state.specialInvestment.rolledChance * 10) / 10;
  const payoutMult = state.specialInvestment.rolledPayout;
  const lossMult = state.specialInvestment.rolledLoss;
  const checking = state.checkingAccount;

  const eligible = CONFIG.specialInvestmentPercentOptions
    .filter(p => checking * p >= CONFIG.specialInvestmentMinAmount);

  if(eligible.length === 0){
    const q = QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)];
    renderQuestion(q);
    return;
  }

  $('mainCard').classList.remove('flash-win','flash-lose');
  $('cardContent').innerHTML =
    '<div class="opp-label">הזדמנות השקעה</div>' +
    '<div class="opp-title-row"><div class="opp-title">'+inv.name+'</div>' +
      '<button class="info-btn" id="oppInfoBtn" type="button">?</button></div>' +
    '<div class="opp-risk">'+inv.risk+'</div>' +
    '<div class="opp-body">' +
      '<div class="gauge" id="oppGauge" style="--pct:'+chancePct+'">' +
        '<div class="gauge-inner"><div class="pct" id="oppPct">'+chancePct+'%</div>' +
        '<div class="pct-lbl">סיכוי הצלחה</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="opp-multipliers">פי ' + payoutMult.toFixed(2) + ' על הכסף בהצלחה · פי ' + lossMult.toFixed(2) + ' בכישלון</div>' +
    '<div class="opp-realize-note">(ניתן לממש את תיק ההשקעות לצורך השקעה זו)</div>' +
    '<div class="opp-result" id="oppResult"></div>';

  $('oppInfoBtn').addEventListener('click', () => openInfoModal(inv.name, inv.desc));

  const optWrap = $('options');
  optWrap.innerHTML = '';

  eligible.forEach(p => {
    const amount = checking * p;
    const winProfit = amount * payoutMult - amount;
    const lossProfit = amount * lossMult - amount;
    const winText = (winProfit >= 0 ? '+' : '-') + fmt(Math.abs(winProfit));
    const lossText = (lossProfit >= 0 ? '+' : '-') + fmt(Math.abs(lossProfit));

    const btn = document.createElement('button');
    btn.className = 'option-btn special-invest-btn';
    btn.innerHTML =
      '<div class="sib-top">' + Math.round(p*100) + '% מהעו"ש — ' + fmt(amount) + '</div>' +
      '<div class="sib-bottom">' +
        '<span class="sib-win">✅ בהצלחה ' + winText + '</span>' +
        '<span class="sib-sep">·</span>' +
        '<span class="sib-lose">❌ בהפסד ' + lossText + '</span>' +
      '</div>';
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

export function openInfoModal(title, text){
  $('infoModalTitle').textContent = title;
  $('infoModalText').textContent = text;
  $('infoModal').classList.add('show');
}
export function closeInfoModal(){
  $('infoModal').classList.remove('show');
}

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
      if(isDeposit) depositToPortfolio(pct);
      else openPortfolio(portfolioModalPendingTrack, pct);
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
  let returnText = '—';
  let returnClass = '';
  if(lastReturn !== null && lastReturn !== undefined){
    const sign = lastReturn >= 0 ? '+' : '-';
    const absPct = Math.abs(Math.round(lastReturn*1000)/10);
    returnText = sign + absPct + '%';
    returnClass = lastReturn > 0 ? 'positive' : (lastReturn < 0 ? 'negative' : '');
  }
  const depositedThisTurn = state.stockPortfolio.depositedThisTurn;
  const currentTurn = state.index + 1;
  const canRealizeNow = canRealizePortfolio();
  const mod = currentTurn % CONFIG.portfolioRealizeEveryMonths;
  const monthsToRealize = mod === 0 ? 0 : CONFIG.portfolioRealizeEveryMonths - mod;
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
  html += '<div class="portfolio-realize-row"><span>תשואה אחרונה</span><span class="' + returnClass + '">' + returnText + '</span></div>';
  html += specialLine;

  if(depositedThisTurn){
    html += '<div class="portfolio-locked-note" style="margin-top:12px;">הפקדת כבר החודש. הפקדה נוספת תתאפשר בחודש הבא.</div>';
  } else {
    html += '<button class="btn-primary" id="portfolioDepositBtn" style="margin-top:14px;" type="button">הפקד לתיק</button>';
  }

  if(canRealizeNow){
    html += '<button class="btn-secondary" id="portfolioRealizeOpenBtn" style="margin-top:10px;" type="button">מימוש תיק</button>';
  } else {
    let note;
    if(depositedThisTurn){
      if(mod === 0) note = 'הפקדת החודש — מימוש יתאפשר בחודש הבא.';
      else note = 'הפקדת החודש — מימוש יתאפשר בעוד ' + monthsToRealize + ' חודשים.';
    } else {
      note = 'ניתן לממש בעוד ' + monthsToRealize + ' חודשים.';
    }
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

export function renderWinScreen(quote){
  const finalWealth = state.checkingAccount + state.investmentPortfolio;
  const date = turnToDate(state.index + 1);
  $('winCapital').textContent = fmt(finalWealth);
  $('winPrice').textContent = fmt(state.apartmentPrice);
  $('winQuote').textContent = quote;
  $('winDate').textContent = 'הגעת לדירה ב' + date.monthName + ' ' + date.year;
  showScreen('win');
}

export function renderLoseScreen(quote, reason){
  const finalWealth = state.checkingAccount + state.investmentPortfolio;
  const date = turnToDate(state.index + 1);
  $('loseCapital').textContent = fmt(finalWealth);
  $('losePrice').textContent = fmt(state.apartmentPrice);
  $('loseTitle').textContent = reason === 'burnout' ? 'נשברת מעומס' : 'הדירה ברחה לך';
  $('loseQuote').textContent = quote;
  $('loseDate').textContent = 'המשחק הסתיים ב' + date.monthName + ' ' + date.year;
  showScreen('lose');
}

function signFmt(n){
  const sign = n >= 0 ? '+' : '-';
  return sign + fmt(Math.abs(n));
}

export function showMonthSummary(ms){
  const percentBefore = ((ms.checkingBefore + ms.investmentPortfolioBefore) / ms.apartmentPriceBefore) * 100;
  const percentAfter  = ((ms.checkingAfter  + ms.investmentPortfolioAfter)  / ms.apartmentPriceAfter)  * 100;
  const pctDelta = percentAfter - percentBefore;

  let html = '';
  const net = ms.netProfit;
  const netSent = net > 0 ? 'positive' : (net < 0 ? 'negative' : 'neutral');
  const netText = net === 0
    ? 'החודש לא היה שינוי נטו'
    : (net > 0 ? 'החודש הרווחת ' + fmt(net) : 'החודש הפסדת ' + fmt(Math.abs(net)));
  const pctDeltaText = Math.abs(pctDelta) < 0.05
    ? 'ללא שינוי באחוז מהדירה'
    : ((pctDelta > 0 ? '+' : '−') + Math.abs(pctDelta).toFixed(1) + '% מהדירה מאז החודש שעבר');

  html += '<div class="ms-hero ' + netSent + '">' +
    '<div class="ms-hero-main">' + netText + '</div>' +
    '<div class="ms-hero-sub">' + Math.round(percentAfter) + '% ממחיר הדירה · ' + pctDeltaText + '</div>' +
  '</div>';

  if(ms.portfolioReturnPct !== null && ms.portfolioReturnPct !== undefined){
    const pct = ms.portfolioReturnPct;
    const delta = ms.investmentPortfolioAfter - ms.investmentPortfolioBefore;
    const sentiment = pct > 0 ? 'positive' : (pct < 0 ? 'negative' : 'neutral');
    const pctStr = (pct >= 0 ? '+' : '−') + Math.abs(Math.round(pct*1000)/10) + '%';
    let line;
    if(pct === 0) line = 'הבורסה לא זזה החודש';
    else if(delta > 0) line = 'הבורסה עשתה ' + pctStr + ' — הרווחת ' + fmt(delta);
    else if(delta < 0) line = 'הבורסה עשתה ' + pctStr + ' — הפסדת ' + fmt(Math.abs(delta));
    else line = 'הבורסה עשתה ' + pctStr;
    html += '<div class="ms-card ms-market ' + sentiment + '">' +
      '<div class="ms-card-label">📈 תיק השקעות</div>' +
      '<div class="ms-card-body ' + sentiment + '">' + line + '</div>' +
    '</div>';
  }

  if(ms.specialInvestment){
    const si = ms.specialInvestment;
    const sent = si.success ? 'positive' : 'negative';
    const line = si.success
      ? 'השקעת ' + fmt(si.amount) + ' ב' + si.name + ' — הרווחת ' + fmt(si.profit)
      : 'השקעת ' + fmt(si.amount) + ' ב' + si.name + ' — הפסדת ' + fmt(Math.abs(si.profit));
    html += '<div class="ms-card ms-special ' + sent + '">' +
      '<div class="ms-card-label">⚡ השקעה מיוחדת</div>' +
      '<div class="ms-card-body ' + sent + '">' + line + '</div>' +
    '</div>';
  }

  const salarySent = ms.salaryAfter > ms.salaryBefore ? 'positive'
    : (ms.salaryAfter < ms.salaryBefore ? 'negative' : 'neutral');
  const expensesSent = ms.fixedExpensesAfter < ms.fixedExpensesBefore ? 'positive'
    : (ms.fixedExpensesAfter > ms.fixedExpensesBefore ? 'negative' : 'neutral');
  html += '<div class="ms-two-up">' +
    '<div class="ms-tile ' + salarySent + '"><div class="ms-tile-label">משכורת</div><div class="ms-tile-value">' + fmt(ms.salaryAfter) + '</div><div class="ms-tile-delta ' + salarySent + '">' + signFmt(ms.salaryAfter - ms.salaryBefore) + '</div></div>' +
    '<div class="ms-tile ' + expensesSent + '"><div class="ms-tile-label">הוצאות</div><div class="ms-tile-value">' + fmt(ms.fixedExpensesAfter) + '</div><div class="ms-tile-delta ' + expensesSent + '">' + signFmt(ms.fixedExpensesAfter - ms.fixedExpensesBefore) + '</div></div>' +
  '</div>';

  const checkingSent = ms.checkingAfter > ms.checkingBefore ? 'positive'
    : (ms.checkingAfter < ms.checkingBefore ? 'negative' : 'neutral');
  const portfolioSent = ms.investmentPortfolioAfter > ms.investmentPortfolioBefore ? 'positive'
    : (ms.investmentPortfolioAfter < ms.investmentPortfolioBefore ? 'negative' : 'neutral');
  html += '<div class="ms-two-up">' +
    '<div class="ms-tile ' + checkingSent + '"><div class="ms-tile-label">עו"ש</div><div class="ms-tile-value">' + fmt(ms.checkingAfter) + '</div><div class="ms-tile-delta ' + checkingSent + '">' + signFmt(ms.checkingAfter - ms.checkingBefore) + '</div></div>' +
    '<div class="ms-tile ' + portfolioSent + '"><div class="ms-tile-label">תיק השקעות</div><div class="ms-tile-value">' + fmt(ms.investmentPortfolioAfter) + '</div><div class="ms-tile-delta ' + portfolioSent + '">' + signFmt(ms.investmentPortfolioAfter - ms.investmentPortfolioBefore) + '</div></div>' +
  '</div>';

  $('monthSummaryContent').innerHTML = html;
  $('monthSummaryContinue').disabled = false;
  $('monthSummaryModal').classList.add('show');
}

export function closeMonthSummary(){
  $('monthSummaryModal').classList.remove('show');
}

export function openStatsModal(){
  renderStatsModal();
  $('statsModal').classList.add('show');
}
export function closeStatsModal(){
  $('statsModal').classList.remove('show');
}

function renderStatsModal(){
  const s = state.stats || {};
  const turns = state.index + 1;
  const date = turnToDate(turns);
  const startDate = turnToDate(1);
  const finalWealth = state.checkingAccount + state.investmentPortfolio;
  const net = finalWealth - CONFIG.startChecking;
  const netSent = net > 0 ? 'positive' : (net < 0 ? 'negative' : 'neutral');
  const finalPct = (finalWealth / state.apartmentPrice) * 100;

  const netSalary = (s.totalSalaryEarned || 0) - (s.totalExpensesPaid || 0);
  const portfolioNet = (s.portfolioMarketReturns || 0) - (s.portfolioTax || 0);
  const returnPct = (s.portfolioDeposits || 0) > 0
    ? (portfolioNet / s.portfolioDeposits) * 100
    : 0;

  let html = '';

  html += '<div class="ms-hero ' + netSent + '">' +
    '<div class="ms-hero-main">נטו: ' + (net >= 0 ? '+' : '') + fmt(net) + '</div>' +
    '<div class="ms-hero-sub">התחלת עם ' + fmt(CONFIG.startChecking) + ' · סיימת עם ' + fmt(finalWealth) + '</div>' +
  '</div>';

  const burnoutText = Math.round(state.burnout || 0) + '%';
  html += '<div class="stats-meta">' +
    '🎮 ' + formatDuration(turns) + ' · ' + turns + ' תורות<br>' +
    '📅 ' + startDate.monthName + ' ' + startDate.year + ' → ' + date.monthName + ' ' + date.year + '<br>' +
    '⚡ שחיקה סופית: ' + burnoutText + '<br>' +
    '🏠 הגעת ל-' + Math.round(finalPct) + '% ממחיר הדירה' +
  '</div>';

  const netSalarySent = netSalary >= 0 ? 'positive' : 'negative';
  html += '<div class="stats-section">' +
    '<div class="stats-section-title">💰 חסכון מהמשכורת</div>' +
    '<div class="stats-row"><span>משכורות שהתקבלו</span><span class="positive">+' + fmt(s.totalSalaryEarned || 0) + '</span></div>' +
    '<div class="stats-row"><span>הוצאות ששולמו</span><span class="negative">-' + fmt(s.totalExpensesPaid || 0) + '</span></div>' +
    '<div class="stats-row total"><span>נטו</span><span class="' + netSalarySent + '">' + (netSalary >= 0 ? '+' : '-') + fmt(Math.abs(netSalary)) + '</span></div>' +
  '</div>';

  const siProfitSent = (s.totalSpecialProfit || 0) >= 0 ? 'positive' : 'negative';
  const siCount = (s.specialInvestments || []).length;
  html += '<div class="stats-section">' +
    '<div class="stats-section-title">⚡ השקעות מיוחדות</div>' +
    '<div class="stats-row"><span>סה"כ השקעות</span><span>' + siCount + '</span></div>' +
    '<div class="stats-row"><span>הצליחו / נכשלו</span><span>' + (s.totalSpecialSuccess || 0) + ' / ' + (s.totalSpecialFail || 0) + '</span></div>' +
    '<div class="stats-row total"><span>נטו</span><span class="' + siProfitSent + '">' + ((s.totalSpecialProfit || 0) >= 0 ? '+' : '-') + fmt(Math.abs(s.totalSpecialProfit || 0)) + '</span></div>' +
  '</div>';

  const portNetSent = portfolioNet >= 0 ? 'positive' : 'negative';
  const returnSign = returnPct >= 0 ? '+' : '-';
  const deposits = s.portfolioDeposits || 0;
  const hasPortfolioActivity = deposits > 0 || (s.totalRealizations || 0) > 0;

  if(hasPortfolioActivity){
    html += '<div class="stats-section">' +
      '<div class="stats-section-title">📈 תיק השקעות</div>' +
      '<div class="stats-row"><span>סה"כ הופקד</span><span>' + fmt(deposits) + '</span></div>' +
      '<div class="stats-row"><span>תשואות שוק</span><span class="' + ((s.portfolioMarketReturns || 0) >= 0 ? 'positive' : 'negative') + '">' + ((s.portfolioMarketReturns || 0) >= 0 ? '+' : '-') + fmt(Math.abs(s.portfolioMarketReturns || 0)) + '</span></div>' +
      '<div class="stats-row"><span>מס ששולם</span><span class="negative">-' + fmt(s.portfolioTax || 0) + '</span></div>' +
      '<div class="stats-row"><span>תשואה כוללת</span><span class="' + portNetSent + '">' + returnSign + Math.abs(Math.round(returnPct*10)/10) + '%</span></div>' +
      '<div class="stats-row"><span>מימושים</span><span>' + (s.totalRealizations || 0) + '</span></div>' +
      '<div class="stats-row total"><span>נטו</span><span class="' + portNetSent + '">' + (portfolioNet >= 0 ? '+' : '-') + fmt(Math.abs(portfolioNet)) + '</span></div>' +
    '</div>';
  }

  if((s.specialInvestments || []).length > 0){
    html += '<div class="stats-section">' +
      '<div class="stats-section-title">📋 פירוט השקעות</div>';
    s.specialInvestments.forEach(item => {
      const sent = item.profit >= 0 ? 'positive' : 'negative';
      const dateForItem = turnToDate(item.turn);
      const profitText = (item.profit >= 0 ? '+' : '-') + fmt(Math.abs(item.profit));
      html += '<div class="stats-inv-item">' +
        '<span class="sii-when">' + dateForItem.monthName + ' ' + dateForItem.year + '</span>' +
        '<span class="sii-name">' + item.name + '</span>' +
        '<span class="sii-profit ' + sent + '">' + profitText + '</span>' +
      '</div>';
    });
    html += '</div>';
  }

  $('statsModalContent').innerHTML = html;
}
