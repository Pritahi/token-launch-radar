// Token Radar: entrypoint pipeline
// 1. Snapshot Validation: Loads /input/snapshot.json
// 2. Value Model: Computes implied value and farm plans via lib/model.ts
// 3. Dashboard Bootstrap: Assembles /output/ with dashboard/ and screenshots/
// 4. Dossier Generation: Builds audit-ready dossier.json via vendor/makefun-board.ts

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

// Configuration & Caps
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

// Utilities
const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
};

const copyFiles = (from: string, to: string): string[] => {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  return readdirSync(from).filter(name => !name.startsWith('.') && statSync(join(from, name)).isFile()).map(name => {
    copyFileSync(join(from, name), join(to, name));
    return name;
  });
};

// 1. Initialization
const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// 2. Value Model & Radar Build
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// 3. Output Assembly
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));

if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image(s): hand in 3 (1-board.png, 2-detail.png, 3-filtered.png)\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: invalid filename\n`);
    process.exit(1);
  }
}

// 4. Dossier Generation
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
}));

// Stdout Summary
const totalImpliedB = (radar.total_implied_usd / 1e9).toFixed(2);
process.stdout.write(`token radar: scored ${board.length} pre-token protocols (${snapshot.watchlist.length}/${snapshot.watchlist.length} watchlist covered), total implied value $${totalImpliedB}B, ${radar.live_size} live-token protocols set aside
Top 5:
${board.slice(0, 5).map(r => `  #${r.rank} ${r.name.padEnd(20)} $${(r.implied_value_usd/1e6).toFixed(1)}M`).join('\n')}
Confidence: high: ${radar.stats.confidence_counts.high}, medium: ${radar.stats.confidence_counts.medium}, low: ${radar.stats.confidence_counts.low}
token radar backtest: fit=${radar.backtest.fit_count} test=${radar.backtest.test_count} median |log10 err|=${radar.backtest.median_abs_log10_error} within2x=${radar.backtest.within_2x_pct}% within5x=${radar.backtest.within_5x_pct}%
token radar: output written to ${out}: board.json, data.js, dashboard/ (${dashFiles.length} files), screenshots/ (${shots.length} images), dossier.json
`);
