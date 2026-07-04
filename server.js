require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/stream' });
const PORT = process.env.PORT || 3000;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';

const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
const ROOT_INDEX_FILE = path.join(__dirname, 'index.html');

app.use(cors());
app.use(express.json());

const SYMBOLS = ['BINANCE:BTCUSDT','BINANCE:ETHUSDT','OANDA:XAU_USD','OANDA:EUR_USD','AAPL','TSLA','NVDA'];
const clients = new Map();
const candles = new Map();
let upstream = null;

function normalizeSymbol(symbol){ return SYMBOLS.includes(symbol) ? symbol : 'BINANCE:BTCUSDT'; }
function bucketTime(unixMs, intervalSec=60){ return Math.floor(unixMs/1000/intervalSec)*intervalSec; }
function broadcast(symbol,payload){ for(const [ws,state] of clients.entries()){ if(ws.readyState===WebSocket.OPEN && state.symbol===symbol) ws.send(JSON.stringify(payload)); }}
function updateCandle(symbol, price, volume=1, unixMs=Date.now()){
  const time=bucketTime(unixMs); const key=`${symbol}:${time}`; let c=candles.get(key);
  if(!c){ c={time,open:price,high:price,low:price,close:price,volume}; candles.set(key,c); }
  else { c.high=Math.max(c.high,price); c.low=Math.min(c.low,price); c.close=price; c.volume+=volume; }
  broadcast(symbol,{type:'candle',symbol,candle:c});
}
function generateHistory(symbol,count=180){
  const baseMap={'BINANCE:BTCUSDT':62000,'BINANCE:ETHUSDT':3300,'OANDA:XAU_USD':2350,'OANDA:EUR_USD':1.08,AAPL:210,TSLA:260,NVDA:125};
  let price=baseMap[symbol]||100; const now=bucketTime(Date.now()); const out=[];
  for(let i=count;i>0;i--){
    const time=now-i*60; const drift=(Math.random()-.49)*price*.002; const open=price; const close=Math.max(.0001,open+drift);
    const high=Math.max(open,close)+Math.random()*price*.0012; const low=Math.min(open,close)-Math.random()*price*.0012; price=close;
    out.push({time,open,high,low,close,volume:Math.round(10+Math.random()*90)});
  }
  return out;
}

const INLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>PropFirm Trading</title><script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script><style>html,body{margin:0;height:100%;background:#07111f;color:#e8eefc;font-family:Arial,sans-serif}body{display:flex;flex-direction:column}.top{padding:14px 16px;background:#0c1728;border-bottom:1px solid #1e2d44;display:flex;justify-content:space-between;gap:10px;align-items:center}.brand{font-weight:800}.badge{font-size:12px;padding:6px 9px;border:1px solid #244464;border-radius:999px;color:#9bdcff}.wrap{display:grid;grid-template-columns:260px 1fr;gap:12px;padding:12px;min-height:0;flex:1}.side,.main{background:#0c1728;border:1px solid #1e2d44;border-radius:18px;padding:12px}.sym{display:block;width:100%;padding:12px;margin:8px 0;border:0;border-radius:12px;background:#13233a;color:#e8eefc;text-align:left;font-weight:700}.sym.active{outline:2px solid #38bdf8}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}.card{background:#101f35;border:1px solid #203751;border-radius:14px;padding:10px}.label{font-size:11px;color:#9eb1cc}.value{font-size:18px;font-weight:800;margin-top:5px}#chart{height:calc(100vh - 220px);min-height:430px}.mobilebar{display:none}@media(max-width:760px){.wrap{grid-template-columns:1fr;padding:8px}.side{order:2}.stats{grid-template-columns:repeat(2,1fr)}#chart{height:55vh;min-height:360px}.top{padding-top:calc(10px + env(safe-area-inset-top))}.mobilebar{display:block;color:#9eb1cc;font-size:12px}}</style></head><body><div class="top"><div><div class="brand">Dropz PropFirm Terminal</div><div class="mobilebar">Live candles • Render-ready</div></div><div class="badge" id="status">Connecting...</div></div><div class="wrap"><aside class="side"><h3>Watchlist</h3><div id="symbols"></div></aside><main class="main"><div class="stats"><div class="card"><div class="label">Equity</div><div class="value">$100,000</div></div><div class="card"><div class="label">Daily Loss</div><div class="value">0.00%</div></div><div class="card"><div class="label">Drawdown</div><div class="value">0.00%</div></div><div class="card"><div class="label">Phase</div><div class="value">Challenge</div></div></div><div id="chart"></div></main></div><script>const symbols=['BINANCE:BTCUSDT','BINANCE:ETHUSDT','OANDA:XAU_USD','OANDA:EUR_USD','AAPL','TSLA','NVDA'];let current=symbols[0];const statusEl=document.getElementById('status');const list=document.getElementById('symbols');symbols.forEach(s=>{const b=document.createElement('button');b.className='sym'+(s===current?' active':'');b.textContent=s;b.onclick=()=>select(s);list.appendChild(b)});const chart=LightweightCharts.createChart(document.getElementById('chart'),{layout:{background:{color:'#0c1728'},textColor:'#d8e2f3'},grid:{vertLines:{color:'#13233a'},horzLines:{color:'#13233a'}},rightPriceScale:{borderColor:'#22364f'},timeScale:{borderColor:'#22364f',timeVisible:true,secondsVisible:false}});const series=chart.addCandlestickSeries({upColor:'#22c55e',downColor:'#ef4444',borderUpColor:'#22c55e',borderDownColor:'#ef4444',wickUpColor:'#22c55e',wickDownColor:'#ef4444'});async function loadHistory(){const r=await fetch('/api/history?symbol='+encodeURIComponent(current));const j=await r.json();series.setData(j.candles);chart.timeScale().fitContent()}function select(s){current=s;document.querySelectorAll('.sym').forEach((b,i)=>b.classList.toggle('active',symbols[i]===s));loadHistory();sendSub()}let ws;function connect(){const proto=location.protocol==='https:'?'wss':'ws';ws=new WebSocket(proto+'://'+location.host+'/stream');ws.onopen=()=>{statusEl.textContent='Live';sendSub()};ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='status')statusEl.textContent='Live: '+m.provider;if(m.type==='candle'&&m.symbol===current)series.update(m.candle)};ws.onclose=()=>{statusEl.textContent='Reconnecting...';setTimeout(connect,1500)}}function sendSub(){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'subscribe',symbol:current}))}loadHistory();connect();addEventListener('resize',()=>chart.applyOptions({width:document.getElementById('chart').clientWidth}));</script></body></html>`;

app.get('/health', (_req,res)=>res.type('text').send('ok'));
app.get('/api/symbols', (_req,res)=>res.json({symbols:SYMBOLS,provider:FINNHUB_API_KEY?'finnhub':'simulation'}));
app.get('/api/history', (req,res)=>{const symbol=normalizeSymbol(req.query.symbol||'BINANCE:BTCUSDT');res.json({symbol,interval:'1m',candles:generateHistory(symbol)});});

// Serve real files when present. Also support zip/GitHub deploys that accidentally miss public/index.html.
if (fs.existsSync(PUBLIC_DIR)) app.use(express.static(PUBLIC_DIR, { index:false, extensions:['html'] }));
app.get('/', (_req,res)=>{
  if (fs.existsSync(INDEX_FILE)) return res.sendFile(INDEX_FILE);
  if (fs.existsSync(ROOT_INDEX_FILE)) return res.sendFile(ROOT_INDEX_FILE);
  return res.type('html').send(INLINE_HTML);
});
app.get(/.*/, (req,res)=>{
  if (req.path.startsWith('/api/') || req.path.startsWith('/stream')) return res.status(404).json({error:'Not found'});
  if (fs.existsSync(INDEX_FILE)) return res.sendFile(INDEX_FILE);
  if (fs.existsSync(ROOT_INDEX_FILE)) return res.sendFile(ROOT_INDEX_FILE);
  return res.type('html').send(INLINE_HTML);
});

function startFinnhub(){
  if(!FINNHUB_API_KEY) return false;
  upstream=new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);
  upstream.on('open',()=>{console.log('Connected to Finnhub stream'); for(const symbol of SYMBOLS) upstream.send(JSON.stringify({type:'subscribe',symbol}));});
  upstream.on('message',(raw)=>{try{const msg=JSON.parse(raw.toString()); if(msg.type!=='trade'||!Array.isArray(msg.data)) return; for(const t of msg.data) updateCandle(t.s,Number(t.p),Number(t.v||1),Number(t.t||Date.now()));}catch(e){console.error('stream parse error',e.message)}});
  upstream.on('close',()=>{console.log('Finnhub stream closed; retrying in 5s'); setTimeout(startFinnhub,5000);});
  upstream.on('error',(err)=>console.error('Finnhub error:',err.message));
  return true;
}
function startSimulation(){
  const prices=Object.fromEntries(SYMBOLS.map(s=>[s,generateHistory(s,1)[0].close]));
  setInterval(()=>{for(const symbol of SYMBOLS){const p=prices[symbol]; const next=Math.max(.0001,p+(Math.random()-.5)*p*.0018); prices[symbol]=next; updateCandle(symbol,next,Math.random()*5,Date.now());}},1000);
}
wss.on('connection',(ws)=>{clients.set(ws,{symbol:'BINANCE:BTCUSDT'});ws.send(JSON.stringify({type:'status',provider:FINNHUB_API_KEY?'finnhub':'simulation'}));ws.on('message',(raw)=>{try{const msg=JSON.parse(raw.toString()); if(msg.type==='subscribe') clients.set(ws,{symbol:normalizeSymbol(msg.symbol)});}catch(_){}});ws.on('close',()=>clients.delete(ws));});
if(!startFinnhub()) startSimulation();
server.listen(PORT,()=>console.log(`Trading platform running on :${PORT}; public=${PUBLIC_DIR}; indexExists=${fs.existsSync(INDEX_FILE)}`));
