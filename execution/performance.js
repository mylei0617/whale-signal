// ─── performance.js ───────────────────────────────────────────────────────────
// Performance Engine — 交易绩效统计 + 止盈 + 动量过滤 + 反向平仓
// 记录所有交易，计算收益指标

import { getTrumpPrice } from "../core/price.js";

// ─── 数据结构 ───────────────────────────────────────────────────────────
let tradeHistory   = [];
let openPositions  = [];
let momentumPending = [];  // { wallet, entryPrice, signalType, ts }
let recentSells    = [];   // { wallet, ts }

// ─── 开仓 ─────────────────────────────────────────────────────────────
export function recordOpen(entryPrice, position, signalType) {
  openPositions.push({ entryPrice, position, signalType, ts: Date.now(), takeProfitStage: 0, soldQty: 0 });
  console.log(`[perf] 📝 开仓 price=$${entryPrice} position=${position}% signal=${signalType}`);
}

// ─── 平仓 ─────────────────────────────────────────────────────────────
export function recordClose(exitPrice, reason = "手动") {
  const closed = [];
  while (openPositions.length > 0) {
    const pos = openPositions.pop();
    const pnl = (exitPrice - pos.entryPrice) / pos.entryPrice;
    tradeHistory.unshift({ entryPrice: pos.entryPrice, exitPrice, position: pos.position, pnl, signalType: pos.signalType, ts: Date.now(), reason });
    closed.push(pos);
    console.log(`[perf] 📤 平仓 price=$${exitPrice} pnl=${(pnl*100).toFixed(1)}% reason=${reason}`);
  }
  return closed;
}

// ─── 分批止盈检查 ───────────────────────────────────────────────────────
export async function checkTakeProfit() {
  if (openPositions.length === 0) return [];
  let price;
  try { price = await getTrumpPrice(); } catch { return []; }
  const triggered = [];
  const remaining = [];
  for (const pos of openPositions) {
    const gain = (price - pos.entryPrice) / pos.entryPrice;
    const stage = pos.takeProfitStage || 0;
    let soldQty = pos.soldQty || 0;
    if (gain >= 0.05 && stage < 1 && soldQty < 30) {
      triggered.push({ type: "TAKE_PROFIT_1", price, gain, qty: 30 - soldQty, pos });
      soldQty = 30;
    }
    if (gain >= 0.10 && stage < 2 && soldQty < 70) {
      triggered.push({ type: "TAKE_PROFIT_2", price, gain, qty: 40, pos });
      soldQty = 70;
    }
    if (gain >= 0.20 && stage < 3 && soldQty < 100) {
      triggered.push({ type: "TAKE_PROFIT_3", price, gain, qty: 100 - soldQty, pos });
      soldQty = 100;
    }
    if (soldQty >= 100) {
      const pnl = (price - pos.entryPrice) / pos.entryPrice;
      tradeHistory.unshift({ entryPrice: pos.entryPrice, exitPrice: price, position: pos.position, pnl, signalType: pos.signalType, ts: Date.now(), reason: "止盈" });
    } else {
      remaining.push({ ...pos, takeProfitStage: soldQty >= 30 ? 1 : soldQty >= 70 ? 2 : stage, soldQty });
    }
  }
  openPositions = remaining;
  return triggered;
}

// ─── 动量过滤 ─────────────────────────────────────────────────────────
export function addMomentumPending(wallet, entryPrice, signalType) {
  momentumPending.push({ wallet, entryPrice, signalType, ts: Date.now() });
}

export async function checkMomentum() {
  if (momentumPending.length === 0) return [];
  let price;
  try { price = await getTrumpPrice(); } catch { return []; }
  const now = Date.now();
  const elapsed = momentumPending.filter(m => now - m.ts >= 5 * 60 * 1000);
  momentumPending = momentumPending.filter(m => now - m.ts < 5 * 60 * 1000);
  const failed = elapsed.filter(m => (price - m.entryPrice) / m.entryPrice < 0.01);
  for (const f of failed) console.log(`[momentum] ⚠️ 动量不足: ${((price-f.entryPrice)/f.entryPrice*100).toFixed(1)}% < 1%`);
  momentumPending = momentumPending.filter(m => !failed.includes(m));
  return elapsed.filter(m => !failed.includes(m));
}

// ─── 反向信号平仓 ─────────────────────────────────────────────────────


// ─── 统计指标 ──────────────────────────────────────────────────────────
export function getStats() {
  const trades = tradeHistory;
  if (trades.length === 0) return { trades: 0, winRate: "0%", avgProfit: "0%", totalPnl: "0%", profitFactor: "0", maxDrawdown: "0%", bySignal: {} };
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  let maxDD = 0, currentDD = 0, peak = 0;
  for (const t of trades) { peak = Math.max(peak, peak + t.pnl); currentDD = Math.min(currentDD + t.pnl, 0); maxDD = Math.min(maxDD, currentDD); }
  const bySignal = {};
  for (const sig of ["PRE_PUMP","RESONANCE","SMART_RESONANCE","SELL_RESONANCE","STOP_LOSS","TAKE_PROFIT_1","TAKE_PROFIT_2","TAKE_PROFIT_3"]) {
    const s = trades.filter(t => t.signalType === sig);
    if (s.length > 0) bySignal[sig] = { count: s.length, winRate: (s.filter(t=>t.pnl>0).length/s.length*100).toFixed(0)+"%", avgPnl: (s.reduce((sum,t)=>sum+t.pnl,0)/s.length*100).toFixed(1)+"%" };
  }
  return {
    trades: trades.length, winRate: (wins.length/trades.length*100).toFixed(0)+"%",
    avgProfit: (trades.reduce((s,t)=>s+t.pnl,0)/trades.length*100).toFixed(1)+"%",
    totalPnl: (trades.reduce((s,t)=>s+t.pnl,0)*100).toFixed(1)+"%",
    profitFactor: totalLoss > 0 ? (totalWin/totalLoss).toFixed(2) : "∞",
    maxDrawdown: (Math.abs(maxDD)*100).toFixed(1)+"%",
    bySignal,
  };
}

export function getHistory() { return tradeHistory.slice(0, 50); }
export function getTradeLog() { return tradeHistory.slice(0, 50); }
export function getOpenPositions() { return openPositions; }

export function clearHistory() {
  tradeHistory = []; openPositions = []; momentumPending = []; recentSells = [];
  console.log("[perf] History cleared");
}

console.log("Performance engine ready");
