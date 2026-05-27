#!/usr/bin/env node
// @ts-check
/**
 * doc-last-verified sentinel (HON-08).
 *
 * Doctrine `feedback_doc_honesty_enforcement.md`: load-bearing canonical docs
 * (product, architecture, debt, security, compliance) must carry a `last-verified`
 * date re-affirmed when their claims are reviewed. A stale/missing stamp means
 * the doc's assertions are unverified — the failure mode that let fabricated B2B
 * claims and doc↔code drift accumulate.
 *
 * MECHANISM — a SIDECAR manifest (`scripts/sentinels/doc-last-verified.json`),
 * NOT in-doc YAML frontmatter. Rationale: stamping a doc with top-of-file
 * frontmatter shifts every line below it by +N, silently breaking any
 * `path/file.md:LINE` cross-reference into that doc — i.e. a doc-honesty guard
 * that itself introduces doc drift. The sidecar stamps dates centrally with zero
 * line-number impact on the docs themselves.
 *
 * RATCHET — the manifest IS the curated list. Add a doc once its claims are
 * verified; never enforce repo-wide in one shot. Removals only when retired.
 *
 * A doc fails if:
 *   - the file is missing, OR
 *   - its manifest date is not a valid YYYY-MM-DD, OR
 *   - the date is in the future, OR
 *   - the date is more than MAX_AGE_DAYS (90) before `today`.
 *
 * Usage:
 *   node doc-last-verified.mjs [--root <repoRoot>] [--today YYYY-MM-DD] [--manifest <path>]
 * `--today` / `--manifest` are for deterministic testing.
 *
 * Exit codes: 0 → every listed doc has a fresh stamp · 1 → ≥1 missing/stale.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_AGE_DAYS = 90;
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
  if (manifest === null) manifest = join(__dirname, 'doc-last-verified.json');
  return { root, today: today ?? new Date().toISOString().slice(0, 10), manifest };
}

/** Whole-day difference (a - b) in days, both 'YYYY-MM-DD' (UTC, no DST drift). */
function daysBetween(a, b) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((da - db) / 86_400_000);
}

function main() {
  const { root, today, manifest } = parseArgs(process.argv);
  if (!existsSync(manifest)) {
    process.stderr.write(`## doc-last-verified\n\nFAIL — manifest not found: ${manifest}\n`);
    process.exit(1);
  }
  /** @type {{ docs: Record<string,string> }} */
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch (e) {
    process.stderr.write(`## doc-last-verified\n\nFAIL — manifest is not valid JSON: ${String(e)}\n`);
    process.exit(1);
  }
  const docs = parsed.docs ?? {};
  const failures = [];
  for (const [rel, date] of Object.entries(docs)) {
    if (!existsSync(join(root, rel))) {
      failures.push(`${rel}: listed in manifest but file is missing on disk`);
      continue;
    }
    if (!DATE_RE.test(date)) {
      failures.push(`${rel}: last-verified "${date}" is not a YYYY-MM-DD date`);
      continue;
    }
    const age = daysBetween(today, date);
    if (age < 0) {
      failures.push(`${rel}: last-verified ${date} is in the future (today=${today})`);
    } else if (age > MAX_AGE_DAYS) {
      failures.push(`${rel}: last-verified ${date} is ${age}d old (> ${MAX_AGE_DAYS}d) — re-verify and re-stamp`);
    }
  }

  const lines = ['## doc-last-verified', ''];
  if (failures.length === 0) {
    lines.push(`PASS — all ${Object.keys(docs).length} curated canonical doc(s) carry a fresh last-verified stamp (≤ ${MAX_AGE_DAYS}d).`);
  } else {
    lines.push(`FAIL — ${failures.length} doc(s) missing or stale:`);
    for (const f of failures) lines.push(`- ${f}`);
    lines.push('', 'Re-verify the doc, then update its date in scripts/sentinels/doc-last-verified.json.');
  }
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
