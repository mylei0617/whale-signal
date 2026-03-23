// ─── performance.js ───────────────────────────────────────────────────────────
// Performance Engine — 交易绩效统计
// 记录所有交易，计算收益指标

import { getTrumpPrice } from "../core/price.js";

// ─── 数据结构 ───────────────────────────────────────────────────────────
let tradeHistory   = [];   // { entryPrice, exitPrice, position, pnl, signalType, ts }
let openPositions  = [];   // 开仓记录 { entryPrice, position, signalType, ts }

// ─── Step 2: 记录开仓 ──────────────────────────────────────────────────
export function recordOpen(entryPrice, position, signalType) {
  openPositions.push({ entryPrice, position, signalType, ts: Date.now() });
  console.log(`[perf] 📝 开仓 price=$${entryPrice} position=${position}% signal=${signalType}`);
}

// ─── Step 3: 记录平仓 ──────────────────────────────────────────────────
export function recordClose(exitPrice, reason = "手动") {
  const closed = [];
  while (openPositions.length > 0) {
    const pos = openPositions.pop();
    const pnl = (exitPrice - pos.entryPrice) / pos.entryPrice;
    const entry = {
      entryPrice:  pos.entryPrice,
      exitPrice,
      position:    pos.position,
      pnl,
      signalType: pos.signalType,
      ts:         Date.now(),
      reason,
    };
    tradeHistory.unshift(entry);
    closed.push(entry);
    console.log(`[perf] 📤 平仓 price=$${exitPrice} pnl=${(pnl*100).toFixed(1)}% reason=${reason}`);
  }
  return closed;
}

// ─── Step 4: 统计指标 ──────────────────────────────────────────────────
export function getStats() {
  const trades = tradeHistory;
  if (trades.length === 0) {
    return { trades: 0, winRate: 0, avgProfit: 0, totalPnl: 0, profitFactor: 0, maxDrawdown: 0, bySignal: {} };
  }

  const wins    = trades.filter(t => t.pnl > 0);
  const losses  = trades.filter(t => t.pnl <= 0);

  const totalWin   = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLoss  = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  // 最大连续亏损
  let maxDD = 0, currentDD = 0, peak = 0;
  for (const t of trades) {
    peak = Math.max(peak, peak + t.pnl);
    currentDD = Math.min(currentDD + t.pnl, 0);
    maxDD = Math.min(maxDD, currentDD);
  }

  // 按信号类型分组
  const bySignal = {};
  for (const signal of ["PRE_PUMP", "RESONANCE", "SMART_RESONANCE", "SELL_RESONANCE", "STOP_LOSS"]) {
    const s = trades.filter(t => t.signalType === signal);
    if (s.length > 0) {
      bySignal[signal] = {
        count:  s.length,
        wins:   s.filter(t => t.pnl > 0).length,
        winRate: (s.filter(t => t.pnl > 0).length / s.length * 100).toFixed(0) + "%",
        avgPnl: (s.reduce((sum, t) => sum + t.pnl, 0) / s.length * 100).toFixed(1) + "%",
      };
    }
  }

  return {
    trades:      trades.length,
    wins:        wins.length,
    losses:      losses.length,
    winRate:     (wins.length / trades.length * 100).toFixed(0) + "%",
    avgProfit:   (trades.reduce((s, t) => s + t.pnl, 0) / trades.length * 100).toFixed(1) + "%",
    totalPnl:    (trades.reduce((s, t) => s + t.pnl, 0) * 100).toFixed(1) + "%",
    profitFactor: totalLoss > 0 ? (totalWin / totalLoss).toFixed(2) : "∞",
    maxDrawdown: (Math.abs(maxDD) * 100).toFixed(1) + "%",
    bySignal,
  };
}

// ─── Step 6: 格式化每日推送 ───────────────────────────────────────────
export function formatDailyReport() {
  const s = getStats();
  if (s.trades === 0) return null;

  const rows = Object.entries(s.bySignal).map(([sig, d]) =>
    `${sig}: ${d.count}笔 胜率${d.winRate} 均收益${d.avgPnl}`
  ).join("\n");

  return (
    `📊 *日交易报告*\n\n` +
    `总交易：*${s.trades}* 笔\n` +
    `胜率：*${s.winRate}*\n` +
    `平均收益：*${s.avgProfit}*\n` +
    `总收益：*${s.totalPnl}*\n` +
    `盈亏比：*${s.profitFactor}*\n` +
    `最大回撤：*${s.maxDrawdown}*\n\n` +
    `📋 信号明细：\n${rows}`
  );
}

// ─── 获取交易历史 ───────────────────────────────────────────────────────
export function getHistory() {
  return tradeHistory.slice(0, 50);
}

// ─── 获取开仓记录 ───────────────────────────────────────────────────────
export function getOpenPositions() {
  return openPositions;
}

// ─── 清空历史（测试用）─────────────────────────────────────────────────
export function clearHistory() {
  tradeHistory = [];
  openPositions = [];
  console.log("[perf] History cleared");
}

console.log("Performance engine ready");
