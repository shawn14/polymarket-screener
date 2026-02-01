#!/usr/bin/env node
/**
 * Edge Detector - Identify traders with the best edge
 * 
 * Edge Score factors:
 * - PnL/Volume ratio (efficiency)
 * - Consistency (performance across time periods)
 * - Win rate on closed positions
 * - Risk-adjusted returns (Sharpe-like)
 * - Recent performance vs all-time (momentum)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { fetchLeaderboard, fetchClosedPositions, fetchPositions } from './api.js';

const DATA_DIR = './data';
const EDGE_FILE = `${DATA_DIR}/edge-traders.json`;

async function fetchTraderDetails(wallet, limit = 100) {
  try {
    const [closedPositions, openPositions] = await Promise.all([
      fetchClosedPositions(wallet, { limit }).catch(() => []),
      fetchPositions(wallet, { limit: 50 }).catch(() => [])
    ]);
    
    return { closedPositions, openPositions };
  } catch (err) {
    return { closedPositions: [], openPositions: [] };
  }
}

function calculateEdgeScore(trader, details) {
  const { closedPositions } = details;
  
  // Base metrics
  const pnl = trader.pnl || 0;
  const volume = trader.vol || 1;
  const efficiency = pnl / volume;
  
  // Win rate from closed positions
  const wins = closedPositions.filter(p => p.realizedPnl > 0);
  const losses = closedPositions.filter(p => p.realizedPnl < 0);
  const totalTrades = wins.length + losses.length;
  const winRate = totalTrades > 0 ? wins.length / totalTrades : 0.5;
  
  // Average win/loss sizes
  const avgWin = wins.length > 0 
    ? wins.reduce((s, p) => s + p.realizedPnl, 0) / wins.length 
    : 0;
  const avgLoss = losses.length > 0 
    ? Math.abs(losses.reduce((s, p) => s + p.realizedPnl, 0) / losses.length)
    : 1;
  
  // Profit factor (total wins / total losses)
  const totalWins = wins.reduce((s, p) => s + p.realizedPnl, 0);
  const totalLosses = Math.abs(losses.reduce((s, p) => s + p.realizedPnl, 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 10 : 1;
  
  // Edge score components (0-100 each)
  const efficiencyScore = Math.min(efficiency * 200, 100); // 50% efficiency = 100
  const winRateScore = winRate * 100;
  const profitFactorScore = Math.min(profitFactor * 20, 100); // PF of 5 = 100
  const consistencyScore = totalTrades > 20 ? 100 : (totalTrades / 20) * 100;
  const sizeScore = Math.min(Math.log10(volume + 1) * 15, 100); // Rewards volume
  
  // Weighted edge score
  const edgeScore = (
    efficiencyScore * 0.30 +
    winRateScore * 0.25 +
    profitFactorScore * 0.20 +
    consistencyScore * 0.15 +
    sizeScore * 0.10
  );
  
  return {
    edgeScore: Math.round(edgeScore * 10) / 10,
    components: {
      efficiency: Math.round(efficiencyScore * 10) / 10,
      winRate: Math.round(winRateScore * 10) / 10,
      profitFactor: Math.round(profitFactorScore * 10) / 10,
      consistency: Math.round(consistencyScore * 10) / 10,
      size: Math.round(sizeScore * 10) / 10
    },
    stats: {
      pnl,
      volume,
      efficiencyPct: Math.round(efficiency * 1000) / 10,
      winRate: Math.round(winRate * 1000) / 10,
      wins: wins.length,
      losses: losses.length,
      avgWin: Math.round(avgWin),
      avgLoss: Math.round(avgLoss),
      profitFactor: Math.round(profitFactor * 100) / 100,
      totalTrades
    }
  };
}

async function detectEdgeTraders(minVolume = 50000, topN = 100) {
  console.log('🎯 Edge Detection Started\n');
  
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  
  // Fetch top traders by PnL across time periods
  console.log('Fetching leaderboards...');
  const [allTime, monthly, weekly] = await Promise.all([
    fetchLeaderboard({ timePeriod: 'all', orderBy: 'PNL', limit: 200 }),
    fetchLeaderboard({ timePeriod: 'month', orderBy: 'PNL', limit: 100 }),
    fetchLeaderboard({ timePeriod: 'week', orderBy: 'PNL', limit: 100 })
  ]);
  
  // Combine and dedupe
  const traderMap = new Map();
  
  for (const trader of [...allTime, ...monthly, ...weekly]) {
    if (!traderMap.has(trader.proxyWallet)) {
      traderMap.set(trader.proxyWallet, trader);
    }
  }
  
  // Filter by minimum volume
  const candidates = Array.from(traderMap.values())
    .filter(t => (t.vol || 0) >= minVolume && (t.pnl || 0) > 0);
  
  console.log(`Found ${candidates.length} profitable traders with >$${minVolume.toLocaleString()} volume\n`);
  
  // Analyze each trader
  const edgeTraders = [];
  
  for (let i = 0; i < Math.min(candidates.length, topN * 2); i++) {
    const trader = candidates[i];
    console.log(`[${i + 1}/${Math.min(candidates.length, topN * 2)}] Analyzing ${trader.userName}...`);
    
    const details = await fetchTraderDetails(trader.proxyWallet);
    const edge = calculateEdgeScore(trader, details);
    
    edgeTraders.push({
      wallet: trader.proxyWallet,
      userName: trader.userName,
      profileImage: trader.profileImage,
      xUsername: trader.xUsername,
      ...edge,
      openPositions: details.openPositions.length,
      currentPositions: details.openPositions.slice(0, 10).map(p => ({
        market: p.title || p.eventSlug,
        outcome: p.outcome,
        size: p.currentValue || p.size,
        avgPrice: p.avgPrice,
        currentPrice: p.curPrice
      }))
    });
    
    // Rate limit
    await new Promise(r => setTimeout(r, 250));
  }
  
  // Sort by edge score
  edgeTraders.sort((a, b) => b.edgeScore - a.edgeScore);
  
  // Take top N
  const topEdge = edgeTraders.slice(0, topN);
  
  // Save results
  const result = {
    fetchedAt: new Date().toISOString(),
    count: topEdge.length,
    traders: topEdge
  };
  
  writeFileSync(EDGE_FILE, JSON.stringify(result, null, 2));
  
  // Print summary
  console.log('\n' + '═'.repeat(80));
  console.log(' TOP EDGE TRADERS');
  console.log('═'.repeat(80));
  console.log(
    'Rank'.padEnd(6) +
    'Trader'.padEnd(22) +
    'Edge'.padStart(8) +
    'Efficiency'.padStart(12) +
    'Win Rate'.padStart(10) +
    'PnL'.padStart(14)
  );
  console.log('─'.repeat(80));
  
  for (let i = 0; i < Math.min(30, topEdge.length); i++) {
    const t = topEdge[i];
    console.log(
      `#${i + 1}`.padEnd(6) +
      t.userName.slice(0, 20).padEnd(22) +
      `${t.edgeScore}`.padStart(8) +
      `${t.stats.efficiencyPct}%`.padStart(12) +
      `${t.stats.winRate}%`.padStart(10) +
      `+$${t.stats.pnl.toLocaleString()}`.padStart(14)
    );
  }
  
  console.log('═'.repeat(80));
  console.log(`\nSaved ${topEdge.length} edge traders to ${EDGE_FILE}`);
  
  return topEdge;
}

// Run if called directly
const args = process.argv.slice(2);
const minVol = parseInt(args[0]) || 50000;
const topN = parseInt(args[1]) || 50;

detectEdgeTraders(minVol, topN).catch(console.error);

export { detectEdgeTraders, calculateEdgeScore };
