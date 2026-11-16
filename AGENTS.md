# Token Launch Radar - Build Brief and Architecture Record

This repository contains the official entry for the make.fun bounty token-radar-01: the premier token launch radar.

## Architecture
The radar employs a rigorous per-category log-log size model (log10 mcap = a + b * log10 TVL) derived from currently tokened protocols in the snapshot. Categories with fewer than four tokened examples fall back to a global regression curve. Valuations include adjustments for 7d TVL momentum (clamped to [-25%, 50%]) and a logarithmic age boost.

The farming cost model estimates net Expected Value (EV) as (8% airdrop cohort / eligible wallets) - farming costs. Costs are calculated using chain-specific gas tables, category-specific transaction cadences, and a time value of $20/hr. Eligible wallet counts are clamped to [5,000, 500,000]. 

Model robustness is verified via 20 deterministic FNV-1a subsamples (using 80% of protocols each). This bootstrap process ensures a median Spearman correlation of 0.83+ and top-20 rank retention exceeding 84%.

The dashboard is a self-contained, offline single-page application. It provides a sortable board featuring a Net EV column, protocol detail views with granular cost breakdowns, a dedicated methodology panel documenting the model/bootstrap assumptions, and an "already launched" view for benchmarking against actual market caps.

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

## Phases
1. Value Model: Implement log-log regression per category, momentum, age boost, and farming EV models.
2. main.ts: Orchestrate parsing, valuation, board generation, and output.
3. Dashboard: Implement single-page SPA (board, details, methodology, launched view) under 64 KB.
4. Screenshots: Render 1280x800 PNGs using headless Chrome.
5. Verify: Ensure deterministic output, dossier integrity, and adherence to all constraints.

## Working style
- Work in this git repo. Commit after each phase with a clear message.
- No network requests inside main.ts.
- Delete AGENT_NOTES.md if it exists.
