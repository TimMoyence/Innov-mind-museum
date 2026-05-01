#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 4 Stryker hot-files gate.
 *
 * Reads:
 *   museum-backend/.stryker-hot-files.json — registry of hot files + thresholds
 *   museum-backend/reports/mutation/mutation.json — Stryker output
 *
 * For each registered hot file, computes kill ratio:
 *   killed / (killed + survived + noCoverage + timeout)
 *
 * Exit codes:
 *   0 — every hot file >= killRatioMin
 *   1 — at least one hot file below threshold
 *   2 — registry references a file absent from mutation.json
 *
 * Env: STRYKER_GATE_ROOT overrides the root directory (used in tests).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.env.STRYKER_GATE_ROOT ?? process.cwd());
const REGISTRY_PATH = resolve(ROOT, '.stryker-hot-files.json');
const MUTATION_PATH = resolve(ROOT, 'reports', 'mutation', 'mutation.json');

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    console.error(`Cannot read ${path}: ${err.message}`);
    process.exit(2);
  }
  return null;
}

function killRatio(file) {
  const mutants = file.mutants ?? [];
  if (mutants.length === 0) return null;
  const killed = mutants.filter((m) => m.status === 'Killed').length;
  const counted = mutants.filter(
    (m) =>
      m.status === 'Killed' ||
      m.status === 'Survived' ||
      m.status === 'NoCoverage' ||
      m.status === 'Timeout',
  ).length;
  if (counted === 0) return null;
  return (killed / counted) * 100;
}

function main() {
  const registry = readJson(REGISTRY_PATH);
  const mutation = readJson(MUTATION_PATH);

  if (!Array.isArray(registry.hotFiles)) {
    console.error('Registry .stryker-hot-files.json must have a `hotFiles` array.');
    process.exit(2);
  }

  if (registry.hotFiles.length === 0) {
    console.log('OK — no hot files registered, gate is a no-op.');
    process.exit(0);
  }

  const failures = [];
  const missing = [];

  for (const entry of registry.hotFiles) {
    const file = mutation.files?.[entry.path];
    if (!file) {
      missing.push(entry.path);
      continue;
    }
    const ratio = killRatio(file);
    if (ratio === null) {
      missing.push(`${entry.path} (no mutants found in report)`);
      continue;
    }
    if (ratio < entry.killRatioMin) {
      failures.push({ path: entry.path, ratio, min: entry.killRatioMin });
    }
  }

  if (missing.length > 0) {
    console.error('Hot files referenced in registry but absent from mutation.json:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error('');
    console.error(
      'Add the file to stryker.config.mjs `mutate:` list, OR remove from .stryker-hot-files.json.',
    );
    process.exit(2);
  }

  if (failures.length > 0) {
    console.error('Hot-file kill-ratio gate failures:');
    for (const f of failures) {
      console.error(`  - ${f.path}: ${f.ratio.toFixed(1)}% < ${f.min}%`);
    }
    process.exit(1);
  }

  console.log(
    `OK — ${registry.hotFiles.length}/${registry.hotFiles.length} hot files passed (kill ratio ≥ killRatioMin).`,
  );
  process.exit(0);
}

main();
