// ─── telegram.js ───────────────────────────────────────────────────────────
import fetch from "node-fetch";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || "";

/**
 * Send a text message to Telegram.
 * @param {string} text
 * @returns {Promise<boolean>} true if sent successfully
 */
export async function sendMessage(text) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.error("[telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
      return false;
    }
    if (!text || typeof text !== "string") {
      console.error("[telegram] Invalid message text");
      return false;
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chat_id:    CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[telegram] API error ${res.status}: ${body}`);
      return false;
    }

    console.log("[telegram] Message sent successfully");
    return true;

  } catch (err) {
    console.error("[telegram] Unexpected error:", err.message);
    return false;
  }
}

/**
 * Format a whale signal into a readable Telegram message.
 * @param {{ tx, wallet, direction, usd, totalScore, level, action }} data
 * @returns {string}
 */
export function formatSignal(data) {
  try {
    const {
      tx         = "",
      wallet     = "",
      direction  = "UNKNOWN",
      usd        = 0,
      totalScore = 0,
      level      = "UNKNOWN",
      action     = "",
    } = data;

    // Shorten wallet address for display: first 4 + last 4 chars
    const shortWallet = wallet.length > 8
      ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
      : wallet;

    const dirEmoji   = direction === "BUY"  ? "📈" : "📉";
    const levelEmoji = level     === "BUY"  ? "🟢" : "🔴";
    const usdFormatted = Number(usd).toLocaleString("en-US", {
      style:    "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

    return (
      `🚨 *Whale Signal*\n\n` +
      `钱包：\`${shortWallet}\`\n` +
      `方向：${dirEmoji} ${direction}\n` +
      `金额：${usdFormatted}\n\n` +
      `信号评分：${totalScore}\n` +
      `等级：${levelEmoji} ${level}\n` +
      `建议：${action}\n\n` +
      `_tx: ${tx.slice(0, 20)}..._\n` +
      `_${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}_`
    );

  } catch (err) {
    console.error("[telegram] formatSignal error:", err.message);
    return "🚨 Whale Signal (format error)";
  }
}
