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
  const entries = Object.entries(walletStats).map(([wallet, s]) => ({
    wallet: wallet.slice(0,8) + "...",
    totalTrades: s.totalTrades,
    wins: s.wins,
    winRate: Math.round(s.winRate * 100) + "%",
  }));
  res.json({ ok: true, wallets: entries, count: entries.length });
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
});
