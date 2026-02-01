#!/usr/bin/env node
/**
 * Whale Watcher - Monitor top traders for activity
 * Sends alerts when whales make moves
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchActivity, fetchPositions, fetchLeaderboard } from './api.js';

// Load .env file
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
}

const DATA_DIR = './data';
const ACTIVITY_FILE = `${DATA_DIR}/whale-activity.json`;
const STATE_FILE = `${DATA_DIR}/whale-state.json`;

// Config
const CONFIG = {
  // Minimum trade size to alert on (USD)
  minTradeSize: 10000,
  // Number of top traders to watch
  watchCount: 50,
  // Poll interval (ms)
  pollInterval: 60000,
  // Webhook URL for alerts (optional)
  webhookUrl: process.env.WHALE_WEBHOOK_URL || null,
  // Telegram bot token and chat (optional)
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramChat: process.env.TELEGRAM_CHAT_ID || null
};

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { lastSeen: {}, watchlist: [] };
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
  // Keep last 1000 activities
  const trimmed = activity.slice(0, 1000);
  writeFileSync(ACTIVITY_FILE, JSON.stringify(trimmed, null, 2));
}

async function sendAlert(message, trade) {
  console.log(`🐋 ALERT: ${message}`);
  
  // Console output
  if (trade) {
    console.log(`   Trader: ${trade.userName}`);
    console.log(`   Action: ${trade.side} ${trade.outcome}`);
    console.log(`   Size: $${trade.size?.toLocaleString()}`);
    console.log(`   Market: ${trade.market}`);
    console.log(`   Profile: https://polymarket.com/profile/${trade.wallet}`);
  }
  
  // Webhook
  if (CONFIG.webhookUrl) {
    try {
      await fetch(CONFIG.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, trade })
      });
    } catch (err) {
      console.error('Webhook failed:', err.message);
    }
  }
  
  // Telegram - Bloomberg style
  if (CONFIG.telegramToken && CONFIG.telegramChat) {
    try {
      let text;
      if (trade) {
        const side = trade.side?.toUpperCase() || 'TRADE';
        const sideEmoji = side === 'BUY' ? '🟢' : side === 'SELL' ? '🔴' : '⚪';
        const priceStr = trade.price ? ` @ ${(trade.price * 100).toFixed(1)}¢` : '';
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        
        const edgeBadge = trade.isEdgeTrader ? '🎯 EDGE TRADER' : '🐋 WHALE';
        const edgeScoreStr = trade.edgeScore ? ` │ EDGE    ${trade.edgeScore}` : '';
        
        text = `${sideEmoji} <b>${side}</b> <code>$${trade.size?.toLocaleString()}</code>${priceStr}

<b>${trade.outcome}</b>
${trade.market}

<code>┌─────────────────────────
│ ${edgeBadge}
│ TRADER  ${trade.userName}
│ PNL     +$${(trade.traderPnl || 0).toLocaleString()}${edgeScoreStr}
└─────────────────────────</code>

<a href="https://polymarket.com/profile/${trade.wallet}">View Profile →</a>`;
      } else {
        text = `⚡ ${message}`;
      }
      
      await fetch(`https://api.telegram.org/bot${CONFIG.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.telegramChat,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
    } catch (err) {
      console.error('Telegram failed:', err.message);
    }
  }
}

const EDGE_WATCHLIST_FILE = `${DATA_DIR}/edge-watchlist.json`;

async function updateWatchlist(state) {
  console.log('Updating watchlist...');
  
  // Load curated edge traders first
  let edgeTraders = [];
  if (existsSync(EDGE_WATCHLIST_FILE)) {
    try {
      const edgeData = JSON.parse(readFileSync(EDGE_WATCHLIST_FILE, 'utf-8'));
      edgeTraders = edgeData.traders.map(t => ({
        wallet: t.wallet,
        userName: t.userName,
        pnl: t.pnl,
        volume: 0,
        isEdgeTrader: true,
        edgeScore: t.edgeScore
      }));
      console.log(`Loaded ${edgeTraders.length} curated edge traders`);
    } catch (e) {
      console.log('Could not load edge watchlist:', e.message);
    }
  }
  
  // Also add top PnL traders
  const topByPnl = await fetchLeaderboard({ 
    timePeriod: 'all', 
    orderBy: 'PNL', 
    limit: CONFIG.watchCount 
  });
  
  const leaderboardTraders = topByPnl.map(t => ({
    wallet: t.proxyWallet,
    userName: t.userName,
    pnl: t.pnl,
    volume: t.vol,
    isEdgeTrader: false
  }));
  
  // Merge: edge traders first, then leaderboard (deduped)
  const seen = new Set(edgeTraders.map(t => t.wallet));
  const combined = [...edgeTraders];
  for (const t of leaderboardTraders) {
    if (!seen.has(t.wallet)) {
      combined.push(t);
      seen.add(t.wallet);
    }
  }
  
  state.watchlist = combined;
  console.log(`Watching ${state.watchlist.length} traders (${edgeTraders.length} edge + ${combined.length - edgeTraders.length} leaderboard)`);
  saveState(state);
}

async function checkTraderActivity(trader, state) {
  try {
    const activity = await fetchActivity(trader.wallet, { limit: 10 });
    
    if (!activity || activity.length === 0) return [];
    
    const lastSeen = state.lastSeen[trader.wallet] || 0;
    const newTrades = [];
    
    for (const trade of activity) {
      const tradeTime = new Date(trade.timestamp).getTime();
      
      // Skip old trades
      if (tradeTime <= lastSeen) continue;
      
      // Skip small trades
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
        timestamp: trade.timestamp,
        traderPnl: trader.pnl,
        traderVolume: trader.volume,
        isEdgeTrader: trader.isEdgeTrader || false,
        edgeScore: trader.edgeScore || null
      });
    }
    
    // Update last seen
    if (activity.length > 0) {
      const latestTime = Math.max(...activity.map(t => new Date(t.timestamp).getTime()));
      state.lastSeen[trader.wallet] = latestTime;
    }
    
    return newTrades;
    
  } catch (err) {
    console.error(`Error checking ${trader.userName}: ${err.message}`);
    return [];
  }
}

async function runOnce() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const state = loadState();
  const allActivity = loadActivity();
  
  // Update watchlist periodically (every 10 runs or if empty)
  if (state.watchlist.length === 0 || Math.random() < 0.1) {
    await updateWatchlist(state);
  }
  
  console.log(`\n[${new Date().toISOString()}] Checking ${state.watchlist.length} traders...`);
  
  let newTradesCount = 0;
  
  for (const trader of state.watchlist) {
    const newTrades = await checkTraderActivity(trader, state);
    
    for (const trade of newTrades) {
      newTradesCount++;
      allActivity.unshift(trade);
      await sendAlert(`${trader.userName} made a $${trade.size.toLocaleString()} trade`, trade);
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }
  
  saveState(state);
  saveActivity(allActivity);
  
  console.log(`Found ${newTradesCount} new whale trades`);
  return newTradesCount;
}

async function runDaemon() {
  console.log('🐋 Whale Watcher started');
  console.log(`   Watching top ${CONFIG.watchCount} traders`);
  console.log(`   Min trade size: $${CONFIG.minTradeSize.toLocaleString()}`);
  console.log(`   Poll interval: ${CONFIG.pollInterval / 1000}s`);
  
  while (true) {
    try {
      await runOnce();
    } catch (err) {
      console.error('Error in whale watcher:', err.message);
    }
    
    await new Promise(r => setTimeout(r, CONFIG.pollInterval));
  }
}

// CLI
const args = process.argv.slice(2);
if (args.includes('--daemon') || args.includes('-d')) {
  runDaemon();
} else {
  runOnce().then(() => process.exit(0));
}
