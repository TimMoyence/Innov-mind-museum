#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sentinel: audit-factory-coverage  (DRY-factories ratchet — CLAUDE.md § Test Discipline)
 *
 * Scans backend `*.entity.ts` classes and flags any entity referenced >= 3x
 * across the test suite that still lacks a `make<Entity>` factory in
 * `tests/helpers/`. The set of missing factories is RATCHETED against
 * `audit-factory-coverage-baseline.json`:
 *
 *   - any NEW missing factory (not in the baseline)  → exit 1 (fail)
 *   - missing set ⊆ baseline                          → exit 0 (pass)
 *   - a baselined entry that NOW has a factory        → pass, with a hint to
 *     remove it from the baseline (the ratchet may only shrink)
 *
 * Was an orphan one-shot audit (no exit code, no wiring) until 2026-05-31 when
 * it was given teeth + a baseline and wired into pre-push Gate 23 + the CI
 * mirror (audit 360 dim.3 — "câbler les orphelins ou les retirer").
 *
 * Flags:
 *   (default)          ratchet check, exit 1 on any new missing factory
 *   --update-baseline  rewrite the baseline to the current missing set
 *                      (one-time bootstrap / deliberate shrink, not routine)
 *
 * Heuristic: walk *.entity.ts files, derive the entity class name, count
 * test-file references, check for a matching `make<Entity>` factory. Still
 * writes the full audit to /tmp/phase7-audit.txt for debugging.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..', '..');
const BASELINE_PATH = join(__dirname, 'audit-factory-coverage-baseline.json');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

function walkFiles(dir, predicate) {
  const out = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) out.push(...walkFiles(full, predicate));
      else if (predicate(full)) out.push(full);
    }
  } catch { /* swallow ENOENT */ }
  return out;
}

function entitiesUnder(srcRoot) {
  return walkFiles(srcRoot, (f) => f.endsWith('.entity.ts')).map((f) => {
    const text = readFileSync(f, 'utf-8');
    const match = text.match(/export class (\w+)/);
    return { path: f, name: match ? match[1] : basename(f, '.entity.ts') };
  });
}

function countReferences(testFiles, name) {
  const re = new RegExp(`\\b${name}\\b`);
  let count = 0;
  for (const f of testFiles) {
    const text = readFileSync(f, 'utf-8');
    if (re.test(text)) count += 1;
  }
  return count;
}

function hasFactory(helperRoots, name) {
  const lower = name[0].toLowerCase() + name.slice(1);
  const factoryFnRe = new RegExp(`\\bmake${name}\\b`);
  for (const root of helperRoots) {
    const helpers = walkFiles(root, (f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const f of helpers) {
      if (basename(f).toLowerCase().includes(lower)) return f;
      const text = readFileSync(f, 'utf-8');
      if (factoryFnRe.test(text)) return f;
    }
  }
  return null;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return { missing: [] };
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  } catch {
    return { missing: [] };
  }
}

function main() {
  const beEntities = entitiesUnder(join(ROOT, 'museum-backend', 'src'));
  const beTestFiles = walkFiles(join(ROOT, 'museum-backend', 'tests'), (f) => f.endsWith('.test.ts'));
  const beHelperRoots = [join(ROOT, 'museum-backend', 'tests', 'helpers')];

  const lines = ['# factory-coverage audit (BE)', ''];
  const missing = [];
  for (const e of beEntities) {
    const refs = countReferences(beTestFiles, e.name);
    const factory = hasFactory(beHelperRoots, e.name);
    if (refs >= 3 && !factory) {
      missing.push({ name: e.name, refs, path: e.path.replace(ROOT + '/', '') });
      lines.push(`- MISSING: ${e.name} (refs: ${refs}, entity: ${e.path.replace(ROOT + '/', '')})`);
    }
  }
  lines.push('');
  lines.push('## Frontend');
  lines.push('(skipped — FE uses OpenAPI types; shape-match rule covers gaps)');

  const out = lines.join('\n');
  // Write the full audit to /tmp for debugging / commit-body inclusion.
  try {
    writeFileSync('/tmp/phase7-audit.txt', out);
  } catch { /* ignore */ }

  const missingNames = missing.map((m) => m.name).sort();

  // ── Update-baseline mode (bootstrap / deliberate shrink only) ──────────
  if (UPDATE_BASELINE) {
    const baseline = loadBaseline();
    const next = {
      comment: baseline.comment
        ?? 'RATCHET baseline for audit-factory-coverage.mjs — may only shrink.',
      bootstrappedAt: baseline.bootstrappedAt ?? new Date().toISOString().slice(0, 10),
      missing: missingNames,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
    console.log(`[audit-factory-coverage] baseline updated → ${String(missingNames.length)} entr(y/ies): ${missingNames.join(', ') || '(none)'}`);
    process.exit(0);
  }

  // ── Ratchet check ──────────────────────────────────────────────────────
  const baseline = loadBaseline();
  const baselineSet = new Set(baseline.missing ?? []);
  const newMissing = missingNames.filter((n) => !baselineSet.has(n));
  const fixed = [...baselineSet].filter((n) => !missingNames.includes(n)).sort();

  console.log('[audit-factory-coverage] DRY-factories ratchet (backend)');
  if (missingNames.length) {
    console.log(`  baselined missing (tracked debt): ${missingNames.filter((n) => baselineSet.has(n)).join(', ') || '(none)'}`);
  }
  if (fixed.length) {
    console.log(`  ✓ now covered (remove from baseline): ${fixed.join(', ')}`);
  }

  if (newMissing.length > 0) {
    console.error(
      `\n[audit-factory-coverage] ✗ ${String(newMissing.length)} entit(y/ies) referenced >= 3x in tests with NO make<Entity> factory and NOT in the baseline:`,
    );
    for (const m of missing.filter((x) => newMissing.includes(x.name))) {
      console.error(`  • ${m.name} (refs: ${m.refs}, entity: ${m.path})`);
    }
    console.error(
      '\n  Fix: add make' + newMissing[0] + '() in museum-backend/tests/helpers/<module>/ ' +
        '(DRY-factories doctrine — docs/TEST_FACTORIES.md), or, if this is a deliberate ' +
        'pre-existing gap, run `node scripts/sentinels/audit-factory-coverage.mjs --update-baseline` ' +
        'with justification. The baseline may only shrink.',
    );
    process.exit(1);
  }

  console.log('[audit-factory-coverage] ✓ no new missing factories (ratchet holds)');
  process.exit(0);
}

main();
