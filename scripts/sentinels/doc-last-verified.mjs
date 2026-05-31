#!/usr/bin/env node
// @ts-check
/**
 * doc-last-verified sentinel (HON-08).
 *
 * Doctrine `feedback_doc_honesty_enforcement.md`: load-bearing canonical docs
 * (product, architecture, debt, security, compliance, the live security/AI-safety
 * ADRs) must keep their claims true. Three layers, cheapest → strongest:
 *
 *   1. REFS RESOLVE (deterministic, every push) — every `path/file.ext:NN`,
 *      `docs/*.md` cross-ref, and relative md link inside a listed doc must
 *      resolve (file exists + ≥ NN lines). Catches deleted/renamed/shortened
 *      targets, dead cross-refs. Free, zero tokens. FAIL.
 *   2. EVENT-DRIVEN FRESHNESS (deterministic, every push) — if a doc references
 *      a code file that was committed AFTER the doc's last-verified day, the doc
 *      may have drifted internally (e.g. a symbol moved within a still-long
 *      file — which layer 1 cannot see). The stamp is treated as STALE: re-verify
 *      and re-stamp (bump the date in the manifest). FAIL. Same-day grace: a
 *      commit on the stamp day does NOT invalidate it (re-stamping the day you
 *      touch the code stays green).
 *   3. DATE FLOOR (180d) — a relaxed backstop forcing a periodic human/AI re-read
 *      even if nothing the doc references changed. FAIL when older than 180d.
 *
 * MECHANISM — a SIDECAR manifest (`scripts/sentinels/doc-last-verified.json`),
 * NOT in-doc frontmatter, so stamping never shifts a doc's line numbers.
 *
 * RATCHET — the manifest IS the curated list. Add a doc once its claims are
 * verified; removals only when retired.
 *
 * Usage:
 *   node doc-last-verified.mjs [--root <repoRoot>] [--today YYYY-MM-DD]
 *                              [--manifest <path>] [--no-change-check]
 * `--today` / `--manifest` / `--no-change-check` are for deterministic testing.
 *
 * Exit codes: 0 → every listed doc fresh + refs resolve · 1 → ≥1 problem.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  buildFileIndex,
  checkDocRefs,
  collectReferencedFiles,
} from './lib/doc-ref-resolver.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_AGE_DAYS = 180;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = null;
  let today = null;
  let manifest = null;
  let changeCheck = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) root = args[++i];
    else if (args[i] === '--today' && args[i + 1]) today = args[++i];
    else if (args[i] === '--manifest' && args[i + 1]) manifest = args[++i];
    else if (args[i] === '--no-change-check') changeCheck = false;
  }
  if (root === null) root = resolve(__dirname, '../..');
  if (manifest === null) manifest = join(__dirname, 'doc-last-verified.json');
  return { root, today: today ?? new Date().toISOString().slice(0, 10), manifest, changeCheck };
}

/** Whole-day difference (a - b) in days, both 'YYYY-MM-DD' (UTC, no DST drift). */
function daysBetween(a, b) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((da - db) / 86_400_000);
}

/**
 * Build Map<relPath, 'YYYY-MM-DD'> = most-recent commit DAY that touched each
 * file since `sinceDay` (exclusive of that whole day). Returns null when `root`
 * is not a git repo (e.g. test fixtures) → caller skips the event-driven layer.
 */
