// ─── trader.js ─────────────────────────────────────────────────────────────
// Execution Engine V1
// 根据信号自动下单（Paper / Live 模式）

import crypto from "crypto";

// ─── 配置 ────────────────────────────────────────────────────────────────
const MODE         = process.env.TRADE_MODE   || "paper";   // paper | live
const EXCHANGE    = process.env.TRADE_EXCHANGE || "bybit";  // bybit

const BYBIT_API_KEY    = process.env.BYBIT_API_KEY    || "";
const BYBIT_API_SECRET = process.env.BYBIT_API_SECRET || "";
const BYBIT_PASSPHRASE = process.env.BYBIT_PASSPHRASE || "";
const BYBIT_TESTNET    = process.env.BYBIT_TESTNET    === "true";

// ─── 状态 ────────────────────────────────────────────────────────────────
let tradeLog = [];       // 交易记录
let paperPosition = 0;   // Paper 模拟仓位

// ─── 仓位映射 ────────────────────────────────────────────────────────────
const POSITION_MAP = {
  PRE_PUMP_TIER_S: 15,
  PRE_PUMP_TIER_A: 10,
  PRE_PUMP:        5,
  RESONANCE:       15,
  SMART_RESONANCE: 30,
  SELL_RESONANCE:  0,
};

// ─── 工具函数 ────────────────────────────────────────────────────────────
function now() {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function logTrade(entry) {
  tradeLog.unshift({ ts: Date.now(), ...entry });
  if (tradeLog.length > 100) tradeLog.pop();
  console.log(`[trader] ${entry.action} ${entry.side} ${entry.quantity}% @ $${entry.price} (${entry.mode})`);
}

// ─── Bybit 签名 ─────────────────────────────────────────────────────────
async function bybitRequest(method, path, params = {}) {
  const ts = Date.now().toString();
  const recv = (ts + 10000).toString();
  const paramStr = Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&");
  const signStr  = ts + BYBIT_API_KEY + recv + paramStr;
  const sign     = crypto.createHmac("sha256", BYBIT_API_SECRET).update(signStr).digest("hex");

  const base = BYBIT_TESTNET
    ? "https://api-testnet.bybit.com"
    : "https://api.bybit.com";

  const res = await fetch(`${base}${path}?${paramStr}`, {
    method,
    headers: {
      "X-BAPI-API-KEY":     BYBIT_API_KEY,
      "X-BAPI-SIGN":        sign,
      "X-BAPI-SIGN-TYPE":   "2",
      "X-BAPI-TIMESTAMP":   ts,
      "X-BAPI-RECV-WINDOW": "10000",
      "Content-Type":       "application/json",
    },
  });

  return res.json();
}

// ─── 获取当前市场价格 ────────────────────────────────────────────────────
async function getMarketPrice(symbol = "TRUMP-USDT") {
  if (MODE === "paper") {
    // Paper 模式：从 price.js 获取模拟价格
    try {
      const { getTrumpPrice } = await import("../core/price.js");
      return await getTrumpPrice();
    } catch {
      return 0;
    }
  }
  try {
    const data = await bybitRequest("GET", "/v5/market/ticker", { category: "spot", symbol });
    return parseFloat(data.result?.list?.[0]?.lastPrice || "0");
  } catch {
    return 0;
  }
}

// ─── 执行买入 ────────────────────────────────────────────────────────────
async function executeBuy(signalType, targetPosition) {
  const price = await getMarketPrice();
  if (!price) { console.error("[trader] Cannot get price"); return null; }

  const mode     = MODE;
  const quantity = targetPosition;

  if (mode === "paper") {
    paperPosition = quantity;
  } else {
    // Live: Bybit 市价单
    try {
      const res = await bybitRequest("POST", "/v5/order/create", {
        category: "spot",
        symbol:   "TRUMPUSDT",
        side:     "Buy",
        orderType:"Market",
        qty:      quantity.toString(),  // 实际按金额，这里简化
        marketUnit: "quote",
      });
      if (res.retCode !== 0) {
        console.error("[trader] Bybit buy error:", res.retMsg);
        return null;
      }
    } catch (e) {
      console.error("[trader] Bybit buy failed:", e.message);
      return null;
    }
  }

  const entry = {
    mode, side: "BUY", signalType,
    price, quantity, pnl: 0,
    action: "✅ 已自动下单",
  };
  logTrade(entry);
  return entry;
}

// ─── 执行卖出 ────────────────────────────────────────────────────────────
async function executeSell(signalType, reason = "止损") {
  const price = await getMarketPrice();
  if (!price) { console.error("[trader] Cannot get price"); return null; }

  const mode     = MODE;
  const quantity = 0;
  const sellQty  = mode === "paper" ? paperPosition : 100; // 全卖

  if (mode === "paper") {
    paperPosition = 0;
  } else {
    try {
      const res = await bybitRequest("POST", "/v5/order/create", {
        category: "spot",
        symbol:   "TRUMPUSDT",
        side:     "Sell",
        orderType:"Market",
        qty:      sellQty.toString(),
        marketUnit: "quote",
      });
      if (res.retCode !== 0) {
        console.error("[trader] Bybit sell error:", res.retMsg);
        return null;
      }
    } catch (e) {
      console.error("[trader] Bybit sell failed:", e.message);
      return null;
    }
  }

  const entry = {
    mode, side: "SELL", signalType,
    price, quantity, pnl: 0,
    action: "✅ 已自动卖出",
  };
  logTrade(entry);
  return entry;
}

// ─── 主执行函数 ──────────────────────────────────────────────────────────
export async function executeSignal(signalType, currentPosition = 0) {
  if (MODE !== "paper" && MODE !== "live") {
    console.warn(`[trader] Unknown mode: ${MODE}, skipping`);
    return null;
  }

  const targetPos = POSITION_MAP[signalType] ?? 0;

  // 空信号跳过
  if (targetPos === 0 && signalType !== "SELL_RESONANCE") {
    console.log(`[trader] No position target for ${signalType}, skipping`);
    return null;
  }

  // SELL_RESONANCE → 全卖
  if (signalType === "SELL_RESONANCE") {
    return await executeSell(signalType, "SELL信号");
  }

  // 止损 → 全卖
  if (signalType === "STOP_LOSS") {
    return await executeSell(signalType, "止损");
  }

  // BUY → 检查是否需要加仓
  const currentPos = MODE === "paper" ? paperPosition : currentPosition;
  if (targetPos <= currentPos) {
    console.log(`[trader] Position ${currentPos}% already >= target ${targetPos}%, skipping`);
    return null;
  }

  return await executeBuy(signalType, targetPos);
}

// ─── 格式化交易消息 ─────────────────────────────────────────────────────
export function formatTradeMessage(entry) {
  if (!entry) return "";
  return (
    `\n─────────────\n` +
    `✅ *${entry.action}*\n` +
    `方向：${entry.side === "BUY" ? "📈 BUY" : "📉 SELL"}\n` +
    `仓位：${entry.side === "BUY" ? `${entry.quantity}%` : "全部"}\n` +
    `价格：$${entry.price}\n` +
    `模式：${entry.mode === "paper" ? "📝 Paper模拟" : "💰 实盘"}\n` +
    `_${now()}_`
  );
}

// ─── 获取交易记录 ────────────────────────────────────────────────────────
export function getTradeLog() {
  return tradeLog;
}

// ─── 获取当前仓位 ────────────────────────────────────────────────────────
export function getPosition() {
  return MODE === "paper" ? paperPosition : 0;
}

console.log(`Execution engine ready (${MODE} mode, ${EXCHANGE})`);
