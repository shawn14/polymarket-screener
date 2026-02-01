#!/usr/bin/env node
/**
 * Fetch and cache trader data from Polymarket
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fetchAllLeaderboard, fetchUserStats, fetchClosedPositions } from './api.js';

const DATA_DIR = './data';

async function main() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log('Fetching leaderboard data...\n');

  // Fetch multiple time periods
  const periods = ['day', 'week', 'month', 'all'];
  const allData = {};

  for (const period of periods) {
    console.log(`Fetching ${period} leaderboard (PNL)...`);
    const pnlTraders = await fetchAllLeaderboard({ timePeriod: period, orderBy: 'PNL' }, 5);
    
    console.log(`Fetching ${period} leaderboard (VOL)...`);
    const volTraders = await fetchAllLeaderboard({ timePeriod: period, orderBy: 'VOL' }, 5);
    
    allData[period] = {
      byPnl: pnlTraders,
      byVolume: volTraders,
      fetchedAt: new Date().toISOString()
    };
    
    console.log(`  → ${pnlTraders.length} traders by PNL, ${volTraders.length} by volume\n`);
  }

  // Save raw data
  writeFileSync(`${DATA_DIR}/leaderboard.json`, JSON.stringify(allData, null, 2));
  console.log(`Saved to ${DATA_DIR}/leaderboard.json`);

  // Build trader index (dedupe across time periods)
  const traderMap = new Map();
  
  for (const period of periods) {
    for (const trader of [...allData[period].byPnl, ...allData[period].byVolume]) {
      const existing = traderMap.get(trader.proxyWallet);
      if (!existing) {
        traderMap.set(trader.proxyWallet, {
          wallet: trader.proxyWallet,
          userName: trader.userName,
          profileImage: trader.profileImage,
          xUsername: trader.xUsername,
          verifiedBadge: trader.verifiedBadge,
          rankings: {}
        });
      }
      
      const entry = traderMap.get(trader.proxyWallet);
      entry.rankings[period] = {
        pnlRank: trader.rank,
        pnl: trader.pnl,
        volume: trader.vol
      };
    }
  }

  const traders = Array.from(traderMap.values());
  writeFileSync(`${DATA_DIR}/traders.json`, JSON.stringify(traders, null, 2));
  console.log(`Indexed ${traders.length} unique traders to ${DATA_DIR}/traders.json`);

  // Fetch detailed stats for top traders
  console.log('\nFetching detailed stats for top 50 traders...');
  const topTraders = allData.all.byPnl.slice(0, 50);
  const detailedStats = [];

  for (let i = 0; i < topTraders.length; i++) {
    const trader = topTraders[i];
    console.log(`  [${i + 1}/${topTraders.length}] ${trader.userName}...`);
    
    try {
      const [stats, closedPositions] = await Promise.all([
        fetchUserStats(trader.proxyWallet).catch(() => null),
        fetchClosedPositions(trader.proxyWallet, { limit: 100 }).catch(() => [])
      ]);

      // Calculate win rate from closed positions
      const wins = closedPositions.filter(p => p.realizedPnl > 0).length;
      const losses = closedPositions.filter(p => p.realizedPnl < 0).length;
      const winRate = wins + losses > 0 ? wins / (wins + losses) : null;

      detailedStats.push({
        ...trader,
        stats,
        winRate,
        totalTrades: wins + losses,
        wins,
        losses,
        avgWin: wins > 0 ? closedPositions.filter(p => p.realizedPnl > 0).reduce((s, p) => s + p.realizedPnl, 0) / wins : 0,
        avgLoss: losses > 0 ? closedPositions.filter(p => p.realizedPnl < 0).reduce((s, p) => s + p.realizedPnl, 0) / losses : 0
      });

      // Rate limit
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.log(`    Error: ${err.message}`);
    }
  }

  writeFileSync(`${DATA_DIR}/top-traders-detailed.json`, JSON.stringify(detailedStats, null, 2));
  console.log(`\nSaved detailed stats to ${DATA_DIR}/top-traders-detailed.json`);
}

main().catch(console.error);
