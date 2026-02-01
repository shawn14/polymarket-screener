# Polymarket Trader Screener

A "stock screener" for Polymarket traders. Identify the best performers by PnL, volume, win rate, and efficiency.

## Quick Start

```bash
# Fetch latest data
npm run fetch

# Run analysis
npm run analyze

# Or just run (auto-fetches if needed)
npm start
```

## Features

- **Leaderboard tracking** across multiple time periods (day, week, month, all-time)
- **Dual ranking** by PnL and volume
- **Detailed stats** for top traders (win rate, avg win/loss)
- **Efficiency analysis** (PnL per volume traded)
- **Consistent winner detection** (high win rate + significant volume)

## API Endpoints Used

| Endpoint | Description |
|----------|-------------|
| `GET /v1/leaderboard` | Top traders by PnL or volume |
| `GET /v1/user-stats` | User statistics |
| `GET /positions` | Open positions |
| `GET /closed-positions` | Closed positions (realized PnL) |
| `GET /activity` | Trade activity |

Base URL: `https://data-api.polymarket.com`

### Leaderboard Parameters

| Param | Values | Description |
|-------|--------|-------------|
| `timePeriod` | `day`, `week`, `month`, `all` | Time window |
| `orderBy` | `PNL`, `VOL` | Sort order |
| `limit` | number | Results per page |
| `offset` | number | Pagination offset |
| `category` | `overall` | Market category |

## Data Files

After fetching, data is stored in `./data/`:

- `leaderboard.json` - Raw leaderboard data
- `traders.json` - Deduplicated trader index
- `top-traders-detailed.json` - Extended stats for top 50

## Example Output

```
═══════════════════════════════════════════════════════════════════════════════
 POLYMARKET TRADER SCREENER
═══════════════════════════════════════════════════════════════════════════════

 TOP 20 BY ALL-TIME PROFIT
────────────────────────────────────────────────────────────────────────────────
Rank  Trader                    PnL         Volume     Win Rate
────────────────────────────────────────────────────────────────────────────────
#1    Theo4                +$5,234,123   $12,456,789      67.3%
#2    beachboy4            +$2,891,234    $8,234,567      72.1%
...
```

## Ideas for Extension

- [ ] Track trader positions in real-time
- [ ] Alert when top traders make moves
- [ ] Copy-trading signals
- [ ] Market sentiment from whale activity
- [ ] Web UI dashboard
- [ ] Telegram bot for alerts

## License

MIT
