// Token Launch Radar Model (Phase 1 implementation)
//
// Input: snapshot (protocols, watchlist, as_of, floor_usd)
// Output: ranked board of 342 pre-token protocols, plus full radar data script.
//
// Implied Value Model:
//   base      = tvl_usd * mult(category)
//   momentum  = 1 + 0.5 * clamp(change_7d or 0, -25, 50) / 100      (0.875 .. 1.25)
//   ageBoost  = 1 + 0.5 * ln(1 + days_since_listed / 365)           (listed_at null -> 0 days)
//   implied   = clamp(round(base * momentum * ageBoost), 5_000_000, 50_000_000_000)
//
// Where mult(category) is computed from tokened protocols in the snapshot with tvl_usd >= 10M.

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

export interface Bootstrap { samples: number; spearman_median: number; spearman_min: number; top20_retention_pct: number }

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
  bootstrap: Bootstrap;
  backtest: Backtest;
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

export function calculateImpliedValue(
  p: SnapshotProtocol,
  asOf: string,
  activeCurve: CategoryCurve
): number {
  const base = 10 ** (activeCurve.a + activeCurve.b * Math.log10(p.tvl_usd));
  const chg7d = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const clampedChg = Math.max(-25, Math.min(50, chg7d));
  const momentum = 1 + 0.5 * (clampedChg / 100);
  const days = daysSinceListed(asOf, p.listed_at);
  const ageBoost = 1 + 0.5 * Math.log(1 + days / 365);
  const rawImplied = base * momentum * ageBoost;
  return Math.max(5_000_000, Math.min(50_000_000_000, Math.round(rawImplied)));
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

function getChainsText(chains: string[]): string {
  if (!chains || chains.length === 0) return 'Ethereum';
  if (chains.length <= 3) return chains.join(', ');
  return `${chains.slice(0, 3).join(', ')} and ${chains.length - 3} other chains`;
}

function getMainChain(chains: string[]): string {
  return chains && chains.length > 0 ? chains[0]! : 'Ethereum';
}

function getCapitalBands(tvl: number): {low: number, high: number} {
  if (tvl >= 1_000_000_000) return {low: 1000, high: 25000};
  if (tvl >= 100_000_000) return {low: 500, high: 5000};
  return {low: 250, high: 1000};
}

export function farmCost(p: SnapshotProtocol): FarmCost {
  const catLower = (p.category ?? '').toLowerCase();
  const mainChain = getMainChain(p.chains).toLowerCase();
  
  const gasMap: Record<string, number> = {
    ethereum: 4, arbitrum: 0.15, base: 0.05, optimism: 0.15, bsc: 0.1, polygon: 0.05, solana: 0.01, avalanche: 0.1, ton: 0.05
  };
  const gas_per_tx_usd = gasMap[mainChain] ?? 0.5;
  
  let weekly_txs = 2;
  let weeks = 8;
  
  if (catLower.includes('cex') || catLower.includes('exchange')) { weekly_txs = 8; weeks = 8; }
  else if (catLower.includes('derivatives')) { weekly_txs = 4; weeks = 8; }
  else if (catLower.includes('dex')) { weekly_txs = 3; weeks = 8; }
  else if (catLower.includes('bridge')) { weekly_txs = 2; weeks = 8; }
  else if (catLower.includes('staking') || catLower.includes('restaking')) { weekly_txs = 1; weeks = 10; }
  else if (catLower.includes('lending') || catLower.includes('cdp') || catLower.includes('risk curator') || catLower.includes('yield')) { weekly_txs = 1; weeks = 8; }
  else if (catLower.includes('prediction')) { weekly_txs = 3; weeks = 8; }

  const setup_txs = 2;
  const gas_usd = Math.round((setup_txs + weekly_txs * weeks) * gas_per_tx_usd * 100) / 100;
  const hours = Math.round((0.5 + 0.25 * weeks) * 10) / 10;
  const time_usd = Math.round(hours * 20);
  
  const {low, high} = getCapitalBands(p.tvl_usd);
  
  return {
    setup_txs,
    weekly_txs,
    weeks,
    gas_per_tx_usd,
    gas_usd,
    hours,
    time_usd,
    capital_low_usd: low,
    capital_high_usd: high,
    total_usd: Math.round((gas_usd + time_usd) * 100) / 100
  };
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
    steps.push(`Create an account on ${name} and complete KYC verification; deposit ${capSmall} in assets to fund your trading account; setup takes approximately 20 minutes.`);
    steps.push(`Generate trading volume on ${chainsStr} by executing spot or derivatives trades weekly; target ${capText} in monthly volume to demonstrate active usage.`);
    steps.push(`Maintain a minimum daily account balance of ${capSmall} throughout an 8-week period to qualify for potential loyalty tier rewards.`);
    steps.push(`Utilize platform features like staking, earn programs, or API trading to expand your account footprint over the active farming period.`);
    steps.push(`Engage with ${name} on official channels, complete requested community verification tasks, and leverage referral programs for additional point multipliers.`);
    steps.push(`Track your activity against official protocol updates. Note that ${name} records no token; prioritize account security and understand exchange counterparty risks.`);
  } else if (
    catLower.includes('liquid staking') ||
    catLower.includes('restak') ||
    catLower.includes('staking pool') ||
    catLower.includes('anchor btc')
  ) {
    steps.push(`Stake ${capSmall} of ${mainChain} native assets into ${name} to receive liquid staking tokens; setup takes 15 minutes on ${mainChain}.`);
    steps.push(`Hold the received liquid staked tokens in your non-custodial wallet for 8 to 12 weeks to accrue baseline rewards and protocol points.`);
    steps.push(`Deploy ${capSmall} of your liquid staked tokens into partner lending or DEX protocols on ${chainsStr} to multiply your farming yield.`);
    steps.push(`Periodically restake or rebalance your position every 2 weeks to ensure your wallet remains flagged as an active participant.`);
    steps.push(`Participate in ${name}'s governance forums, join the official Discord, and secure any available early-adopter or beta-user roles.`);
    steps.push(`Monitor smart contract risks and slashing conditions. Note that ${name} records no token; rely only on official documentation for security.`);
  } else if (
    catLower.includes('risk curator') ||
    catLower.includes('allocator') ||
    catLower.includes('collateral') ||
    catLower.includes('cdp manager')
  ) {
    steps.push(`Supply ${capSmall} of stablecoins or collateral assets to ${name} vaults on ${mainChain}; setup takes 15 minutes plus network gas.`);
    steps.push(`Allocate capital across at least 2 distinct risk-curated vaults (${capText} total) over 8 weeks to build deposit history.`);
    steps.push(`Rebalance your vault allocations on a bi-weekly basis, demonstrating active management and interaction with the protocol's risk framework.`);
    steps.push(`If available, use vault receipt tokens as collateral in partner DeFi applications to further leverage your participation.`);
    steps.push(`Actively participate in the protocol's governance voting and Discord discussions to increase your eligibility for potential future rewards.`);
    steps.push(`Review audit reports and monitor collateral ratios closely. Note that ${name} records no token; always verify official contract addresses.`);
  } else if (catLower.includes('bridge') || catLower.includes('canonical bridge') || catLower.includes('cross chain')) {
    steps.push(`Connect your wallet to ${name} on ${mainChain} and bridge ${capSmall} of assets to a supported destination chain; setup takes 10 minutes.`);
    steps.push(`Execute at least 2 cross-chain bridge transactions per week across diverse routes for 8 weeks, targeting ${capText} in total cumulative volume.`);
    steps.push(`Deposit ${capSmall} of idle assets into ${name}'s liquidity pools to earn fees and accumulate additional protocol interaction points.`);
    steps.push(`Maintain a frequent bridge cadence to avoid being flagged as a one-time user during potential snapshot evaluations.`);
    steps.push(`Join ${name}'s official community, complete bridge quest campaigns, and utilize referral codes to increase your account's visibility.`);
    steps.push(`Verify transaction success on block explorers and monitor bridge security. Note that ${name} records no token; manage cross-chain risks wisely.`);
  } else if (
    catLower.includes('dex') ||
    catLower.includes('derivative') ||
    catLower.includes('option') ||
    catLower.includes('synthetic')
  ) {
    steps.push(`Deposit ${capSmall} of assets into ${name} on ${chainsStr} and execute your first trade or liquidity provision; setup takes 15 minutes.`);
    steps.push(`Generate ${capText} in trading volume by executing multiple swaps or leveraged trades weekly over 8 to 12 weeks of active use.`);
    steps.push(`Provide ${capSmall} of liquidity to the protocol's top pools to earn fees and secure long-term participation status.`);
    steps.push(`Experiment with advanced trading features, such as limit orders or perps, to maximize protocol interaction breadth.`);
    steps.push(`Participate in trading competitions, join the official Discord server, and claim any available early-access or community badges.`);
    steps.push(`Monitor liquidation risks and impermanent loss. Note that ${name} records no token; verify official URLs before trading.`);
  } else if (catLower.includes('yield') || catLower.includes('farm') || catLower.includes('algo-stable')) {
    steps.push(`Deposit ${capSmall} of assets into an auto-compounding vault on ${name} on ${chainsStr}; setup takes 15 minutes plus gas fees.`);
    steps.push(`Maintain your active deposits over 8 to 12 weeks to compound yields and maximize eligibility for potential loyalty rewards.`);
    steps.push(`Diversify your deposits across 2 or more yield strategies (${capText} total) to build a robust interaction profile with the protocol.`);
    steps.push(`Harvest rewards periodically to maintain regular transaction activity, ensuring you aren't perceived as inactive.`);
    steps.push(`Join the community quests, engage in governance votes, and collect any available Discord roles to boost your participation profile.`);
    steps.push(`Review strategy audits and withdrawal fee structures. Note that ${name} records no token; always use official dapp interfaces.`);
  } else if (catLower.includes('rwa') || catLower.includes('stablecoin') || catLower.includes('card')) {
    steps.push(`Mint or purchase ${capSmall} of tokenized assets on ${name} on ${chainsStr}; setup takes 20 minutes including KYC if required.`);
    steps.push(`Hold the tokenized assets in your wallet for 8 to 12 weeks to demonstrate commitment to the protocol's core utility.`);
    steps.push(`Utilize your tokenized assets in partner DeFi lending or collateral markets (${capText}) to increase protocol utility usage.`);
    steps.push(`Perform monthly rebalancing or yield claiming actions to maintain an active, long-term interaction record.`);
    steps.push(`Participate in protocol community calls, join the Discord, and verify your account status for loyalty programs.`);
    steps.push(`Understand the legal backing and redemption process. Note that ${name} records no token; review official disclosures thoroughly.`);
  } else if (catLower.includes('lend') || catLower.includes('cdp') || catLower.includes('uncollateralized')) {
    steps.push(`Supply ${capSmall} of assets into ${name} on ${chainsStr} to activate your lending account; setup takes 15 minutes on ${mainChain}.`);
    steps.push(`Borrow a conservative amount (e.g., 30% LTV) against your collateral over 8 weeks, monitoring your health factor regularly.`);
    steps.push(`Repay and re-borrow small amounts bi-weekly to maintain a consistent transaction cadence and demonstrate active management.`);
    steps.push(`Deposit borrowed funds into partner liquidity protocols (${capText}) to multiply your exposure and participation metrics.`);
    steps.push(`Vote in protocol governance proposals and contribute to discussions on the Discord to strengthen your user profile.`);
    steps.push(`Monitor health factors closely to avoid liquidation. Note that ${name} records no token; ensure all contracts are legitimate.`);
  } else if (catLower.includes('basis trading')) {
    steps.push(`Execute an initial delta-neutral basis position of ${capSmall} on ${name} on ${chainsStr}; setup takes 15 minutes plus gas.`);
    steps.push(`Maintain your basis positions through funding rate cycles over 8 weeks to capture sustainable yield and earn protocol points.`);
    steps.push(`Adjust position collateral or leverage settings (${capText} range) every 2 weeks to demonstrate active protocol management.`);
    steps.push(`Reinvest earned funding yields back into the strategy to accelerate point accumulation and compounding.`);
    steps.push(`Engage in governance voting and join Discord channels to track yield leaderboards and verify participation status.`);
    steps.push(`Actively manage liquidation risks during volatile market periods. Note that ${name} records no token; check official risk documentation.`);
  } else if (catLower.includes('chain') || catLower.includes('cedefi')) {
    steps.push(`Bridge ${capSmall} of assets to ${name} on ${chainsStr} and perform your first native transaction; setup takes 15 minutes.`);
    steps.push(`Deploy transactions across at least 5 different dapps on the ecosystem over 8 to 12 weeks to build a comprehensive usage history.`);
    steps.push(`Maintain a frequent wallet activity level of 2 transactions weekly, aiming for ${capText} in total ecosystem volume.`);
    steps.push(`Stake native network tokens or provide liquidity (${capSmall}) on native DEXs to directly support the network's infrastructure.`);
    steps.push(`Participate in ecosystem testnet campaigns, claim verified developer or user badges, and join official Discord channels.`);
    steps.push(`Safeguard your wallet credentials. Note that ${name} records no token; always audit the gas costs and bridge mechanisms used.`);
  } else if (catLower.includes('prediction')) {
    steps.push(`Place an initial prediction market position of ${capSmall} on ${name} on ${chainsStr}; setup takes 15 minutes plus gas fees.`);
    steps.push(`Execute trades across at least 3 distinct prediction market categories over 8 to 10 weeks, aiming for ${capText} total volume.`);
    steps.push(`Supply ${capSmall} of liquidity to prediction pools to earn resolution fees and boost your market participant score.`);
    steps.push(`Resolve or claim positions on a weekly cadence to ensure a regular and verifiable transaction activity record.`);
    steps.push(`Propose new markets, claim community roles on Discord, and utilize referral links to increase participation visibility.`);
    steps.push(`Understand the protocol's oracle resolution mechanism. Note that ${name} records no token; verify market terms on official docs.`);
  } else if (catLower.includes('liquidity manager')) {
    steps.push(`Deposit ${capSmall} into a concentrated liquidity vault on ${name} on ${chainsStr}; setup takes 15 minutes plus network gas.`);
    steps.push(`Keep your liquidity active in optimized strategies over 8 to 12 weeks to earn trading fees and protocol loyalty points.`);
    steps.push(`Rebalance or swap vault strategies every 2 weeks (${capText} total volume) to generate smart contract interaction records.`);
    steps.push(`Stake your vault LP tokens into available reward gauges to amplify your yield and interaction profile.`);
    steps.push(`Engage with the community on Discord, vote on strategy parameters, and participate in loyalty booster campaigns.`);
    steps.push(`Monitor rebalancing efficiency and impermanent loss. Note that ${name} records no token; always verify the official audit links.`);
  } else if (catLower.includes('indexes')) {
    steps.push(`Purchase or mint ${capSmall} of index basket tokens on ${name} on ${chainsStr}; setup takes 10 minutes plus gas.`);
    steps.push(`Hold index tokens in your non-custodial wallet for 8 to 12 weeks to qualify for protocol-level rewards and points.`);
    steps.push(`Stake index tokens into governance or liquidity modules (${capText}) to earn additional yield and protocol rewards.`);
    steps.push(`Execute periodic re-balancing or mint-redeem actions every 3 weeks to demonstrate active account management.`);
    steps.push(`Join the community governance forums, engage on Discord, and use referral links to enhance your points accumulation.`);
    steps.push(`Review underlying asset weightings and index composition regularly. Note that ${name} records no token; verify all contract addresses.`);
  } else if (catLower.includes('privacy')) {
    steps.push(`Execute an initial shielded deposit of ${capSmall} into ${name} on ${chainsStr}; setup takes 15 minutes plus gas.`);
    steps.push(`Perform at least 2 private transfers or proof generations weekly over 8 to 10 weeks, aiming for ${capText} volume.`);
    steps.push(`Maintain a shielded balance between ${capSmall} and ${capText} to qualify for ongoing privacy liquidity incentives.`);
    steps.push(`Interact with private swap or messaging features to ensure a diverse and robust protocol interaction history.`);
    steps.push(`Claim verified Discord roles, participate in privacy research discussions, and maintain streaks for testnet activity.`);
    steps.push(`Follow local compliance guidelines. Note that ${name} records no token; always check official documentation for ZK safety instructions.`);
  } else {
    steps.push(`Execute an initial deposit or transaction of ${capSmall} on ${name} on ${chainsStr}; setup takes 15 minutes plus gas fees.`);
    steps.push(`Maintain active protocol usage by conducting at least 2 qualifying transactions weekly over 8 to 10 weeks.`);
    steps.push(`Allocate ${capText} across core protocol pools or vaults to build a substantial and verifiable deposit footprint.`);
    steps.push(`Interact with secondary protocol features like governance, staking, or fee claiming on a regular weekly cadence.`);
    steps.push(`Join ${name}'s official community Discord, claim member badges, and leverage referral programs for point multipliers.`);
    steps.push(`Review protocol audits and risk disclosures regularly. Note that ${name} records no token; always use official dapp interfaces.`);
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

    const base = 10 ** (activeCurve.a + activeCurve.b * Math.log10(p.tvl_usd));
    const chg7d = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
    const clampedChg = Math.max(-25, Math.min(50, chg7d));
    const momentum = 1 + 0.5 * (clampedChg / 100);
    const days = daysSinceListed(snapshot.as_of, p.listed_at);
    const ageBoost = 1 + 0.5 * Math.log(1 + days / 365);
    const implied = calculateImpliedValue(p, snapshot.as_of, activeCurve);
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

    const L = cost.capital_low_usd.toLocaleString('en-US');
    const U = cost.capital_high_usd.toLocaleString('en-US');
    const X = cost.total_usd.toLocaleString('en-US');
    const G = cost.gas_usd.toLocaleString('en-US');
    const chain = getMainChain(p.chains);
    const Y = est_farmer_airdrop_usd.toLocaleString('en-US');
    const Z = net_ev_usd.toLocaleString('en-US');

    steps.push(`Budget about $${X} all-in (gas ~$${G} on ${chain} plus ~${cost.hours} hours of time) against a mid-farmer airdrop share near $${Y}, an estimated net value of $${Z}; capital of $${L}-$${U} stays deployed, not spent.`);

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

  const rows = scored.map((r, i) => ({
    rank: i + 1,
    ...r,
  }));
  
  const farmCosts = rows.map((r) => r.farm_cost.total_usd).sort((a, b) => a - b);
  const farmerShares = rows.map((r) => r.est_farmer_airdrop_usd).sort((a, b) => a - b);
  const positive_ev_count = rows.filter(r => r.net_ev_usd > 0).length;

  process.stdout.write(`token radar costs: median farm cost $${Math.round(farmCosts[Math.floor(farmCosts.length * 0.5)]!).toLocaleString('en-US')}, median farmer share $${Math.round(farmerShares[Math.floor(farmerShares.length * 0.5)]!).toLocaleString('en-US')}, ${positive_ev_count} of ${rows.length} plans net-positive\n`);

  return rows;
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

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function getRanks(values: number[]): number[] {
  const n = values.length;
  const indexed = values.map((val, idx) => ({ val, idx }));
  // Sort descending: larger value -> smaller rank (1 is top)
  indexed.sort((a, b) => b.val - a.val);

  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && indexed[j + 1]!.val === indexed[i]!.val) {
      j++;
    }
    const avgRank = i + 1 + (j - i) / 2;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k]!.idx] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = buildLiveRows(snapshot);
  const { globalCurve, curveMap } = computeCurves(snapshot.protocols);

  // Bootstrap Method:
  // 1. 20 samples (0..19). For each, build a deterministic 80% subsample of TOKENED protocols.
  // 2. Refit curves (computeCurves).
  // 3. Recompute implied values for all pre-token protocols.
  // 4. Rank pre-token protocols (tie-safe) and compute Spearman's correlation with base ranks.
  // 5. Track top-20 retention.
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

  const tokenedForBootstrap = snapshot.protocols.filter(p => !isPreToken(p) && p.tvl_usd >= 10_000_000 && p.mcap_usd! > 0 && p.listed_at !== null);
  const preTokenProts = snapshot.protocols.filter(isPreToken);
  const baseTop20Slugs = new Set(board.slice(0, 20).map(r => r.slug));
  const slugToBaseRank = new Map(board.map((r, i) => [r.slug, i + 1]));

  const spearmanResults: number[] = [];
  const retentionResults: number[] = [];

  for (let s = 0; s < 20; s++) {
    const subsample = tokened.filter(p => fnv1a(p.slug + ":" + s) % 5 !== 0);
    const { globalCurve: fitGlobal, curveMap: fitCurveMap } = computeCurves(subsample);
    
    // Bootstrap implied values for preTokenProts
    const bootstrapRows = preTokenProts.map(p => {
      const curve = (p.category && fitCurveMap.has(p.category) && fitCurveMap.get(p.category)!.own_fit)
        ? fitCurveMap.get(p.category)!
        : fitGlobal;
      return { slug: p.slug, implied: calculateImpliedValue(p, snapshot.as_of, curve) };
    });

    // Sort to match board tie-break
    bootstrapRows.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    
    // Assign ranks (tie-safe)
    const bootRanks = getRanks(bootstrapRows.map(r => r.implied));
    
    // Map slug to bootRank
    const slugToBootRank = new Map(bootstrapRows.map((r, i) => [r.slug, bootRanks[i]!]));

    // Spearman Correlation
    const baseRanksList = board.map(r => slugToBaseRank.get(r.slug)!);
    const bootRanksList = board.map(r => slugToBootRank.get(r.slug)!);
    spearmanResults.push(pearson(baseRanksList, bootRanksList));

    // Top 20 retention
    let retained = 0;
    for (const slug of baseTop20Slugs) {
      if (slugToBootRank.get(slug)! <= 25) retained++;
    }
    retentionResults.push(retained);
  }

  const sortedSpearman = spearmanResults.sort((a, b) => a - b);
  const spearmanMedian = sortedSpearman[Math.floor(sortedSpearman.length * 0.5)]!;
  const spearmanMin = sortedSpearman[0]!;
  const top20RetentionPct = retentionResults.reduce((sum, r) => sum + r, 0) / 20 / 20 * 100;
  
  process.stdout.write(`token radar bootstrap: 20 samples, spearman median ${spearmanMedian.toFixed(3)} min ${spearmanMin.toFixed(3)}, top-20 retention ${top20RetentionPct.toFixed(1)}%\n`);

  const bootstrap: Bootstrap = {
    samples: 20,
    spearman_median: Math.round(spearmanMedian * 1000) / 1000,
    spearman_min: Math.round(spearmanMin * 1000) / 1000,
    top20_retention_pct: Math.round(top20RetentionPct * 10) / 10,
  };
  
  // Backtest ...

  const categoryCurvesObj: Record<string, CategoryCurve> = {};
  for (const [cat, curve] of curveMap.entries()) {
    categoryCurvesObj[cat] = curve;
  }

  const totalImplied = board.reduce((sum, r) => sum + r.implied_value_usd, 0);

  const vals = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const netEvs = board.map((r) => r.net_ev_usd).sort((a, b) => a - b);

  const stats: Stats = {
    q1_implied_usd: vals[Math.floor(vals.length * 0.25)]!,
    median_implied_usd: vals[Math.floor(vals.length * 0.5)]!,
    q3_implied_usd: vals[Math.floor(vals.length * 0.75)]!,
    confidence_counts: { high: 0, medium: 0, low: 0 },
    median_net_ev_usd: netEvs[Math.floor(netEvs.length * 0.5)]!,
    positive_ev_count: board.filter(r => r.net_ev_usd > 0).length,
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
    bootstrap,
    backtest,
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
