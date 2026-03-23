// ─── positionManager.js ──────────────────────────────────────────────────────
// 仓位管理系统 V1
// 根据信号类型自动计算建议仓位

export let currentPosition = 0;  // 当前仓位百分比

export const MAX_POSITION = 30; // 最大仓位 30%

export const POSITION_RULES = {
  PRE_PUMP:       { action: "加仓", amount: 5  },
  RESONANCE:      { action: "加仓", amount: 15 },
  SMART_RESONANCE:{ action: "加仓", amount: 30 },
  SELL_RESONANCE: { action: "清仓", amount: 0  },
};

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
