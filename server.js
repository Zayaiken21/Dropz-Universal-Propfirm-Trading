const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

app.use(express.static(PUBLIC, { extensions: ['html'] }));

const routes = {
  '/': 'index.html',
  '/terminal': 'pages/terminal.html',
  '/dashboard': 'pages/dashboard.html',
  '/challenge': 'pages/challenge.html',
  '/rules': 'pages/rules.html',
  '/positions': 'pages/positions.html',
  '/settings': 'pages/settings.html'
};
Object.entries(routes).forEach(([url, file]) => {
  app.get(url, (_, res) => res.sendFile(path.join(PUBLIC, file)));
});
app.get('*', (_, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

// Local simulated market WebSocket. Replace later with broker/feed bridge.
const wss = new WebSocket.Server({ server, path: '/ws/market' });
const symbols = { 'BTCUSDT': 67500, 'ETHUSDT': 3500, 'XAUUSD': 2350, 'EURUSD': 1.085, 'NAS100': 19800 };
const candles = {};
function nextCandle(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const bucket = now - (now % 60);
  let price = symbols[symbol] || 100;
  const vol = symbol.includes('USD') && symbol !== 'EURUSD' ? price * 0.0008 : 0.0004;
  const change = (Math.random() - 0.48) * vol;
  const next = Math.max(0.0001, price + change);
  symbols[symbol] = next;
  if (!candles[symbol] || candles[symbol].time !== bucket) {
    candles[symbol] = { time: bucket, open: price, high: Math.max(price, next), low: Math.min(price, next), close: next };
  } else {
    const c = candles[symbol]; c.high = Math.max(c.high, next); c.low = Math.min(c.low, next); c.close = next;
  }
  return { symbol, candle: candles[symbol], price: next };
}
wss.on('connection', (socket) => {
  let symbol = 'BTCUSDT';
  socket.on('message', (msg) => { try { const data = JSON.parse(msg); if (data.symbol) symbol = data.symbol; } catch {} });
  const seed = [];
  let base = symbols[symbol];
  const t = Math.floor(Date.now()/1000) - 120*60;
  for (let i=0;i<120;i++) { const open = base; const close = Math.max(0.0001, open + (Math.random()-.49)*(open*.001)); const high=Math.max(open,close)*(1+Math.random()*.0009); const low=Math.min(open,close)*(1-Math.random()*.0009); base=close; seed.push({time:t+i*60,open,high,low,close}); }
  socket.send(JSON.stringify({ type:'history', symbol, candles: seed }));
  const timer = setInterval(() => socket.readyState === 1 && socket.send(JSON.stringify({ type:'candle', ...nextCandle(symbol) })), 1000);
  socket.on('close', () => clearInterval(timer));
});

server.listen(PORT, () => console.log(`Dropz Universal Propfirm Trading running on ${PORT}`));
