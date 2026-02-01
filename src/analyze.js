#!/usr/bin/env node
/**
 * Analyze trader data and output screener results
 */

import { readFileSync, existsSync } from 'fs';

const DATA_DIR = './data';

function loadData(filename) {
  const path = `${DATA_DIR}/${filename}`;
  if (!existsSync(path)) {
    console.error(`Missing ${path} - run 'npm run fetch' first`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function formatMoney(n) {
  if (n == null) return '-';
  const sign = n >= 0 ? '+' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPct(n) {
  if (n == null) return '-';
  return (n * 100).toFixed(1) + '%';
}

function main() {
  const leaderboard = loadData('leaderboard.json');
  const detailedPath = `${DATA_DIR}/top-traders-detailed.json`;
  const detailed = existsSync(detailedPath) 
    ? JSON.parse(readFileSync(detailedPath, 'utf-8'))
    : null;

  console.log('═'.repeat(80));
  console.log(' POLYMARKET TRADER SCREENER');
  console.log('═'.repeat(80));
  console.log(`\nData fetched: ${leaderboard.all.fetchedAt}\n`);

  // Top by All-Time PnL
  console.log('─'.repeat(80));
  console.log(' TOP 20 BY ALL-TIME PROFIT');
  console.log('─'.repeat(80));
  console.log(
    'Rank'.padEnd(6) +
    'Trader'.padEnd(25) +
    'PnL'.padStart(15) +
    'Volume'.padStart(15) +
    'Win Rate'.padStart(12)
  );
  console.log('─'.repeat(80));

  const topAll = leaderboard.all.byPnl.slice(0, 20);
  for (const trader of topAll) {
    const detail = detailed?.find(d => d.proxyWallet === trader.proxyWallet);
    console.log(
      `#${trader.rank}`.padEnd(6) +
      trader.userName.slice(0, 24).padEnd(25) +
      formatMoney(trader.pnl).padStart(15) +
      formatMoney(trader.vol).padStart(15) +
      formatPct(detail?.winRate).padStart(12)
    );
  }

  // Top by Daily PnL (hot traders)
  console.log('\n' + '─'.repeat(80));
  console.log(' TOP 10 TODAY (Hot Hands 🔥)');
  console.log('─'.repeat(80));
  console.log(
    'Rank'.padEnd(6) +
    'Trader'.padEnd(25) +
    'Today PnL'.padStart(15) +
    'Today Vol'.padStart(15)
  );
  console.log('─'.repeat(80));

  const topDay = leaderboard.day.byPnl.slice(0, 10);
  for (const trader of topDay) {
    console.log(
      `#${trader.rank}`.padEnd(6) +
      trader.userName.slice(0, 24).padEnd(25) +
      formatMoney(trader.pnl).padStart(15) +
      formatMoney(trader.vol).padStart(15)
    );
  }

  // Volume leaders
  console.log('\n' + '─'.repeat(80));
  console.log(' TOP 10 BY VOLUME (Whales 🐋)');
  console.log('─'.repeat(80));
  console.log(
    'Rank'.padEnd(6) +
    'Trader'.padEnd(25) +
    'Volume'.padStart(15) +
    'PnL'.padStart(15)
  );
  console.log('─'.repeat(80));

  const topVol = leaderboard.all.byVolume.slice(0, 10);
  for (const trader of topVol) {
    console.log(
      `#${trader.rank}`.padEnd(6) +
      trader.userName.slice(0, 24).padEnd(25) +
      formatMoney(trader.vol).padStart(15) +
      formatMoney(trader.pnl).padStart(15)
    );
  }

  // Efficiency analysis (PnL per volume)
  if (detailed && detailed.length > 0) {
    console.log('\n' + '─'.repeat(80));
    console.log(' TOP 10 BY EFFICIENCY (Best Edge)');
    console.log('─'.repeat(80));
    console.log(
      'Rank'.padEnd(6) +
      'Trader'.padEnd(25) +
      'PnL/Vol'.padStart(12) +
      'Win Rate'.padStart(12) +
      'Trades'.padStart(10)
    );
    console.log('─'.repeat(80));

    const withEfficiency = detailed
      .filter(t => t.vol > 10000) // Min volume filter
      .map(t => ({
        ...t,
        efficiency: t.pnl / t.vol
      }))
      .sort((a, b) => b.efficiency - a.efficiency)
      .slice(0, 10);

    for (let i = 0; i < withEfficiency.length; i++) {
      const trader = withEfficiency[i];
      console.log(
        `#${i + 1}`.padEnd(6) +
        trader.userName.slice(0, 24).padEnd(25) +
        formatPct(trader.efficiency).padStart(12) +
        formatPct(trader.winRate).padStart(12) +
        String(trader.totalTrades || '-').padStart(10)
      );
    }
  }

  // Consistent winners (high win rate + good volume)
  if (detailed && detailed.length > 0) {
    console.log('\n' + '─'.repeat(80));
    console.log(' CONSISTENT WINNERS (>60% Win Rate, >$50k Volume)');
    console.log('─'.repeat(80));
    console.log(
      'Trader'.padEnd(25) +
      'Win Rate'.padStart(12) +
      'W/L'.padStart(10) +
      'Avg Win'.padStart(12) +
      'Avg Loss'.padStart(12)
    );
    console.log('─'.repeat(80));

    const consistent = detailed
      .filter(t => t.winRate >= 0.6 && t.vol > 50000 && t.totalTrades >= 10)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 10);

    for (const trader of consistent) {
      console.log(
        trader.userName.slice(0, 24).padEnd(25) +
        formatPct(trader.winRate).padStart(12) +
        `${trader.wins}/${trader.losses}`.padStart(10) +
        formatMoney(trader.avgWin).padStart(12) +
        formatMoney(trader.avgLoss).padStart(12)
      );
    }

    if (consistent.length === 0) {
      console.log('  No traders match criteria');
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log(' Profile URLs: https://polymarket.com/profile/{wallet}');
  console.log('═'.repeat(80) + '\n');
}

main();
