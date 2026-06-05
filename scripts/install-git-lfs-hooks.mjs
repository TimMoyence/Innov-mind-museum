#!/usr/bin/env node
/**
 * install-git-lfs-hooks — make the husky × git-lfs hook chain clobber-proof.
 *
 * Run by the root `prepare` script
 * (`husky && node scripts/install-git-lfs-hooks.mjs`) so EVERY `npm/pnpm
 * install` re-establishes a layout that survives both `husky` and a future
 * `git lfs install`, WITHOUT ever calling `git lfs install` ourselves.
 *
 * ── Why this is needed (verified against husky@9.1.7 source) ────────────────
 * `husky` (the `prepare` step) does `git config core.hooksPath .husky/_` and
 * writes 39-byte delegator wrappers `.husky/_/<hook>` that `. "$(dirname)/h"`
 * → which runs the real `.husky/<hook>` (our gates). A subsequent
 * `git lfs install` writes its own 4 hooks into whatever core.hooksPath points
 * at — so when hooksPath is `.husky/_` it OVERWRITES the husky delegators with
 * bare `git lfs <hook>` wrappers, severing the chain to `.husky/pre-push` (the
 * 21-gate). That is exactly the silent UFR-020 regression we are guarding.
 *
 * ── What this script does (idempotent, exit 0 always) ───────────────────────
 *   1. Pin `core.hooksPath = .husky` (overriding husky's `.husky/_`). git then
 *      runs the tracked `.husky/<hook>` directly — no delegator to clobber, and
 *      a future `git lfs install` would land on `.husky/<hook>` where the
 *      husky-lfs-integrity sentinel detects it.
 *   2. Purge any bare git-lfs wrapper that a prior `git lfs install` left in
 *      `.husky/_/` (they are inert once hooksPath=.husky, but removing them
 *      prevents a relapse if hooksPath ever falls back to `.husky/_`).
 *   3. Self-heal: if a tracked `.husky/<hook>` has the Musaium marker but lost
 *      its `git lfs <hook>` chain, re-append the non-fatal LFS block.
 *
 * Never reconstructs gate logic; never runs `git lfs install`; safe when
 * git-lfs is not installed (only edits config + shell text).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const huskyDir = path.join(repoRoot, '.husky');
const underscoreDir = path.join(huskyDir, '_');

const MARKER = 'husky-lfs-integrity: musaium-gate';
const HOOKS = ['pre-push', 'post-checkout', 'post-commit', 'post-merge'];

function lfsBlock(hook) {
  return [
    '',
    `# ─── Git LFS (self-healed by scripts/install-git-lfs-hooks.mjs) ───`,
    `if command -v git-lfs >/dev/null 2>&1; then`,
    `  git lfs ${hook} "$@"`,
    `fi`,
    '',
  ].join('\n');
}

function isBareLfsWrapper(txt, hook) {
  // git-lfs writes a tiny (<400B) wrapper whose only command is `git lfs <hook>`
  return new RegExp(`git\\s+lfs\\s+${hook}\\b`).test(txt) && !txt.includes(MARKER);
}

// ── Step 1 — pin core.hooksPath to .husky (override husky's .husky/_) ────────
try {
  const cur = execFileSync('git', ['config', 'core.hooksPath'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  // accept either the relative `.husky` or an absolute path ending in /.husky
  if (cur !== '.husky' && !/[/\\]\.husky$/.test(cur)) {
    execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: repoRoot });
    console.log(`[install-git-lfs-hooks] pinned core.hooksPath = .husky (was "${cur || 'unset'}")`);
  }
} catch (e) {
  console.warn(`[install-git-lfs-hooks] WARN could not read/set core.hooksPath (${e.message}) — continuing.`);
}

// ── Step 2 — purge bare git-lfs wrappers left under .husky/_/ ─────────────────
try {
  if (fs.existsSync(underscoreDir)) {
    for (const hook of HOOKS) {
      const p = path.join(underscoreDir, hook);
      if (!fs.existsSync(p)) continue;
      const txt = fs.readFileSync(p, 'utf8');
      if (isBareLfsWrapper(txt, hook)) {
        fs.rmSync(p, { force: true });
        console.log(`[install-git-lfs-hooks] purged inert git-lfs wrapper .husky/_/${hook}`);
      }
    }
  }
} catch (e) {
  console.warn(`[install-git-lfs-hooks] WARN purge of .husky/_/ failed (${e.message}) — continuing.`);
}

// ── Step 3 — self-heal the LFS chain inside the tracked .husky/<hook> files ──
let changed = 0;
for (const hook of HOOKS) {
  const p = path.join(huskyDir, hook);
  if (!fs.existsSync(p)) {
    console.warn(`[install-git-lfs-hooks] WARN .husky/${hook} missing — not recreated (the sentinel will flag it).`);
    continue;
  }
  const txt = fs.readFileSync(p, 'utf8');
  if (new RegExp(`git\\s+lfs\\s+${hook}\\b`).test(txt)) continue; // already chained — no-op
  if (!txt.includes(MARKER)) {
    console.warn(
      `[install-git-lfs-hooks] WARN .husky/${hook} lacks the marker AND the LFS chain — leaving untouched (looks clobbered; the sentinel will flag it).`,
    );
    continue;
  }
  fs.writeFileSync(p, `${txt.replace(/\n*$/, '\n')}${lfsBlock(hook)}`);
  console.log(`[install-git-lfs-hooks] healed .husky/${hook} — re-appended \`git lfs ${hook}\` chain.`);
  changed += 1;
}

if (changed === 0) console.log('[install-git-lfs-hooks] OK — husky × git-lfs chain intact.');
process.exit(0);
