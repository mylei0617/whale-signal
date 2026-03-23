// ─── smartMoney.js ──────────────────────────────────────────────────────────
// Smart Money 钱包评分系统 V3
// 追踪钱包历史胜率，对高质量钱包信号加权增强

import { getTrumpPrice } from "./price.js";

// ─── 内存数据库 ──────────────────────────────────────────────────────────
export let walletStats = {};     // wallet → { totalTrades, wins, winRate }
let pendingSignals = [];         // { wallet, price, ts, tx, score }
let checkTimer = null;           // 定时器引用

// ─── Step 8: 初始化 ─────────────────────────────────────────────────────
function initWallet(wallet) {
  if (!walletStats[wallet]) {
    walletStats[wallet] = { totalTrades: 0, wins: 0, winRate: 0.5 };
  }
}

// ─── Step 5: 胜率加权 ────────────────────────────────────────────────────
export function applyWinRateScore(score, wallet) {
  initWallet(wallet);
  const { winRate } = walletStats[wallet];
  let bonus = 0;
  if (winRate > 0.6) bonus += 20;
  if (winRate < 0.4) bonus -= 15;
  return score + bonus;
}

// ─── Step 6: 共振增强（胜率版）────────────────────────────────────────────
export function checkSmartResonance(wallets) {
  return wallets.some(w => (walletStats[w]?.winRate || 0.5) > 0.6);
}

// ─── Step 2: 记录 BUY 信号 ───────────────────────────────────────────────
export function recordSignal(wallet, price, tx, score) {
  initWallet(wallet);
  pendingSignals.push({ wallet, price, ts: Date.now(), tx, score });
  scheduleCheck();
}

// ─── 定时检查 pending 信号 ────────────────────────────────────────────────
function scheduleCheck() {
  if (checkTimer) return; // 已在运行
  checkTimer = setTimeout(checkPendingSignals, 31 * 60 * 1000); // 31分钟后
}

async function checkPendingSignals() {
  checkTimer = null;
  const now = Date.now();
  const cutoff = now - 30 * 60 * 1000; // 30分钟前

  const toCheck = pendingSignals.filter(s => s.ts < cutoff);
  pendingSignals = pendingSignals.filter(s => s.ts >= cutoff);

  if (toCheck.length === 0) return;

  console.log(`[smartMoney] Checking ${toCheck.length} pending signals...`);

  let currentPrice;
  try {
    currentPrice = await getTrumpPrice();
  } catch (e) {
    console.error("[smartMoney] Failed to get price:", e.message);
    // 仍然调度下次检查
    if (pendingSignals.length > 0) scheduleCheck();
    return;
  }

  for (const sig of toCheck) {
    const change = (currentPrice - sig.price) / sig.price;
    const isWin = change > 0.02; // 价格上涨 >2%
    updateStats(sig.wallet, isWin);
    console.log(`[smartMoney] ${sig.wallet.slice(0,8)} price=${sig.price} current=${currentPrice} change=${(change*100).toFixed(1)}% → ${isWin ? 'WIN' : 'LOSS'}`);
  }

  // 还有未到期的，继续调度
  if (pendingSignals.length > 0) scheduleCheck();
}

// ─── Step 3 & 4: 更新胜率 ────────────────────────────────────────────────
function updateStats(wallet, isWin) {
  initWallet(wallet);
  const s = walletStats[wallet];
  s.totalTrades += 1;
  if (isWin) s.wins += 1;
  s.winRate = s.wins / s.totalTrades;
}

// ─── Step 7: 格式化胜率信息 ───────────────────────────────────────────────
export function formatWinRateInfo(wallets) {
  return wallets.map(w => {
    const s = walletStats[w] || { winRate: 0.5 };
    const rate = Math.round((s.winRate || 0.5) * 100);
    const short = w.length > 8 ? `${w.slice(0,4)}...${w.slice(-4)}` : w;
    const tag = rate > 60 ? "💎" : rate < 40 ? "⚠️" : "";
    return `${short}（胜率${rate}%）${tag}`;
  });
}

export function getStats(wallet) {
  return walletStats[wallet] || null;
}

console.log("Smart Money system ready");
