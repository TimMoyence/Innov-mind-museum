#!/usr/bin/env node
/**
 * Sentinel: a11y-ratchet  (EN 301 549 / RGAA — audit 360 dim.3 gap #a11y)
 *
 * The mobile app already ships strong accessibility coverage (hundreds of
 * `accessibilityLabel` / `accessibilityRole` props + an RTL physical-side-leak
 * audit helper). There was, however, NO sentinel guarding that floor — a refactor
 * could silently strip a11y props and no gate would notice. This is a FLOOR
 * RATCHET (same philosophy as as-any / guardrails / ai-tests-count): the measured
 * a11y signal may only grow, never regress below the committed baseline.
 *
 * What it locks (scope: museum-frontend/{features,app,shared/ui}, *.ts/*.tsx):
 *   - accessibilityLabel occurrences  >= baseline.accessibilityLabel
 *   - accessibilityRole  occurrences  >= baseline.accessibilityRole
 *   - accessibilityHint  occurrences  >= baseline.accessibilityHint
 *   - # of RTL audit tests using `findPhysicalSideLeaks` >= baseline.rtlAuditTests
 *     (EN 301 549 §9.1.3.2 — keeps the physical-side-prop guard wired)
 *
 * NOT a per-element "is this Pressable labelled?" AST check — that would be
 * fragile (props can be spread/forwarded) and noisy. The floor ratchet is robust
 * and zero-false-positive: it fails only on a real net removal of a11y signal.
 *
 * Flags:
 *   (default)          ratchet check, exit 1 if any count regressed
 *   --update-baseline  re-pin the baseline to current counts (deliberate raise/lower)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FE = join(REPO_ROOT, 'museum-frontend');
const BASELINE_PATH = join(__dirname, 'a11y-ratchet-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');

const SCOPE_DIRS = ['features', 'app', join('shared', 'ui')].map((d) => join(FE, d));
const RTL_TEST_DIR = join(FE, '__tests__');

function walk(dir, predicate) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.test-dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(entry.name)) out.push(full);
  }
  return out;
}

const isSource = (n) => n.endsWith('.tsx') || n.endsWith('.ts');

function countMatches(files, re) {
  let n = 0;
  for (const f of files) {
    const m = readFileSync(f, 'utf8').match(re);
    if (m) n += m.length;
  }
  return n;
}

function computeCounts() {
  const srcFiles = SCOPE_DIRS.flatMap((d) => walk(d, isSource));
  const accessibilityLabel = countMatches(srcFiles, /accessibilityLabel/g);
  const accessibilityRole = countMatches(srcFiles, /accessibilityRole/g);
  const accessibilityHint = countMatches(srcFiles, /accessibilityHint/g);
  // RTL audit tests that actually call the physical-side-leak detector.
  const rtlTests = walk(RTL_TEST_DIR, (n) => n.endsWith('.test.ts') || n.endsWith('.test.tsx'));
  const rtlAuditTests = rtlTests.filter((f) =>
    /findPhysicalSideLeaks|_rtl-style-audit/.test(readFileSync(f, 'utf8')),
  ).length;
  return { accessibilityLabel, accessibilityRole, accessibilityHint, rtlAuditTests };
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const counts = computeCounts();

  if (UPDATE) {
    const baseline = {
      _comment:
        'FLOOR RATCHET for a11y-ratchet.mjs (EN 301 549 / RGAA). Each value is a MINIMUM: the live count of that a11y signal in museum-frontend/{features,app,shared/ui} must stay >= this. Raise deliberately as coverage grows; lowering requires --update-baseline with justification (a genuine screen removal). Do NOT lower to paper over a regression.',
      bootstrappedAt: '2026-05-31',
      floors: counts,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
    console.log('[a11y-ratchet] baseline updated → ' + JSON.stringify(counts));
    process.exit(0);
  }

  const baseline = loadBaseline();
  if (!baseline || !baseline.floors) {
    console.error('[a11y-ratchet] ✗ baseline missing — bootstrap with `--update-baseline`.');
    process.exit(1);
  }

  const floors = baseline.floors;
  const regressions = [];
  for (const key of Object.keys(floors)) {
    const have = counts[key] ?? 0;
    const floor = floors[key];
    if (have < floor) regressions.push({ key, have, floor });
  }

  console.log('[a11y-ratchet] a11y floor ratchet (museum-frontend)');
  for (const key of Object.keys(floors)) {
    console.log(`  ${key}: ${String(counts[key] ?? 0)} (floor ${String(floors[key])})`);
  }

  if (regressions.length) {
    console.error('\n[a11y-ratchet] ✗ a11y signal REGRESSED below the floor:');
    for (const r of regressions) {
      console.error(`  • ${r.key}: ${String(r.have)} < ${String(r.floor)} (removed ${String(r.floor - r.have)})`);
    }
    console.error(
      '\n  Restore the missing accessibilityLabel/Role/Hint or RTL audit test. If a screen was' +
        ' legitimately removed, re-pin with `node scripts/sentinels/a11y-ratchet.mjs --update-baseline` + justification.',
    );
    process.exit(1);
  }

  console.log('[a11y-ratchet] ✓ no a11y regression (floor holds)');
  process.exit(0);
}

main();
