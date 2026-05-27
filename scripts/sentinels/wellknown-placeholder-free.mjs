#!/usr/bin/env node
// @ts-check
/**
 * wellknown-placeholder-free sentinel — DEPLOY GATE.
 *
 * The RFC 9116 security.txt advertises an `Encryption:` channel pointing at
 * `/.well-known/pgp-key.txt`. Until the real keypair is generated
 * (docs/operations/PGP_KEY_GENERATION.md), that file ships a placeholder body
 * `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP`. Shipping it to production publishes an
 * empty/broken encrypted-disclosure channel — a "negligent vendor" signal and
 * a broken RFC 9116 promise. The file's own header even claims "the deploy
 * pipeline rejects this file if the body still contains the literal token" —
 * this sentinel makes that promise true.
 *
 * Scans every file under a `.well-known` directory for forbidden placeholder
 * markers. Intended to run in the museum-web **deploy** job only (the
 * placeholder is legitimate in dev/PR until the human generates the key).
 *
 * Usage:
 *   node wellknown-placeholder-free.mjs [--dir <wellKnownDir>] [--root <repoRoot>]
 * Defaults to <repoRoot>/museum-web/public/.well-known.
 *
 * Exit codes:
 *   0 → no placeholder markers — safe to ship
 *   1 → ≥1 placeholder marker detected (or target dir missing)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Forbidden markers (case-insensitive substring). Catches the canonical PGP
 * placeholder plus any generic DO_NOT_SHIP / PLACEHOLDER_DO_NOT_SHIP token a
 * future .well-known stub might use.
 */
const FORBIDDEN_MARKERS = [/PGP_KEY_PLACEHOLDER_DO_NOT_SHIP/i, /PLACEHOLDER_DO_NOT_SHIP/i, /DO_NOT_SHIP/i];

function parseArgs(argv) {
  const args = argv.slice(2);
  let dir = null;
  let root = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      dir = args[i + 1];
      i++;
    } else if (args[i] === '--root' && args[i + 1]) {
      root = args[i + 1];
      i++;
    }
  }
  if (root === null) root = resolve(__dirname, '../..');
  if (dir === null) dir = join(root, 'museum-web', 'public', '.well-known');
  return { dir };
}

/** Recursively collect all files under `dir`. */
function walk(dir, acc) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

function scanFile(path, base) {
  const issues = [];
  const lines = readFileSync(path, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const marker of FORBIDDEN_MARKERS) {
      if (marker.test(lines[i])) {
        issues.push(`${relative(base, path)}:${i + 1} — placeholder marker (${marker.source})`);
        break;
      }
    }
  }
  return issues;
}

function emitReport(issues, dir) {
  const lines = ['## Sentinel report — wellknown-placeholder-free', ''];
  if (issues.length === 0) {
    lines.push('PASS — no placeholder markers in .well-known — safe to ship.');
  } else {
    lines.push(`FAIL — ${issues.length} placeholder marker(s) in .well-known:`);
    for (const issue of issues) lines.push(`- ${issue}`);
    lines.push('');
    lines.push('Resolve before prod deploy: generate the real key per');
    lines.push('docs/operations/PGP_KEY_GENERATION.md, OR remove the broken');
    lines.push('`Encryption:` pointer from security.txt until a key exists.');
  }
  void dir;
  process.stderr.write(lines.join('\n') + '\n');
}

function main() {
  const { dir } = parseArgs(process.argv);
  if (!existsSync(dir)) {
    process.stderr.write(
      `## Sentinel report — wellknown-placeholder-free\n\nFAIL — target directory not found: ${dir}\n`,
    );
    process.exit(1);
  }
  const issues = walk(dir, []).flatMap((f) => scanFile(f, dir));
  emitReport(issues, dir);
  process.exit(issues.length === 0 ? 0 : 1);
}

main();
