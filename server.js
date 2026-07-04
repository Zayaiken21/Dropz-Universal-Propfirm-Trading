const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(__dirname, 'public');

// Serve BOTH layouts so it works on Render, GitHub uploads, iPhone ZIP uploads, and static hosting.
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use('/public', express.static(PUBLIC));
app.use(express.static(ROOT, { extensions: ['html'] }));
app.use(express.static(PUBLIC, { extensions: ['html'] }));

const pages = ['index','terminal','dashboard','challenge','rules','positions','settings'];
function sendPage(res, name){
  const candidates = [path.join(ROOT, `${name}.html`), path.join(PUBLIC, `${name}.html`)];
  const found = candidates.find(fs.existsSync);
  if(found) return res.sendFile(found);
  return res.status(500).send('Dropz page missing: '+name+'.html');
}
app.get('/', (_,res)=>sendPage(res,'index'));
pages.forEach(p=>{ app.get('/'+p, (_,res)=>sendPage(res,p)); app.get('/'+p+'.html', (_,res)=>sendPage(res,p)); });
app.get('*', (_,res)=>sendPage(res,'index'));

const symbols = { BTCUSDT:67500, ETHUSDT:3500, XAUUSD:2350, EURUSD:1.085, NAS100:19800 };
const live = {};
function candle(symbol){
  const now = Math.floor(Date.now()/1000); const time = now - now%60;
  const base = symbols[symbol] || 100; const move = (Math.random()-.48)*(base*.0011); const price = Math.max(.0001,base+move); symbols[symbol]=price;
  if(!live[symbol] || live[symbol].time!==time) live[symbol]={time,open:base,high:Math.max(base,price),low:Math.min(base,price),close:price};
  else { const c=live[symbol]; c.high=Math.max(c.high,price); c.low=Math.min(c.low,price); c.close=price; }
  return {symbol, price, candle:live[symbol]};
}
function history(symbol){ let base=symbols[symbol]||100, t=Math.floor(Date.now()/1000)-120*60, out=[]; for(let i=0;i<120;i++){const o=base,c=Math.max(.0001,o+(Math.random()-.49)*(o*.0016)),h=Math.max(o,c)*(1+Math.random()*.001),l=Math.min(o,c)*(1-Math.random()*.001);base=c;out.push({time:t+i*60,open:o,high:h,low:l,close:c});} return out; }
const wss = new WebSocket.Server({server, path:'/ws/market'});
wss.on('connection', ws=>{ let symbol='BTCUSDT'; ws.send(JSON.stringify({type:'history',symbol,candles:history(symbol)})); ws.on('message', raw=>{try{const m=JSON.parse(raw); if(m.symbol){symbol=m.symbol; ws.send(JSON.stringify({type:'history',symbol,candles:history(symbol)}));}}catch{}}); const timer=setInterval(()=>{if(ws.readyState===1) ws.send(JSON.stringify({type:'candle',...candle(symbol)}));},1000); ws.on('close',()=>clearInterval(timer)); });
server.listen(PORT, ()=>console.log(`Dropz Universal Propfirm Trading running on port ${PORT}`));
