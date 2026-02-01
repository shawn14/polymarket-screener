// Vercel serverless function - generates copy signals from top trader positions

export const config = { runtime: 'edge' };

const BASE_URL = 'https://data-api.polymarket.com';

// Top traders to follow
const FOLLOW_LIST = [
  '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee', // kch123
  '0xd91d2cbbfa4342cf425b5f10f734eb5d4e3cda67', // Theo4
];

async function fetchPositions(wallet) {
  const params = new URLSearchParams({
    user: wallet,
    sortBy: 'CURRENT',
    sortDirection: 'DESC',
    sizeThreshold: '.1',
    limit: '25'
  });
  
  const res = await fetch(`${BASE_URL}/positions?${params}`);
  return res.json();
}

export default async function handler(req) {
  try {
    // Gather positions from followed traders
    const allPositions = [];
    
    for (const wallet of FOLLOW_LIST) {
      try {
        const positions = await fetchPositions(wallet);
        allPositions.push(...positions.map(p => ({
          ...p,
          traderWallet: wallet
        })));
      } catch (err) {
        // Skip failed fetches
      }
    }
    
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
    
    // Generate signals
    const signals = [];
    
    for (const [key, group] of Object.entries(grouped)) {
      const totalSize = group.positions.reduce((s, p) => s + Math.abs(p.currentValue || p.size || 0), 0);
      const avgPrice = group.positions.reduce((s, p) => s + (p.avgPrice || p.curPrice || 0), 0) / group.positions.length;
      const traderCount = new Set(group.positions.map(p => p.traderWallet)).size;
      
      if (totalSize < 5000) continue;
      
      let confidence = traderCount >= 2 ? 0.8 : totalSize > 50000 ? 0.6 : 0.4;
      
      signals.push({
        id: key,
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
          wallet: p.traderWallet,
          size: p.currentValue || p.size
        }))
      });
    }
    
    // Sort by total size
    signals.sort((a, b) => b.totalSize - a.totalSize);
    
    return new Response(JSON.stringify(signals.slice(0, 20)), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=120'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
