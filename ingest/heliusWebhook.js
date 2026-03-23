// ─── heliusWebhook.js ──────────────────────────────────────────────────────
import { normalize }        from "../core/normalizer.js";
import { extractFeatures }  from "../core/features.js";
import { score }            from "../core/scorer.js";
import { decide }           from "../strategy/rules.js";
import { sendMessage, formatSignal } from "../push/telegram.js";

// ─── Whale 共振检测缓存 ───────────────────────────────────────────────────
let recentBuys = [];       // { wallet, ts, usd }
let lastResonanceTs = 0;   // 上次共振推送时间戳（ms）

// ─── 共振检测核心逻辑 ────────────────────────────────────────────────────
async function checkResonance(wallet, direction, usd) {
  const now = Date.now();

  // Step 3: 清理超过120秒的旧数据
  recentBuys = recentBuys.filter(item => now - item.ts < 120000);

  // Step 2: BUY 且 usd > 30000 → 记录（只记录BUY）
  if (direction === "BUY" && usd > 30000) {
    recentBuys.push({ wallet, ts: now, usd });
    console.log(`[resonance] Recorded BUY wallet=${wallet.slice(0,8)} usd=${usd.toLocaleString()}`);
  }

  // Step 4: 共振检测（≥2个不同钱包）
  const uniqueWallets = [...new Set(recentBuys.map(b => b.wallet))];
  const isResonance = uniqueWallets.length >= 2;

  if (isResonance) {
    // Step 7: 60秒防重复推送
    if (now - lastResonanceTs < 60000) {
      console.log(`[resonance] Cooldown active (${Math.round((60000-(now-lastResonanceTs))/1000)}s left), skipping`);
      return false;
    }
    lastResonanceTs = now;
    return true;
  }

  return false;
}

// ─── 共振信号格式化 ───────────────────────────────────────────────────────
function formatResonance(buys, totalScore) {
  const wallets = [...new Set(buys.map(b => b.wallet))];
  const totalUSD = buys.reduce((sum, b) => sum + b.usd, 0);
  const shortWallets = wallets.map(w => w.length > 8 ? `${w.slice(0,4)}...${w.slice(-4)}` : w);

  return (
    `🔥 *Whale共振信号*\n\n` +
    `*${wallets.length}* 个钱包同时买入 TRUMP\n` +
    `钱包：` + shortWallets.join(`  `) + `\n` +
    `总金额：*$${totalUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}*\n\n` +
    `信号评分：*${totalScore}*（共振增强 +30）\n` +
    `等级：🟢 BUY\n` +
    `建议：建仓 10-20%\n\n` +
    `_${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}_`
  );
}

// ─── 单事件处理流水线 ─────────────────────────────────────────────────────
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

  // Step 5: 先检查共振
  const isResonance = await checkResonance(tx.wallet, features.direction, tx.usd);

  // 4. Score
  let totalScore = score(features);

  // Step 6: 共振增强
  if (isResonance) {
    totalScore += 30;
    console.log(`[webhook] 🔥 RESONANCE DETECTED! score=${totalScore}`);
  }

  console.log(`[webhook] tx=${tx.tx.slice(0, 20)} direction=${features.direction} score=${totalScore} resonance=${isResonance}`);

  // 5. Decide
  const decision = decide(totalScore, features);

  // 共振信号优先推送（即使 normal 决策为 null）
  if (isResonance) {
    // recentBuys 里只有 BUY 事件（已在 checkResonance 里过滤）
    const resonanceMsg = formatResonance(recentBuys, totalScore);
    const sent = await sendMessage(resonanceMsg);
    if (!sent) {
      console.error("[webhook] Failed to send resonance Telegram message");
    }
    return;
  }

  if (!decision) {
    console.log(`[webhook] No actionable signal (score=${totalScore}), skipping`);
    return;
  }

  // 6. Format and push (normal signal)
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

// ─── Express Route Handler ─────────────────────────────────────────────────
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

console.log("Whale resonance system ready");
