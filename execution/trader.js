import { getTrumpPrice } from "../core/price.js";
import { recordOpen, recordClose, checkTakeProfit } from "./performance.js";

const MODE = process.env.TRADE_MODE || "paper";
let tradeLog = [], paperPosition = 0;
let momentumQueue = [], recentSells = [], processedTx = new Set();

const POS_MAP = {
  PRE_PUMP_TIER_S:15, PRE_PUMP_TIER_A:10, PRE_PUMP:5,
  RESONANCE:15, SMART_RESONANCE:30, SELL_RESONANCE:0, STOP_LOSS:0
};

function log(e) { tradeLog.unshift({ts:Date.now(),...e}); if(tradeLog.length>100)tradeLog.pop(); console.log("[trader] "+e.action+" "+e.side+" "+e.quantity+"% @ $"+e.price); }

async function getPrice() { try { return await getTrumpPrice(); } catch { return 0; } }

async function doBuy(st,qty) {
  const p = await getPrice();
  if (!p) return null;
  if (MODE==="paper") paperPosition = qty;
  recordOpen(p,qty,st);
  const e = {mode:MODE,side:"BUY",signalType:st,price:p,quantity:qty,action:"BUY executed"};
  log(e); return e;
}

async function doSell(st,reason) {
  const p = await getPrice();
  if (!p) return null;
  recordClose(p,reason);
  if (MODE==="paper") paperPosition = 0;
  const e = {mode:MODE,side:"SELL",signalType:st,price:p,quantity:0,action:"SELL executed"};
  log(e); return e;
}

export async function executeSignal(st,cur=0,tx="",skip=false) {
  if (tx && processedTx.has(tx)) { console.log("[trader] dup: "+tx.slice(0,20)); return null; }
  const target = POS_MAP[st]??0;
  if (target===0 && st!=="SELL_RESONANCE" && st!=="STOP_LOSS") return null;
  if (st==="SELL_RESONANCE" || st==="STOP_LOSS") {
    if (checkReverseExit()) console.log("[trader] reverse exit");
    const r = await doSell(st,st==="STOP_LOSS"?"stop_loss":"sell");
    if (r && tx) processedTx.add(tx);
    return r;
  }
  const p = await getPrice();
  if (p>0) {
    if (skip) { const r=await doBuy(st,target); if(r&&tx)processedTx.add(tx); return r; }
    momentumQueue.push({ts:Date.now(),entryPrice:p,signalType:st,tx});
    console.log("[trader] queued: "+st+" tx="+tx.slice(0,20));
  }
  return null;
}

export function checkReverseExit() {
  const n = Date.now();
  recentSells = recentSells.filter(s=>n-s.ts<600000);
  const u = [...new Set(recentSells.map(s=>s.wallet))];
  if (u.length>=2) { recentSells=[]; return true; }
  return false;
}

export function addSellSignal(w) { recentSells.push({wallet:w,ts:Date.now()}); }
export function getPosition() { return MODE==="paper"?paperPosition:0; }
export function getTradeLog() { return tradeLog.slice(0,50); }
export {checkTakeProfit,momentumQueue,processedTx,recentSells};

export function formatTradeMessage(entry) {
  if (!entry) return "";
  return "Action: "+entry.action+" | Side: "+entry.side+" | Price: $"+entry.price+" | Position: "+getPosition()+"% | Mode: "+MODE;
}

export function formatTakeProfitMessage(tp) {
  return tp.map(t=>"TakeProfit: "+t.type+" at $"+t.price+" ("+(t.gain*100).toFixed(1)+"%)").join(", ");
}

console.log("Execution engine ready ("+MODE+")");
