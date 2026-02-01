#!/usr/bin/env node
/**
 * Copy Trading Signal Generator
 * Watch specific traders and generate actionable signals
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { fetchActivity, fetchPositions, fetchUserStats } from './api.js';

const DATA_DIR = './data';
const SIGNALS_FILE = `${DATA_DIR}/signals.json`;
const FOLLOWING_FILE = `${DATA_DIR}/following.json`;

// Default traders to follow (top performers)
const DEFAULT_FOLLOW = [
  { wallet: '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee', name: 'kch123' },
  { wallet: '0xd91d2cbbfa4342cf425b5f10f734eb5d4e3cda67', name: 'Theo4' },
  { wallet: '0xb8c0c7f24ebc8f67f8e86fb8d8a16e89e2e1f63d', name: 'Fredi9999' }
];

// Config
const CONFIG = {
  // Minimum position size to signal (USD)
  minPositionSize: 5000,
  // Minimum trader win rate to follow
  minWinRate: 0.6,
  // Signal confidence thresholds
  confidenceThresholds: {
    high: 0.8,    // Multiple top traders agree
    medium: 0.6,  // Single top trader, large position
    low: 0.4      // Single trader, smaller position
  },
  // Webhook for signals
  webhookUrl: process.env.SIGNAL_WEBHOOK_URL || null
};

function loadFollowing() {
  if (!existsSync(FOLLOWING_FILE)) {
    return DEFAULT_FOLLOW;
  }
  return JSON.parse(readFileSync(FOLLOWING_FILE, 'utf-8'));
}

function saveFollowing(following) {
  writeFileSync(FOLLOWING_FILE, JSON.stringify(following, null, 2));
}

function loadSignals() {
  if (!existsSync(SIGNALS_FILE)) return [];
  return JSON.parse(readFileSync(SIGNALS_FILE, 'utf-8'));
}

function saveSignals(signals) {
  // Keep last 500 signals
  const trimmed = signals.slice(0, 500);
  writeFileSync(SIGNALS_FILE, JSON.stringify(trimmed, null, 2));
}

async function sendSignal(signal) {
  console.log('\n📊 NEW SIGNAL');
  console.log('─'.repeat(50));
  console.log(`Market: ${signal.market}`);
  console.log(`Position: ${signal.side} ${signal.outcome}`);
  console.log(`Confidence: ${(signal.confidence * 100).toFixed(0)}%`);
  console.log(`Traders: ${signal.traders.map(t => t.name).join(', ')}`);
  console.log(`Total Size: $${signal.totalSize.toLocaleString()}`);
  console.log(`Avg Price: ${(signal.avgPrice * 100).toFixed(1)}¢`);
  console.log('─'.repeat(50));
  
  if (CONFIG.webhookUrl) {
    try {
      await fetch(CONFIG.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signal)
      });
    } catch (err) {
      console.error('Webhook failed:', err.message);
    }
  }
}

async function getTraderPositions(trader) {
  try {
    const positions = await fetchPositions(trader.wallet, { limit: 50 });
    return positions.map(p => ({
      ...p,
      traderName: trader.name,
      traderWallet: trader.wallet
    }));
  } catch (err) {
    console.error(`Error fetching positions for ${trader.name}: ${err.message}`);
    return [];
  }
}

async function generateSignals() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const following = loadFollowing();
  const existingSignals = loadSignals();
  
  console.log(`\n[${new Date().toISOString()}] Generating signals from ${following.length} traders...`);
  
  // Gather all positions
  const allPositions = [];
  for (const trader of following) {
    const positions = await getTraderPositions(trader);
    allPositions.push(...positions);
    await new Promise(r => setTimeout(r, 300)); // Rate limit
  }
  
  console.log(`Found ${allPositions.length} total positions`);
  
  // Group by market/outcome
  const grouped = {};
  for (const pos of allPositions) {
    const key = `${pos.conditionId}-${pos.outcome}`;
    if (!grouped[key]) {
      grouped[key] = {
        conditionId: pos.conditionId,
        market: pos.title || pos.eventSlug,
        outcome: pos.outcome,
        side: pos.size > 0 ? 'LONG' : 'SHORT',
        positions: []
      };
    }
    grouped[key].positions.push(pos);
  }
  
  // Generate signals where multiple traders agree or single trader has large position
  const newSignals = [];
  
  for (const [key, group] of Object.entries(grouped)) {
    const totalSize = group.positions.reduce((s, p) => s + Math.abs(p.currentValue || p.size || 0), 0);
    const avgPrice = group.positions.reduce((s, p) => s + (p.avgPrice || p.curPrice || 0), 0) / group.positions.length;
    const traderCount = new Set(group.positions.map(p => p.traderWallet)).size;
    
    // Skip small positions
    if (totalSize < CONFIG.minPositionSize) continue;
    
    // Calculate confidence
    let confidence = 0;
    if (traderCount >= 3) {
      confidence = CONFIG.confidenceThresholds.high;
    } else if (traderCount >= 2 || totalSize > 50000) {
      confidence = CONFIG.confidenceThresholds.medium;
    } else if (totalSize > 10000) {
      confidence = CONFIG.confidenceThresholds.low;
    }
    
    if (confidence < CONFIG.confidenceThresholds.low) continue;
    
    // Check if we already signaled this
    const existingSignal = existingSignals.find(s => 
      s.conditionId === group.conditionId && 
      s.outcome === group.outcome &&
      Date.now() - new Date(s.timestamp).getTime() < 24 * 60 * 60 * 1000 // Within 24h
    );
    
    if (existingSignal) continue;
    
    const signal = {
      id: `${Date.now()}-${key}`,
      timestamp: new Date().toISOString(),
      conditionId: group.conditionId,
      market: group.market,
      outcome: group.outcome,
      side: group.side,
      confidence,
      totalSize,
      avgPrice,
      traderCount,
      traders: group.positions.map(p => ({
        name: p.traderName,
        wallet: p.traderWallet,
        size: p.currentValue || p.size
      }))
    };
    
    newSignals.push(signal);
    await sendSignal(signal);
  }
  
  // Save signals
  const allSignals = [...newSignals, ...existingSignals];
  saveSignals(allSignals);
  
  console.log(`\nGenerated ${newSignals.length} new signals`);
  return newSignals;
}

// CLI commands
async function addTrader(wallet, name) {
  const following = loadFollowing();
  
  if (following.find(t => t.wallet.toLowerCase() === wallet.toLowerCase())) {
    console.log(`Already following ${name || wallet}`);
    return;
  }
  
  following.push({ wallet, name: name || wallet.slice(0, 10) });
  saveFollowing(following);
  console.log(`Now following ${name || wallet}`);
}

function listFollowing() {
  const following = loadFollowing();
  console.log('\nFollowing:');
  for (const trader of following) {
    console.log(`  - ${trader.name} (${trader.wallet.slice(0, 10)}...)`);
  }
}

function removeTrader(walletOrName) {
  const following = loadFollowing();
  const filtered = following.filter(t => 
    t.wallet.toLowerCase() !== walletOrName.toLowerCase() &&
    t.name.toLowerCase() !== walletOrName.toLowerCase()
  );
  
  if (filtered.length === following.length) {
    console.log('Trader not found');
    return;
  }
  
  saveFollowing(filtered);
  console.log(`Removed ${walletOrName}`);
}

// Main
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'add':
    if (!args[1]) {
      console.log('Usage: node copy-trader.js add <wallet> [name]');
      process.exit(1);
    }
    addTrader(args[1], args[2]);
    break;
    
  case 'remove':
    if (!args[1]) {
      console.log('Usage: node copy-trader.js remove <wallet|name>');
      process.exit(1);
    }
    removeTrader(args[1]);
    break;
    
  case 'list':
    listFollowing();
    break;
    
  case 'signals':
    const signals = loadSignals();
    console.log('\nRecent Signals:');
    for (const s of signals.slice(0, 10)) {
      console.log(`  [${s.confidence * 100}%] ${s.side} ${s.outcome} on ${s.market}`);
    }
    break;
    
  default:
    generateSignals().then(() => process.exit(0));
}
