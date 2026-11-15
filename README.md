# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Pritahi/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Pritahi/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)

## Overview
Token Radar is the definitive offline radar for monitoring pre-token protocols. As an entry for the make.fun `token-radar-01` bounty, it provides a comprehensive dashboard to track, rank, and farm upcoming token launches based on real DeFi data.

## Value Model Methodology
The core of Token Radar is its proprietary value model. Instead of hardcoded valuations, we derive the implied launch market cap from the DefiLlama snapshot:
- **Base Valuation**: `TVL_usd * category_multiple`.
- **Multiples**: Derived as the median `mcap/TVL` ratio over all tokened protocols within the same category (having TVL ≥ $10M), clamped between 0.02 and 5.
- **Momentum**: `1 + 0.5 * clamp(change_7d, -25%, 50%) / 100` (range 0.875–1.25).
- **Age Boost**: `1 + 0.5 * ln(1 + days_since_listed / 365)`.
- **Implied Value**: The final figure is clamped to the $5M – $50B range.

Protocols are ranked by this implied value descending. Confidence tiers (High/Medium/Low) indicate how well-calibrated a category multiple is based on the number of available tokened protocols.

## Running the Radar
This application is built with Node 22 using standard libraries. No external network connections are required during runtime.

```bash
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

## Outputs
The tool generates a self-contained environment in the output directory:
- `board.json`: The raw ranked data.
- `data.js`: The application data used by the dashboard.
- `dashboard/`: A complete offline SPA.
- `screenshots/`: 3 pre-rendered PNGs (board, detail, filtered).
- `dossier.json`: A summary build dossier.

## Dashboard Features
- **Board View**: Sortable and filterable table (search, category, chain, watchlist-only, TVL-threshold). Also includes a "Download CSV" feature to export current filter results.
- **Detail View**: Full protocol analysis including model breakdown (base, momentum, age boost), confidence metrics, and a structured farm plan.
- **Methodology**: Detailed breakdown of the category multiples and model assumptions.
- **Already Launched**: Contrast list of tokened protocols and their actual market caps.

## Screenshots
Screenshots (`1-board.png`, `2-detail.png`, `3-filtered.png`) were rendered using headless Chrome (1280x800 resolution) against the generated dashboard to ensure visual fidelity.

To update them:
1. Run the radar to generate the `out/` dashboard.
2. Serve `out/dashboard/` locally.
3. Run `google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars --window-size=1280,800 --screenshot=screenshots/1-board.png "file://$PWD/out/dashboard/index.html#/board"`
4. Verify resulting PNG files are ≤ 512 KiB and meet resolution constraints (1280x800).

## Repo Layout
- `main.ts`: Entry point.
- `lib/`: Value model logic.
- `dashboard/`: Frontend source (JS/HTML/CSS).
- `vendor/`: Third-party integration files (keep byte-identical).

---
<sub>Licensed under the terms of the project.</sub>
