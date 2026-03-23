// ─── price.js ─────────────────────────────────────────────────────────────
// 获取 TRUMP 代币当前价格（OKX API）

import fetch from "node-fetch";

const OKX_TICKER = "https://www.okx.com/api/v5/market/ticker?instId=TRUMP-USDT";

export async function getTrumpPrice() {
  try {
    const res = await fetch(OKX_TICKER, { timeout: 8000 });
    const data = await res.json();
    if (data.data?.[0]?.last) {
      return parseFloat(data.data[0].last);
    }
  } catch (e) {
    console.error("[price] OKX fetch failed:", e.message);
  }
  // Fallback: use SOL price estimate
  const solPrice = parseFloat(process.env.SOL_PRICE_USD) || 150;
  return solPrice;
}
