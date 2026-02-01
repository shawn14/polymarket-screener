# Polymarket Trader Screener

A "stock screener" for Polymarket traders. Identify the best performers by PnL, volume, win rate, and efficiency. Includes whale monitoring and copy-trading signals.

## Quick Start

```bash
# Fetch latest data
npm run fetch

# Run CLI analysis
npm run analyze

# Start web dashboard
npm run serve
# → http://localhost:3456
```

## Features

### 📊 Trader Screener
- Leaderboard tracking across multiple time periods (day, week, month, all-time)
- Dual ranking by PnL and volume
- Detailed stats for top traders (win rate, avg win/loss)
- Efficiency analysis (PnL per volume traded)

### 🐋 Whale Watcher
Monitor top traders for activity and get alerts when they make moves.

```bash
# Check once
npm run whales

# Run as daemon (continuous monitoring)
npm run whales:daemon

# With alerts (set env vars)
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy npm run whales:daemon
WHALE_WEBHOOK_URL=https://your-webhook.com npm run whales:daemon
```

### 📡 Copy Trading Signals
Generate signals based on what top traders are doing.

```bash
# Generate signals
npm run copy

# Manage followed traders
npm run copy:add 0x123...abc TraderName
npm run copy:list
npm run copy:signals
```

### 🖥️ Web Dashboard
Visual dashboard showing all data.

```bash
npm run serve
# Open http://localhost:3456
```

Features:
- Real-time leaderboard with filtering
- Copy trading signal cards
- Whale activity feed
- Efficiency rankings

## API Endpoints (Internal Server)

| Endpoint | Description |
|----------|-------------|
| `GET /api/leaderboard` | All leaderboard data |
| `GET /api/traders` | Unique trader index |
| `GET /api/top-detailed` | Detailed stats for top 50 |
| `GET /api/signals` | Copy trading signals |
| `GET /api/whale-activity` | Recent whale trades |

## Polymarket API Reference

### Base URLs
- `https://data-api.polymarket.com` - Main data API
- `https://lb-api.polymarket.com` - Leaderboard API

### Key Endpoints

**Leaderboard**
```
GET /v1/leaderboard
  ?timePeriod=day|week|month|all
  &orderBy=PNL|VOL
  &limit=100
  &offset=0
  &category=overall
```

**User Data**
```
GET /positions?user={wallet}
GET /closed-positions?user={wallet}
GET /activity?user={wallet}
GET /v1/user-stats?proxyAddress={wallet}
GET /value?user={wallet}
```

## Data Files

After fetching, data is stored in `./data/`:

| File | Description |
|------|-------------|
| `leaderboard.json` | Raw leaderboard data |
| `traders.json` | Deduplicated trader index |
| `top-traders-detailed.json` | Extended stats for top 50 |
| `signals.json` | Generated copy signals |
| `whale-activity.json` | Whale trade history |
| `whale-state.json` | Whale watcher state |
| `following.json` | Traders you're following |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Web server port (default: 3456) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot for alerts |
| `TELEGRAM_CHAT_ID` | Telegram chat for alerts |
| `WHALE_WEBHOOK_URL` | Webhook for whale alerts |
| `SIGNAL_WEBHOOK_URL` | Webhook for copy signals |

## Ideas for Extension

- [ ] Real-time position tracking
- [ ] Historical performance charts
- [ ] Market sentiment analysis from whale positions
- [ ] Automated copy-trading execution
- [ ] Discord bot integration
- [ ] SMS/push notifications
- [ ] Portfolio simulation (paper trading)

## License

MIT
