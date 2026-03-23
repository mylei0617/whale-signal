// ─── smartMoney.js ──────────────────────────────────────────────────────────
// Smart Money 钱包评分系统 V3 + Tier System
// 追踪钱包历史胜率，对高质量钱包信号加权增强

import { getTrumpPrice } from "./price.js";

// ─── 内存数据库 ──────────────────────────────────────────────────────────
export let walletStats = {};     // wallet → { totalTrades, wins, winRate, avgProfit, tier }
let pendingSignals = [];         // { wallet, price, ts, tx, score }
let checkTimer = null;           // 定时器引用

// ─── Tier 映射 ────────────────────────────────────────────────────────────
export const TIER_MAP = {
  S: { emoji: "👑", label: "S级", scoreBonus: 40 },
  A: { emoji: "💎", label: "A级", scoreBonus: 20 },
  B: { emoji: "🔵", label: "B级", scoreBonus: 0  },
  C: { emoji: "⚠️", label: "C级", scoreBonus: -20 },
};

// ─── 计算钱包 Tier（样本量 ≥ 30 才生效）──────────────────────────────────
export function calcTier(winRate, avgProfit = 0, totalTrades = 0) {
  if (totalTrades < 30) return "C"; // 样本不足，强制 C 级
  if (winRate > 0.7 && avgProfit > 0.02) return "S";
  if (winRate >= 0.6) return "A";
  if (winRate >= 0.5) return "B";
  return "C";
}

// ─── 初始化 ───────────────────────────────────────────────────────────────
function initWallet(wallet) {
  if (!walletStats[wallet]) {
    walletStats[wallet] = { totalTrades: 0, wins: 0, winRate: 0.5, avgProfit: 0, tier: "C" };
  }
}

// ─── Tier 加权 ────────────────────────────────────────────────────────────
export function applyWinRateScore(score, wallet) {
  initWallet(wallet);
  const s = walletStats[wallet];
  const tierInfo = TIER_MAP[s.tier] || TIER_MAP.C;
  return score + tierInfo.scoreBonus;
}

// ─── 是否有 Tier S 钱包 ─────────────────────────────────────────────────
export function hasTierS(wallets) {
  return wallets.some(w => (walletStats[w]?.tier || "B") === "S");
}

// ─── 记录 BUY 信号 ───────────────────────────────────────────────────────
export function recordSignal(wallet, price, tx, score) {
  initWallet(wallet);
  pendingSignals.push({ wallet, price, ts: Date.now(), tx, score });
  scheduleCheck();
}

// ─── 定时检查 pending 信号 ────────────────────────────────────────────────
function scheduleCheck() {
  if (checkTimer) return;
  checkTimer = setTimeout(checkPendingSignals, 31 * 60 * 1000);
}

async function checkPendingSignals() {
  checkTimer = null;
  const now = Date.now();
  const cutoff = now - 30 * 60 * 1000;

  const toCheck = pendingSignals.filter(s => s.ts < cutoff);
  pendingSignals = pendingSignals.filter(s => s.ts >= cutoff);

  if (toCheck.length === 0) return;

  console.log(`[smartMoney] Checking ${toCheck.length} pending signals...`);

  let currentPrice;
  try {
    currentPrice = await getTrumpPrice();
  } catch (e) {
    console.error("[smartMoney] Failed to get price:", e.message);
    if (pendingSignals.length > 0) scheduleCheck();
    return;
  }

  for (const sig of toCheck) {
    const profit = (currentPrice - sig.price) / sig.price;
    const isWin = profit > 0.02;
    updateStats(sig.wallet, isWin, profit);
    console.log(`[smartMoney] ${sig.wallet.slice(0,8)} entry=${sig.price} current=${currentPrice} profit=${(profit*100).toFixed(1)}% → ${isWin ? 'WIN' : 'LOSS'}`);
  }

  if (pendingSignals.length > 0) scheduleCheck();
}

// ─── 更新胜率 + Tier ─────────────────────────────────────────────────────
function updateStats(wallet, isWin, profit) {
  initWallet(wallet);
  const s = walletStats[wallet];
  s.totalTrades += 1;
  if (isWin) s.wins += 1;
  s.avgProfit = s.avgProfit === 0 ? profit : s.avgProfit * 0.7 + profit * 0.3;
  s.winRate = s.wins / s.totalTrades;
  s.tier = calcTier(s.winRate, s.avgProfit, s.totalTrades);
}

// ─── 格式化胜率+Tier 信息 ────────────────────────────────────────────────
export function formatWinRateInfo(wallets) {
  return wallets.map(w => {
    const s = walletStats[w] || { winRate: 0.5, tier: "C", avgProfit: 0, totalTrades: 0 };
    const short = w.length > 8 ? `${w.slice(0,4)}...${w.slice(-4)}` : w;

    if (s.totalTrades < 30) {
      return `${short}（⚠️样本不足 ${s.totalTrades}/30）`;
    }

    const rate = Math.round((s.winRate || 0.5) * 100);
    const tierInfo = TIER_MAP[s.tier] || TIER_MAP.C;
    const profitTag = s.tier === "S" ? ` 收益${(s.avgProfit*100).toFixed(1)}%` : "";
    return `${short}（${tierInfo.emoji}${tierInfo.label} ${rate}%）${profitTag}`;
  });
}

// ─── 获取钱包 Tier 信息 ───────────────────────────────────────────────────
export function getTierInfo(wallet) {
  initWallet(wallet);
  const s = walletStats[wallet];
  return { ...s, tierInfo: TIER_MAP[s.tier] };
}

console.log("Smart Money system ready");
