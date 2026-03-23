// ─── heliusWebhook.js ──────────────────────────────────────────────────────
import { normalize }        from "../core/normalizer.js";
import { extractFeatures }  from "../core/features.js";
import { score }            from "../core/scorer.js";
import { decide }           from "../strategy/rules.js";
import { sendMessage, formatSignal } from "../push/telegram.js";

/**
 * Process a single Helius event through the full pipeline.
 * normalize → features → score → decide → push
 * @param {object} evt - Raw Helius event
 */
async function processEvent(evt) {
  // 1. Normalize
  const tx = normalize(evt);
  if (!tx) {
    console.warn("[webhook] normalize returned null, skipping event");
    return;
  }

  // 2. Extract features
  const features = extractFeatures(tx);
  if (!features) {
    console.warn("[webhook] extractFeatures returned null, skipping event");
    return;
  }

  // 3. Only process TRUMP token transactions
  if (!features.isTarget) {
    console.log(`[webhook] Not a TRUMP transaction, skipping tx: ${tx.tx.slice(0, 20)}`);
    return;
  }

  // 4. Score
  const totalScore = score(features);
  console.log(`[webhook] tx=${tx.tx.slice(0, 20)} direction=${features.direction} score=${totalScore}`);

  // 5. Decide
  const decision = decide(totalScore, features);
  if (!decision) {
    console.log(`[webhook] No actionable signal (score=${totalScore}), skipping`);
    return;
  }

  // 6. Format and push
  const message = formatSignal({
    tx:         tx.tx,
    wallet:     tx.wallet,
    direction:  features.direction,
    usd:        tx.usd,
    totalScore,
    level:      decision.level,
    action:     decision.action,
  });

  const sent = await sendMessage(message);
  if (!sent) {
    console.error("[webhook] Failed to send Telegram message");
  }
}

/**
 * Express route handler for POST /webhook/helius
 * Helius sends an array of events per request.
 */
export async function heliusWebhookHandler(req, res) {
  try {
    const body = req.body;

    if (!body) {
      console.error("[webhook] Empty request body");
      return res.status(400).json({ ok: false, error: "Empty body" });
    }

    // Helius sends either a single event or an array
    const events = Array.isArray(body) ? body : [body];
    console.log(`[webhook] Received ${events.length} event(s)`);

    // Process all events concurrently
    await Promise.all(events.map(evt => processEvent(evt)));

    return res.status(200).json({ ok: true, processed: events.length });

  } catch (err) {
    console.error("[webhook] Unexpected error:", err.message);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
