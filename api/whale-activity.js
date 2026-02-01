// Vercel serverless function - fetches recent whale activity

export const config = { runtime: 'edge' };

const BASE_URL = 'https://data-api.polymarket.com';

async function fetchActivity(wallet, limit = 10) {
  const params = new URLSearchParams({
    user: wallet,
    limit: String(limit)
  });
  
  const res = await fetch(`${BASE_URL}/activity?${params}`);
  return res.json();
}

export default async function handler(req) {
  try {
    // Get top traders
    const params = new URLSearchParams({
      timePeriod: 'all',
      orderBy: 'PNL',
      limit: '10',
      offset: '0',
      category: 'overall'
    });
    
    const topTraders = await fetch(`${BASE_URL}/v1/leaderboard?${params}`).then(r => r.json());
    
    // Fetch recent activity from each
    const allActivity = [];
    
    for (const trader of topTraders.slice(0, 10)) {
      try {
        const activity = await fetchActivity(trader.proxyWallet, 5);
        
        for (const trade of activity) {
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
            timestamp: trade.timestamp
          });
        }
      } catch (err) {
        // Skip failed fetches
      }
    }
    
    // Sort by timestamp
    allActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
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
