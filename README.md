# PropFirm Trading Platform Starter

A deployable HTML/Node trading dashboard with moving candlesticks, watchlist, account metrics, prop-firm style rule cards, and a backend market-data proxy.

## Run locally
```bash
npm install
cp .env.example .env
# Add FINNHUB_API_KEY in .env
npm start
```
Open: http://localhost:3000

## Render deploy commands
- Build Command: `npm install`
- Start Command: `npm start`

Add environment variable:
- `FINNHUB_API_KEY=your_finnhub_key`
- `DATA_PROVIDER=finnhub`

## Notes
- This is a charting/trading-dashboard starter, not a broker or order execution system.
- Keep API keys on the server. Do not put data-provider keys in frontend HTML.
- Free market-data plans can have delay, rate limits, or symbol limits. For a prop firm, plan to upgrade to a licensed feed before launching publicly.
