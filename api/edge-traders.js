// Vercel serverless - Calculate edge scores for top traders

export const config = { runtime: 'edge' };

const BASE_URL = 'https://data-api.polymarket.com';

async function fetchLeaderboard(timePeriod, limit = 100) {
  const params = new URLSearchParams({
    timePeriod,
    orderBy: 'PNL',
    limit: String(limit),
    offset: '0',
    category: 'overall'
  });
  const res = await fetch(`${BASE_URL}/v1/leaderboard?${params}`);
  return res.json();
}

async function fetchClosedPositions(wallet) {
  const params = new URLSearchParams({
    user: wallet,
    sortBy: 'realizedpnl',
    sortDirection: 'DESC',
    limit: '50'
  });
  const res = await fetch(`${BASE_URL}/closed-positions?${params}`);
  return res.json();
}

async function fetchPositions(wallet) {
  const params = new URLSearchParams({
    user: wallet,
    sortBy: 'CURRENT',
    sortDirection: 'DESC',
    sizeThreshold: '.1',
    limit: '20'
  });
  const res = await fetch(`${BASE_URL}/positions?${params}`);
  return res.json();
}

function calculateEdgeScore(trader, closedPositions) {
  const pnl = trader.pnl || 0;
  const volume = trader.vol || 1;
  const efficiency = pnl / volume;
  
  const wins = closedPositions.filter(p => p.realizedPnl > 0);
  const losses = closedPositions.filter(p => p.realizedPnl < 0);
  const totalTrades = wins.length + losses.length;
  const winRate = totalTrades > 0 ? wins.length / totalTrades : 0.5;
  
  const totalWins = wins.reduce((s, p) => s + p.realizedPnl, 0);
  const totalLosses = Math.abs(losses.reduce((s, p) => s + p.realizedPnl, 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 10 : 1;
  
  const efficiencyScore = Math.min(efficiency * 200, 100);
  const winRateScore = winRate * 100;
  const profitFactorScore = Math.min(profitFactor * 20, 100);
  const consistencyScore = totalTrades > 20 ? 100 : (totalTrades / 20) * 100;
  const sizeScore = Math.min(Math.log10(volume + 1) * 15, 100);
  
  const edgeScore = (
    efficiencyScore * 0.30 +
    winRateScore * 0.25 +
    profitFactorScore * 0.20 +
    consistencyScore * 0.15 +
    sizeScore * 0.10
  );
  
  return {
    edgeScore: Math.round(edgeScore * 10) / 10,
    efficiency: Math.round(efficiency * 1000) / 10,
    winRate: Math.round(winRate * 1000) / 10,
    profitFactor: Math.round(profitFactor * 100) / 100,
    wins: wins.length,
    losses: losses.length,
    totalTrades
  };
}

export default async function handler(req) {
  try {
    // Get top traders
    const traders = await fetchLeaderboard('all', 50);
    
    // Filter profitable with decent volume
    const candidates = traders.filter(t => (t.pnl || 0) > 0 && (t.vol || 0) > 50000);
    
    // Calculate edge for top 30
    const edgeTraders = [];
    
    for (const trader of candidates.slice(0, 30)) {
      try {
        const [closedPositions, openPositions] = await Promise.all([
          fetchClosedPositions(trader.proxyWallet),
          fetchPositions(trader.proxyWallet)
        ]);
        
        const edge = calculateEdgeScore(trader, closedPositions);
        
        edgeTraders.push({
          wallet: trader.proxyWallet,
          userName: trader.userName,
          pnl: trader.pnl,
          volume: trader.vol,
          ...edge,
          openPositions: openPositions.slice(0, 5).map(p => ({
            market: p.title || p.eventSlug,
            outcome: p.outcome,
            size: Math.round(p.currentValue || p.size || 0),
            price: p.curPrice
          }))
        });
      } catch (err) {
        // Skip failed
      }
    }
    
    // Sort by edge score
    edgeTraders.sort((a, b) => b.edgeScore - a.edgeScore);
    
    return new Response(JSON.stringify({
      fetchedAt: new Date().toISOString(),
      traders: edgeTraders
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
