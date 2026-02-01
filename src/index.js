#!/usr/bin/env node
/**
 * Polymarket Trader Screener - Main entry
 * 
 * Usage:
 *   npm run fetch    - Fetch latest trader data
 *   npm run analyze  - Run screener analysis
 *   npm start        - Quick analysis (fetch if needed)
 */

import { existsSync } from 'fs';
import { execSync } from 'child_process';

const DATA_FILE = './data/leaderboard.json';

async function main() {
  // Check if data exists
  if (!existsSync(DATA_FILE)) {
    console.log('No data found. Fetching trader data...\n');
    execSync('node src/fetch-traders.js', { stdio: 'inherit' });
    console.log('\n');
  }
  
  // Run analysis
  execSync('node src/analyze.js', { stdio: 'inherit' });
}

main().catch(console.error);
