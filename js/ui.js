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
