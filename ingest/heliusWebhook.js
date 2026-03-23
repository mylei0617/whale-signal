// ─── heliusWebhook.js ──────────────────────────────────────────────────────
import { normalize }        from "../core/normalizer.js";
import { extractFeatures }  from "../core/features.js";
import { score }            from "../core/scorer.js";
import { decide }           from "../strategy/rules.js";
import { sendMessage, formatSignal } from "../push/telegram.js";
import {
  walletStats,
  recordSignal,
  checkSmartResonance,
  formatWinRateInfo,
  getStats,
  getTrumpPrice,
} from "../core/smartMoney.js";

// ─── Whale 共振检测缓存 ───────────────────────────────────────────────────
let recentBuys = [];       // { wallet, ts, usd }
let lastResonanceTs = 0;   // 上次共振推送时间戳（ms）

// ─── 共振检测核心逻辑 ─────────────────────────────────────────────────────
async function checkResonance(wallet, direction, usd) {
  const now = Date.now();

  // 清理超过120秒的旧数据
  recentBuys = recentBuys.filter(item => now - item.ts < 120000);

  // BUY 且 usd > 30000 → 记录
  if (direction === "BUY" && usd > 30000) {
    recentBuys.push({ wallet, ts: now, usd });
    console.log(`[resonance] Recorded BUY wallet=${wallet.slice(0,8)} usd=${usd.toLocaleString()}`);
  }

  // 共振检测（≥2个不同钱包）
  const uniqueWallets = [...new Set(recentBuys.map(b => b.wallet))];
  const isResonance = uniqueWallets.length >= 2;

  if (isResonance) {
    // 60秒防重复推送
    if (now - lastResonanceTs < 60000) {
      console.log(`[resonance] Cooldown active (${Math.round((60000-(now-lastResonanceTs))/1000)}s left), skipping`);
      return false;
    }
    lastResonanceTs = now;
    return true;
  }

  return false;
}

// ─── 共振信号格式化 V3（Smart Money版）──────────────────────────────────────
function formatResonanceV3(buys, totalScore) {
  const wallets = [...new Set(buys.map(b => b.wallet))];
  const totalUSD = buys.reduce((sum, b) => sum + b.usd, 0);
  const walletInfo = formatWinRateInfo(wallets);
  const smartTag = checkSmartResonance(wallets) ? "💎 Smart Money" : "";

  return (
    `🔥 *${smartTag}Whale共振信号*\n\n` +
    `*${wallets.length}* 个钱包同时买入 TRUMP\n` +
    `钱包：` + walletInfo.join(`  `) + `\n` +
    `总金额：*$${totalUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}*\n\n` +
    `信号评分：*${totalScore}*\n` +
    `等级：🟢 BUY\n` +
    `建议：建仓 10-20%\n\n` +
    `_${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}_`
  );
}

// ─── 单事件处理流水线 ─────────────────────────────────────────────────────
async function processEvent(evt) {
  // 1. Normalize
  const tx = normalize(evt);
  if (!tx) return;

  // 2. Extract features
  const features = extractFeatures(tx);
  if (!features) return;

  // 3. 只处理 TRUMP 交易
  if (!features.isTarget) return;

  // 4. 检查共振
  const isResonance = await checkResonance(tx.wallet, features.direction, tx.usd);

  // 5. 评分（含胜率加权）
  const featuresWithWallet = { ...features, wallet: tx.wallet };
  let totalScore = score(featuresWithWallet);

  // 6. 共振增强（普通共振 +30）
  if (isResonance) {
    totalScore += 30;
    // 7. Smart Money共振增强（≥2钱包且有高胜率钱包 +20）
    if (checkSmartResonance([...new Set(recentBuys.map(b => b.wallet))])) {
      totalScore += 20;
    }
    console.log(`[webhook] 🔥 RESONANCE DETECTED! score=${totalScore}`);
  }

  console.log(`[webhook] tx=${tx.tx.slice(0,20)} dir=${features.direction} score=${totalScore} resonance=${isResonance}`);

  // 8. 记录 BUY 信号用于30分钟后回溯
  if (features.direction === "BUY" && totalScore >= 30) {
    let price;
    try {
      price = await getTrumpPrice();
    } catch {
      price = 0;
    }
    if (price > 0) {
      recordSignal(tx.wallet, price, tx.tx, totalScore);
    }
  }

  // 9. 共振信号优先推送
  if (isResonance) {
    const msg = formatResonanceV3(recentBuys, totalScore);
    const sent = await sendMessage(msg);
    if (!sent) console.error("[webhook] Failed to send resonance message");
    return;
  }

  // 10. 普通信号决策
  const decision = decide(totalScore, featuresWithWallet);
  if (!decision) return;

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
  if (!sent) console.error("[webhook] Failed to send Telegram message");
}

// ─── Express Route Handler ─────────────────────────────────────────────────
export async function heliusWebhookHandler(req, res) {
  try {
    const body = req.body;
    if (!body) return res.status(400).json({ ok: false, error: "Empty body" });

    const events = Array.isArray(body) ? body : [body];
    console.log(`[webhook] Received ${events.length} event(s)`);

    await Promise.all(events.map(evt => processEvent(evt)));
    return res.status(200).json({ ok: true, processed: events.length });

  } catch (err) {
    console.error("[webhook] Unexpected error:", err.message);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
