#!/usr/bin/env node
/**
 * Sentinel: husky-lfs-integrity
 *
 * Guards against the `git lfs install` clobber that silently deletes the
 * Musaium husky gates (UFR-020 NO-BYPASS). Background:
 *
 *   `core.hooksPath` is configured to `.husky` (absolute). git therefore runs
 *   `.husky/<hook>` directly. `git lfs install` writes its 4 hooks
 *   (pre-push / post-checkout / post-commit / post-merge) into whatever
 *   `core.hooksPath` points at — so a future `git lfs install` would OVERWRITE
 *   `.husky/pre-push` (the 21-gate) with a bare 3-line git-lfs wrapper,
 *   silently disabling every shift-left gate.
 *
 *   The fix chains `git lfs <hook>` INSIDE the tracked husky hooks (the layout
 *   `git lfs install --manual` itself recommends) and tags each real gate with
 *   a marker comment. This sentinel asserts the chained layout is intact and
 *   that no hook has been reduced to a bare git-lfs wrapper (the clobber
 *   signature).
 *
 * Checks (all must hold; any failure => exit 1):
 *   1. `.husky/pre-push` contains the MUSAIUM marker AND chains `git lfs pre-push`.
 *   2. `.husky/post-checkout` exists, has the marker, chains `git lfs post-checkout`.
 *   3. `.husky/post-commit` exists, has the marker, chains `git lfs post-commit`.
 *   4. `.husky/post-merge` has the marker, chains `git lfs post-merge`, AND
 *      keeps the workspace-links sentinel call.
 *   5. No `.husky/<hook>` is a bare git-lfs-only wrapper (clobber signature:
 *      contains `git lfs <hook>` but NOT the Musaium marker).
 *   6. The inert git-lfs files committed under `.husky/_/` are no longer
 *      tracked (they are dead — `.husky/_` is not the hooksPath — and were the
 *      misleading artifact of the original clobber).
 *   7. Runtime guard (local only, skipped where `.husky/_/` absent — e.g. fresh
 *      CI checkout before `prepare`): IF `core.hooksPath` resolves to `.husky/_`
 *      AND a `.husky/_/<hook>` is a bare git-lfs wrapper, the active gate is
 *      severed right now — FAIL. Run `pnpm prepare` to re-pin hooksPath=.husky
 *      and purge the wrapper (scripts/install-git-lfs-hooks.mjs).
 *
 * Exit 0 = pass / 1 = violation.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const huskyDir = path.join(repoRoot, '.husky');

/** The marker comment that tags a real Musaium husky hook (vs a clobber). */
const MARKER = 'husky-lfs-integrity: musaium-gate';

const violations = [];

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function lfsChain(hook) {
  // matches `git lfs <hook>` with any surrounding whitespace / quoting of args
  return new RegExp(`git\\s+lfs\\s+${hook}\\b`);
}

// ── Check 1 — pre-push: marker + LFS chain ──────────────────────────────────
{
  const p = path.join(huskyDir, 'pre-push');
  const txt = read(p);
  if (txt === null) {
    violations.push('.husky/pre-push is missing — the 21-gate is gone');
  } else {
    if (!txt.includes(MARKER))
      violations.push(`.husky/pre-push lacks the "${MARKER}" marker (may have been clobbered by \`git lfs install\`)`);
    if (!lfsChain('pre-push').test(txt))
      violations.push('.husky/pre-push does not chain `git lfs pre-push` — LFS objects will not upload on push');
  }
}

// ── Checks 2 & 3 — post-checkout / post-commit must exist + chain LFS ────────
for (const hook of ['post-checkout', 'post-commit']) {
  const p = path.join(huskyDir, hook);
  const txt = read(p);
  if (txt === null) {
    violations.push(`.husky/${hook} is missing — \`git lfs ${hook}\` is not wired into the active hooksPath`);
    continue;
  }
  if (!txt.includes(MARKER)) violations.push(`.husky/${hook} lacks the "${MARKER}" marker`);
  if (!lfsChain(hook).test(txt)) violations.push(`.husky/${hook} does not chain \`git lfs ${hook}\``);
}

