import express from 'express';
import { heliusWebhookHandler } from './ingest/heliusWebhook.js';
import { sendMessage } from './push/telegram.js';

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 8080;

app.get('/health', (req, res) => res.json({ ok: true, service: 'whale-signal-v1', ts: new Date().toISOString() }));

app.get('/dashboard', async (req, res) => {
  try {
    const { getTradeLog, getPosition: gp1 } = await import('./execution/trader.js');
    const { getOpenPositions: gp2, getStats } = await import('./execution/performance.js');
    const { walletStats } = await import('./core/smartMoney.js');
    const pos = gp1();
    const stats = getStats() || {};
    const open = (gp2() || []).slice(0, 10);
    const trades = (getTradeLog() || []).slice(0, 20);
    const wr = parseFloat(stats.winRate || '0%');
    const pnlColor = (stats.totalPnl||'0%').startsWith('-') ? 'red' : 'green';
    const html = '<!DOCTYPE html><html><head><meta charset=utf-8><title>Whale Signal Dashboard</title><style>body{font-family:Arial;background:#0a0a1a;color:#fff;padding:20px;max-width:900px;margin:0 auto}h1{color:#00d4ff}h2{color:#888;border-bottom:1px solid #333;padding-bottom:8px}.card{background:#1a1a3a;border-radius:12px;padding:20px;margin:15px 0}.row{display:flex;gap:15px;flex-wrap:wrap}.stat{background:#222;padding:15px;border-radius:8px;min-width:100px;text-align:center}.big{font-size:2em;color:#00d4ff}.green{color:#00ff88}.red{color:#ff4444}.yellow{color:#ffdd00}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:8px;border-bottom:1px solid #333;text-align:left}th{color:#555}</style></head><body><h1>Whale Signal Dashboard</h1><div class=card><h2>Status</h2><div class=row><div class=stat><div class=big style=color:'+(pos>0?'#00ff88':'#888')+'>'+pos+'%</div><div>Position</div></div><div class=stat><div class=big>'+(stats.trades||0)+'</div><div>Trades</div></div><div class=stat><div class=big>'+(stats.winRate||'0%')+'</div><div>Win Rate</div></div><div class=stat><div class=big style=color:'+pnlColor+'>'+(stats.totalPnl||'0%')+'</div><div>PnL</div></div><div class=stat><div class=big>'+(stats.profitFactor||0)+'</div><div>Profit Factor</div></div></div></div>'+(open.length>0?'<div class=card><h2>Open Positions</h2><table><tr><th>Entry</th><th>Pos</th><th>Signal</th><th>Holding</th></tr>'+open.map(o=>'<tr><td class=green>$'+o.entryPrice+'</td><td>'+o.position+'%</td><td>'+o.signalType+'</td><td>'+Math.round((Date.now()-o.ts)/60000)+'min</td></tr>').join('')+'</table></div>':'')+'<div class=card><h2>Recent Trades</h2><table><tr><th>Time</th><th>Side</th><th>Price</th><th>PnL</th><th>Reason</th></tr>'+trades.map(t=>'<tr><td>'+new Date(t.ts).toLocaleString()+'</td><td class='+(t.side==='BUY'?'green':'red')+'>'+t.side+'</td><td>$'+t.price+'</td><td class='+(t.pnl>=0?'green':'red')+'>'+(t.pnl?(t.pnl*100).toFixed(1)+'%':'-')+'</td><td>'+(t.reason||t.signalType||'')+'</td></tr>').join('')+'</table></div><div class=card><h2>Wallet Tracking</h2><table><tr><th>Wallet</th><th>Tier</th><th>WinRate</th><th>Trades</th></tr>'+Object.entries(walletStats||{}).slice(0,10).map(([w,s])=>'<tr><td>'+w.slice(0,8)+'...</td><td>'+(s.tier||'B')+'</td><td>'+(s.totalTrades>=30?(s.winRate*100).toFixed(0)+'%':'&lt;'+s.totalTrades)+'</td><td>'+s.totalTrades+'</td></tr>').join('')+'</table></div></body></html>';
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.send(html);
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});

app.get('/trades', async (req, res) => {
  try {
    const { getTradeLog, getPosition: gp1 } = await import('./execution/trader.js');
    const { getOpenPositions: gp2 } = await import('./execution/performance.js');
    res.json({ok:true,position:gp1()+'%',open:gp2()||[],trades:getTradeLog()||[]});
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});

app.get('/stats', async (req, res) => {
  try {
    const { getStats } = await import('./execution/performance.js');
    const { getPosition: gp } = await import('./execution/trader.js');
    res.json({ok:true,position:gp()+'%',stats:getStats()||{}});
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});

app.get('/test-all', async (req, res) => {
  const results = [];
  try {
    const { executeSignal } = await import('./execution/trader.js');
    const { clearHistory } = await import('./execution/performance.js');
    clearHistory();
    const r = await executeSignal('RESONANCE', 0, 'test_'+Date.now(), true);
    results.push({name:'Trade Execution',ok:r!==null});
  } catch(e) { results.push({name:'Trade Execution',ok:false,error:e.message}); }
  try {
    const { heliusWebhookHandler } = await import('./ingest/heliusWebhook.js');
    await heliusWebhookHandler({body:[{signature:'inv_'+Date.now(),feePayer:'X',type:'SWAP',tokenTransfers:[],events:{}}]},{status:()=>({json:()=>{}})});
    results.push({name:'Invalid Filter',ok:true});
  } catch(e) { results.push({name:'Invalid Filter',ok:false}); }
  try {
    const { executeSignal, processedTx } = await import('./execution/trader.js');
    const tx = 'idem_'+Date.now();
    await executeSignal('RESONANCE', 0, tx, true);
    await executeSignal('RESONANCE', 0, tx, true);
    results.push({name:'Idempotency',ok:processedTx.has(tx)});
  } catch(e) { results.push({name:'Idempotency',ok:false}); }
  try {
    const { getStats } = await import('./execution/performance.js');
    const s = getStats()||{};
    results.push({name:'Stats',ok:s.trades>=0,detail:(s.trades||0)+' trades, '+(s.winRate||'0%')+' winRate'});
  } catch(e) { results.push({name:'Stats',ok:false}); }
  const passed = results.filter(r=>r.ok).length;
  res.json({status:passed===results.length?'PASS':'PARTIAL',passed,total:results.length,bug_list:results.filter(r=>!r.ok).map(r=>r.name),results});
});

app.get('/test-trade', async (req, res) => {
  try {
    const { executeSignal } = await import('./execution/trader.js');
    const { clearHistory } = await import('./execution/performance.js');
    clearHistory();
    const r = await executeSignal('RESONANCE', 0, 'trade_'+Date.now(), true);
    res.json({ok:true,executed:r!==null,result:r});
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});

app.get('/test-stoploss', async (req, res) => {
  try {
    const { executeSignal } = await import('./execution/trader.js');
    const { recordOpen } = await import('./execution/performance.js');
    recordOpen(100, 15, 'TEST');
    const r = await executeSignal('STOP_LOSS', 15, '', true);
    res.json({ok:true,executed:r!==null,result:r});
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});

app.get('/test-prepump', async (req, res) => {
  const { walletStats } = await import('./core/smartMoney.js');
  const { heliusWebhookHandler } = await import('./ingest/heliusWebhook.js');
  const { TRUMP_MINT } = await import('./constants.js');
  const WA = 'SmallBuyWallet1111111111111111';
  const WB = 'SmallBuyWallet2222222222222222';
  const WC = 'SmallBuyWallet3333333333333333';
  walletStats[WA] = {totalTrades:5,wins:4,winRate:0.8,avgProfit:0.03,tier:'S'};
  walletStats[WB] = {totalTrades:5,wins:3,winRate:0.6,avgProfit:0.01,tier:'A'};
  walletStats[WC] = {totalTrades:5,wins:3,winRate:0.6,avgProfit:0.01,tier:'A'};
  const now = Math.floor(Date.now()/1000);
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const events = [
    {signature:'prepumpA'+Date.now(),feePayer:WA,type:'SWAP',timestamp:now-60,tokenTransfers:[{fromUserAccount:'USDCVault',toUserAccount:WA,mint:TRUMP_MINT,tokenAmount:10000},{fromUserAccount:WA,toUserAccount:'TRUMPVault',mint:USDC,tokenAmount:20000}],events:{swap:{nativeInput:{amount:'150000000'}}}},
    {signature:'prepumpB'+Date.now(),feePayer:WB,type:'SWAP',timestamp:now-30,tokenTransfers:[{fromUserAccount:'USDCVault',toUserAccount:WB,mint:TRUMP_MINT,tokenAmount:10000},{fromUserAccount:WB,toUserAccount:'TRUMPVault',mint:USDC,tokenAmount:20000}],events:{swap:{nativeInput:{amount:'150000000'}}}},
    {signature:'prepumpC'+Date.now(),feePayer:WC,type:'SWAP',timestamp:now,tokenTransfers:[{fromUserAccount:'USDCVault',toUserAccount:WC,mint:TRUMP_MINT,tokenAmount:10000},{fromUserAccount:WC,toUserAccount:'TRUMPVault',mint:USDC,tokenAmount:20000}],events:{swap:{nativeInput:{amount:'100000000'}}}},
  ];
  await heliusWebhookHandler({body:events},{status:()=>({json:()=>{}})});
  res.json({ok:true,message:'PrePump simulated with 3 wallets'});
});

app.get('/test-tier', async (req, res) => {
  const { walletStats } = await import('./core/smartMoney.js');
  const { heliusWebhookHandler } = await import('./ingest/heliusWebhook.js');
  const { TRUMP_MINT } = await import('./constants.js');
  const WS = 'SuperWhaleWallet111111111111111';
  const WB = 'NormalWallet111111111111111111';
  walletStats[WS] = {totalTrades:10,wins:8,winRate:0.8,avgProfit:0.035,tier:'S'};
  walletStats[WB] = {totalTrades:5,wins:3,winRate:0.6,avgProfit:0.01,tier:'A'};
  const now = Math.floor(Date.now()/1000);
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const events = [
    {signature:'tierS'+Date.now(),feePayer:WS,type:'SWAP',timestamp:now,tokenTransfers:[{fromUserAccount:'USDCVault',toUserAccount:WS,mint:TRUMP_MINT,tokenAmount:100000},{fromUserAccount:WS,toUserAccount:'TRUMPVault',mint:USDC,tokenAmount:50000}],events:{swap:{nativeInput:{amount:'500000000'}}}},
    {signature:'tierB'+Date.now(),feePayer:WB,type:'SWAP',timestamp:now-30,tokenTransfers:[{fromUserAccount:'USDCVault',toUserAccount:WB,mint:TRUMP_MINT,tokenAmount:100000},{fromUserAccount:WB,toUserAccount:'TRUMPVault',mint:USDC,tokenAmount:50000}],events:{swap:{nativeInput:{amount:'500000000'}}}},
  ];
  await heliusWebhookHandler({body:events},{status:()=>({json:()=>{}})});
  res.json({ok:true,message:'Tier S+B resonance simulated'});
});

app.get('/test', async (req, res) => {
  res.json({ok:true,message:'System is running. Use /test-all or /test-trade to verify.'});
});

app.post('/webhook/helius', heliusWebhookHandler);

// Background: take profit + momentum check every 60s
setInterval(async () => {
  try {
    const { checkTakeProfit, executeSignal, formatTakeProfitMessage, sendMessage, getPosition, momentumQueue, formatTradeMessage } = await import('./execution/trader.js');
    const now = Date.now();
    const tp = await checkTakeProfit();
    if (tp.length > 0) await sendMessage('Take Profit triggered: ' + formatTakeProfitMessage(tp));
    const toExec = (momentumQueue||[]).filter(m => now - m.ts >= 5 * 60 * 1000);
    if (toExec.length > 0) {
      for (const m of toExec) {
        const r = await executeSignal(m.signalType, getPosition(), m.tx||'', true);
        if (r) await sendMessage('Signal confirmed after 5min: ' + formatTradeMessage(r));
      }
    }
  } catch(e) { console.error('[bg] Error:', e.message); }
}, 60 * 1000);

app.listen(PORT, () => { console.log('Whale signal system V1 ready'); console.log('Listening on port : ' + PORT); });
