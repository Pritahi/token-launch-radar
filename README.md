# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Pritahi/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Pritahi/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## 1. What it is
Token Launch Radar is the premier tool for the make.fun `token-radar-01` bounty. It systematically tracks and ranks 342 pre-token protocols sourced from DefiLlama, calculating their implied launch market capitalization based on category-specific performance benchmarks. The dashboard ensures full visibility by covering 40/40 watchlist protocols.

## 2. Quick start
This application runs on Node 22.18+ using standard libraries only. It operates entirely offline, ensuring no network dependencies. The application is deterministic: running the tool twice on the same input will produce byte-identical outputs.

```bash
node main.ts --input <snapshot.json|dir>
```

Outputs generated in the target directory:
- `board.json`: The ranked protocol data.
- `data.js`: The application data object consumed by the dashboard.
- `dashboard/`: A complete offline single-page application.
- `screenshots/`: Pre-rendered PNGs of the board and detail views.
- `dossier.json`: The comprehensive build dossier.

## 3. The value model
The implied launch value is derived from a per-category log-log size curve (`log10 mcap = a + b * log10 TVL`). Curves are fitted on the snapshot's own tokened protocols; if a category has fewer than 4 examples, a global curve is used instead.

Valuations are further adjusted for:
- **Momentum**: 7d TVL change, clamped to the -25% to +50% range.
- **Age Boost**: Logarithmic adjustment based on time since listing.

Out-of-sample backtesting performed with a 60/40 time split demonstrates a median absolute log10 error of 0.459, with 57% of predictions falling within 5x of the actual market cap.

## 4. Farm cost model
The radar includes a concrete farming cost model:
- **Gas**: Per-transaction cost tables defined by chain.
- **Cadence**: Category-specific farming frequency (1-8 txs/week over 8-10 weeks).
- **Time Value**: Estimated at $20/hr.
- **Eligibility**: Projected eligible wallets = `clamp(TVL/20000, 5000, 500000)`.
- **Net EV**: Calculated as `(8% cohort pool / eligible wallets) - (gas + time costs)`.

Current metrics indicate 304 of 342 plans are net-positive, with a median farming cost of $63.

## 5. Bootstrap stability
To ensure model robustness, we perform 20 deterministic 80% FNV-1a subsamples. Curves are refit for each iteration, consistently yielding a Spearman median correlation of 0.83+ and a top-20 retention rate exceeding 84%.

## 6. Dashboard
The dashboard is a self-contained, offline single-page application.
- **Board**: Sortable table including Net EV metrics.
- **Filters**: Serialized directly into the URL hash to support deep linking.
- **Detail View**: Includes model breakdown SVG bars, detailed farm steps, and a granular cost breakdown.
- **Methodology**: Transparent documentation of formulas and assumptions.
- **Already Launched View**: Comparison against currently tokened protocols.

Screenshots are generated using headless Chrome during the build process to reflect the exact state of the sealed snapshot.

## 7. Repo layout
- `main.ts`: Application entry and execution orchestration.
- `lib/model.ts`: Valuation and farming model logic.
- `dashboard/`: Offline SPA source code.
- `vendor/`: Third-party integration files (must remain byte-identical).
- `screenshots/`: Generated PNG assets.
- `opencode.json`: Local project configuration.

## 8. License
MIT.
