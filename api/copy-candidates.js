// Vercel serverless - Find best copy trading candidates
// Filters: 15+ trades, 70%+ win rate, 30%+ efficiency

export const config = { runtime: 'edge' };

const BASE_URL = 'https://data-api.polymarket.com';

async function fetchLeaderboard(timePeriod, limit = 100) {
  const params = new URLSearchParams({
    timePeriod, orderBy: 'PNL', limit: String(limit), offset: '0', category: 'overall'
  });
  const res = await fetch(`${BASE_URL}/v1/leaderboard?${params}`);
  return res.json();
}

async function fetchClosedPositions(wallet) {
  const params = new URLSearchParams({
    user: wallet, sortBy: 'realizedpnl', sortDirection: 'DESC', limit: '100'
  });
  const res = await fetch(`${BASE_URL}/closed-positions?${params}`);
  return res.json();
}

async function fetchPositions(wallet) {
  const params = new URLSearchParams({
    user: wallet, sortBy: 'CURRENT', sortDirection: 'DESC', sizeThreshold: '.1', limit: '30'
  });
  const res = await fetch(`${BASE_URL}/positions?${params}`);
  return res.json();
}

export default async function handler(req) {
  try {
    // Get traders from multiple time periods
    const [allTime, monthly, weekly] = await Promise.all([
      fetchLeaderboard('all', 100),
      fetchLeaderboard('month', 50),
      fetchLeaderboard('week', 50)
    ]);
    
    // Dedupe
    const traderMap = new Map();
    for (const t of [...allTime, ...monthly, ...weekly]) {
      if (!traderMap.has(t.proxyWallet) && (t.pnl || 0) > 0 && (t.vol || 0) > 50000) {
        traderMap.set(t.proxyWallet, t);
      }
    }
    
    const candidates = [];
    const traders = Array.from(traderMap.values()).slice(0, 50);
    
    for (const trader of traders) {
      try {
        const [closed, open] = await Promise.all([
          fetchClosedPositions(trader.proxyWallet),
          fetchPositions(trader.proxyWallet)
        ]);
        
        const wins = closed.filter(p => p.realizedPnl > 0);
        const losses = closed.filter(p => p.realizedPnl < 0);
        const totalTrades = wins.length + losses.length;
        const winRate = totalTrades > 0 ? wins.length / totalTrades : 0;
        const efficiency = trader.pnl / (trader.vol || 1);
        
        const totalWins = wins.reduce((s, p) => s + p.realizedPnl, 0);
        const totalLosses = Math.abs(losses.reduce((s, p) => s + p.realizedPnl, 0));
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 10;
        
        // Filter: 15+ trades, 70%+ win rate, 30%+ efficiency
        if (totalTrades >= 15 && winRate >= 0.70 && efficiency >= 0.30) {
          candidates.push({
            wallet: trader.proxyWallet,
            userName: trader.userName,
            pnl: Math.round(trader.pnl),
            volume: Math.round(trader.vol),
            efficiency: Math.round(efficiency * 1000) / 10,
            winRate: Math.round(winRate * 1000) / 10,
            profitFactor: Math.round(profitFactor * 100) / 100,
            totalTrades,
            wins: wins.length,
            losses: losses.length,
            avgWin: wins.length > 0 ? Math.round(totalWins / wins.length) : 0,
            avgLoss: losses.length > 0 ? Math.round(totalLosses / losses.length) : 0,
            positions: open.map(p => ({
              market: p.title || p.eventSlug,
              outcome: p.outcome,
              size: Math.round(p.currentValue || p.size || 0),
              avgPrice: p.avgPrice,
              currentPrice: p.curPrice,
              pnl: Math.round(p.cashPnl || 0)
            }))
          });
        }
      } catch (err) {}
    }
    
    // Sort by efficiency
    candidates.sort((a, b) => b.efficiency - a.efficiency);
    
    return new Response(JSON.stringify({
      fetchedAt: new Date().toISOString(),
      criteria: { minTrades: 15, minWinRate: 70, minEfficiency: 30 },
      count: candidates.length,
      traders: candidates
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
