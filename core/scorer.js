// ─── scorer.js ─────────────────────────────────────────────────────────────

/**
 * Score a transaction based on extracted features.
 * @param {{ isTarget: boolean, direction: string, sizeScore: number }} features
 * @returns {number} score
 */
export function score(features) {
  try {
    if (!features || typeof features !== "object") {
      console.error("[scorer] Invalid features: not an object");
      return 0;
    }

    const { direction, sizeScore } = features;
    let total = 0;

    // Direction score
    if (direction === "BUY")  total += 30;
    if (direction === "SELL") total -= 30;

    // Size bonus: large transactions carry more weight
    if ((Number(sizeScore) || 0) > 0.5) total += 20;

    return total;

  } catch (err) {
    console.error("[scorer] Unexpected error:", err.message);
    return 0;
  }
}
