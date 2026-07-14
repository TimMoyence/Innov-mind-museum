#!/usr/bin/env node
/**
 * Run the backend suite the way CI runs it: SHARDED. Used by `pnpm test` and,
 * with `--coverage`, by `pnpm test:coverage`.
 *
 * WHY (2026-07-14). CI runs `jest --shard=N/4` across a 4-job matrix
 * (`.github/workflows/ci-cd-backend.yml`, job `test-coverage`): ~173 suites per
 * process. The local scripts ran all 692 suites in ONE process, and that single
 * difference produced two classes of *local-only* false failures:
 *
 *  (a) OOM. Peak heap measured at 4693 MB — above Node's ~4 GB default. The run
 *      died around the ~450th suite with `Ineffective mark-compacts near heap
 *      limit` / exit 134. **No test goes red** — the process is simply killed, so
 *      it does not even look like a failure.
 *
 *  (b) Event-loop starvation. Open handles (ioredis / BullMQ sockets never
 *      `.unref()`ed — pre-existing tech debt, see TECH_DEBT.md) accumulate across
 *      the whole run. By the 650th suite a supertest route assertion that takes
 *      **2.2 s in isolation** takes **> 30 s** and trips the timeout. A DIFFERENT
 *      suite loses each run (`mfa.route`, `auth.route`, `admin.route` all
 *      observed), which is exactly why it read as "flaky" rather than "coupled":
 *      the 650th suite pays for the 649 before it; none of them is guilty alone.
 *
 * Sharding fixes both at the root — each shard is a fresh process, so neither heap
 * nor handles carry over. It is not a workaround, it is parity with CI.
 *
 * COVERAGE. `jest.config.ts` sets `collectCoverage: true` and enforces a
 * `coverageThreshold` — but a shard only ever sees a QUARTER of the code, so the
 * per-shard threshold check is meaningless and fails every shard while zero tests
 * are red. CI solves this with `SHARDED_COVERAGE=1` (skips the per-run check) and
 * a separate merge job: `nyc report` over the 4 shard JSONs, then `nyc
 * check-coverage` against the union. We do exactly the same here, with the SAME
 * thresholds (88/74/86/89) — drift between the two would make the local gate a lie.
 *
 * All four shards always run (we do not stop at the first red one) so one
 * invocation shows every failure; exit code is non-zero if ANY shard failed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SHARDS = 4;
const WITH_COVERAGE = process.argv.includes('--coverage');
const passthrough = process.argv.slice(2).filter((a) => a !== '--coverage');

// Must mirror `.github/workflows/ci-cd-backend.yml` (job `coverage-merge`).
const THRESHOLDS = { statements: 88, branches: 74, functions: 86, lines: 89 };

const NYC_TEMP = '.nyc_output';
const shardDir = (shard) => `coverage-shard-${String(shard)}`;

const run = (cmd, args, env) =>
  spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;

if (WITH_COVERAGE) {
  rmSync(NYC_TEMP, { recursive: true, force: true });
  for (let s = 1; s <= SHARDS; s += 1) rmSync(shardDir(s), { recursive: true, force: true });
}

const failed = [];

for (let shard = 1; shard <= SHARDS; shard += 1) {
  process.stdout.write(`\n──────── shard ${String(shard)}/${String(SHARDS)} ────────\n`);

  const jestArgs = [
    'jest',
    '--watchman=false',
    '--runInBand',
    '--selectProjects',
    'unit-integration',
    `--shard=${String(shard)}/${String(SHARDS)}`,
    '--testTimeout=30000',
    ...(WITH_COVERAGE
      ? ['--coverage', '--coverageReporters=json', `--coverageDirectory=${shardDir(shard)}`]
      : ['--coverage=false']),
    ...passthrough,
  ];

  // SHARDED_COVERAGE=1 disables jest.config.ts's per-run coverageThreshold — a
  // shard covers 1/4 of the code, so that check can only ever be a false red.
  // The real gate is the merged check below (and, in CI, the coverage-merge job).
  if (run('npx', jestArgs, { SHARDED_COVERAGE: '1' }) !== 0) {
    failed.push(shard);
  }
}

if (failed.length > 0) {
  process.stdout.write(`\n✖ failing shard(s): ${failed.join(', ')}\n`);
  process.exit(1);
}

if (!WITH_COVERAGE) {
  process.stdout.write(`\n✔ all ${String(SHARDS)} shards green\n`);
  process.exit(0);
}

// ── Merge the shard coverage and gate on the UNION (mirrors CI's coverage-merge)
process.stdout.write('\n──────── merged coverage ────────\n');
mkdirSync(NYC_TEMP, { recursive: true });

let staged = 0;
for (let shard = 1; shard <= SHARDS; shard += 1) {
  const src = join(shardDir(shard), 'coverage-final.json');
  if (!existsSync(src)) {
    process.stderr.write(`✖ missing ${src} — shard ${String(shard)} produced no coverage\n`);
    process.exit(1);
  }
  copyFileSync(src, join(NYC_TEMP, `${shardDir(shard)}.json`));
  staged += 1;
}
process.stdout.write(
  `staged ${String(staged)} shard(s) in ${NYC_TEMP}/: ${readdirSync(NYC_TEMP).join(', ')}\n\n`,
);

const reportRc = run('npx', [
  '--yes',
  'nyc@15',
  'report',
  '--reporter=text-summary',
  `--temp-dir=${NYC_TEMP}`,
  '--report-dir=coverage',
]);
if (reportRc !== 0) process.exit(reportRc);

const checkRc = run('npx', [
  '--yes',
  'nyc@15',
  'check-coverage',
  '--statements',
  String(THRESHOLDS.statements),
  '--branches',
  String(THRESHOLDS.branches),
  '--functions',
  String(THRESHOLDS.functions),
  '--lines',
  String(THRESHOLDS.lines),
  `--temp-dir=${NYC_TEMP}`,
]);

if (checkRc !== 0) {
  process.stderr.write('\n✖ merged coverage below threshold (same gate as CI coverage-merge)\n');
  process.exit(checkRc);
}

process.stdout.write(`\n✔ all ${String(SHARDS)} shards green + merged coverage above threshold\n`);
