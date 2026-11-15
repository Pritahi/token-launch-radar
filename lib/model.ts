function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function getRanks(items: {slug: string, implied: number}[]): number[] {
  const sorted = [...items].sort((a, b) => b.implied - a.implied);
  const ranks = new Map<string, number>();
  
  let i = 0;
  while(i < sorted.length) {
    let j = i;
    while(j < sorted.length && sorted[j]!.implied === sorted[i]!.implied) {
      j++;
    }
    const avgRank = (i + 1 + j) / 2;
    for(let k = i; k < j; k++) {
      ranks.set(sorted[k]!.slug, avgRank);
    }
    i = j;
  }
  return items.map(item => ranks.get(item.slug)!);
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for(let i = 0; i < n; i++) {
    sumX += x[i]; sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i]; sumY2 += y[i] * y[i];
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (den === 0) return 0;
  return num / den;
}

export interface Bootstrap {
  samples: number;
  spearman_median: number;
  spearman_min: number;
  top20_retention_pct: number;
}

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

export interface ModelBreakdown {
  base: number;
  momentum: number;
  age_boost: number;
  curve_a: number;
  curve_b: number;
  curve_own_fit: boolean;
  days_since_listed: number;
}

export interface FarmCost {
  setup_txs: number;
  weekly_txs: number;
  weeks: number;
  gas_per_tx_usd: number;
  gas_usd: number;
  hours: number;
  time_usd: number;
  capital_low_usd: number;
  capital_high_usd: number;
  total_usd: number;
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
  token_status: 'pre-token';
  watchlist: boolean;
  days_since_listed: number;
  implied_value_usd: number;
  est_airdrop_usd: number;
  confidence: 'high' | 'medium' | 'low';
  model: ModelBreakdown;
  farm_steps: string[];
  farm_cost: FarmCost;
  est_farmer_airdrop_usd: number;
  net_ev_usd: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface CategoryCurve {
  category: string;
  count: number;
  a: number;
  b: number;
  own_fit: boolean;
}

export interface Stats {
  q1_implied_usd: number;
  median_implied_usd: number;
  q3_implied_usd: number;
  confidence_counts: { high: number; medium: number; low: number };
  median_net_ev_usd: number;
  positive_ev_count: number;
}

export interface Backtest {
  fit_count: number;
  test_count: number;
  split_date: string;
  median_abs_log10_error: number;
  within_2x_pct: number;
  within_5x_pct: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist_size: number;
  watchlist_covered: number;
  board_size: number;
  pre_token_count: number;
  live_size: number;
  total_implied_usd: number;
  global_curve: CategoryCurve;
  category_curves: Record<string, CategoryCurve>;
  stats: Stats;
  rows: BoardRow[];
  live: LiveRow[];
  backtest: Backtest;
  bootstrap: Bootstrap;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}


export function calculateImpliedValue(p: SnapshotProtocol, curve: CategoryCurve, asOf: string): number {
  const base = 10 ** (curve.a + curve.b * Math.log10(p.tvl_usd));
  const chg7d = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const clampedChg = Math.max(-25, Math.min(50, chg7d));
  const momentum = 1 + 0.5 * (clampedChg / 100);
  const days = daysSinceListed(asOf, p.listed_at);
  const ageBoost = 1 + 0.5 * Math.log(1 + days / 365);
  return Math.max(5_000_000, Math.min(50_000_000_000, Math.round(base * momentum * ageBoost)));
}

export function daysSinceListed(asOf: string, listedAt: string | null): number {
  if (!listedAt) return 0;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function median(arr: number[]): number {
  if (arr.length === 0) return 1;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

function fitCurve(data: {tvl: number, mcap: number}[]): {a: number, b: number} {
  const n = data.length;
  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumXY = 0;
  for (const p of data) {
    const X = Math.log10(p.tvl);
    const Y = Math.log10(p.mcap);
    sumX += X;
    sumY += Y;
    sumX2 += X * X;
    sumXY += X * Y;
  }
  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const a = (sumY - b * sumX) / n;
  return { a: Math.round(a * 1e6) / 1e6, b: Math.round(b * 1e6) / 1e6 };
}

export function computeCurves(protocols: SnapshotProtocol[]): {
  globalCurve: CategoryCurve;
  curveMap: Map<string, CategoryCurve>;
} {
  const calibration = protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd >= 10_000_000,
  ).map(p => ({tvl: p.tvl_usd, mcap: p.mcap_usd!, category: p.category}));

  const globalCurveData = fitCurve(calibration);
  const globalCurve: CategoryCurve = {
    category: 'global',
    count: calibration.length,
    ...globalCurveData,
    own_fit: false
  };

  const catDataMap = new Map<string, {tvl: number, mcap: number}[]>();
  for (const p of calibration) {
    if (p.category) {
      if (!catDataMap.has(p.category)) catDataMap.set(p.category, []);
      catDataMap.get(p.category)!.push({tvl: p.tvl, mcap: p.mcap});
    }
  }

  const allCats = new Set<string>();
  for (const p of protocols) {
    if (p.category) allCats.add(p.category);
  }

  const curveMap = new Map<string, CategoryCurve>();
  for (const cat of allCats) {
    const list = catDataMap.get(cat) ?? [];
    const count = list.length;
    if (count >= 4) {
      const curveData = fitCurve(list);
      curveMap.set(cat, { category: cat, count, ...curveData, own_fit: true });
    } else {
      curveMap.set(cat, { ...globalCurve, category: cat, count, own_fit: false });
    }
  }

  return { globalCurve, curveMap };
}

function getCapitalText(tvl: number): string {
  if (tvl >= 1_000_000_000) return '$1,000 - $25,000';
  if (tvl >= 100_000_000) return '$500 - $5,000';
  return '$250 - $1,000';
}

function getCapitalSmall(tvl: number): string {
  if (tvl >= 1_000_000_000) return '$1,000';
  if (tvl >= 100_000_000) return '$500';
  return '$250';
}

function getCapitalRange(tvl: number): [number, number] {
  if (tvl >= 1_000_000_000) return [1000, 25000];
  if (tvl >= 100_000_000) return [500, 5000];
  return [250, 1000];
}

export function farmCost(p: SnapshotProtocol): FarmCost {
  const chains = p.chains;
  const mainChain = getMainChain(chains).toLowerCase();
  const gasPerTx = {
    ethereum: 4,
    arbitrum: 0.15,
    base: 0.05,
    optimism: 0.15,
    bsc: 0.1,
    polygon: 0.05,
    solana: 0.01,
    avalanche: 0.1,
    ton: 0.05
  }[mainChain] ?? 0.5;

  const catLower = (p.category ?? '').toLowerCase();
  let weekly_txs = 2, weeks = 8;
  if (catLower.includes('cex') || catLower.includes('exchange')) { weekly_txs = 8; weeks = 8; }
  else if (catLower.includes('derivatives')) { weekly_txs = 4; weeks = 8; }
  else if (catLower.includes('dex')) { weekly_txs = 3; weeks = 8; }
  else if (catLower.includes('bridge')) { weekly_txs = 2; weeks = 8; }
  else if (catLower.includes('staking') || catLower.includes('restaking')) { weekly_txs = 1; weeks = 10; }
  else if (catLower.includes('lending') || catLower.includes('cdp') || catLower.includes('risk curator') || catLower.includes('yield')) { weekly_txs = 1; weeks = 8; }
  else if (catLower.includes('prediction')) { weekly_txs = 3; weeks = 8; }
  const setup_txs = 2;

  const gas_usd = Math.round((setup_txs + weekly_txs * weeks) * gasPerTx * 100) / 100;
  const hours = Math.round((0.5 + 0.25 * weeks) * 10) / 10;
  const time_usd = Math.round(hours * 20);
  const [capital_low_usd, capital_high_usd] = getCapitalRange(p.tvl_usd);
  const total_usd = Math.round((gas_usd + time_usd) * 100) / 100;

  return { setup_txs, weekly_txs, weeks, gas_per_tx_usd: gasPerTx, gas_usd, hours, time_usd, capital_low_usd, capital_high_usd, total_usd };
}

function getChainsText(chains: string[]): string {
  if (!chains || chains.length === 0) return 'Ethereum';
  if (chains.length <= 3) return chains.join(', ');
  return `${chains.slice(0, 3).join(', ')} and ${chains.length - 3} other chains`;
}

function getMainChain(chains: string[]): string {
  return chains && chains.length > 0 ? chains[0]! : 'Ethereum';
}

export function farmSteps(p: SnapshotProtocol): string[] {
  const name = p.name;
  const tvl = p.tvl_usd;
  const chainsStr = getChainsText(p.chains);
  const mainChain = getMainChain(p.chains);
  const capText = getCapitalText(tvl);
  const capSmall = getCapitalSmall(tvl);
  const catLower = (p.category ?? '').toLowerCase();

  const steps: string[] = [];

  if (catLower.includes('cex')) {
    steps.push(`Open ${name} on ${chainsStr}, complete KYC, and deposit ${capSmall} USDC into your account; setup takes ~15 minutes.`);
    steps.push(`Generate continuous trading volume across spot/futures pairs. Aim for ${capText} in monthly volume across 6 to 10 active trading weeks.`);
    steps.push(`Maintain an equity balance of ${capText} over 8 consecutive weeks to rank in protocol account tier systems.`);
    steps.push(`Utilize sub-accounts, API trading, and launchpool deposits to increase active account feature depth.`);
    steps.push(`Join ${name}'s official Discord, claim verified member badges, and participate in referral campaigns for bonus points.`);
    steps.push(`Monitor official announcements. Note that ${name} records no token; handle counterparty risk and follow security best practices.`);
  } else if (
    catLower.includes('liquid staking') ||
    catLower.includes('restak') ||
    catLower.includes('staking pool') ||
    catLower.includes('anchor btc')
  ) {
    steps.push(`Open ${name} on ${chainsStr} and stake ${capSmall} of native assets to receive liquid receipt tokens; setup takes ~10 minutes.`);
    steps.push(`Hold liquid staked tokens in your non-custodial wallet over 6 to 12 reward epochs (4 to 12 weeks) to accrue baseline yield and points.`);
    steps.push(`Provide ${capText} of liquid staked token liquidity into partner money markets or liquidity pools on ${mainChain}.`);
    steps.push(`Participate in periodic restaking cap roll-overs every 1 to 2 weeks to keep wallet activity active.`);
    steps.push(`Join ${name}'s Discord community, claim testnet/beta badges, and share referral links for extra score multipliers.`);
    steps.push(`Track accrued reward points and smart-contract slashing risk. Note that ${name} records no token; verify official URLs on official docs.`);
  } else if (
    catLower.includes('risk curator') ||
    catLower.includes('allocator') ||
    catLower.includes('collateral') ||
    catLower.includes('cdp manager')
  ) {
    steps.push(`Open ${name} on ${chainsStr} and deposit ${capSmall} of USDC into its top curated risk vault; setup takes ~15 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Allocate capital across 2 to 3 distinct risk vaults (${capText} total) over 4 to 8 weeks to build deposit history.`);
    steps.push(`Rebalance or reallocate vault shares on a bi-weekly cadence to demonstrate active portfolio management.`);
    steps.push(`Supply vault receipt tokens as collateral on partner money markets where supported to stack rewards.`);
    steps.push(`Participate in curator governance voting proposals and refer active depositors for score multipliers.`);
    steps.push(`Track smart-contract audit coverage and credit risk. Note that ${name} records no token; check official docs before deploying capital.`);
  } else if (catLower.includes('bridge') || catLower.includes('canonical bridge') || catLower.includes('cross chain')) {
    steps.push(`Open ${name} on ${chainsStr} and bridge ${capSmall} of USDC from ${mainChain}; setup takes ~10 minutes plus ~$2 gas.`);
    steps.push(`Execute 1 to 2 cross-chain bridge transactions weekly across supported routes over 6 to 10 weeks.`);
    steps.push(`Accumulate over ${capText} in total cumulative bridge volume across at least 4 destination networks.`);
    steps.push(`Provide ${capSmall} to ${name}'s bridge liquidity pools if available to earn LP fees and bridge points.`);
    steps.push(`Claim community Discord roles, complete testnet bridge tasks, and share referral links for volume bonuses.`);
    steps.push(`Verify message relay status on block explorers. Note that ${name} records no token; manage cross-chain contract risk carefully.`);
  } else if (
    catLower.includes('dex') ||
    catLower.includes('derivative') ||
    catLower.includes('option') ||
    catLower.includes('synthetic')
  ) {
    steps.push(`Open ${name} on ${chainsStr} and execute an initial trade or liquidity deposit of ${capSmall}; setup takes ~10 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Generate active trading volume by executing 2 to 4 swaps or trades weekly over 6 to 12 weeks, aiming for ${capText} cumulative volume.`);
    steps.push(`Provide ${capText} of liquidity to top pools on ${name} for at least 30 days to earn trading fees and LP loyalty points.`);
    steps.push(`Utilize advanced feature orders like limit orders or perps leverage to build comprehensive interaction history.`);
    steps.push(`Claim testnet/beta badges, join the official Discord server, and participate in referral programs for extra boosters.`);
    steps.push(`Monitor slippage, impermanent loss, and liquidation risk. Note that ${name} records no token; verify official contract addresses.`);
  } else if (catLower.includes('yield') || catLower.includes('farm') || catLower.includes('algo-stable')) {
    steps.push(`Open ${name} on ${chainsStr} and deposit ${capSmall} of USDC into an auto-compounding strategy pool; setup takes ~15 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Maintain active strategy deposits over 6 to 10 weeks to maximize compounding efficiency and loyalty multipliers.`);
    steps.push(`Rotate or expand deposits across 2 or more yield vaults (${capText} total) to increase smart contract interaction count.`);
    steps.push(`Claim or harvest yields every 1 to 2 weeks to maintain regular transaction cadence on ${mainChain}.`);
    steps.push(`Complete community quests, collect Discord roles, and engage in governance discussions for point boosts.`);
    steps.push(`Review strategy audit reports and withdrawal fee terms. Note that ${name} records no token; verify official dapp links.`);
  } else if (catLower.includes('rwa') || catLower.includes('stablecoin') || catLower.includes('card')) {
    steps.push(`Open ${name} on ${chainsStr} and mint or deposit ${capSmall} of tokenized real-world assets; setup takes ~20 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Hold tokenized RWA assets in your wallet for 8 to 12 weeks to qualify for protocol yield distributions and snapshot eligibility.`);
    steps.push(`Utilize RWA tokens within partner DeFi lending or liquidity pools (${capText}) to boost capital efficiency.`);
    steps.push(`Execute monthly re-balancing or yield collection transactions over 8 to 12 weeks to maintain active wallet status.`);
    steps.push(`Join official governance forums, obtain verified user roles, and participate in referral campaigns.`);
    steps.push(`Understand legal structures and redemption timelines. Note that ${name} records no token; review official disclosures.`);
  } else if (catLower.includes('lend') || catLower.includes('cdp') || catLower.includes('uncollateralized')) {
    steps.push(`Open ${name} on ${chainsStr} and supply ${capSmall} of USDC into its top lending market; setup takes ~15 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Borrow a conservative ${capSmall} against your collateral (maintaining Health Factor > 2.0) over 6 to 10 weeks.`);
    steps.push(`Repay and re-borrow small amounts on a bi-weekly cadence to generate regular protocol interaction records.`);
    steps.push(`Deposit borrowed assets into partner liquidity pools (${capText}) to stack yield and protocol points.`);
    steps.push(`Participate in governance parameter votes and collect community Discord roles for score multipliers.`);
    steps.push(`Monitor liquidation thresholds and interest rate shifts. Note that ${name} records no token; verify contract security.`);
  } else if (catLower.includes('basis trading')) {
    steps.push(`Open ${name} on ${chainsStr} and execute an initial delta-neutral basis position of ${capSmall}; setup takes ~15 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Hold basis trade positions through funding rate cycles over 4 to 8 weeks to capture yield and accrue protocol points.`);
    steps.push(`Adjust position collateral or leverage parameters every 1 to 2 weeks (${capText} range) to maintain optimal active status.`);
    steps.push(`Reinvest funding yields back into basis strategy vaults to compound yield and points accumulation.`);
    steps.push(`Engage with Discord governance channels, track yield leaderboards, and use referral links for score boosts.`);
    steps.push(`Manage liquidation risk during volatile market swings. Note that ${name} records no token; check official risk docs.`);
  } else if (catLower.includes('chain') || catLower.includes('cedefi')) {
    steps.push(`Open ${name} on ${chainsStr}, bridge ${capSmall} to the network, and execute initial native transactions; setup takes ~15 minutes.`);
    steps.push(`Deploy transactions across at least 5 distinct dapps on ${name} over 6 to 12 weeks to build ecosystem usage depth.`);
    steps.push(`Maintain active wallet activity with 2 to 4 transactions weekly, targeting ${capText} in total ecosystem volume.`);
    steps.push(`Stake native network tokens or provide DEX liquidity (${capSmall}) to support network security.`);
    steps.push(`Participate in testnet campaigns, claim developer/user badges, and join official ecosystem Discord channels.`);
    steps.push(`Store wallet credentials safely. Note that ${name} records no token; inspect gas costs and bridge security models.`);
  } else if (catLower.includes('prediction')) {
    steps.push(`Open ${name} on ${chainsStr} and place an initial position of ${capSmall} on active outcome markets; setup takes ~15 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Place prediction trades across at least 3 distinct market categories over 6 to 10 weeks (${capText} total volume).`);
    steps.push(`Provide liquidity to prediction pools (${capSmall}) to earn resolution fees and market maker points.`);
    steps.push(`Resolve or claim winning market positions on a weekly cadence to build transaction activity metrics.`);
    steps.push(`Participate in market creation proposals, claim community roles, and share referral links for point bonuses.`);
    steps.push(`Understand oracle resolution mechanisms. Note that ${name} records no token; verify market terms on official docs.`);
  } else if (catLower.includes('liquidity manager')) {
    steps.push(`Open ${name} on ${chainsStr} and deposit ${capSmall} into a concentrated liquidity management vault; setup takes ~15 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Keep liquidity deployed in active rebalancing strategies over 6 to 10 weeks to earn fees and manager points.`);
    steps.push(`Rebalance or switch vault strategy ranges every 2 weeks (${capText} total) to generate protocol smart-contract interactions.`);
    steps.push(`Stake vault LP tokens into secondary reward gauges where available to stack yield rewards.`);
    steps.push(`Join Discord for strategy updates, participate in vault parameter voting, and check for loyalty boosters.`);
    steps.push(`Monitor range out-of-bound risks and impermanent loss. Note that ${name} records no token; verify official audit links.`);
  } else if (catLower.includes('indexes')) {
    steps.push(`Open ${name} on ${chainsStr} and mint or purchase ${capSmall} of index basket tokens; setup takes ~10 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Hold index basket tokens in your wallet over 6 to 12 weeks to qualify for streaming fee rebates and points.`);
    steps.push(`Stake index tokens into governance or liquidity pools (${capText}) to amplify reward accumulation.`);
    steps.push(`Execute periodic index re-balancing or mint/redeem actions every 2 to 3 weeks to maintain active account status.`);
    steps.push(`Participate in index inclusion proposals, join Discord, and utilize referral links for bonus points.`);
    steps.push(`Review index asset weightings and underlying liquidity. Note that ${name} records no token; verify contract addresses.`);
  } else if (catLower.includes('privacy')) {
    steps.push(`Open ${name} on ${chainsStr} and execute an initial shielded deposit of ${capSmall}; setup takes ~15 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Perform 1 to 2 private transfers or proof generations weekly over 6 to 10 weeks (${capText} volume).`);
    steps.push(`Maintain a shielded pool balance between ${capSmall} and ${capText} to earn privacy liquidity incentives.`);
    steps.push(`Test private swap or private messaging features to increase protocol feature interaction breadth.`);
    steps.push(`Obtain verified Discord roles, participate in privacy research discussions, and check for testnet streaks.`);
    steps.push(`Ensure compliance with local regulations. Note that ${name} records no token; check official docs for ZK safety instructions.`);
  } else {
    steps.push(`Open ${name} on ${chainsStr} and execute an initial deposit or transaction of ${capSmall}; setup takes ~15 minutes plus ~$2 gas on ${mainChain}.`);
    steps.push(`Maintain active protocol interaction with 1 to 2 qualifying transactions weekly over 6 to 10 weeks.`);
    steps.push(`Allocate ${capText} across core protocol pools or vaults to build a substantial deposit footprint.`);
    steps.push(`Interact with secondary features such as governance voting, staking, or fee claims on a regular cadence.`);
    steps.push(`Join ${name}'s official Discord server, claim community member badges, and share referral links for score multipliers.`);
    steps.push(`Review smart-contract audits and risk disclosures. Note that ${name} records no token; verify official dapp links.`);
  }

  return steps.map((s) => s.trim());
}

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const watchSet = new Set(snapshot.watchlist);
  const { globalCurve, curveMap } = computeCurves(snapshot.protocols);

  // Log curves to stdout at build time per AGENTS.md requirements
  const ownFitLog = [...curveMap.entries()]
    .filter(([_, c]) => c.own_fit)
    .map(([cat, c]) => `${cat} a=${c.a} b=${c.b} (n=${c.count})`)
    .join(', ');
  process.stdout.write(`token radar model: global curve a=${globalCurve.a} b=${globalCurve.b}; own-fit categories: ${ownFitLog}\n`);

  const preToken = snapshot.protocols.filter(isPreToken);

  const scored = preToken.map((p) => {
    const curve = p.category ? curveMap.get(p.category) : undefined;
    const activeCurve = curve ?? globalCurve;

    const implied = calculateImpliedValue(p, activeCurve, snapshot.as_of);
    const base = 10 ** (activeCurve.a + activeCurve.b * Math.log10(p.tvl_usd));
    const chg7d = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
    const clampedChg = Math.max(-25, Math.min(50, chg7d));
    const momentum = 1 + 0.5 * (clampedChg / 100);
    const days = daysSinceListed(snapshot.as_of, p.listed_at);
    const ageBoost = 1 + 0.5 * Math.log(1 + days / 365);
    const estAirdrop = Math.round(implied * 0.08);

    let confidence: 'high' | 'medium' | 'low';
    if (activeCurve.own_fit && p.tvl_usd >= snapshot.floor_usd) {
      confidence = 'high';
    } else if (activeCurve.count >= 2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    const steps = farmSteps(p);
    const cost = farmCost(p);
    const eligible_wallets = Math.max(5000, Math.min(500000, Math.round(p.tvl_usd / 20000)));
    const est_farmer_airdrop_usd = Math.max(1, Math.round(estAirdrop / eligible_wallets));
    const net_ev_usd = est_farmer_airdrop_usd - cost.total_usd;

    const netText = net_ev_usd < 0 ? '-$' + Math.abs(net_ev_usd).toLocaleString() : '$' + net_ev_usd.toLocaleString();
    steps.push(`Budget about $${cost.total_usd.toLocaleString()} all-in (gas ~$${cost.gas_usd.toLocaleString()} on ${getMainChain(p.chains)} plus ~${cost.hours.toFixed(1)} hours of time) against a mid-farmer airdrop share near $${est_farmer_airdrop_usd.toLocaleString()}, an estimated net value of ${netText}; capital of $${cost.capital_low_usd.toLocaleString()}-$${cost.capital_high_usd.toLocaleString()} stays deployed, not spent.`);

    const row: Omit<BoardRow, 'rank'> = {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      watchlist: watchSet.has(p.slug),
      days_since_listed: days,
      implied_value_usd: implied,
      est_airdrop_usd: estAirdrop,
      confidence,
      model: {
        base: Math.round(base),
        momentum: Math.round(momentum * 1000) / 1000,
        age_boost: Math.round(ageBoost * 1000) / 1000,
        curve_a: activeCurve.a,
        curve_b: activeCurve.b,
        curve_own_fit: activeCurve.own_fit,
        days_since_listed: days,
      },
      farm_steps: steps,
      farm_cost: cost,
      est_farmer_airdrop_usd,
      net_ev_usd,
    };
    return row;
  });

  // Sort by implied_value_usd descending, tie-break by slug ascending
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  const medianCost = median(scored.map(r => r.farm_cost.total_usd));
  const medianShare = median(scored.map(r => r.est_farmer_airdrop_usd));
  const netPositive = scored.filter(r => r.net_ev_usd > 0).length;
  process.stdout.write(`token radar costs: median farm cost $${medianCost.toLocaleString()}, median farmer share $${medianShare.toLocaleString()}, ${netPositive} of ${scored.length} plans net-positive\n`);

  return scored.map((r, i) => ({
    rank: i + 1,
    ...r,
  }));
}

export function buildLiveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
    }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = buildLiveRows(snapshot);
  const { globalCurve, curveMap } = computeCurves(snapshot.protocols);

