// Vercel serverless function - fetches detailed trader stats

export const config = { runtime: 'edge' };

const BASE_URL = 'https://data-api.polymarket.com';

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

export default async function handler(req) {
  try {
    // Get top 20 traders
    const params = new URLSearchParams({
      timePeriod: 'all',
      orderBy: 'PNL',
      limit: '20',
      offset: '0',
      category: 'overall'
    });
    
    const topTraders = await fetch(`${BASE_URL}/v1/leaderboard?${params}`).then(r => r.json());
    
    // Fetch detailed stats for each (in batches to avoid rate limits)
    const detailed = [];
    
    for (const trader of topTraders.slice(0, 20)) {
      try {
        const closedPositions = await fetchClosedPositions(trader.proxyWallet);
        
        const wins = closedPositions.filter(p => p.realizedPnl > 0).length;
        const losses = closedPositions.filter(p => p.realizedPnl < 0).length;
        const winRate = wins + losses > 0 ? wins / (wins + losses) : null;
        
        detailed.push({
          ...trader,
          winRate,
          totalTrades: wins + losses,
          wins,
          losses,
          avgWin: wins > 0 ? closedPositions.filter(p => p.realizedPnl > 0).reduce((s, p) => s + p.realizedPnl, 0) / wins : 0,
          avgLoss: losses > 0 ? closedPositions.filter(p => p.realizedPnl < 0).reduce((s, p) => s + p.realizedPnl, 0) / losses : 0
        });
      } catch (err) {
        detailed.push({ ...trader, error: err.message });
      }
    }
    
    return new Response(JSON.stringify(detailed), {
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
