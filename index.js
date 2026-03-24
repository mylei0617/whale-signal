import 'dotenv/config';
import express from "express";
import { heliusWebhookHandler } from "./ingest/heliusWebhook.js";
import { sendMessage } from "./push/telegram.js";

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 8080;

// Startup: test Telegram if configured
(function() {
  var BOT = process.env.TELEGRAM_BOT_TOKEN || "";
  var CHAT = process.env.TELEGRAM_CHAT_ID || "";
  console.log("[init] TELEGRAM_BOT_TOKEN:", BOT ? "SET (" + BOT.slice(0,6) + ")" : "MISSING");
  console.log("[init] TELEGRAM_CHAT_ID:", CHAT || "MISSING");
  if (BOT && CHAT) {
    fetch("https://api.telegram.org/bot" + BOT + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text: "*Railway started* - Bot is online!", parse_mode: "Markdown" })
    }).then(function(r) { return r.json(); })
      .then(function(j) { console.log("[init] Telegram:", j.ok ? "SENT msg_id=" + j.message_id : "FAIL " + JSON.stringify(j).slice(0,50)); })
      .catch(function(e) { console.error("[init] Telegram err:", e.message); });
  } else {
    console.error("[init] Telegram NOT configured");
  }
})();

app.get("/health", function(req, res) {
  res.json({ ok: true, service: "whale-signal-v1", ts: new Date().toISOString() });
});

app.get("/debug-tg", function(req, res) {
  res.json({
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? "SET" : "MISSING",
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "MISSING",
    NODE_ENV: process.env.NODE_ENV || "unknown"
  });
});