  const preToken = snapshot.protocols.filter(isPreToken);
  const tokenedAll = snapshot.protocols.filter(p => !isPreToken(p) && p.tvl_usd >= 10_000_000 && p.mcap_usd! > 0 && p.listed_at !== null);
  const baseSorted = board.map(r => ({ slug: r.slug, implied: r.implied_value_usd }));
  const baseRanks = getRanks(baseSorted);
  const baseTop20 = new Set(board.slice(0, 20).map(r => r.slug));

  const correlations: number[] = [];
  const retentionRates: number[] = [];

  for (let s = 0; s < 20; s++) {
    const subsample = tokenedAll.filter(p => fnv1a(p.slug + ":" + s) % 5 !== 0);
    const { globalCurve: subGlobal, curveMap: subCurveMap } = computeCurves(subsample);

    const bootRows = preToken.map(p => ({
      slug: p.slug,
      implied: calculateImpliedValue(p, subCurveMap.get(p.category!) ?? subGlobal, snapshot.as_of)
    }));
    bootRows.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

    const bootRanks = getRanks(bootRows);

    const slugToBootRank = new Map(bootRows.map((r, i) => [r.slug, bootRanks[i]]));
    const slugToBaseRank = new Map(baseSorted.map((r, i) => [r.slug, baseRanks[i]]));

    const x: number[] = [];
    const y: number[] = [];
    for(const row of bootRows) {
      x.push(slugToBaseRank.get(row.slug)!);
      y.push(slugToBootRank.get(row.slug)!);
    }
    correlations.push(pearson(x, y));

    const bootTop25 = new Set(bootRows.slice(0, 25).map(r => r.slug));
    let count = 0;
    for (const slug of baseTop20) {
      if (bootTop25.has(slug)) count++;
    }
    retentionRates.push((count / 20) * 100);
  }

