# Token Launch Radar - build brief

You are building our entry for make.fun bounty token-radar-01: the best token launch radar.
Read this whole file, the kit's RULES.txt (at /tmp/makefun/acct/token-radar-01-kit/RULES.txt), the
existing starter code in this repo, and /tmp/makefun/acct/token-radar-01-kit/input/snapshot.json
before writing code. Keep the gate's shape exactly; make everything else dramatically better.

## What the judge rewards (in priority order)
1. A working radar: covers all 40 watchlist protocols, ranks pre-token protocols by a stated
   implied value, screenshots and code agree.
2. The value model: implied value derived from the snapshot's own figures (TVL, 7d change, age
   tracked with no token, category benchmarks computed FROM the tokened protocols in the same
   snapshot). Never a hardcoded list of names.
3. Farm plans: concrete steps with costs and durations, per protocol.
4. The dashboard: sortable, filterable, readable at a glance, detail view per protocol.
5. It looks made: a chosen palette, consistent spacing, type that reads.

## Hard constraints (the gate)
- main.ts at repo root, Node 22, standard library ONLY, no network, no npm packages.
- Reads /input/snapshot.json (or --input), writes /output/board.json, /output/data.js,
  copies dashboard/ and screenshots/ into /output, writes /output/dossier.json with
  buildDossier from vendor/makefun-board.ts (keep that vendor file byte-identical).
- Runs twice; both runs must write identical bytes. No Date.now(), Math.random(), or
  environment-dependent behavior: derive "today" from snapshot.as_of.
- board.json: object with "rows" array, 100..4000 rows. Each row: slug (must exist in
  snapshot), name, rank (1..N each once), implied_value_usd (positive integer dollars),
  farm_steps (3..12 strings, each 20..600 chars after trim). implied_value_usd must never
  increase as rank rises. Every watchlist slug must appear.
- dashboard/: index.html + at least one .css + one .js. Total dashboard source must stay
  under 64 KB so the dossier shows it whole. NO http:// or https:// anywhere in HTML
  attributes, CSS, or JS import specifiers (visible text may contain URLs).
- screenshots/: exactly 3 PNGs, each <= 512 KiB, long side <= 1440 px, short side >= 800 px.
  Names: 1-board.png, 2-detail.png, 3-filtered.png.
- Local run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /tmp/makefun/acct/token-radar-01-kit/input/snapshot.json

## Phase 1: the value model (lib/model.ts rewrite)
Input: snapshot.protocols (758; fields slug, name, category, chains, tvl_usd, change_7d,
mcap_usd, listed_at, gecko_id, symbol), snapshot.watchlist (40 slugs), snapshot.as_of,
snapshot.floor_usd.

Definitions:
- "pre-token" = gecko_id null AND symbol null. There are 342. ALL of them go on the board
  (342 rows), ranked by implied_value_usd descending. Tokened protocols are excluded from
  rows but their data calibrates the model (and the dashboard may show them in a separate
  "already launched" list for context).
- implied_value_usd = estimated launch market cap if the protocol launched a token with its
  current record. Compute it as:
    base      = tvl_usd * mult(category)
    momentum  = 1 + 0.5 * clamp(change_7d or 0, -25, 50) / 100        (0.875 .. 1.25)
    ageBoost  = 1 + 0.5 * ln(1 + days_since_listed / 365)             (listed_at null -> use 0 days)
    implied   = clamp(round(base * momentum * ageBoost), 5_000_000, 50_000_000_000)
  where mult(category) = median(mcap_usd / tvl_usd) over tokened protocols of the same
  category with tvl_usd >= 10M, clamped to [0.02, 5]; if the category has fewer than 3 such
  protocols or is null, fall back to the median over ALL tokened protocols with tvl_usd >= 10M.
  Compute every number from the snapshot at runtime. Log the medians to stdout at build time
  (they should look like: CEX 0.06, Lending 0.13, Dexs 0.34, Canonical Bridge 1.12).
- Ties: none allowed in a way that makes all values equal; the clamp plus real data prevents
  that, but assert ranks 1..342 are unique and values non-increasing.
- Also compute per protocol, for the dashboard: confidence tier (high when category has >=8
  calibration protocols and tvl >= floor; medium at >=3; low otherwise), the three model
  components (base, momentum, ageBoost), and est_airdrop_usd = 8% of implied (what a farmer
  cohort might split; shown as context, never as the ranking figure).

