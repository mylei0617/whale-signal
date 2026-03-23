// ─── rules.js ──────────────────────────────────────────────────────────────
import { SCORE_THRESHOLDS, SIGNAL_LEVELS } from "../constants.js";

/**
 * Decide trading action based on score and features.
 * @param {number} totalScore
 * @param {{ direction: string, sizeScore: number }} features
 * @returns {{ level: string, action: string } | null}
 */
export function decide(totalScore, features) {
  try {
    if (typeof totalScore !== "number") {
      console.error("[rules] Invalid score: not a number");
      return null;
    }
    if (!features || typeof features !== "object") {
      console.error("[rules] Invalid features: not an object");
      return null;
    }

    const { direction } = features;

    // Strong BUY signal
    if (totalScore >= SCORE_THRESHOLDS.BUY_SIGNAL && direction === SIGNAL_LEVELS.BUY) {
      return {
        level:  SIGNAL_LEVELS.BUY,
        action: "建仓10%",
      };
    }

    // Strong SELL signal
    if (totalScore <= SCORE_THRESHOLDS.SELL_SIGNAL && direction === SIGNAL_LEVELS.SELL) {
      return {
        level:  SIGNAL_LEVELS.SELL,
        action: "减仓",
      };
    }

    // No actionable signal
    return null;

  } catch (err) {
    console.error("[rules] Unexpected error:", err.message);
    return null;
  }
}
