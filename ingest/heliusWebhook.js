// ─── Pre-Pump 检测缓存 ───────────────────────────────────────────────────
let prePumpBuffer = [];       // { wallet, usd, ts }
let lastPrePumpTs = 0;        // 上次 Pre-Pump 推送时间戳

function checkPrePump(wallet, direction, usd) {
  const now = Date.now();

  // Step 3: 清理3分钟前的数据
  prePumpBuffer = prePumpBuffer.filter(item => now - item.ts < 180000);

  // Step 2: BUY 且 $10k < usd < $50k → 记录
  if (direction === "BUY" && usd > 10000 && usd < 50000) {
    prePumpBuffer.push({ wallet, usd, ts: now });
    console.log(`[prePump] Recorded small BUY wallet=${wallet.slice(0,8)} usd=${usd.toLocaleString()}`);
  }

  // Step 4: 检测模式（≥3钱包 AND 总金额≥$50k）
  const uniqueWallets = [...new Set(prePumpBuffer.map(b => b.wallet))];
  const totalUSD = prePumpBuffer.reduce((sum, b) => sum + b.usd, 0);
  const isPrePump = uniqueWallets.length >= 3 && totalUSD >= 50000;

  if (!isPrePump) return null;

  // 过滤条件：至少1个钱包 winRate ≥ 0.55
  const highWinRateCount = uniqueWallets.filter(w => (walletStats[w]?.winRate || 0.5) >= 0.55).length;
  if (highWinRateCount < 1) {
    console.log(`[prePump] Filtered: no wallet with winRate ≥ 0.55 (wallets=${uniqueWallets.length})`);
    return null;
  }

  // Step 7: 60秒防重复
  if (now - lastPrePumpTs < 60000) {
    console.log(`[prePump] Cooldown active, skipping`);
    return null;
  }
  lastPrePumpTs = now;

  // 增强评分：Tier A → 75, Tier S → 85, 普通 → 65
  const hasTierS = uniqueWallets.some(w => (walletStats[w]?.tier || "B") === "S");
  const hasTierA = uniqueWallets.some(w => (walletStats[w]?.tier || "B") === "A");
  const score = hasTierS ? 85 : hasTierA ? 75 : 65;
  const isHighQuality = hasTierS || hasTierA;

  return { wallets: uniqueWallets, totalUSD, score, hasTierS, hasTierA, isHighQuality };
}

function formatPrePump(data) {
  const { wallets, totalUSD, score, hasTierS, hasTierA } = data;
  const walletInfo = wallets.map(w => {
    const short = w.length > 8 ? `${w.slice(0,4)}...${w.slice(-4)}` : w;
    const rate = Math.round((walletStats[w]?.winRate || 0.5) * 100);
    const tag = rate >= 70 ? "👑" : rate >= 60 ? "💎" : "";
    return `${short}（${tag}${rate}%）`;
  });

  const prefix = hasTierS ? "🔥 " : "";

  return (
    `⚡️ *${prefix}Pre-Pump 信号*\n\n` +
    `检测到连续小额买入\n\n` +
    `钱包数：*${wallets.length}*\n` +
    `钱包：` + walletInfo.join(`  `) + `\n` +
    `总金额：*$${totalUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}*\n\n` +
    `信号评分：*${score}*\n` +
    `建议：${hasTierS ? "建仓 15%" : hasTierA ? "建仓 10%" : "小仓试探 5%"}\n\n` +
    `_${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}_`
  );
}


import { normalize }        from "../core/normalizer.js";
import { extractFeatures }  from "../core/features.js";
import { score }            from "../core/scorer.js";
import { decide }           from "../strategy/rules.js";
import { sendMessage, formatSignal } from "../push/telegram.js";
import { getTrumpPrice }       from "../core/price.js";
import { formatPositionInfo, recordEntry, checkStopLoss } from "../core/positionManager.js";
import {
  walletStats,
  recordSignal,
  formatWinRateInfo,
  hasTierS,
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
  const smartTag = wallets.some(w => (walletStats[w]?.winRate || 0.5) > 0.6) ? "💎 Smart Money" : "";
  const tierSTag = hasTierS(wallets) ? "👑 S级资金" : "";

  return (
    `🔥 *${tierSTag || smartTag || "Whale"}共振信号*\n\n` +
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

  // 4. 检查 Pre-Pump（独立通道，不走阈值，直接推送）
  const prePump = checkPrePump(tx.wallet, features.direction, tx.usd);
  if (prePump) {
    const signalType = prePump.hasTierS ? "PRE_PUMP_TIER_S" : prePump.hasTierA ? "PRE_PUMP_TIER_A" : "PRE_PUMP";
    const msg = formatPrePump(prePump) + formatPositionInfo(signalType, prePump.score);
    const sent = await sendMessage(msg);
    if (!sent) console.error("[webhook] Pre-Pump message failed");
    // 继续走共振逻辑（可能同时触发共振）
  }

  // 5. 检查共振
  const isResonance = await checkResonance(tx.wallet, features.direction, tx.usd);

  // 5. 评分（含胜率加权）
  const featuresWithWallet = { ...features, wallet: tx.wallet };
  let totalScore = score(featuresWithWallet);

  // 6. 共振增强（普通共振 +30）
  if (isResonance) {
    totalScore += 30;
    // 7. Smart Money共振增强（≥2钱包且有高胜率钱包 +20）
    if ([...new Set(recentBuys.map(b => b.wallet))].some(w => (walletStats[w]?.winRate || 0.5) > 0.6)) {
      totalScore += 20;
    }
    // 8. Tier S 共振增强（+30）
    if (hasTierS([...new Set(recentBuys.map(b => b.wallet))])) {
      totalScore += 30;
    }
    console.log(`[webhook] 🔥 RESONANCE DETECTED! score=${totalScore}`);
  }

  console.log(`[webhook] tx=${tx.tx.slice(0,20)} dir=${features.direction} score=${totalScore} resonance=${isResonance}`);

  // 8. 记录 BUY 信号用于30分钟后回溯（同时记录建仓价格用于风控）
  if (features.direction === "BUY" && totalScore >= 30) {
    let price;
    try {
      price = await getTrumpPrice();
    } catch {
      price = 0;
    }
    if (price > 0) {
      recordSignal(tx.wallet, price, tx.tx, totalScore);
      recordEntry(price);
      // 风控检查
      const risk = checkStopLoss(price);
      if (risk.triggered) {
        const riskMsg = `\n─────────────\n${risk.message}`;
        await sendMessage(riskMsg);
        if (risk.systemPause) return; // 系统暂停，停止本次推送
      }
    }
  }
  // 8+9. 记录 BUY 信号 + 风控检查 + 共振优先推送
  if (isResonance) {
    const isSmart = [...new Set(recentBuys.map(b => b.wallet))].some(w => (walletStats[w]?.winRate || 0.5) > 0.6);
    const signalType = isSmart ? "SMART_RESONANCE" : "RESONANCE";
    const resonanceMsg = formatResonanceV3(recentBuys, totalScore) + formatPositionInfo(signalType, totalScore);
    const sent = await sendMessage(resonanceMsg);
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
  }) + (features.direction === "SELL" ? formatPositionInfo("SELL_RESONANCE", totalScore) : "");

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
