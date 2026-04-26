#!/usr/bin/env node
/**
 * Sentinel: as-any-ratchet
 *
 * Counts `as any` occurrences across production source trees and compares the
 * count against a committed baseline. The count may only DECREASE — any
 * regression fails the hook.
 *
 * Scopes (production only — not test trees):
 *   - museum-backend/src/
 *   - museum-frontend/        (excluding tests, .test-dist, node_modules)
 *   - museum-web/src/
 *
 * Baseline: scripts/sentinels/as-any-baseline.json (commit it).
 * On first run with no baseline file, the script writes one and exits 0,
 * instructing the user to commit it.
 *
 * Exit 0 = pass / 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const baselinePath = path.join(__dirname, 'as-any-baseline.json');

const TARGETS = [
  { name: 'backend', root: path.join(repoRoot, 'museum-backend', 'src') },
  { name: 'frontend', root: path.join(repoRoot, 'museum-frontend') },
  { name: 'web', root: path.join(repoRoot, 'museum-web', 'src') },
];

const FRONTEND_EXCLUDE = new Set([
  'node_modules',
  '.test-dist',
  'tests',
  '__tests__',
  'dist',
  'ios',
  'android',
  '.expo',
]);

const AS_ANY_RE = /\bas\s+any\b/g;

function walk(dir, isFrontend) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      if (isFrontend && FRONTEND_EXCLUDE.has(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name), isFrontend));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx|mts|cts)$/.test(entry.name)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.spec\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(path.join(dir, entry.name));
  }
  return out;
}

function countAsAny(file) {
  const text = fs.readFileSync(file, 'utf8');
  const matches = text.match(AS_ANY_RE);
  return matches ? matches.length : 0;
}

function tally() {
  const result = {};
  for (const target of TARGETS) {
    const files = walk(target.root, target.name === 'frontend');
    let total = 0;
    for (const f of files) total += countAsAny(f);
    result[target.name] = total;
  }
  result.total = result.backend + result.frontend + result.web;
  return result;
}

const current = tally();

if (!fs.existsSync(baselinePath)) {
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        _comment:
          'Maximum allowed as-any count per scope. The ratchet only allows the count to go DOWN. Regenerate manually only when you intentionally lower the bar.',
        backend: current.backend,
        frontend: current.frontend,
        web: current.web,
        total: current.total,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `[sentinel:as-any] PASS — baseline created at scripts/sentinels/as-any-baseline.json`,
  );
  console.log(
    `[sentinel:as-any] Counts: backend=${current.backend} frontend=${current.frontend} web=${current.web} total=${current.total}`,
  );
  console.log(
    `[sentinel:as-any] ACTION REQUIRED: commit scripts/sentinels/as-any-baseline.json`,
  );
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

const regressions = [];
for (const scope of ['backend', 'frontend', 'web']) {
  if (current[scope] > baseline[scope]) {
    regressions.push(`${scope}: ${baseline[scope]} -> ${current[scope]}`);
  }
}

if (regressions.length > 0) {
  console.error(`[sentinel:as-any] FAIL: as-any count regressed:`);
  for (const r of regressions) console.error(`  - ${r}`);
  console.error(
    `[sentinel:as-any] Replace 'as any' with 'as unknown' + type guard, or a precise type.`,
  );
  console.error(
    `[sentinel:as-any] If the bar legitimately moved DOWN, regenerate baseline by deleting scripts/sentinels/as-any-baseline.json and re-running.`,
  );
  process.exit(1);
}

console.log(
  `[sentinel:as-any] PASS — backend=${current.backend}<=${baseline.backend} frontend=${current.frontend}<=${baseline.frontend} web=${current.web}<=${baseline.web}`,
);
process.exit(0);
