#!/usr/bin/env node
// @ts-check
/**
 * Sentinel: secret-rotation-freshness  (audit 360 dim.3 gap #secret-rotation)
 *
 * Secret/cert/key rotation runbooks rot silently: the procedure drifts from the
 * live infra (new vendor, changed key store, rotated CA) and nobody notices
 * until a rotation fails under incident pressure. This sentinel keeps the
 * ROTATION runbooks fresh — each must carry a last-verified stamp re-affirmed
 * within `maxAgeDays` (120d; quarterly cert/redis cadence + buffer).
 *
 * MECHANISM — a SIDECAR manifest (`secret-rotation-freshness.json`), NOT in-doc
 * frontmatter, so stamping never shifts a runbook's line numbers (same rationale
 * as doc-last-verified). Re-stamp a runbook's date when you re-verify its
 * procedure against the live infra.
 *
 * A runbook fails if: file missing · date not YYYY-MM-DD · date in the future ·
 * date older than maxAgeDays.
 *
 * Usage: node secret-rotation-freshness.mjs [--root <repoRoot>] [--today YYYY-MM-DD] [--manifest <path>]
 * (--today / --manifest are for deterministic testing.)
 * Exit 0 = all fresh · 1 = ≥1 missing/stale.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = null;
  let today = null;
  let manifest = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) root = args[++i];
    else if (args[i] === '--today' && args[i + 1]) today = args[++i];
    else if (args[i] === '--manifest' && args[i + 1]) manifest = args[++i];
  }
  if (root === null) root = resolve(__dirname, '../..');
  if (manifest === null) manifest = join(__dirname, 'secret-rotation-freshness.json');
  return { root, today: today ?? new Date().toISOString().slice(0, 10), manifest };
}

/** Whole-day difference (a - b) in days, both 'YYYY-MM-DD' (UTC, no DST drift). */
function daysBetween(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

function main() {
  const { root, today, manifest } = parseArgs(process.argv);
  if (!existsSync(manifest)) {
    process.stderr.write(`## secret-rotation-freshness\n\nFAIL — manifest not found: ${manifest}\n`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch (e) {
    process.stderr.write(`## secret-rotation-freshness\n\nFAIL — manifest is not valid JSON: ${String(e)}\n`);
    process.exit(1);
  }
  const maxAge = Number(parsed.maxAgeDays ?? 120);
  const runbooks = parsed.runbooks ?? {};
  const failures = [];
  for (const [rel, date] of Object.entries(runbooks)) {
    if (!existsSync(join(root, rel))) {
      failures.push(`${rel}: listed in manifest but file is missing on disk`);
      continue;
    }
    if (!DATE_RE.test(String(date))) {
      failures.push(`${rel}: last-verified "${String(date)}" is not a YYYY-MM-DD date`);
      continue;
    }
    const age = daysBetween(today, String(date));
    if (age < 0) {
      failures.push(`${rel}: last-verified ${String(date)} is in the future (today=${today})`);
    } else if (age > maxAge) {
      failures.push(`${rel}: last-verified ${String(date)} is ${String(age)}d old (> ${String(maxAge)}d) — re-verify the rotation procedure against live infra and re-stamp`);
    }
  }

  const lines = ['## secret-rotation-freshness', ''];
  if (failures.length === 0) {
    lines.push(`PASS — all ${String(Object.keys(runbooks).length)} rotation runbook(s) carry a fresh stamp (≤ ${String(maxAge)}d).`);
  } else {
    lines.push(`FAIL — ${String(failures.length)} rotation runbook(s) missing or stale:`);
    for (const f of failures) lines.push(`- ${f}`);
    lines.push('', 'Re-verify the rotation procedure, then update its date in scripts/sentinels/secret-rotation-freshness.json.');
  }
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
