// ─── performance.js ───────────────────────────────────────────────────────────
// Performance Engine — 交易绩效统计 + 止盈 + 动量过滤

import { getTrumpPrice } from "../core/price.js";

let tradeHistory = [];
let openPositions = []; // { entryPrice, position, signalType, ts, soldQty }

export function recordOpen(entryPrice, position, signalType) {
  openPositions.push({ entryPrice, position, signalType, ts: Date.now(), soldQty: 0 });
  console.log(`[perf] 📝 开仓 price=$${entryPrice} position=${position}%`);
}

export function recordClose(exitPrice, reason = "手动") {
  while (openPositions.length > 0) {
    const pos = openPositions.pop();
    const pnl = (exitPrice - pos.entryPrice) / pos.entryPrice;
    tradeHistory.unshift({ entryPrice: pos.entryPrice, exitPrice, pnl, signalType: pos.signalType, ts: Date.now(), reason });
    console.log(`[perf] 📤 平仓 price=$${exitPrice} pnl=${(pnl*100).toFixed(1)}%`);
  }
}

export async function checkTakeProfit() {
  if (openPositions.length === 0) return [];
  let price;
  try { price = await getTrumpPrice(); } catch { return []; }
  const triggered = [], remaining = [];
  for (const pos of openPositions) {
    const gain = (price - pos.entryPrice) / pos.entryPrice;
    let sold = pos.soldQty || 0;
    if (gain >= 0.05 && sold < 30)  { triggered.push({ type: "TP1", price, gain, qty: 30-sold, reason: "止盈+5%卖出30%" }); sold = 30; }
    if (gain >= 0.10 && sold < 70)  { triggered.push({ type: "TP2", price, gain, qty: 40, reason: "止盈+10%再卖40%" }); sold = 70; }
    if (gain >= 0.20 && sold < 100) { triggered.push({ type: "TP3", price, gain, qty: 100-sold, reason: "止盈+20%全卖" }); sold = 100; }
    if (sold >= 100) {
      const pnl = (price - pos.entryPrice) / pos.entryPrice;
      tradeHistory.unshift({ entryPrice: pos.entryPrice, exitPrice: price, pnl, signalType: pos.signalType, ts: Date.now(), reason: "止盈" });
      console.log(`[perf] 💰 止盈全卖 price=$${price} pnl=${(pnl*100).toFixed(1)}%`);
    } else remaining.push({ ...pos, soldQty: sold });
  }
  openPositions = remaining;
  return triggered;
}

export function getStats() {
  const t = tradeHistory;
  if (t.length === 0) return { trades: 0, winRate: "0%", avgProfit: "0%", totalPnl: "0%", profitFactor: "0", maxDrawdown: "0%", bySignal: {} };
  const wins = t.filter(x => x.pnl > 0), losses = t.filter(x => x.pnl <= 0);
  const totalWin = wins.reduce((s, x) => s + x.pnl, 0), totalLoss = Math.abs(losses.reduce((s, x) => s + x.pnl, 0));
  let maxDD = 0, currentDD = 0, peak = 0;
  for (const x of t) { peak = Math.max(peak, peak + x.pnl); currentDD = Math.min(currentDD + x.pnl, 0); maxDD = Math.min(maxDD, currentDD); }
  const bySignal = {};
  for (const sig of ["PRE_PUMP","RESONANCE","SMART_RESONANCE","SELL_RESONANCE","STOP_LOSS","止盈"]) {
    const s = t.filter(x => x.signalType === sig || x.reason === sig);
    if (s.length > 0) bySignal[sig] = { count: s.length, winRate: (s.filter(x=>x.pnl>0).length/s.length*100).toFixed(0)+"%", avgPnl: (s.reduce((sum,x)=>sum+x.pnl,0)/s.length*100).toFixed(1)+"%" };
  }
  return {
    trades: t.length, winRate: (wins.length/t.length*100).toFixed(0)+"%",
    avgProfit: (t.reduce((s,x)=>s+x.pnl,0)/t.length*100).toFixed(1)+"%",
    totalPnl: (t.reduce((s,x)=>s+x.pnl,0)*100).toFixed(1)+"%",
    profitFactor: totalLoss > 0 ? (totalWin/totalLoss).toFixed(2) : "∞",
    maxDrawdown: (Math.abs(maxDD)*100).toFixed(1)+"%",
    bySignal,
  };
}

export function getHistory() { return tradeHistory.slice(0, 50); }
export function getTradeLog() { return tradeHistory.slice(0, 50); }
export function getOpenPositions() { return openPositions; }
export function clearHistory() { tradeHistory = []; openPositions = []; console.log("[perf] History cleared"); }

console.log("Performance engine ready");
