// ─── features.js ───────────────────────────────────────────────────────────
import { TRUMP_MINT } from "../constants.js";

/**
 * Extract features from a normalized transaction.
 * @param {object} tx - Normalized transaction from normalizer.js
 * @returns {{ isTarget: boolean, direction: string, sizeScore: number } | null}
 */
export function extractFeatures(tx) {
  try {
    if (!tx || typeof tx !== "object") {
      console.error("[features] Invalid tx: not an object");
      return null;
    }

    const { tokenIn, tokenOut, usd } = tx;

    // Is this transaction involving TRUMP token?
    const isTarget = tokenIn === TRUMP_MINT || tokenOut === TRUMP_MINT;

    // Determine direction
    // tokenOut === TRUMP means wallet received TRUMP → BUY
    // tokenIn  === TRUMP means wallet sent TRUMP     → SELL
    let direction = "OTHER";
    if (tokenOut === TRUMP_MINT) direction = "BUY";
    else if (tokenIn === TRUMP_MINT) direction = "SELL";

    // Size score: USD value normalized to 0-1 (cap at $100,000)
    const sizeScore = Math.min((Number(usd) || 0) / 100000, 1);

    return { isTarget, direction, sizeScore };

  } catch (err) {
    console.error("[features] Unexpected error:", err.message);
    return null;
  }
}
