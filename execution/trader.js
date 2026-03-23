// ─── trader.js ─────────────────────────────────────────────────────────────
// Execution Engine V1
// 根据信号自动下单（Paper / Live 模式）

import crypto from "crypto";
import { getTrumpPrice } from "../core/price.js";
import { recordOpen, recordClose, checkTakeProfit } from "./performance.js";

// ─── 状态 ────────────────────────────────────────────────────────────────
let tradeLog      = [];
let paperPosition = 0;
let momentumQueue = []; // { ts, entryPrice, signalType, tx }
let recentSells = [];   // { wallet, ts }
let processedTx = new Set(); // 幂等控制：已处理的tx

// ─── 配置 ────────────────────────────────────────────────────────────────
const MODE = process.env.TRADE_MODE || "paper";
const BYBIT_TESTNET = process.env.BYBIT_TESTNET === "true";

// ─── 工具 ────────────────────────────────────────────────────────────────
function now() { return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }); }

function logTrade(e) {
  tradeLog.unshift({ ts: Date.now(), ...e });
  if (tradeLog.length > 100) tradeLog.pop();
  console.log(`[trader] ${e.action} ${e.side} ${e.quantity||"-"}% @ $${e.price} (${MODE})`);
}

// ─── Bybit ───────────────────────────────────────────────────────────────
async function bybitRequest(method, path, params = {}) {
  const ts = Date.now().toString();
  const recv = (parseInt(ts) + 10000).toString();
  const paramStr = Object.entries(params).map(([k,v]) => `${k}=${v}`).join("&");
  const signStr = ts + (process.env.BYBIT_API_KEY||"") + recv + paramStr;
  const sign = crypto.createHmac("sha256", process.env.BYBIT_API_SECRET||"").update(signStr).digest("hex");
  const base = BYBIT_TESTNET ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
  const res = await fetch(`${base}${path}?${paramStr}`, {
    method, headers: { "X-BAPI-API-KEY": process.env.BYBIT_API_KEY||"", "X-BAPI-SIGN": sign,
      "X-BAPI-SIGN-TYPE": "2", "X-BAPI-TIMESTAMP": ts, "X-BAPI-RECV-WINDOW": "10000", "Content-Type": "application/json" }
  });
  return res.json();
}

async function getMarketPrice() {
  try { return await getTrumpPrice(); } catch { return 0; }
}

// ─── 止盈检查（代理）────────────────────────────────────────────────────
async function runTakeProfit() { return await checkTakeProfit(); }

// ─── 反向平仓检查 ────────────────────────────────────────────────────────
function checkReverseExit() {
  const now = Date.now();
  recentSells = recentSells.filter(s => now - s.ts < 10 * 60 * 1000);
  const unique = [...new Set(recentSells.map(s => s.wallet))];
  if (unique.length >= 2) { recentSells = []; return true; }
  return false;
}

// ─── 执行买入 ────────────────────────────────────────────────────────────
async function doBuy(signalType, quantity) {
  const price = await getMarketPrice();
  if (!price) return null;
  if (MODE === "paper") paperPosition = quantity;
  recordOpen(price, quantity, signalType);
  const entry = { mode: MODE, side: "BUY", signalType, price, quantity, action: "✅ 已自动下单" };
  logTrade(entry);
  return entry;
}

// ─── 执行卖出 ────────────────────────────────────────────────────────────
async function doSell(signalType, reason) {
  const price = await getMarketPrice();
  if (!price) return null;
  recordClose(price, reason);
  if (MODE === "paper") paperPosition = 0;
  const entry = { mode: MODE, side: "SELL", signalType, price, quantity: 0, action: "✅ 已自动卖出" };
  logTrade(entry);
  return entry;
}

// ─── 主执行函数 ──────────────────────────────────────────────────────────
const POSITION_MAP = {
  PRE_PUMP_TIER_S: 15, PRE_PUMP_TIER_A: 10, PRE_PUMP: 5,
  RESONANCE: 15, SMART_RESONANCE: 30, SELL_RESONANCE: 0, STOP_LOSS: 0,
};

export async function executeSignal(signalType, currentPosition = 0, tx = "") {
  // 幂等检查
  if (tx && processedTx.has(tx)) {
    console.log(`[trader] duplicate tx ignored: ${tx.slice(0,20)}`);
    return null;
  }

  const targetPos = POSITION_MAP[signalType] ?? 0;
  if (targetPos === 0 && signalType !== "SELL_RESONANCE" && signalType !== "STOP_LOSS") return null;

  // SELL / 止损
  if (signalType === "SELL_RESONANCE" || signalType === "STOP_LOSS") {
    if (checkReverseExit()) console.log("[trader] 🚨 反向信号平仓触发");
    const result = await doSell(signalType, signalType === "STOP_LOSS" ? "止损" : "SELL信号");
    if (result && tx) processedTx.add(tx);
    return result;
  }

  // BUY：动量过滤，先入队等5分钟
  const price = await getMarketPrice();
  if (price > 0) {
    momentumQueue.push({ ts: Date.now(), entryPrice: price, signalType, tx });
    console.log(`[trader] ⏳ 动量等待中，5分钟后确认... tx=${tx.slice(0,20)}`);
  }
  return null; // 等5分钟后再处理
}

// ─── 格式化消息 ─────────────────────────────────────────────────────────
export function formatTradeMessage(entry) {
  if (!entry) return "";
  return `\n─────────────\n✅ *${entry.action}*\n方向：${entry.side==="BUY"?"📈 BUY":"📉 SELL"}\n仓位：${entry.side==="BUY"?`${entry.quantity}%`:"全部"}\n价格：$${entry.price}\n模式：${MODE==="paper"?"📝 Paper模拟":"💰 实盘"}\n当前仓位：${paperPosition}%\n_${now()}_`;
}

export function formatTakeProfitMessage(triggered) {
  const lines = triggered.map(t => {
    if (t.type === "TP1") return `💰 止盈 +${(t.gain*100).toFixed(1)}%：已卖出 30%`;
    if (t.type === "TP2") return `💰 止盈 +${(t.gain*100).toFixed(1)}%：再卖 40%（累计70%）`;
    if (t.type === "TP3") return `💰 止盈 +${(t.gain*100).toFixed(1)}%：全部卖出`;
    return "";
  });
  return `\n─────────────\n` + lines.join("\n") + `\n_${now()}_`;
}

export function formatMomentumFailMessage() {
  return `\n─────────────\n⚠️ *动量不足*\n信号已取消（5分钟内涨幅<1%）\n_${now()}_`;
}

export function formatReverseExitMessage() {
  return `\n─────────────\n🚨 *反向信号*\n检测到大户卖出\n已清仓\n_${now()}_`;
}

export function addSellSignal(wallet) { recentSells.push({ wallet, ts: Date.now() }); }

// ─── 导出 ───────────────────────────────────────────────────────────────
export function getPosition() { return MODE === "paper" ? paperPosition : 0; }
export { checkTakeProfit, checkReverseExit };

export { momentumQueue, recentSells, processedTx };

console.log(`Execution engine ready (${MODE} mode)`);
