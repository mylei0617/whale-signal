// ─── scorer.js ─────────────────────────────────────────────────────────────
import { applyWinRateScore } from "./smartMoney.js";

/**
 * Score a transaction based on extracted features + wallet win rate.
 * @param {{ isTarget: boolean, direction: string, sizeScore: number, wallet: string }} features
 * @returns {number} score
 */
export function score(features) {
  try {
    if (!features || typeof features !== "object") {
      console.error("[scorer] Invalid features: not an object");
      return 0;
    }

    const { direction, sizeScore, wallet } = features;
    let total = 0;

    // Direction score
    if (direction === "BUY")  total += 50;
    if (direction === "SELL") total -= 50;

    // Size bonus: large transactions carry more weight
    if ((Number(sizeScore) || 0) > 0.5) total += 20;

    // Step 5: Smart Money 胜率加权
    total = applyWinRateScore(total, wallet);

    return total;

  } catch (err) {
    console.error("[scorer] Unexpected error:", err.message);
    return 0;
  }
}