  const sortedCorrs = correlations.sort((a, b) => a - b);
  const medianCorr = sortedCorrs[10]!;
  const minCorr = sortedCorrs[0]!;
  const avgRetention = retentionRates.reduce((a, b) => a + b, 0) / 20;

  process.stdout.write(`token radar bootstrap: 20 samples, spearman median ${medianCorr.toFixed(3)} min ${minCorr.toFixed(3)}, top-20 retention ${avgRetention.toFixed(1)}%\n`);

  const bootstrap: Bootstrap = {
    samples: 20,
    spearman_median: Math.round(medianCorr * 1000) / 1000,
    spearman_min: Math.round(minCorr * 1000) / 1000,
    top20_retention_pct: Math.round(avgRetention * 10) / 10
  };

  const tokened = snapshot.protocols.filter(p => !isPreToken(p) && p.tvl_usd >= 10_000_000 && p.mcap_usd! > 0 && p.listed_at !== null)
    .sort((a, b) => a.listed_at!.localeCompare(b.listed_at!));
  const split = Math.floor(tokened.length * 0.6);
  const fit = tokened.slice(0, split);
  const test = tokened.slice(split);

  const { globalCurve: fitGlobal, curveMap: fitCurveMap } = computeCurves(fit);

  const results: number[] = [];
  for (const p of test) {
    const curve = (p.category && fitCurveMap.has(p.category) && fitCurveMap.get(p.category)!.own_fit)
      ? fitCurveMap.get(p.category)!
      : fitGlobal;
      
    const pred = 10 ** (curve.a + curve.b * Math.log10(p.tvl_usd));
    
    const err = Math.log10(pred / p.mcap_usd!);
    results.push(Math.abs(err));
  }

