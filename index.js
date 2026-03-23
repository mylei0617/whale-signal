// ─── index.js ──────────────────────────────────────────────────────────────
import 'dotenv/config';
import express                  from "express";
import { heliusWebhookHandler } from "./ingest/heliusWebhook.js";

const PORT = process.env.PORT || 8080;
const app  = express();

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "whale-signal-v1", ts: new Date().toISOString() });
});

app.get("/stats", async (req, res) => {
  const { walletStats } = await import("./core/smartMoney.js");
  const { getStats: perfStats, getTradeLog, getPosition } = await import("./execution/trader.js");

  const walletEntries = Object.entries(walletStats).map(([wallet, s]) => ({
    wallet: wallet.slice(0,8) + "...",
    totalTrades: s.totalTrades,
    wins: s.wins,
    winRate: Math.round((s.winRate || 0) * 100) + "%",
    tier: s.tier || "B",
    avgProfit: ((s.avgProfit || 0) * 100).toFixed(1) + "%",
  }));

  const perf = perfStats();

  res.json({
    ok: true,
    currentPosition: getPosition() + "%",
    performance: perf,
    wallets: walletEntries,
  });
});

app.get("/dashboard", async (req, res) => {
  const { getTradeLog, getPosition } = await import("./execution/trader.js");
  const { getOpenPositions: getPerfOpen, getStats } = await import("./execution/performance.js");
  const { walletStats } = await import("./core/smartMoney.js");

  const pos = getPosition();
  const stats = getStats();
  const open = getPerfOpen();
  const trades = getTradeLog().slice(0, 20);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Whale Signal Dashboard</title>
<style>
body{font-family:Arial;background:#0a0a1a;color:#fff;padding:20px;max-width:900px;margin:0 auto}
h1{color:#00d4ff;border-bottom:1px solid #333;padding-bottom:10px}
.card{background:#1a1a3a;border-radius:12px;padding:20px;margin:15px 0}
.row{display:flex;gap:15px;flex-wrap:wrap}
.stat{background:#222;padding:15px;border-radius:8px;min-width:120px;text-align:center}
.big{font-size:2em;color:#00d4ff}
.green{color:#00ff88}.red{color:#ff4444}.yellow{color:#ffdd00}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{padding:8px;border-bottom:1px solid #333;text-align:left}
th{color:#888}
</style></head><body>
<h1>🐋 Whale Signal Dashboard</h1>
<div class="card">
  <h2>📊 当前状态</h2>
  <div class="row">
    <div class="stat"><div class="big ${pos > 0 ? 'green' : ''}">${pos}%</div><div>当前仓位</div></div>
    <div class="stat"><div class="big">${stats.trades}</div><div>总交易</div></div>
    <div class="stat"><div class="big ${stats.winRate > '50%' ? 'green' : 'red'}">${stats.winRate}</div><div>胜率</div></div>
    <div class="stat"><div class="big ${(stats.totalPnl||'0%').startsWith('-') ? 'red' : 'green'}">${stats.totalPnl}</div><div>总收益</div></div>
    <div class="stat"><div class="big yellow">${stats.profitFactor}</div><div>盈亏比</div></div>
  </div>
</div>
${open.length > 0 ? `<div class="card"><h2>📋 开仓中</h2><table><tr><th>入场价</th><th>仓位</th><th>信号</th><th>持仓时间</th></tr>` +
open.map(o => `<tr><td class="green">$${o.entryPrice}</td><td>${o.position}%</td><td>${o.signalType}</td><td>${Math.round((Date.now()-o.ts)/60000)}分钟</td></tr>`).join('') + `</table></div>` : ''}
<div class="card"><h2>📜 最近交易</h2>
<table><tr><th>时间</th><th>方向</th><th>价格</th><th>盈亏</th><th>原因</th></tr>${
trades.map(t => `<tr><td>${new Date(t.ts).toLocaleString('zh-CN')}</td><td class="${t.side==='BUY'?'green':'red'}">${t.side}</td><td>$${t.price}</td><td class="${(t.pnl||0)>=0?'green':'red'}">${t.pnl ? (t.pnl*100).toFixed(1)+'%' : '-'}</td><td>${t.reason||t.signalType||''}</td></tr>`).join('')
}</table></div>
<div class="card"><h2>👛 钱包追踪</h2><table><tr><th>钱包</th><th>Tier</th><th>胜率</th><th>交易数</th><th>平均收益</th></tr>${
Object.entries(walletStats).slice(0,10).map(([w,s]) => `<tr><td>${w.slice(0,8)}...</td><td>${s.tier||'B'}</td><td>${s.totalTrades >= 30 ? (s.winRate*100).toFixed(0)+'%' : '⚠️'+s.totalTrades+'/'}</td><td>${s.totalTrades}</td><td>${s.avgProfit ? (s.avgProfit*100).toFixed(1)+'%' : '-'}</td></tr>`).join('')
}</table></div></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.get("/trades", async (req, res) => {
  const { getTradeLog, getPosition } = await import("./execution/trader.js");
  const { getOpenPositions: getPerfOpen } = await import("./execution/performance.js");
  const log = getTradeLog().slice(0, 20).map(t => ({
    ts: new Date(t.ts).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
    side: t.side,
    signal: t.signalType,
    price: `$${t.price}`,
    qty: t.quantity ? `${t.quantity}%` : "-",
    pnl: t.pnl ? `${(t.pnl*100).toFixed(1)}%` : "-",
  }));
  const open = getPerfOpen().map(o => ({
    entryPrice: `$${o.entryPrice}`,
    position: `${o.position}%`,
    signal: o.signalType,
    holding: `${Math.round((Date.now() - o.ts) / 60000)}分钟`,
    gain: o.soldQty !== undefined ? `${o.soldQty}%` : "-",
  }));
  res.json({ ok: true, currentPosition: getPosition() + "%", openPositions: open, trades: log });
});

// Helius webhook endpoint
app.post("/webhook/helius", heliusWebhookHandler);

// Test endpoint — force send a BUY signal
app.get("/test-signal", async (req, res) => {
  const { sendMessage, formatSignal } = await import("./push/telegram.js");
  const signal = formatSignal({
    wallet:    "WhaleWallet1234567890abcdef",
    direction: "BUY",
    amountUSD: 5000000000,
    score:     85,
    level:     "BUY",
    action:    "建仓10%",
    tx:        "mockSig" + Date.now(),
  });
  await sendMessage(signal);
  res.json({ ok: true, message: "Forced BUY signal sent — check Telegram" });
});

// Test endpoint — simulate 3 wallets small BUY → trigger Pre-Pump
// Pre-seeds wallet win rates so filter passes
app.get("/test-prepump", async (req, res) => {
  const { walletStats } = await import("./core/smartMoney.js");
  const WALLET_A = "SmallBuyWallet1111111111111111";
  const WALLET_B = "SmallBuyWallet2222222222222222";
  const WALLET_C = "SmallBuyWallet3333333333333333";
  // Seed win rates so filter passes (winRate >= 0.55 required)
  walletStats[WALLET_A] = { totalTrades: 5, wins: 4, winRate: 0.80, avgProfit: 0.03, tier: "S" };
  walletStats[WALLET_B] = { totalTrades: 5, wins: 3, winRate: 0.60, avgProfit: 0.01, tier: "A" };
  walletStats[WALLET_C] = { totalTrades: 5, wins: 3, winRate: 0.60, avgProfit: 0.01, tier: "A" };

  const { heliusWebhookHandler } = await import("./ingest/heliusWebhook.js");
  const { TRUMP_MINT } = await import("./constants.js");
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const now = Math.floor(Date.now() / 1000);

  const events = [
    { signature: "prepumpA" + Date.now(), feePayer: WALLET_A, type: "SWAP", timestamp: now - 60,
      tokenTransfers: [
        { fromUserAccount: "USDCVault", toUserAccount: WALLET_A, mint: TRUMP_MINT, tokenAmount: 10000 },
        { fromUserAccount: WALLET_A, toUserAccount: "TRUMPVault", mint: USDC, tokenAmount: 20000 },
      ],
      events: { swap: { nativeInput: { amount: "150000000" } } }, // ~$22,500
    },
    { signature: "prepumpB" + Date.now(), feePayer: WALLET_B, type: "SWAP", timestamp: now - 30,
      tokenTransfers: [
        { fromUserAccount: "USDCVault", toUserAccount: WALLET_B, mint: TRUMP_MINT, tokenAmount: 10000 },
        { fromUserAccount: WALLET_B, toUserAccount: "TRUMPVault", mint: USDC, tokenAmount: 20000 },
      ],
      events: { swap: { nativeInput: { amount: "150000000" } } }, // ~$22,500
    },
    { signature: "prepumpC" + Date.now(), feePayer: WALLET_C, type: "SWAP", timestamp: now,
      tokenTransfers: [
        { fromUserAccount: "USDCVault", toUserAccount: WALLET_C, mint: TRUMP_MINT, tokenAmount: 10000 },
        { fromUserAccount: WALLET_C, toUserAccount: "TRUMPVault", mint: USDC, tokenAmount: 20000 },
      ],
      events: { swap: { nativeInput: { amount: "100000000" } } }, // ~$15,000
    },
  ];

  await heliusWebhookHandler({ body: events }, { status: () => ({ json: () => {} }) });
  res.json({ ok: true, message: "Pre-Pump triggered (3 wallets seeded with winRate ≥ 0.55) — check Telegram" });
});

// Test endpoint — simulate auto trade execution (paper mode) + Telegram push
app.get("/test-trade", async (req, res) => {
  const { executeSignal, formatTradeMessage, getTradeLog, getPosition } = await import("./execution/trader.js");
  const { sendMessage } = await import("./push/telegram.js");
  const result = await executeSignal("RESONANCE", 0);
  const msg = formatTradeMessage(result);
  if (msg) await sendMessage("📋 *Paper交易测试*\n" + msg);
  res.json({ ok: true, mode: "paper", trade: result, position: getPosition() + "%" });
});

// Test endpoint — simulate Tier S + Tier B wallets → trigger resonance with high score
app.get("/test-tier", async (req, res) => {
  const { walletStats, TIER_MAP } = await import("./core/smartMoney.js");
  const WALLET_S = "SuperWhaleWallet111111111111111";
  const WALLET_B = "NormalWallet111111111111111111";

  // Seed Tier S wallet (winRate > 0.7 + avgProfit > 0.02)
  walletStats[WALLET_S] = { totalTrades: 10, wins: 8, winRate: 0.8, avgProfit: 0.035, tier: "S" };
  walletStats[WALLET_B] = { totalTrades: 5, wins: 3, winRate: 0.6, avgProfit: 0.01, tier: "A" };

  const { heliusWebhookHandler } = await import("./ingest/heliusWebhook.js");
  const { TRUMP_MINT } = await import("./constants.js");
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const now = Math.floor(Date.now() / 1000);

  const events = [
    { signature: "tierS" + Date.now(), feePayer: WALLET_S, type: "SWAP", timestamp: now,
      tokenTransfers: [
        { fromUserAccount: "USDCVault", toUserAccount: WALLET_S, mint: TRUMP_MINT, tokenAmount: 100000 },
        { fromUserAccount: WALLET_S, toUserAccount: "TRUMPVault", mint: USDC, tokenAmount: 50000 },
      ],
      events: { swap: { nativeInput: { amount: "500000000" } } }, // ~$75,000
    },
    { signature: "tierB" + Date.now(), feePayer: WALLET_B, type: "SWAP", timestamp: now - 30,
      tokenTransfers: [
        { fromUserAccount: "USDCVault", toUserAccount: WALLET_B, mint: TRUMP_MINT, tokenAmount: 100000 },
        { fromUserAccount: WALLET_B, toUserAccount: "TRUMPVault", mint: USDC, tokenAmount: 50000 },
      ],
      events: { swap: { nativeInput: { amount: "500000000" } } }, // ~$75,000
    },
  ];

  await heliusWebhookHandler({ body: events }, { status: () => ({ json: () => {} }) });
  res.json({ ok: true, message: "Tier S+B resonance triggered — check Telegram" });
});

// Test endpoint — simulate 2 different wallets BUY TRUMP → trigger resonance
app.get("/test-resonance", async (req, res) => {
  const { heliusWebhookHandler } = await import("./ingest/heliusWebhook.js");
  const WALLET_A = "WhaleWallet11111111111111111111111";
  const WALLET_B = "WhaleWallet22222222222222222222222";
  const { TRUMP_MINT } = await import("./constants.js");

  const events = [
    {
      signature: "resonanceA" + Date.now(),
      feePayer:  WALLET_A,
      type:      "SWAP",
      timestamp: Math.floor(Date.now() / 1000),
      tokenTransfers: [
        { fromUserAccount: "USDCVault", toUserAccount: WALLET_A, mint: TRUMP_MINT, tokenAmount: 100000 },
        { fromUserAccount: WALLET_A, toUserAccount: "TRUMPVault", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", tokenAmount: 50000 },
      ],
      events: { swap: { nativeInput: { amount: "201000000000" } } }, // 201 SOL ≈ $30,150
    },
    {
      signature: "resonanceB" + Date.now(),
      feePayer:  WALLET_B,
      type:      "SWAP",
      timestamp: Math.floor(Date.now() / 1000),
      tokenTransfers: [
        { fromUserAccount: "USDCVault", toUserAccount: WALLET_B, mint: TRUMP_MINT, tokenAmount: 100000 },
        { fromUserAccount: WALLET_B, toUserAccount: "TRUMPVault", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", tokenAmount: 50000 },
      ],
      events: { swap: { nativeInput: { amount: "201000000000" } } }, // 201 SOL ≈ $30,150
    },
  ];

  await heliusWebhookHandler({ body: events }, { status: () => ({ json: () => {} }) });
  res.json({ ok: true, message: "Resonance triggered — check Telegram" });
});

// Test endpoint — simulate stop loss trigger
app.get("/test-stoploss", async (req, res) => {
  const { recordEntry, checkStopLoss, updatePosition } = await import("./core/positionManager.js");
  updatePosition("PRE_PUMP");  // 记录建仓，position=5%
  recordEntry(100);            // 入场价 $100
  const result = checkStopLoss(94); // 下跌6% → 触发止损
  res.json({ ok: true, entry: 100, current: 94, drawdown: "6%", result });
});

// Test endpoint — force a BUY signal directly (bypass scoring)
app.get("/test", async (req, res) => {
  const { sendMessage, formatSignal } = await import("./push/telegram.js");
  const WALLET = "WhaleWallet1234567890abcdef";
  const signal = formatSignal({
    wallet:    WALLET,
    direction: "BUY",
    amountUSD: 8000000,
    score:     55,
    level:     "BUY",
    action:    "建仓10%",
    tx:        "mockSig" + Date.now(),
  });
  await sendMessage(signal);
  res.json({ ok: true, message: "BUY signal sent — check Telegram" });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error("[express] Unhandled error:", err.message);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log("  Whale Signal System V1");
  console.log("=".repeat(50));
  console.log(`  Listening on port  : ${PORT}`);
  console.log(`  Webhook endpoint   : POST /webhook/helius`);
  console.log(`  Health check       : GET  /health`);
  console.log(`  Test endpoint      : GET  /test`);
  console.log("=".repeat(50));
  console.log("  TRUMP_MINT configured : yes");
  console.log(`  Telegram configured   : ${process.env.TELEGRAM_BOT_TOKEN ? "yes" : "NO — set TELEGRAM_BOT_TOKEN"}`);
  console.log("=".repeat(50));
  console.log("Whale signal system V1 ready");
  // 后台任务：每60秒检查止盈+动量确认
  setInterval(async () => {
    try {
      const { checkTakeProfit, executeSignal, formatTakeProfitMessage, sendMessage, getPosition, momentumQueue } = await import("./execution/trader.js");
      const now = Date.now();
      // 止盈检查
      const tp = await checkTakeProfit();
      if (tp.length > 0) {
        await sendMessage(formatTakeProfitMessage(tp));
        console.log(`[bg] 止盈触发: ${tp.length}笔`);
      }
      // 动量确认（5分钟等待）
      const toExec = momentumQueue.filter(m => now - m.ts >= 5 * 60 * 1000);
      if (toExec.length > 0) {
        console.log(`[bg] 动量确认: ${toExec.length}笔，执行BUY`);
        for (const m of toExec) await executeSignal(m.signalType, getPosition());
      }
    } catch(e) { console.error("[bg] Error:", e.message); }
  }, 60 * 1000);
});