// ── Check 4 — post-merge: marker + LFS chain + workspace-links preserved ─────
{
  const p = path.join(huskyDir, 'post-merge');
  const txt = read(p);
  if (txt === null) {
    violations.push('.husky/post-merge is missing');
  } else {
    if (!txt.includes(MARKER)) violations.push(`.husky/post-merge lacks the "${MARKER}" marker`);
    if (!lfsChain('post-merge').test(txt))
      violations.push('.husky/post-merge does not chain `git lfs post-merge`');
    if (!/workspace-links\.mjs/.test(txt))
      violations.push('.husky/post-merge lost the workspace-links sentinel call (regression)');
  }
}

// ── Check 5 — no hook reduced to a bare git-lfs wrapper (clobber signature) ──
{
  let entries = [];
  try {
    entries = fs.readdirSync(huskyDir, { withFileTypes: true });
  } catch {
    violations.push('.husky/ directory not found');
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const name = e.name;
    // only the 4 hooks git-lfs ever writes can carry the clobber signature
    if (!['pre-push', 'post-checkout', 'post-commit', 'post-merge'].includes(name)) continue;
    const txt = read(path.join(huskyDir, name));
    if (txt === null) continue;
    const isBareLfs = lfsChain(name).test(txt) && !txt.includes(MARKER);
    if (isBareLfs)
      violations.push(
        `.husky/${name} looks like a bare git-lfs wrapper (chains git-lfs but lacks the Musaium marker) — \`git lfs install\` clobbered the gate`,
      );
  }
}

// ── Check 6 — inert .husky/_/* git-lfs files no longer tracked ───────────────
{
  let tracked = '';
  try {
    tracked = execSync('git ls-files .husky/_/', { cwd: repoRoot, encoding: 'utf8' });
  } catch {
    tracked = '';
  }
  const clobberArtifacts = tracked
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\.husky\/_\/(pre-push|post-checkout|post-commit|post-merge)$/.test(l));
  for (const f of clobberArtifacts)
    violations.push(`${f} is tracked but inert (it is a committed git-lfs clobber artifact; \`git rm\` it — husky regenerates .husky/_/ locally)`);
}

// ── Check 7 — runtime guard: hooksPath=.husky/_ with a clobbered delegator ──
// Local-only. On a fresh CI checkout .husky/_/ does not exist yet (husky runs
// at install time) — in that case this check is a no-op, the tracked-tree
// checks 1-6 already prove the layout is correct.
{
  let hooksPath = '';
  try {
    hooksPath = execSync('git config core.hooksPath', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    hooksPath = '';
  }
  const usesUnderscore = /(^|[/\\])\.husky[/\\]_$/.test(hooksPath) || hooksPath === '.husky/_';
  const underscoreDir = path.join(huskyDir, '_');
  if (usesUnderscore && fs.existsSync(underscoreDir)) {
    for (const hook of ['pre-push', 'post-checkout', 'post-commit', 'post-merge']) {
      const txt = read(path.join(underscoreDir, hook));
      if (txt === null) continue;
      if (lfsChain(hook).test(txt) && !txt.includes(MARKER))
        violations.push(
          `core.hooksPath="${hooksPath}" AND .husky/_/${hook} is a bare git-lfs wrapper — the ${hook} gate is severed RIGHT NOW. Run \`pnpm prepare\` to re-pin hooksPath=.husky and purge it.`,
        );
    }
  }
}

if (violations.length > 0) {
  console.error('[sentinel:husky-lfs-integrity] FAIL:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error('[sentinel:husky-lfs-integrity] Fix: re-chain `git lfs <hook>` inside the tracked .husky/<hook> files');
  console.error('[sentinel:husky-lfs-integrity] (see scripts/install-git-lfs-hooks.mjs). NEVER run `git lfs install` against core.hooksPath=.husky.');
  process.exit(1);
}

console.log('[sentinel:husky-lfs-integrity] PASS — husky gates intact, git-lfs chained, no clobber detected');
process.exit(0);
