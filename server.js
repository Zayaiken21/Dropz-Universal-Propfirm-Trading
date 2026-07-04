require('dotenv').config();
const path = require('path');
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

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

const SYMBOLS = ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'OANDA:XAU_USD', 'OANDA:EUR_USD', 'AAPL', 'TSLA', 'NVDA'];
const clients = new Map();
const candles = new Map();
let upstream = null;

function normalizeSymbol(symbol) {
  return SYMBOLS.includes(symbol) ? symbol : 'BINANCE:BTCUSDT';
}
function bucketTime(unixMs, intervalSec = 60) {
  return Math.floor(unixMs / 1000 / intervalSec) * intervalSec;
}
function updateCandle(symbol, price, volume = 1, unixMs = Date.now()) {
  const time = bucketTime(unixMs);
  const key = `${symbol}:${time}`;
  let c = candles.get(key);
  if (!c) {
    c = { time, open: price, high: price, low: price, close: price, volume };
    candles.set(key, c);
  } else {
    c.high = Math.max(c.high, price);
    c.low = Math.min(c.low, price);
    c.close = price;
    c.volume += volume;
  }
  broadcast(symbol, { type: 'candle', symbol, candle: c });
}
function broadcast(symbol, payload) {
  for (const [ws, state] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN && state.symbol === symbol) ws.send(JSON.stringify(payload));
  }
}
function generateHistory(symbol, count = 180) {
  const baseMap = {
    'BINANCE:BTCUSDT': 62000,
    'BINANCE:ETHUSDT': 3300,
    'OANDA:XAU_USD': 2350,
    'OANDA:EUR_USD': 1.08,
    AAPL: 210,
    TSLA: 260,
    NVDA: 125
  };
  let price = baseMap[symbol] || 100;
  const now = bucketTime(Date.now());
  const out = [];
  for (let i = count; i > 0; i--) {
    const time = now - i * 60;
    const drift = (Math.random() - 0.49) * price * 0.002;
    const open = price;
    const close = Math.max(0.0001, open + drift);
    const high = Math.max(open, close) + Math.random() * price * 0.0012;
    const low = Math.min(open, close) - Math.random() * price * 0.0012;
    price = close;
    out.push({ time, open, high, low, close, volume: Math.round(10 + Math.random() * 90) });
  }
  return out;
}

app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/api/symbols', (_req, res) => {
  res.json({ symbols: SYMBOLS, provider: FINNHUB_API_KEY ? 'finnhub' : 'simulation' });
});
app.get('/api/history', (req, res) => {
  const symbol = normalizeSymbol(req.query.symbol || 'BINANCE:BTCUSDT');
  res.json({ symbol, interval: '1m', candles: generateHistory(symbol) });
});

// Critical Render fix: always return the HTML app for / and browser refreshes.
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/stream')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

function startFinnhub() {
  if (!FINNHUB_API_KEY) return false;
  upstream = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);
  upstream.on('open', () => {
    console.log('Connected to Finnhub stream');
    for (const symbol of SYMBOLS) upstream.send(JSON.stringify({ type: 'subscribe', symbol }));
  });
  upstream.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'trade' || !Array.isArray(msg.data)) return;
      for (const t of msg.data) updateCandle(t.s, Number(t.p), Number(t.v || 1), Number(t.t || Date.now()));
    } catch (e) { console.error('stream parse error', e.message); }
  });
  upstream.on('close', () => {
    console.log('Finnhub stream closed; retrying in 5s');
    setTimeout(startFinnhub, 5000);
  });
  upstream.on('error', (err) => console.error('Finnhub error:', err.message));
  return true;
}
function startSimulation() {
  const prices = Object.fromEntries(SYMBOLS.map(s => [s, generateHistory(s, 1)[0].close]));
  setInterval(() => {
    for (const symbol of SYMBOLS) {
      const p = prices[symbol];
      const next = Math.max(0.0001, p + (Math.random() - 0.5) * p * 0.0018);
      prices[symbol] = next;
      updateCandle(symbol, next, Math.random() * 5, Date.now());
    }
  }, 1000);
}

wss.on('connection', (ws) => {
  clients.set(ws, { symbol: 'BINANCE:BTCUSDT' });
  ws.send(JSON.stringify({ type: 'status', provider: FINNHUB_API_KEY ? 'finnhub' : 'simulation' }));
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe') clients.set(ws, { symbol: normalizeSymbol(msg.symbol) });
    } catch (_) {}
  });
  ws.on('close', () => clients.delete(ws));
});

if (!startFinnhub()) startSimulation();
server.listen(PORT, () => console.log(`Trading platform running on :${PORT}`));
