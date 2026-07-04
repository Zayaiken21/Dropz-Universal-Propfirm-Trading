const $ = (id) => document.getElementById(id);
let currentSymbol = 'BINANCE:BTCUSDT';
let balance = 100000;
let floating = 0;
let positions = [];

const chart = LightweightCharts.createChart($('chart'), {
  layout: { background: { color: '#0e1626' }, textColor: '#cfe3ff' },
  grid: { vertLines: { color: '#18263d' }, horzLines: { color: '#18263d' } },
  rightPriceScale: { borderColor: '#263852' },
  timeScale: { borderColor: '#263852', timeVisible: true, secondsVisible: false },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
});
const candleSeries = chart.addCandlestickSeries({
  upColor: '#22c55e', downColor: '#ef4444', borderUpColor: '#22c55e', borderDownColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444'
});

async function loadSymbols() {
  const res = await fetch('/api/symbols');
  const data = await res.json();
  $('providerText').textContent = data.provider === 'finnhub' ? 'Live Finnhub feed' : 'Simulation mode — add API key';
  $('providerDot').style.background = data.provider === 'finnhub' ? '#22c55e' : '#facc15';
  $('watchlist').innerHTML = data.symbols.map(s => `<div class="watchItem ${s===currentSymbol?'active':''}" data-symbol="${s}"><b>${s}</b><span>1m</span></div>`).join('');
  document.querySelectorAll('.watchItem').forEach(el => el.onclick = () => switchSymbol(el.dataset.symbol));
}

async function loadHistory(symbol) {
  const res = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}`);
  const data = await res.json();
  candleSeries.setData(data.candles);
  chart.timeScale().fitContent();
  const last = data.candles[data.candles.length - 1];
  updatePrice(last.close);
}

function connectStream() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/stream`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', symbol: currentSymbol }));
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'candle' && msg.symbol === currentSymbol) {
      candleSeries.update(msg.candle);
      updatePrice(msg.candle.close);
      markToMarket(msg.candle.close);
    }
  };
  ws.onclose = () => setTimeout(connectStream, 2000);
  window.activeWS = ws;
}

function switchSymbol(symbol) {
  currentSymbol = symbol;
  $('symbolTitle').textContent = symbol;
  document.querySelectorAll('.watchItem').forEach(el => el.classList.toggle('active', el.dataset.symbol === symbol));
  if (window.activeWS?.readyState === WebSocket.OPEN) window.activeWS.send(JSON.stringify({ type: 'subscribe', symbol }));
  loadHistory(symbol);
}

function updatePrice(price) {
  $('lastPrice').textContent = Number(price).toLocaleString(undefined, { maximumFractionDigits: price < 10 ? 5 : 2 });
}

function markToMarket(price) {
  floating = positions.reduce((sum, p) => sum + (p.side === 'BUY' ? price - p.entry : p.entry - price) * p.size, 0);
  const equity = balance + floating;
  $('floating').textContent = money(floating);
  $('floating').className = floating >= 0 ? 'green' : 'red';
  $('equity').textContent = money(equity);
  const lossUsed = Math.max(0, -floating / 1000 * 100);
  $('lossUsed').textContent = `${lossUsed.toFixed(1)}%`;
  const targetProgress = Math.min(100, Math.max(0, (equity - 100000) / 10000 * 100));
  $('targetBar').style.width = `${targetProgress}%`;
  $('challengeText').textContent = `Target progress: ${targetProgress.toFixed(1)}%`;
  renderPositions();
}

function renderPositions() {
  if (!positions.length) { $('positions').innerHTML = '<tr><td colspan="4">No open positions</td></tr>'; return; }
  $('positions').innerHTML = positions.map(p => `<tr><td>${p.symbol}</td><td>${p.side}</td><td>${p.size}</td><td class="${floating >= 0 ? 'green':'red'}">${money(floating)}</td></tr>`).join('');
}
function money(n){return n.toLocaleString(undefined,{style:'currency',currency:'USD'});} 

$('demoTrade').onclick = () => {
  const shown = $('lastPrice').textContent.replace(/,/g,'');
  const entry = Number(shown) || 100;
  positions = [{ symbol: currentSymbol, side: Math.random() > .5 ? 'BUY' : 'SELL', size: currentSymbol.includes('BTC') ? .25 : 10, entry }];
  renderPositions();
};
$('resetBtn').onclick = () => { balance = 100000; floating = 0; positions = []; $('balance').textContent = money(balance); markToMarket(Number($('lastPrice').textContent.replace(/,/g,'')) || 0); };

loadSymbols();
loadHistory(currentSymbol);
connectStream();
addEventListener('resize', () => chart.applyOptions({ width: $('chart').clientWidth }));
