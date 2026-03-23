// ─── positionManager.js ──────────────────────────────────────────────────────
// 仓位管理系统 V1
// 根据信号类型自动计算建议仓位

export let currentPosition = 0;  // 当前仓位百分比

export const MAX_POSITION = 30; // 最大仓位 30%

export const POSITION_RULES = {
  PRE_PUMP_TIER_A: { action: "加仓", amount: 10 },
  PRE_PUMP_TIER_S: { action: "加仓", amount: 15 },
  PRE_PUMP:        { action: "加仓", amount: 5  },
  RESONANCE:       { action: "加仓", amount: 15 },
  SMART_RESONANCE: { action: "加仓", amount: 30 },
  SELL_RESONANCE:  { action: "清仓", amount: 0  },
};

// ─── 风控系统 ────────────────────────────────────────────────────────────
let entryPrice = 0;        // 建仓价格
let stopLossCount = 0;      // 连续止损次数
let pausedUntil = 0;         // 暂停截止时间戳

export const STOP_LOSS_PCT = 0.05;  // 止损阈值 5%
export const MAX_STOP_LOSS = 3;     // 连续3次止损暂停24h

/**
 * 建仓时记录入场价格
 */
export function recordEntry(price) {
  entryPrice = price;
  stopLossCount = 0;
  console.log(`[risk] Entry recorded: $${price}`);
}

/**
 * 检查是否触发止损
 * @param {number} currentPrice
 * @returns {{ triggered: boolean, drawdown: number, message: string }}
 */
export function checkStopLoss(currentPrice) {
  if (currentPosition === 0 || entryPrice === 0) {
    return { triggered: false, drawdown: 0, message: "" };
  }

  const drawdown = (entryPrice - currentPrice) / entryPrice;
  const isPaused = Date.now() < pausedUntil;

  if (isPaused) {
    return { triggered: false, drawdown, message: "🛑 系统暂停中", paused: true };
  }

  if (drawdown >= STOP_LOSS_PCT) {
    stopLossCount++;
    const isSystemPause = stopLossCount >= MAX_STOP_LOSS;
    if (isSystemPause) {
      pausedUntil = Date.now() + 24 * 60 * 60 * 1000;
      entryPrice = 0;
      currentPosition = 0;
      return {
        triggered: true,
        drawdown,
        message: "🛑 系统暂停24h（连续3次止损触发）",
        systemPause: true,
      };
    }
    return {
      triggered: true,
      drawdown,
      message: `⚠️ 止损触发（-${(drawdown * 100).toFixed(1)}%），建议减仓（${stopLossCount}/3）`,
    };
  }

  return { triggered: false, drawdown, message: "" };
}

/**
 * 格式化止损信息
 */
export function formatRiskInfo() {
  if (currentPosition === 0 || entryPrice === 0) return "";

  const risk = checkStopLoss(0); // 不实际触发，仅获取drawdown
  if (risk.triggered) {
    return `\n─────────────\n${risk.message}`;
  }
  return "";
}

/**
 * 格式化风控提示（配合价格推送使用）
 */
export function formatRiskAlert() {
  const risk = checkStopLoss(0);
  if (!risk.triggered) return "";
  return `\n─────────────\n${risk.message}`;
}

/**
 * 根据信号类型更新仓位
 * @param {string} signalType - PRE_PUMP | RESONANCE | SMART_RESONANCE | SELL_RESONANCE
 * @returns {{ position: number, action: string, change: number }}
 */
export function updatePosition(signalType) {
  const rule = POSITION_RULES[signalType];
  if (!rule) return null;

  const prev = currentPosition;

  if (rule.amount === 0) {
    // 清仓
    currentPosition = 0;
    return { position: 0, action: "清仓", change: -prev };
  }

  // 加仓：不能超过 MAX
  const newPosition = Math.min(rule.amount, MAX_POSITION);
  currentPosition = newPosition;
  const change = newPosition - prev;

  return {
    position: newPosition,
    action:  rule.action,
    change,
  };
}

/**
 * 格式化仓位信息到推送消息
 * @param {string} signalType
 * @param {number} score
 * @returns {string}
 */
export function formatPositionInfo(signalType, score) {
  const result = updatePosition(signalType);
  if (!result) return "";

  const actionText = result.action;
  const positionText = result.position > 0
    ? `当前仓位：*${result.position}%*`
    : "";

  let note = "";
  if (signalType === "SELL_RESONANCE") {
    note = "建议：全部清仓离场";
  } else if (result.position >= MAX_POSITION) {
    note = "⚠️ 已达最大仓位 30%，谨慎加仓";
  }

  return (
    `\n─────────────\n` +
    `${positionText}\n` +
    `建议操作：${actionText}\n` +
    (note ? `${note}\n` : "")
  );
}

console.log("Position system ready");
