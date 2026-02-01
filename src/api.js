/**
 * Polymarket API client
 */

const BASE_URL = 'https://data-api.polymarket.com';

/**
 * Fetch leaderboard data
 * @param {Object} options
 * @param {'day'|'week'|'month'|'all'} options.timePeriod
 * @param {'PNL'|'VOL'} options.orderBy
 * @param {number} options.limit
 * @param {number} options.offset
 * @param {string} options.category
 */
export async function fetchLeaderboard({
  timePeriod = 'all',
  orderBy = 'PNL',
  limit = 100,
  offset = 0,
  category = 'overall'
} = {}) {
  const params = new URLSearchParams({
    timePeriod,
    orderBy,
    limit: String(limit),
    offset: String(offset),
    category
  });
  
  const url = `${BASE_URL}/v1/leaderboard?${params}`;
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`Leaderboard fetch failed: ${res.status}`);
  }
  
  return res.json();
}

/**
 * Fetch all leaderboard pages
 */
export async function fetchAllLeaderboard(options = {}, maxPages = 10) {
  const allTraders = [];
  const limit = options.limit || 100;
  
  for (let page = 0; page < maxPages; page++) {
    const traders = await fetchLeaderboard({
      ...options,
      limit,
      offset: page * limit
    });
    
    if (traders.length === 0) break;
    allTraders.push(...traders);
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  
  return allTraders;
}

/**
 * Fetch user positions
 */
export async function fetchPositions(walletAddress, { limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({
    user: walletAddress,
    sortBy: 'CURRENT',
    sortDirection: 'DESC',
    sizeThreshold: '.1',
    limit: String(limit),
    offset: String(offset)
  });
  
  const url = `${BASE_URL}/positions?${params}`;
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`Positions fetch failed: ${res.status}`);
  }
  
  return res.json();
}

/**
 * Fetch user closed positions (realized PnL)
 */
export async function fetchClosedPositions(walletAddress, { limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({
    user: walletAddress,
    sortBy: 'realizedpnl',
    sortDirection: 'DESC',
    limit: String(limit),
    offset: String(offset)
  });
  
  const url = `${BASE_URL}/closed-positions?${params}`;
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`Closed positions fetch failed: ${res.status}`);
  }
  
  return res.json();
}

/**
 * Fetch user activity/trades
 */
export async function fetchActivity(walletAddress, { limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({
    user: walletAddress,
    limit: String(limit),
    offset: String(offset)
  });
  
  const url = `${BASE_URL}/activity?${params}`;
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`Activity fetch failed: ${res.status}`);
  }
  
  return res.json();
}

/**
 * Fetch user stats
 */
export async function fetchUserStats(walletAddress) {
  const url = `${BASE_URL}/v1/user-stats?proxyAddress=${walletAddress}`;
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`User stats fetch failed: ${res.status}`);
  }
  
  return res.json();
}

/**
 * Fetch user portfolio value
 */
export async function fetchUserValue(walletAddress) {
  const url = `${BASE_URL}/value?user=${walletAddress}`;
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`User value fetch failed: ${res.status}`);
  }
  
  return res.json();
}

/**
 * Fetch user rank
 */
export async function fetchUserRank(walletAddress, rankType = 'pnl') {
  const url = `https://lb-api.polymarket.com/rank?address=${walletAddress}&rankType=${rankType}`;
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`User rank fetch failed: ${res.status}`);
  }
  
  return res.json();
}
