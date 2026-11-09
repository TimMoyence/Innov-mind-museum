#!/usr/bin/env node
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
  return new RegExp(`git\\s+lfs\\s+${hook}\\b`).test(txt) && !txt.includes(MARKER);
}

try {
  const cur = execFileSync('git', ['config', 'core.hooksPath'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  if (cur !== '.husky' && !/[/\\]\.husky$/.test(cur)) {
    execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: repoRoot });
    console.log(`[install-git-lfs-hooks] pinned core.hooksPath = .husky (was "${cur || 'unset'}")`);
  }
} catch (e) {
  console.warn(`[install-git-lfs-hooks] WARN could not read/set core.hooksPath (${e.message}) — continuing.`);
}

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

let changed = 0;
for (const hook of HOOKS) {
  const p = path.join(huskyDir, hook);
  if (!fs.existsSync(p)) {
    console.warn(`[install-git-lfs-hooks] WARN .husky/${hook} missing — not recreated (the sentinel will flag it).`);
    continue;
  }
  const txt = fs.readFileSync(p, 'utf8');
  if (new RegExp(`git\\s+lfs\\s+${hook}\\b`).test(txt)) continue;
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
