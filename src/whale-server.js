#!/usr/bin/env node
/**
 * Whale Watcher with HTTP health check for Cloud Run
 * Runs the daemon + exposes a health endpoint
 */

import { createServer } from 'http';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { fetchActivity, fetchLeaderboard } from './api.js';

const PORT = process.env.PORT || 8080;
const DATA_DIR = './data';
const ACTIVITY_FILE = `${DATA_DIR}/whale-activity.json`;
const STATE_FILE = `${DATA_DIR}/whale-state.json`;

// Config
const CONFIG = {
  minTradeSize: 10000,
  watchCount: 50,
  pollInterval: 60000,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramChat: process.env.TELEGRAM_CHAT_ID || null
};

let lastCheck = null;
let tradesFound = 0;
let isRunning = false;

function loadState() {
  if (!existsSync(STATE_FILE)) {
    // Initialize with current time to only capture NEW activity
    console.log('First run - initializing state to capture only NEW trades');
    return { lastSeen: {}, watchlist: [], initialized: Date.now() };
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadActivity() {
  if (!existsSync(ACTIVITY_FILE)) return [];
  return JSON.parse(readFileSync(ACTIVITY_FILE, 'utf-8'));
}

function saveActivity(activity) {
  const trimmed = activity.slice(0, 1000);
  writeFileSync(ACTIVITY_FILE, JSON.stringify(trimmed, null, 2));
}

async function sendAlert(message, trade, isCopyCandidate = false) {
  const emoji = isCopyCandidate ? '🎯' : '🐋';
  console.log(`${emoji} ALERT: ${message}`);
  if (trade) {
    console.log(`   Trader: ${trade.userName} | ${trade.side} ${trade.outcome} | $${trade.size?.toLocaleString()}`);
  }
  
  if (CONFIG.telegramToken && CONFIG.telegramChat) {
    try {
      const text = trade 
        ? `${emoji} *${isCopyCandidate ? 'Copy Signal' : 'Whale Alert'}*\n\n*${trade.userName}* ${trade.side} *${trade.outcome}*\n💰 Size: $${trade.size?.toLocaleString()}\n📊 Market: ${trade.market}\n${isCopyCandidate ? `\n✨ _This trader has 70%+ win rate & 30%+ efficiency_` : ''}\n\n[View Profile](https://polymarket.com/profile/${trade.wallet})`
        : `${emoji} ${message}`;
      
      await fetch(`https://api.telegram.org/bot${CONFIG.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.telegramChat,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });
    } catch (err) {
      console.error('Telegram failed:', err.message);
    }
  }
}

async function fetchClosedPositions(wallet) {
  const params = new URLSearchParams({
    user: wallet, sortBy: 'realizedpnl', sortDirection: 'DESC', limit: '50'
  });
  const res = await fetch(`https://data-api.polymarket.com/closed-positions?${params}`);
  return res.json();
}

async function updateWatchlist(state) {
  console.log('Updating watchlist with copy candidate detection...');
  
  // Get top by PnL across time periods
  const [allTime, monthly, weekly] = await Promise.all([
    fetchLeaderboard({ timePeriod: 'all', orderBy: 'PNL', limit: 100 }),
    fetchLeaderboard({ timePeriod: 'month', orderBy: 'PNL', limit: 50 }),
    fetchLeaderboard({ timePeriod: 'week', orderBy: 'PNL', limit: 50 })
  ]);
  
  // Combine and dedupe
  const traderMap = new Map();
  for (const t of [...allTime, ...monthly, ...weekly]) {
    if (!traderMap.has(t.proxyWallet) && (t.pnl || 0) > 0 && (t.vol || 0) > 10000) {
      traderMap.set(t.proxyWallet, {
        wallet: t.proxyWallet,
        userName: t.userName,
        pnl: t.pnl,
        volume: t.vol,
        efficiency: t.pnl / (t.vol || 1),
        isCopyCandidate: false
      });
    }
  }
  
  // Check which are copy candidates (15+ trades, 70%+ win rate, 30%+ efficiency)
  console.log('Checking for copy candidates...');
  const topTraders = Array.from(traderMap.values())
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, 40);
  
  for (const trader of topTraders) {
    try {
      const closed = await fetchClosedPositions(trader.wallet);
      const wins = closed.filter(p => p.realizedPnl > 0).length;
      const losses = closed.filter(p => p.realizedPnl < 0).length;
      const totalTrades = wins + losses;
      const winRate = totalTrades > 0 ? wins / totalTrades : 0;
      
      // Copy candidate criteria: 15+ trades, 70%+ win rate, 30%+ efficiency
      if (totalTrades >= 15 && winRate >= 0.70 && trader.efficiency >= 0.30) {
        trader.isCopyCandidate = true;
        trader.winRate = winRate;
        trader.totalTrades = totalTrades;
        console.log(`  ✓ ${trader.userName} is a COPY CANDIDATE (${totalTrades} trades, ${(winRate*100).toFixed(0)}% win rate)`);
      }
      
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {}
  }
  
  // Sort by efficiency and take top N, prioritizing copy candidates
  state.watchlist = Array.from(traderMap.values())
    .sort((a, b) => {
      if (a.isCopyCandidate && !b.isCopyCandidate) return -1;
      if (!a.isCopyCandidate && b.isCopyCandidate) return 1;
      return b.efficiency - a.efficiency;
    })
    .slice(0, CONFIG.watchCount);
  
  const copyCandidates = state.watchlist.filter(t => t.isCopyCandidate);
  console.log(`Watching ${state.watchlist.length} traders (${copyCandidates.length} copy candidates)`);
  state.copyCandidates = copyCandidates.map(t => t.wallet);
  saveState(state);
}

async function checkTraderActivity(trader, state) {
  try {
    const activity = await fetchActivity(trader.wallet, { limit: 10 });
    if (!activity || activity.length === 0) return [];
    
    // On first run, use initialization time to skip all historical trades
    const lastSeen = state.lastSeen[trader.wallet] || state.initialized || Date.now();
    const newTrades = [];
    
    for (const trade of activity) {
      // Polymarket returns timestamp in seconds, convert to ms
      const tradeTime = (typeof trade.timestamp === 'number' && trade.timestamp < 10000000000) 
        ? trade.timestamp * 1000 
        : new Date(trade.timestamp).getTime();
      
      if (tradeTime <= lastSeen) continue;
      
      const size = Math.abs(trade.usdcSize || trade.size || 0);
      if (size < CONFIG.minTradeSize) continue;
      
      newTrades.push({
        wallet: trader.wallet,
        userName: trader.userName,
        side: trade.side || (trade.type === 'buy' ? 'BUY' : 'SELL'),
        outcome: trade.outcome || trade.title,
        market: trade.eventTitle || trade.market || trade.slug,
        size,
        price: trade.price,
        timestamp: trade.timestamp
      });
    }
    
    if (activity.length > 0) {
      const latestTime = Math.max(...activity.map(t => {
        const ts = t.timestamp;
        return (typeof ts === 'number' && ts < 10000000000) ? ts * 1000 : new Date(ts).getTime();
      }));
      state.lastSeen[trader.wallet] = latestTime;
    }
    
    return newTrades;
  } catch (err) {
    return [];
  }
}

async function runOnce() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  
  const state = loadState();
  const allActivity = loadActivity();
  
  if (state.watchlist.length === 0 || Math.random() < 0.1) {
    await updateWatchlist(state);
  }
  
  console.log(`[${new Date().toISOString()}] Checking ${state.watchlist.length} traders...`);
  
  let newTradesCount = 0;
  
  const copyCandidates = state.copyCandidates || [];
  
  for (const trader of state.watchlist) {
    const newTrades = await checkTraderActivity(trader, state);
    const isCopyCandidate = copyCandidates.includes(trader.wallet);
    
    for (const trade of newTrades) {
      newTradesCount++;
      trade.isCopyCandidate = isCopyCandidate;
      allActivity.unshift(trade);
      await sendAlert(
        `${trader.userName} made a $${trade.size.toLocaleString()} trade`, 
        trade,
        isCopyCandidate
      );
    }
    await new Promise(r => setTimeout(r, 200));
  }
  
  saveState(state);
  saveActivity(allActivity);
  
  lastCheck = new Date().toISOString();
  tradesFound += newTradesCount;
  
  console.log(`Found ${newTradesCount} new whale trades`);
}

async function runDaemon() {
  isRunning = true;
  console.log('🐋 Whale Watcher daemon started');
  
  while (isRunning) {
    try {
      await runOnce();
    } catch (err) {
      console.error('Error:', err.message);
    }
    await new Promise(r => setTimeout(r, CONFIG.pollInterval));
  }
}

// HTTP server for health checks
const server = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      lastCheck,
      tradesFound,
      uptime: process.uptime()
    }));
  } else if (req.url === '/activity') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadActivity().slice(0, 50)));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Health server on port ${PORT}`);
  runDaemon();
});
