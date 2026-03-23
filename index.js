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

// Test endpoint — simulate a TRUMP BUY event
app.get("/test", async (req, res) => {
  const { TRUMP_MINT } = await import("./constants.js");

  const WALLET = "WhaleWallet1234567890abcdef";
  const mockEvent = {
    signature: "mockSig" + Date.now(),
    feePayer:  WALLET,
    type:      "SWAP",
    timestamp: Math.floor(Date.now() / 1000),
    tokenTransfers: [
      {
        fromUserAccount: "USDCVault1234",
        toUserAccount:   WALLET,
        mint:            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        tokenAmount:     50000,
      },
      {
        fromUserAccount: WALLET,
        toUserAccount:   "TRUMPVault9999",
        mint:            TRUMP_MINT,
        tokenAmount:     500000,
      },
    ],
    events: {
      swap: {
        nativeInput: { amount: "2000000000" }, // 2 SOL ≈ $300
      },
    },
  };

  console.log("[test] Injecting mock TRUMP BUY event...");
  await heliusWebhookHandler(
    { body: [mockEvent] },
    { status: () => ({ json: () => {} }) }
  );

  res.json({ ok: true, message: "Mock event injected — check Telegram" });
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
