// Vercel serverless function - proxies whale activity from GCP Cloud Run

export const config = { runtime: 'edge' };

const GCP_WHALE_WATCHER = 'https://polymarket-whale-watcher-377466082980.us-central1.run.app';

export default async function handler(req) {
  try {
    // Fetch from GCP Cloud Run whale watcher
    const res = await fetch(`${GCP_WHALE_WATCHER}/activity`);
    const activity = await res.json();
    
    // Map isCopyCandidate to isEdgeTrader for frontend compatibility
    const mapped = activity.map(trade => ({
      ...trade,
      isEdgeTrader: trade.isCopyCandidate
    }));
    
    return new Response(JSON.stringify(mapped), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=10, stale-while-revalidate=30'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
