// ─── normalizer.js ─────────────────────────────────────────────────────────
// Normalize raw Helius webhook event into a standard transaction object.

/**
 * @param {object} evt - Raw Helius webhook event
 * @returns {{ tx, wallet, type, tokenIn, tokenOut, amountIn, amountOut, usd, ts } | null}
 */
export function normalize(evt) {
  try {
    if (!evt || typeof evt !== "object") {
      console.error("[normalizer] Invalid event: not an object");
      return null;
    }

    // Helius enriched transaction format
    const tx       = evt.signature       || evt.transaction?.signatures?.[0] || "";
    const wallet   = evt.feePayer        || evt.accountData?.[0]?.account    || "";
    const type     = evt.type            || "UNKNOWN";
    const ts       = evt.timestamp       || Math.floor(Date.now() / 1000);

    // Extract token transfer info from tokenTransfers array
    const transfers = Array.isArray(evt.tokenTransfers) ? evt.tokenTransfers : [];

    // tokenIn = token the wallet sent (fromUserAccount = wallet)
    const inTransfer  = transfers.find(t => t.fromUserAccount === wallet) || {};
    // tokenOut = token the wallet received (toUserAccount = wallet)
    const outTransfer = transfers.find(t => t.toUserAccount   === wallet) || {};

    const tokenIn   = inTransfer.mint           || "";
    const tokenOut  = outTransfer.mint          || "";
    const amountIn  = Number(inTransfer.tokenAmount)  || 0;
    const amountOut = Number(outTransfer.tokenAmount) || 0;

    // USD value — Helius may provide nativeTransfers sum or events.swap
    const swapEvent = evt.events?.swap;
    let usd = 0;
    if (swapEvent?.nativeInput?.amount) {
      // Convert lamports → SOL → USD (rough: 1 SOL ≈ $150 fallback)
      const solAmount = Number(swapEvent.nativeInput.amount) / 1e9;
      usd = solAmount * (Number(process.env.SOL_PRICE_USD) || 150);
    } else if (swapEvent?.tokenInputs?.[0]?.rawTokenAmount?.uiAmount) {
      usd = Number(swapEvent.tokenInputs[0].rawTokenAmount.uiAmount) || 0;
    }

    if (!tx) {
      console.error("[normalizer] Missing signature in event");
      return null;
    }

    return { tx, wallet, type, tokenIn, tokenOut, amountIn, amountOut, usd, ts };

  } catch (err) {
    console.error("[normalizer] Unexpected error:", err.message);
    return null;
  }
}
