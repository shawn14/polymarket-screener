// Vercel serverless function - fetches live from Polymarket API

export const config = { runtime: 'edge' };

const BASE_URL = 'https://data-api.polymarket.com';

async function fetchLeaderboard(timePeriod, orderBy, limit = 100) {
  const params = new URLSearchParams({
    timePeriod,
    orderBy,
    limit: String(limit),
    offset: '0',
    category: 'overall'
  });
  
  const res = await fetch(`${BASE_URL}/v1/leaderboard?${params}`);
  return res.json();
}

export default async function handler(req) {
  try {
    const periods = ['day', 'week', 'month', 'all'];
    const data = {};
    
    for (const period of periods) {
      const [byPnl, byVolume] = await Promise.all([
        fetchLeaderboard(period, 'PNL', 50),
        fetchLeaderboard(period, 'VOL', 50)
      ]);
      
      data[period] = {
        byPnl,
        byVolume,
        fetchedAt: new Date().toISOString()
      };
    }
    
    return new Response(JSON.stringify(data), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