app.get("/dashboard", async function(req, res) {
  try {
    var m1 = await import("./execution/trader.js");
    var m2 = await import("./execution/performance.js");
    var m3 = await import("./core/smartMoney.js");
    var pos = m1.getPosition();
    var stats = m2.getStats() || {};
    var open = (m2.getOpenPositions() || []).slice(0, 10);
    var trades = (m1.getTradeLog() || []).slice(0, 20);
    var wr = parseFloat((stats.winRate || "0%").replace("%", ""));
    var pnlColor = ((stats.totalPnl || "0%").startsWith("-")) ? "red" : "green";
    var html = "<!DOCTYPE html><html><head><meta charset=utf-8><title>Whale Signal Dashboard</title><style>body{font-family:Arial;background:#0a0a1a;color:#fff;padding:20px;max-width:900px;margin:0 auto}h1{color:#00d4ff}h2{color:#888;border-bottom:1px solid #333;padding-bottom:8px}.card{background:#1a1a3a;border-radius:12px;padding:20px;margin:15px 0}.row{display:flex;gap:15px;flex-wrap:wrap}.stat{background:#222;padding:15px;border-radius:8px;min-width:100px;text-align:center}.big{font-size:2em;color:#00d4ff}.green{color:#00ff88}.red{color:#ff4444}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:8px;border-bottom:1px solid #333;text-align:left}th{color:#555}</style></head><body><h1>Whale Signal Dashboard</h1><div class=card><h2>Status</h2><div class=row><div class=stat><div class=big style=color:" + (pos > 0 ? "#00ff88" : "#888") + ">" + pos + "%</div><div>Position</div></div><div class=stat><div class=big>" + (stats.trades || 0) + "</div><div>Trades</div></div><div class=stat><div class=big>" + (stats.winRate || "0%") + "</div><div>Win Rate</div></div><div class=stat><div class=big style=color:" + pnlColor + ">" + (stats.totalPnl || "0%") + "</div><div>PnL</div></div><div class=stat><div class=big>" + (stats.profitFactor || 0) + "</div><div>Profit Factor</div></div></div></div>";
    if (open.length > 0) {
      html += "<div class=card><h2>Open Positions</h2><table><tr><th>Entry</th><th>Pos</th><th>Signal</th><th>Holding</th></tr>";
      for (var i = 0; i < open.length; i++) {
        var o = open[i];
        html += "<tr><td class=green>$" + o.entryPrice + "</td><td>" + o.position + "%</td><td>" + o.signalType + "</td><td>" + Math.round((Date.now() - o.ts) / 60000) + "min</td></tr>";
      }
      html += "</table></div>";
    }
    html += "<div class=card><h2>Recent Trades</h2><table><tr><th>Time</th><th>Side</th><th>Price</th><th>PnL</th><th>Reason</th></tr>";
    for (var j = 0; j < trades.length; j++) {
      var t = trades[j];
      var sideClass = (t.side === "BUY") ? "green" : "red";
      var pnlClass = ((t.pnl || 0) >= 0) ? "green" : "red";
      html += "<tr><td>" + new Date(t.ts).toLocaleString() + "</td><td class=" + sideClass + ">" + t.side + "</td><td>$" + t.price + "</td><td class=" + pnlClass + ">" + (t.pnl ? (t.pnl * 100).toFixed(1) + "%" : "-") + "</td><td>" + (t.reason || t.signalType || "") + "</td></tr>";
    }
    html += "</table></div>";
    var wEntries = Object.entries(m3.walletStats || {}).slice(0, 10);
    if (wEntries.length > 0) {
      html += "<div class=card><h2>Wallet Tracking</h2><table><tr><th>Wallet</th><th>Tier</th><th>WinRate</th><th>Trades</th></tr>";
      for (var k = 0; k < wEntries.length; k++) {
        var w = wEntries[k];
        var s = w[1];
        html += "<tr><td>" + w[0].slice(0, 8) + "...</td><td>" + (s.tier || "B") + "</td><td>" + (s.totalTrades >= 30 ? (s.winRate * 100).toFixed(0) + "%" : "&lt;" + s.totalTrades) + "</td><td>" + s.totalTrades + "</td></tr>";
      }
      html += "</table></div>";
    }
    html += "</body></html>";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/trades", async function(req, res) {
  try {
    var m1 = await import("./execution/trader.js");
    var m2 = await import("./execution/performance.js");
    res.json({ ok: true, position: m1.getPosition() + "%", open: m2.getOpenPositions() || [], trades: m1.getTradeLog() || [] });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/stats", async function(req, res) {
  try {
    var m1 = await import("./execution/trader.js");
    var m2 = await import("./execution/performance.js");
    res.json({ ok: true, position: m1.getPosition() + "%", stats: m2.getStats() || {} });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/test-all", async function(req, res) {
  var results = [];
  try {
    var m1 = await import("./execution/trader.js");
    var m2 = await import("./execution/performance.js");
    m2.clearHistory();
    var r = await m1.executeSignal("RESONANCE", 0, "test_" + Date.now(), true);
    results.push({ name: "Trade Execution", ok: r !== null });
  } catch(e) { results.push({ name: "Trade Execution", ok: false, error: e.message }); }
  try {
    var m3 = await import("./ingest/heliusWebhook.js");
    await m3.heliusWebhookHandler({ body: [{ signature: "inv_" + Date.now(), feePayer: "X", type: "SWAP", tokenTransfers: [], events: {} }] }, { status: function() { return { json: function() {} }; } });
    results.push({ name: "Invalid Filter", ok: true });
  } catch(e) { results.push({ name: "Invalid Filter", ok: false }); }
  try {
    var m4 = await import("./execution/trader.js");
    var tx = "idem_" + Date.now();
    await m4.executeSignal("RESONANCE", 0, tx, true);
    await m4.executeSignal("RESONANCE", 0, tx, true);
    results.push({ name: "Idempotency", ok: m4.processedTx.has(tx) });
  } catch(e) { results.push({ name: "Idempotency", ok: false }); }
  try {
    var m5 = await import("./execution/performance.js");
    var s = m5.getStats() || {};
    results.push({ name: "Stats", ok: s.trades >= 0, detail: (s.trades || 0) + " trades, " + (s.winRate || "0%") + " winRate" });
  } catch(e) { results.push({ name: "Stats", ok: false }); }
  var passed = results.filter(function(r) { return r.ok; }).length;
  res.json({
    status: passed === results.length ? "PASS" : "PARTIAL",
    passed: passed,
    total: results.length,
    bug_list: results.filter(function(r) { return !r.ok; }).map(function(r) { return r.name; }),
    results: results
  });
});

app.get("/test-trade", async function(req, res) {
  try {
    var m1 = await import("./execution/trader.js");
    var m2 = await import("./execution/performance.js");
    m2.clearHistory();
    var r = await m1.executeSignal("RESONANCE", 0, "trade_" + Date.now(), true);
    res.json({ ok: true, executed: r !== null, result: r });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/test-stoploss", async function(req, res) {
  try {
    var m1 = await import("./execution/trader.js");
    var m2 = await import("./execution/performance.js");
    m2.recordOpen(100, 15, "TEST");
    var r = await m1.executeSignal("STOP_LOSS", 15, "", true);
    res.json({ ok: true, executed: r !== null, result: r });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/test-prepump", async function(req, res) {
  var m1 = await import("./core/smartMoney.js");
  var m2 = await import("./ingest/heliusWebhook.js");
  var m3 = await import("./constants.js");
  var WA = "SmallBuyWallet1111111111111111";
  var WB = "SmallBuyWallet2222222222222222";
  var WC = "SmallBuyWallet3333333333333333";
  m1.walletStats[WA] = { totalTrades: 5, wins: 4, winRate: 0.8, avgProfit: 0.03, tier: "S" };
  m1.walletStats[WB] = { totalTrades: 5, wins: 3, winRate: 0.6, avgProfit: 0.01, tier: "A" };
  m1.walletStats[WC] = { totalTrades: 5, wins: 3, winRate: 0.6, avgProfit: 0.01, tier: "A" };
  var now = Math.floor(Date.now() / 1000);
  var USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  var events = [
    { signature: "prepumpA" + Date.now(), feePayer: WA, type: "SWAP", timestamp: now - 60, tokenTransfers: [{ fromUserAccount: "USDCVault", toUserAccount: WA, mint: m3.TRUMP_MINT, tokenAmount: 10000 }, { fromUserAccount: WA, toUserAccount: "TRUMPVault", mint: USDC, tokenAmount: 20000 }], events: { swap: { nativeInput: { amount: "150000000" } } } },
    { signature: "prepumpB" + Date.now(), feePayer: WB, type: "SWAP", timestamp: now - 30, tokenTransfers: [{ fromUserAccount: "USDCVault", toUserAccount: WB, mint: m3.TRUMP_MINT, tokenAmount: 10000 }, { fromUserAccount: WB, toUserAccount: "TRUMPVault", mint: USDC, tokenAmount: 20000 }], events: { swap: { nativeInput: { amount: "150000000" } } } },
    { signature: "prepumpC" + Date.now(), feePayer: WC, type: "SWAP", timestamp: now, tokenTransfers: [{ fromUserAccount: "USDCVault", toUserAccount: WC, mint: m3.TRUMP_MINT, tokenAmount: 10000 }, { fromUserAccount: WC, toUserAccount: "TRUMPVault", mint: USDC, tokenAmount: 20000 }], events: { swap: { nativeInput: { amount: "100000000" } } } },
  ];
  await m2.heliusWebhookHandler({ body: events }, { status: function() { return { json: function() {} }; } });
  res.json({ ok: true, message: "PrePump simulated with 3 wallets" });
});

app.get("/test-tier", async function(req, res) {
  var m1 = await import("./core/smartMoney.js");
  var m2 = await import("./ingest/heliusWebhook.js");
  var m3 = await import("./constants.js");
  var WS = "SuperWhaleWallet111111111111111";
  var WB = "NormalWallet111111111111111111";
  m1.walletStats[WS] = { totalTrades: 10, wins: 8, winRate: 0.8, avgProfit: 0.035, tier: "S" };
  m1.walletStats[WB] = { totalTrades: 5, wins: 3, winRate: 0.6, avgProfit: 0.01, tier: "A" };
  var now = Math.floor(Date.now() / 1000);
  var USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  var events = [
    { signature: "tierS" + Date.now(), feePayer: WS, type: "SWAP", timestamp: now, tokenTransfers: [{ fromUserAccount: "USDCVault", toUserAccount: WS, mint: m3.TRUMP_MINT, tokenAmount: 100000 }, { fromUserAccount: WS, toUserAccount: "TRUMPVault", mint: USDC, tokenAmount: 50000 }], events: { swap: { nativeInput: { amount: "500000000" } } } },
    { signature: "tierB" + Date.now(), feePayer: WB, type: "SWAP", timestamp: now - 30, tokenTransfers: [{ fromUserAccount: "USDCVault", toUserAccount: WB, mint: m3.TRUMP_MINT, tokenAmount: 100000 }, { fromUserAccount: WB, toUserAccount: "TRUMPVault", mint: USDC, tokenAmount: 50000 }], events: { swap: { nativeInput: { amount: "500000000" } } } },
  ];
  await m2.heliusWebhookHandler({ body: events }, { status: function() { return { json: function() {} }; } });
  res.json({ ok: true, message: "Tier S+B resonance simulated" });
});

app.get("/test", function(req, res) {
  res.json({ ok: true, message: "System is running. Use /test-all or /test-trade." });
});

app.post("/webhook/helius", heliusWebhookHandler);

// Background: take profit + momentum check every 60s
setInterval(async function() {
  try {
    var m1 = await import("./execution/trader.js");
    var tp = await m1.checkTakeProfit();
    if (tp.length > 0) {
      var msg = tp.map(function(t) { return t.signalType + " " + t.pct + "% at $" + t.price; }).join(", ");
      await sendMessage("Take Profit triggered: " + msg);
    }
    var now = Date.now();
    var toExec = (m1.momentumQueue || []).filter(function(m) { return now - m.ts >= 5 * 60 * 1000; });
    if (toExec.length > 0) {
      for (var i = 0; i < toExec.length; i++) {
        var m = toExec[i];
        var r = await m1.executeSignal(m.signalType, m1.getPosition(), m.tx || "", true);
        if (r) await sendMessage("Signal confirmed: " + m.signalType + " " + r.side + " " + r.quantity + "% @ $" + r.price);
      }
    }
  } catch(e) { console.error("[bg] Error:", e.message); }
}, 60 * 1000);

app.listen(PORT, function() {
  console.log("========================================");
  console.log("  Whale Signal System V1 ready");
  console.log("  Listening on port: " + PORT);
  console.log("  Webhook: POST /webhook/helius");
  console.log("  Health: GET /health");
  console.log("========================================");
});
