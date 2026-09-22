/* ============ storage.js ============ */

const KEY = 'race2apt_save_v1';

export function saveGame(state){
  try{
    const serializable = {
      checkingAccount: state.checkingAccount,
      apartmentPrice: state.apartmentPrice,
      investmentPortfolio: state.investmentPortfolio,
      salary: state.salary,
      fixedExpenses: state.fixedExpenses,
      burnout: state.burnout,
      monthSummary: state.monthSummary,
      stockPortfolio: state.stockPortfolio,
      portfolioClosedAtTurn: state.portfolioClosedAtTurn,
      lastPortfolioRealization: state.lastPortfolioRealization,
      lastSpecialInvestment: state.lastSpecialInvestment,
      specialInvestment: state.specialInvestment,
      slots: state.slots,
      index: state.index,
      total: state.total,
      nickname: state.nickname,
      stats: state.stats,
      savedAt: Date.now()
    };
    localStorage.setItem(KEY, JSON.stringify(serializable));
  }catch(e){ console.warn('saveGame failed', e); }
}

export function loadGame(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed.index !== 'number' || !Array.isArray(parsed.slots)) return null;
    return parsed;
  }catch(e){ console.warn('loadGame failed', e); return null; }
}

export function clearSave(){
  try{ localStorage.removeItem(KEY); }catch(e){}
}

export function hasSave(){
  return !!loadGame();
}
