// The token radar's model: snapshot parsing, valuation, farm steps, and board building.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  age_days: number | null;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist_size: number;
  board_size: number;
  rows: BoardRow[];
}

// Check if a protocol is pre-token and non-excluded (matches watchlist eligibility)
export function isEligiblePreToken(p: SnapshotProtocol): boolean {
  if (p.gecko_id !== null || p.symbol !== null) return false;
  const cat = p.category;
  if (cat && ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'].includes(cat)) {
    return false;
  }
  const name = p.name.trim();
  // Version marker check: space followed by V2, v2, 2.0 etc.
  if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(name)) {
    return false;
  }
  // Whole word wrapped, staked, staking
  if (/\b(wrapped|staked|staking)\b/i.test(name)) {
    return false;
  }
  // Starts with exchange name
  const exchanges = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
  for (const ex of exchanges) {
    if (name.toLowerCase().startsWith(ex.toLowerCase())) {
      return false;
    }
  }
  return true;
}

export function parseSnapshot(jsonStr: string): Snapshot {
  return JSON.parse(jsonStr) as Snapshot;
}

export function calculateAgeDays(listedAt: string | null, asOfDate: string): number {
  if (!listedAt) return 365;
  const listed = new Date(listedAt).getTime();
  const asOf = new Date(asOfDate).getTime();
  if (isNaN(listed) || isNaN(asOf)) return 365;
  const diffDays = Math.floor((asOf - listed) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

export function computeImpliedValue(p: SnapshotProtocol, ageDays: number): number {
  const baseMultiple = 0.28;
  const base = p.tvl_usd * baseMultiple;
  
  const change7d = p.change_7d !== null ? Math.max(-60, Math.min(120, p.change_7d)) : 0;
  const growthMult = 1 + (change7d / 100) * 0.4;
  
  const maturity = 0.6 + Math.min(ageDays, 1095) / 1095 * 0.4;
  
  // Category weighting
  let catFactor = 1.0;
  if (p.category === 'Dexs' || p.category === 'Lending' || p.category === 'Derivatives') {
    catFactor = 1.15;
  } else if (p.category === 'Yield' || p.category === 'CDP') {
    catFactor = 1.05;
  }

  const raw = base * growthMult * maturity * catFactor;
  const val = Math.max(10000, Math.round(raw));
  return Math.min(100000000000000, val);
}

export function generateFarmSteps(p: SnapshotProtocol): string[] {
  const chain = p.chains && p.chains.length > 0 ? p.chains[0] : 'Ethereum';
  const category = p.category || 'DeFi';
  const name = p.name;

  const steps: string[] = [
    `Bridge native assets or stablecoins to ${chain} via official or decentralized bridges. Ensure you maintain sufficient native gas tokens (approx. $15 to $30 equivalent) for transaction fees.`,
    `Connect your non-custodial Web3 wallet (e.g. MetaMask, Rabby, or Phantom) to the official ${name} application interface on ${chain}.`,
    `Deposit and supply principal assets (such as USDC, ETH, or compatible LSTs) into ${name}'s core ${category.toLowerCase()} liquidity pools to accrue protocol activity points and yield.`,
    `Participate in active borrowing, staking, or governance participation features within ${name} to maximize multi-vector retroactive snapshot eligibility over a 30-day engagement cycle.`,
    `Monitor weekly portfolio TVL adjustments, engage with community governance discussions on Discord/Snapshot, and maintain consistent interaction frequency to secure tier-1 airdrop allocation.`
  ];

  // Ensure each step is 20-600 chars trimmed
  return steps.map(s => s.trim());
}

export function buildBoardRows(snapshot: Snapshot): BoardRow[] {
  const protoMap = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) {
    protoMap.set(p.slug, p);
  }

  // 1. Gather all watchlist slugs
  const watchlistSlugs = new Set(snapshot.watchlist);
  const selectedSlugs = new Set<string>(watchlistSlugs);

  // 2. Add other eligible pre-token protocols sorted by TVL descending until we reach 250 rows
  const targetCount = 250;
  const candidates: SnapshotProtocol[] = [];
  for (const p of snapshot.protocols) {
    if (!selectedSlugs.has(p.slug) && isEligiblePreToken(p)) {
      candidates.push(p);
    }
  }
  candidates.sort((a, b) => b.tvl_usd - a.tvl_usd);

  for (const c of candidates) {
    if (selectedSlugs.size >= targetCount) break;
    selectedSlugs.add(c.slug);
  }

  // Build rows data
  const rowsRaw: Array<{ p: SnapshotProtocol; ageDays: number; implied: number }> = [];
  for (const slug of selectedSlugs) {
    const p = protoMap.get(slug);
    if (!p) continue;
    const ageDays = calculateAgeDays(p.listed_at, snapshot.as_of);
    const implied = computeImpliedValue(p, ageDays);
    rowsRaw.push({ p, ageDays, implied });
  }

  // Sort by implied value descending, with tie-break on TVL descending, then slug ascending
  rowsRaw.sort((a, b) => {
    if (b.implied !== a.implied) return b.implied - a.implied;
    if (b.p.tvl_usd !== a.p.tvl_usd) return b.p.tvl_usd - a.p.tvl_usd;
    return a.p.slug.localeCompare(b.p.slug);
  });

  // Ensure strict strictly non-increasing implied values (adjust ties if any)
  for (let i = 1; i < rowsRaw.length; i++) {
    if (rowsRaw[i]!.implied >= rowsRaw[i - 1]!.implied) {
      rowsRaw[i]!.implied = Math.max(1, rowsRaw[i - 1]!.implied - 1);
    }
  }

  // Assign ranks 1..N
  const boardRows: BoardRow[] = rowsRaw.map((item, idx) => {
    const rank = idx + 1;
    const farmSteps = generateFarmSteps(item.p);
    return {
      rank,
      slug: item.p.slug,
      name: item.p.name,
      category: item.p.category,
      chains: item.p.chains,
      tvl_usd: item.p.tvl_usd,
      change_7d: item.p.change_7d,
      mcap_usd: item.p.mcap_usd,
      listed_at: item.p.listed_at,
      gecko_id: item.p.gecko_id,
      symbol: item.p.symbol,
      age_days: item.ageDays,
      implied_value_usd: item.implied,
      farm_steps: farmSteps
    };
  });

  return boardRows;
}

export function boardIssue(board: { rows: BoardRow[] }, snapshot: Snapshot): string | null {
  if (!board || !Array.isArray(board.rows)) return 'board.rows must be an array';
  const rows = board.rows;
  if (rows.length < 100 || rows.length > 4000) return `board length ${rows.length} out of bounds (100-4000)`;

  const seenSlugs = new Set<string>();
  const watchlistSet = new Set(snapshot.watchlist);

  let prevImplied = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) return `Row at index ${i} has rank ${r.rank}, expected ${i + 1}`;
    if (!r.slug || typeof r.slug !== 'string') return `Invalid slug at index ${i}`;
    if (seenSlugs.has(r.slug)) return `Duplicate slug ${r.slug}`;
    seenSlugs.add(r.slug);

    if (typeof r.implied_value_usd !== 'number' || r.implied_value_usd <= 0) {
      return `Invalid implied_value_usd at row ${r.slug}`;
    }
    if (r.implied_value_usd > prevImplied) {
      return `Implied value rises at row ${r.slug}: ${r.implied_value_usd} > ${prevImplied}`;
    }
    prevImplied = r.implied_value_usd;

    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `Farm steps count invalid at row ${r.slug}: length ${r.farm_steps?.length}`;
    }
    for (const step of r.farm_steps) {
      if (typeof step !== 'string') return `Farm step not a string in ${r.slug}`;
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `Farm step length ${trimmed.length} out of bounds (20-600) in ${r.slug}`;
      }
    }
  }

  // Check watchlist coverage
  for (const w of snapshot.watchlist) {
    if (!seenSlugs.has(w)) {
      return `Watchlist slug ${w} missing from board rows`;
    }
  }

  return null;
}
