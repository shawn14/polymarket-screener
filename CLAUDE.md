# CLAUDE.md - Polymarket Screener

## Project Overview

A Bloomberg-style trader screener for Polymarket. Identifies high-edge traders, monitors whale activity, and sends real-time Telegram alerts.

**Live URL:** https://polymarket-screener-seven.vercel.app

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (Bloomberg terminal aesthetic)
- **Backend:** Node.js (ES modules)
- **Hosting:** Vercel (serverless functions + static)
- **Whale Watcher:** GCP Cloud Run (24/7 monitoring)
- **Alerts:** Telegram Bot (@Pmwhale_bot)
- **Data:** Polymarket public APIs

## GCP Cloud Run - Whale Watcher

**URL:** https://polymarket-whale-watcher-377466082980.us-central1.run.app

**Endpoints:**
- `/` - Status (uptime, last check, trades found)
- `/activity` - Recent whale trades with `isCopyCandidate` flag

The Vercel dashboard proxies `/api/whale-activity` from this GCP endpoint, so both Telegram and the web dashboard show the same data.

## Key Features

### 📊 Trader Screener (Main Table)
Full-width Bloomberg-style data table with columns:
- **Rank** - Position in sorted list
- **Trader** - Username (linked to Polymarket profile)
- **PnL** - Profit/Loss (color-coded green/red)
- **Volume** - Total traded volume
- **Efficiency** - PnL/Volume ratio (higher = better edge)
- **Win Rate** - % of winning trades
- **Trades** - Total closed positions
- **Avg Win/Loss** - Average win and loss sizes
- **Profit Factor** - Total wins ÷ total losses
- **Edge Score** - Composite score (see Edge Detection below)

**Sort Options:** PnL, Volume, Efficiency, Win Rate, Edge Score
**Time Filters:** All Time, Month, Week, Today

### 🎯 Edge Detection Algorithm

Edge Score weights:
- Efficiency (30%) - PnL per dollar traded
- Win Rate (25%) - Consistency of wins
- Profit Factor (20%) - Risk/reward ratio
- Consistency (15%) - Based on trade count (20+ trades = max)
- Size (10%) - Rewards higher volume

**Copy-worthy trader criteria:**
| Factor | Target | Why |
|--------|--------|-----|
| Trades | 20+ | Statistical significance |
| Win Rate | >60% | Consistent edge |
| Efficiency | >20% | Good PnL per dollar |
| Profit Factor | >2x | Wins outweigh losses |
| Recency | Active in last week | Still trading |
| Diversification | Multiple markets | Not one lucky bet |

**Red flags:**
- 100% win rate with <10 trades (luck)
- Huge single positions (concentrated risk)
- Only niche markets (specialist, not generalizable)

### 🐋 Whale Watcher

Monitors top 50 traders for new activity. Sends Telegram alerts for trades >$10K.

**Run modes:**
```bash
npm run whales          # Check once
npm run whales:daemon   # Continuous monitoring (60s intervals)
```

### 📡 Telegram Bot (@Pmwhale_bot)

**Bot Token:** Stored in `.env` (TELEGRAM_BOT_TOKEN)
**Chat ID:** 1532830178 (Shawn's DM)

**Alert Format (Bloomberg-style):**
```
🟢 BUY $47,500 @ 62.3¢

Yes - Trump wins 2024
US Presidential Election Winner

┌─────────────────────────
│ TRADER  Theo4
│ PNL     +$22,847,291
│ VOLUME  $44,892,000
└─────────────────────────

View Profile →
```

**Future:** Can create a public channel for subscribers.

## File Structure

```
polymarket-screener/
├── api/                    # Vercel serverless functions
│   ├── leaderboard.js
│   ├── edge-traders.js
│   ├── signals.js
│   ├── whale-activity.js
│   └── ...
├── src/
│   ├── api.js              # Polymarket API client
│   ├── fetch-traders.js    # Data fetching script
│   ├── edge-detector.js    # Edge score calculation
│   ├── whale-watcher.js    # Whale monitoring daemon
│   ├── copy-trader.js      # Copy signal generation
│   └── server.js           # Local dev server
├── public/
│   └── index.html          # Bloomberg-style dashboard
├── data/                   # Fetched data (gitignored)
│   ├── leaderboard.json
│   ├── edge-traders.json
│   ├── whale-activity.json
│   └── ...
├── .env                    # Telegram credentials
├── vercel.json             # Vercel config
└── package.json
```

## Commands

```bash
# Fetch all data (leaderboard + detailed stats)
npm run fetch

# Run edge detection analysis
npm run edge

# Start whale watcher daemon
npm run whales:daemon

# Generate copy signals
npm run copy

# Local dev server
npm run serve
```

## Polymarket API Reference

**Base URLs:**
- `https://data-api.polymarket.com` - Main data
- `https://lb-api.polymarket.com` - Leaderboard

**Key Endpoints:**
```
GET /v1/leaderboard?timePeriod=all&orderBy=PNL&limit=100
GET /positions?user={wallet}
GET /closed-positions?user={wallet}
GET /activity?user={wallet}
```

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=xxx    # @Pmwhale_bot token
TELEGRAM_CHAT_ID=xxx      # Target chat/channel
WHALE_WEBHOOK_URL=xxx     # Optional webhook
```

## Deployment

Auto-deploys via Vercel on push. Build command fetches fresh data.

```bash
vercel --prod
```

## Design Notes

**Bloomberg Terminal Aesthetic:**
- Pure black (#000) background
- Orange (#ff6600) accent color
- Monospace font (SF Mono, Monaco, Consolas)
- Dense 4-panel grid layout
- Compact data tables with tabular numbers
- Live dot animation on whale feed
- Mobile-responsive (stacked panels, horizontal scroll)

**Mobile Optimizations:**
- Stacked vertical layout on <768px
- Horizontal scrollable tables
- Shortened column headers (Eff%, Win%, PF)
- Hidden columns on <480px (Trades, Avg W/L)
- Touch-friendly dropdowns

## Top Edge Traders (As of Analysis)

1. **Theo4** - 22 trades, 81.8% WR, 51% efficiency, $22M PnL
2. **Jenzigo** - 11 trades, 90.9% WR, 42.8% efficiency
3. **Michie** - 15 trades, 73.3% WR, 36.6% efficiency

## Future Ideas

- [ ] Public Telegram channel for whale alerts
- [ ] Real-time position tracking
- [ ] Historical performance charts
- [ ] Automated copy-trading execution
- [ ] Push notifications
- [ ] Portfolio simulation (paper trading)
- [ ] Market sentiment from whale positions

## Related

- Polymarket: https://polymarket.com
- Bot: https://t.me/Pmwhale_bot