function buildChangedFileMap(root, sinceDay) {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--git-dir'], { stdio: 'ignore' });
  } catch {
    return null;
  }
  let out = '';
  try {
    out = execFileSync(
      'git',
      ['-C', root, 'log', `--since=${sinceDay} 23:59:59`, '--name-only', '--pretty=format:%x00%cI'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    return new Map();
  }
  const map = new Map();
  let curDay = null;
  for (const raw of out.split('\n')) {
    if (raw.startsWith('\x00')) {
      curDay = raw.slice(1, 11); // YYYY-MM-DD prefix of the ISO commit date
      continue;
    }
    const f = raw.trim();
    if (f && curDay) {
      const prev = map.get(f);
      if (!prev || prev < curDay) map.set(f, curDay);
    }
  }
  return map;
}

function main() {
  const { root, today, manifest, changeCheck } = parseArgs(process.argv);
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
  const entries = Object.entries(docs);

  /** @type {string[]} */ const dateFailures = [];
  /** @type {string[]} */ const refFailures = [];
  /** @type {string[]} */ const staleByChange = [];

  // Repo index built once (skipped if no docs to check).
  const index = entries.length > 0 ? buildFileIndex(root) : new Map();

  // Event-driven: one `git log` since the OLDEST stamp, then compare per doc.
  let changedFiles = null;
  if (changeCheck && entries.length > 0) {
    const validDates = entries.map(([, d]) => d).filter((d) => DATE_RE.test(d));
    if (validDates.length > 0) {
      const minDay = validDates.reduce((a, b) => (a < b ? a : b));
      changedFiles = buildChangedFileMap(root, minDay);
    }
  }

  for (const [rel, date] of entries) {
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      dateFailures.push(`${rel}: listed in manifest but file is missing on disk`);
      continue;
    }
    if (!DATE_RE.test(date)) {
      dateFailures.push(`${rel}: last-verified "${date}" is not a YYYY-MM-DD date`);
      continue;
    }
    const age = daysBetween(today, date);
    if (age < 0) {
      dateFailures.push(`${rel}: last-verified ${date} is in the future (today=${today})`);
    } else if (age > MAX_AGE_DAYS) {
      dateFailures.push(`${rel}: last-verified ${date} is ${age}d old (> ${MAX_AGE_DAYS}d) — re-verify and re-stamp`);
    }

    // Layer 1 — refs resolve.
    for (const f of checkDocRefs(abs, rel, root, index)) {
      refFailures.push(`${rel}:${f.line} [${f.kind}] ${f.ref} — ${f.why}`);
    }

    // Layer 2 — event-driven freshness (skip when not a git repo).
    if (changedFiles) {
      const referenced = collectReferencedFiles(abs, rel, root, index);
      const movedSinceStamp = [];
      for (const file of referenced) {
        const changeDay = changedFiles.get(file);
        if (changeDay && daysBetween(changeDay, date) > 0) {
          movedSinceStamp.push(`${file} (changed ${changeDay})`);
        }
      }
      if (movedSinceStamp.length > 0) {
        staleByChange.push(
          `${rel} (stamped ${date}): ${movedSinceStamp.length} referenced file(s) changed since the stamp — re-verify & bump the date:\n      - ${movedSinceStamp.join('\n      - ')}`,
        );
      }
    }
  }

  const total = dateFailures.length + refFailures.length + staleByChange.length;
  const lines = ['## doc-last-verified', ''];
  if (total === 0) {
    lines.push(
      `PASS — all ${entries.length} curated doc(s): fresh stamp (≤ ${MAX_AGE_DAYS}d), every path:line/cross-ref resolves, no referenced code changed since stamp.`,
    );
  } else {
    lines.push(`FAIL — ${total} problem(s) across ${entries.length} curated doc(s):`);
    if (dateFailures.length > 0) {
      lines.push('', `### Stale/missing date (${dateFailures.length})`);
      for (const f of dateFailures) lines.push(`- ${f}`);
    }
    if (refFailures.length > 0) {
      lines.push('', `### Dangling reference (${refFailures.length})`);
      for (const f of refFailures) lines.push(`- ${f}`);
    }
    if (staleByChange.length > 0) {
      lines.push('', `### Stale-by-change — referenced code moved since the stamp (${staleByChange.length})`);
      for (const f of staleByChange) lines.push(`- ${f}`);
    }
    lines.push(
      '',
      'Re-verify the doc against the code, then bump its date in scripts/sentinels/doc-last-verified.json.',
    );
  }
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(total === 0 ? 0 : 1);
}

main();
