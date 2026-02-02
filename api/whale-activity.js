// Vercel serverless function - fetches recent whale activity with edge detection

export const config = { runtime: 'edge' };

const BASE_URL = 'https://data-api.polymarket.com';

// Edge score threshold - traders above this are marked as edge traders
const EDGE_THRESHOLD = 75;

async function fetchActivity(wallet, limit = 10) {
  const params = new URLSearchParams({
    user: wallet,
    limit: String(limit)
  });
  
  const res = await fetch(`${BASE_URL}/activity?${params}`);
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
  
  return (
    efficiencyScore * 0.30 +
    winRateScore * 0.25 +
    profitFactorScore * 0.20 +
    consistencyScore * 0.15 +
    sizeScore * 0.10
  );
}

export default async function handler(req) {
  try {
    // Get top traders
    const params = new URLSearchParams({
      timePeriod: 'all',
      orderBy: 'PNL',
      limit: '50',
      offset: '0',
      category: 'overall'
    });
    
    const topTraders = await fetch(`${BASE_URL}/v1/leaderboard?${params}`).then(r => r.json());
    
    // Build edge score map for top traders
    const edgeScores = new Map();
    
    for (const trader of topTraders.slice(0, 30)) {
      try {
        const closedPositions = await fetchClosedPositions(trader.proxyWallet);
        const score = calculateEdgeScore(trader, closedPositions);
        edgeScores.set(trader.proxyWallet, Math.round(score * 10) / 10);
      } catch (err) {
        // Skip failed
      }
    }
    
    // Fetch recent activity from each
    const allActivity = [];
    
    for (const trader of topTraders.slice(0, 30)) {
      try {
        const activity = await fetchActivity(trader.proxyWallet, 5);
        
        const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
        const edgeScore = edgeScores.get(trader.proxyWallet) || 0;
        const isEdgeTrader = edgeScore >= EDGE_THRESHOLD;
        
        for (const trade of activity) {
          // Skip old trades (older than 7 days)
          if (trade.timestamp < sevenDaysAgo) continue;
          
          const size = Math.abs(trade.usdcSize || trade.size || 0);
          if (size < 1000) continue; // Skip small trades
          
          allActivity.push({
            wallet: trader.proxyWallet,
            userName: trader.userName,
            side: trade.side || (trade.type === 'buy' ? 'BUY' : 'SELL'),
            outcome: trade.outcome || trade.title,
            market: trade.eventTitle || trade.market || trade.slug,
            size,
            price: trade.price,
            timestamp: trade.timestamp,
            isEdgeTrader,
            edgeScore: isEdgeTrader ? edgeScore : null,
            traderPnl: trader.pnl
          });
        }
      } catch (err) {
        // Skip failed fetches
      }
    }
    
    // Sort by timestamp (timestamps are in seconds)
    allActivity.sort((a, b) => b.timestamp - a.timestamp);
    
    return new Response(JSON.stringify(allActivity.slice(0, 50)), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=30, stale-while-revalidate=60'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