Farm plans: generate 5..7 steps per protocol from a category playbook, parameterized with the
protocol's own name, chains, TVL and category. Every step 20..600 chars. Rules:
- Step 1 names the protocol, what it does (from category), its chains, and the one concrete
  first action (e.g. "Open <name> on <chain> and supply ~$1,000 of USDC to its top lending
  pool; setup takes ~20 minutes plus ~$2 gas on <chain>.")
- 2-4 core farming actions with explicit capital ranges scaled to the protocol's TVL
  (small TVL -> $250-1,000 positions; mid -> $500-5,000; huge -> $1,000-25,000), weekly
  cadence, and how many weeks airdrop farmers typically need (4-12 weeks).
- 1-2 booster steps (referral program, testnet/beta use, governance/Discord roles, streaks).
- 1 closing step: tracking + risk (smart-contract risk, capital at risk, check official docs).
- Category playbooks for at least: CEX, Liquid Staking, Risk Curators, Bridge,
  Canonical Bridge, Dexs, Derivatives, Onchain Capital Allocator, Yield, Yield Aggregator,
  RWA, Lending, CDP, Basis Trading, Staking Pool, Chain, Prediction Market, Liquidity
  Manager, Indexes, Privacy, plus a generic fallback. Keep each playbook's language specific
  to how that category is actually farmed (volume for perps/DEXs, deposits+epochs for
  staking/restaking/yield, bridge-in-and-use for bridges, trading volume tiers for CEXs).
- Say "records no token" (DefiLlama's record), never "has no token".

Output shapes: keep the starter's exported function signatures (parseSnapshot, buildRadar,
boardIssue, dataScript) so main.ts keeps working; you may change their internals and the
radar object shape as long as main.ts and the gate stay happy. data.js must carry everything
the dashboard needs: board rows with all display fields, per-protocol detail (model breakdown,
farm steps, chains, category, listed date), the "already launched" list (slug, name, category,
tvl, mcap), the as_of date, floor, and the model medians per category.

## Phase 2: main.ts
Keep the starter's structure; upgrade the stdout summary. Keep --input/--output handling,
the exit codes, the copy step and the dossier write exactly as the gate expects.

## Phase 3: the dashboard (dashboard/index.html, app.css, app.js)
A single-page offline app that reads ../data.js. Requirements:
- Header: product name "Token Radar", as_of date, one-line methodology summary, counts
  (protocols ranked, watchlist covered).
- KPI strip: total implied value ranked, # pre-token protocols, # watchlist covered,
  median implied value.
- Board table: rank, name, category, chains, TVL, 7d change, implied value, est. airdrop,
  confidence badge. Sortable by every numeric column (click header toggles asc/desc),
  default rank order. Row click opens the detail view. Sticky header, zebra rows, numeric
  columns right-aligned with tabular numbers.
- Filters: text search (name/slug), category multi-select or dropdown, chain dropdown,
  "watchlist only" toggle, min-TVL slider or presets. A visible "N of 342" result count.
- Detail view (hash route #/protocol/<slug>): header with name/category/chains, implied
  value hero number, the model breakdown rendered as small SVG bars (base x momentum x
  ageBoost), TVL and 7d change, listed date and days tracked, confidence badge, the full
  farm plan as a numbered checklist with cost/time chips, and a "records no token" note.
  Back link to the board.
- Filtered view (hash route #/board?...): the filter state must serialize into the URL hash
  so a screenshot can deep-link a filtered board.
- A methodology section (own hash route or a panel): the exact formula, the category
  multiple table computed from the snapshot (category, n, median multiple), and the
  assumptions (momentum clamp, age boost, 8% airdrop share). This is what proves criterion 2.
- An "already launched" view listing tokened protocols with their actual mcap for contrast.
- Design system: dark radar theme. Palette: deep navy background (#0a1628-ish), panel
  #101f36-ish, accent signal-green (#34f5a2-ish), secondary cyan, warning amber, text
  near-white. One accent font stack (ui-monospace for numbers), 8px spacing scale, 12px
  radius, subtle grid/scanline motif in the header. Consistent, calm, professional: no
  gradients everywhere, no emojis. Total app.css + app.js + index.html under 64 KB.
- No external assets, fonts, or links in attributes. Everything inline and local.

## Phase 4: screenshots (dev-time only, committed as PNGs)
Render with the installed headless Chrome, e.g.:
  google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --window-size=1280,800 --screenshot=screenshots/1-board.png \
    "file://$PWD/out/dashboard/index.html#/board"
Three shots: 1-board.png (the full board), 2-detail.png (#/protocol/<the rank-1 slug>),
3-filtered.png (#/board with an interesting filter, e.g. watchlist-only or one category).
Exactly 1280x800. Each must be <= 512 KiB. The page must render correctly from file:// with
no network. Screenshots must show real data from the sealed snapshot (they are re-checked
against the code by the judge).

## Phase 5: verify
- Run main.ts twice into two dirs; diff -r must show identical bytes.
- node -e checks: board rows 100..4000, ranks 1..N unique, values non-increasing, all 40
  watchlist slugs present, every farm_steps string 20..600 chars, 3..12 steps.
- dashboard total bytes < 64 KB.
- screenshots: 3 PNGs, 1280x800, <= 512 KiB each.
- dossier.json rebuild: recompute buildDossier on out/ and byte-compare.

## Working style
- Work in this git repo. Commit after each phase with a clear message.
- You may run node, jq, python3, google-chrome for verification. No npm installs, no network
  fetches inside main.ts.
- Delete the file AGENT_NOTES.md if it exists; it was a smoke test.
- If a check fails, fix and re-verify before moving on.