  const medianErr = median(results);
  const within2x = (results.filter(e => e <= Math.log10(2)).length / results.length) * 100;
  const within5x = (results.filter(e => e <= Math.log10(5)).length / results.length) * 100;

  const backtest: Backtest = {
    fit_count: fit.length,
    test_count: test.length,
    split_date: test[0]?.listed_at ?? 'N/A',
    median_abs_log10_error: Math.round(medianErr * 1000) / 1000,
    within_2x_pct: Math.round(within2x * 10) / 10,
    within_5x_pct: Math.round(within5x * 10) / 10
  };

  const categoryCurvesObj: Record<string, CategoryCurve> = {};
  for (const [cat, curve] of curveMap.entries()) {
    categoryCurvesObj[cat] = curve;
  }

  const totalImplied = board.reduce((sum, r) => sum + r.implied_value_usd, 0);

  const vals = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const stats: Stats = {
    q1_implied_usd: vals[Math.floor(vals.length * 0.25)]!,
    median_implied_usd: vals[Math.floor(vals.length * 0.5)]!,
    q3_implied_usd: vals[Math.floor(vals.length * 0.75)]!,
    confidence_counts: { high: 0, medium: 0, low: 0 },
    median_net_ev_usd: median(board.map((r) => r.net_ev_usd)),
    positive_ev_count: board.filter((r) => r.net_ev_usd > 0).length,
  };
  for (const r of board) {
    stats.confidence_counts[r.confidence]++;
  }

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist_size: snapshot.watchlist.length,
    watchlist_covered: board.filter((r) => r.watchlist).length,
    board_size: board.length,
    pre_token_count: board.length,
    live_size: live.length,
    total_implied_usd: totalImplied,
    global_curve: globalCurve,
    category_curves: categoryCurvesObj,
    stats,
    rows: board,
    live,
    backtest,
    bootstrap,
  };

  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json has no valid as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist array of strings');
  }

  const protocols: SnapshotProtocol[] = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`snapshot.json protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json protocol ${i} lacks slug, name or tvl_usd`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });

  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (!Array.isArray(board) || board.length < 100 || board.length > 4000) {
    return `board has ${board?.length ?? 0} rows; must be between 100 and 4000`;
  }

  const slugs = new Set(board.map((r) => r.slug));
  const missingWatchlist = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missingWatchlist.length > 0) {
    return `board misses ${missingWatchlist.length} watchlist slug(s): ${missingWatchlist.slice(0, 5).join(', ')}`;
  }

  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `ranks are not 1..N; rank ${i + 1} is ${ranks[i]}`;
  }

  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} (${board[i]!.slug}: $${board[i]!.implied_value_usd}) exceeds row ${i} ($${board[i - 1]!.implied_value_usd})`;
    }
  }

  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }

  for (const r of board) {
    if (typeof r.slug !== 'string' || r.slug.length < 1 || r.slug.length > 128 || /\s/.test(r.slug)) {
      return `row ${r.rank} has invalid slug '${r.slug}'`;
    }
    if (typeof r.name !== 'string' || r.name.length === 0) {
      return `row ${r.rank} (${r.slug}) has empty name`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `row ${r.rank} (${r.slug}) has invalid implied_value_usd ${r.implied_value_usd}`;
    }
    const steps = r.farm_steps;
    if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) {
      return `row ${r.rank} (${r.slug}) has ${steps?.length ?? 0} farm steps; must be 3..12`;
    }
    for (let sIdx = 0; sIdx < steps.length; sIdx++) {
      const step = steps[sIdx]!;
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `row ${r.rank} (${r.slug}) step ${sIdx + 1} has ${trimmed.length} characters; must be 20..600`;
      }
    }
  }

  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
