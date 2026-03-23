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

// Test endpoint — simulate a TRUMP BUY event
app.get("/test", async (req, res) => {
  const { TRUMP_MINT } = await import("./constants.js");

  const mockEvent = {
    signature: "mockSig" + Date.now(),
    feePayer:  "WhaleWallet1234567890abcdef",
    type:      "SWAP",
    timestamp: Math.floor(Date.now() / 1000),
    tokenTransfers: [
      {
        fromUserAccount: "USDCVault1234",
        toUserAccount:   "WhaleWallet1234567890abcdef",
        mint:            TRUMP_MINT,
        tokenAmount:     500000,
      },
      {
        fromUserAccount: "WhaleWallet1234567890abcdef",
        toUserAccount:   "USDCVault1234",
        mint:            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        tokenAmount:     75000,
      },
    ],
    events: {
      swap: {
        nativeInput: { amount: "500000000" }, // 0.5 SOL in lamports
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
