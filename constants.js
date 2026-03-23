// ─── Constants ────────────────────────────────────────────────────────────────
export const TRUMP_MINT = "HaP8r3ksG76PhQLTqR8FYBeNiQpejcFbQmiHbg787Ut1";

export const SIGNAL_LEVELS = {
  BUY:  "BUY",
  SELL: "SELL",
};

export const SCORE_THRESHOLDS = {
  BUY_SIGNAL:  70,  // 单笔 BUY(50) 不触发，共振(80)才触发，Smart共振(100)更强
  SELL_SIGNAL: -50,
};
