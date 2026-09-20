/* ============ ui.js ============
   Everything that reads or writes the DOM. */

import { CONFIG, QUESTIONS, PORTFOLIO_TRACKS } from './data.js';
import { state, shuffle, rand, chooseOption,
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

/* ---------- question ---------- */
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

/* ---------- special investment ---------- */
export function renderSpecialInvestment(inv){
  const chancePct = Math.round(state.specialInvestment.rolledChance * 10) / 10;
  const checking = state.checkingAccount;

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
    '<div class="opp-result" id="oppResult"></div>';

  $('oppInfoBtn').addEventListener('click', () => openInfoModal(inv.name, inv.desc));

  const optWrap = $('options');
  optWrap.innerHTML = '';

  const eligible = CONFIG.specialInvestmentPercentOptions
    .filter(p => checking * p >= CONFIG.specialInvestmentMinAmount);

  if(eligible.length === 0){
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

/* ---------- portfolio modal ---------- */
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
      if(mod === 0){
        note = 'הפקדת החודש — מימוש יתאפשר בחודש הבא.';
      } else {
        note = 'הפקדת החודש — מימוש יתאפשר בעוד ' + monthsToRealize + ' חודשים.';
      }
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
    '<div class="portfolio-realize-row"><
