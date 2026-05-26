#!/usr/bin/env node
// @ts-check
/**
 * web-domain-canonical sentinel.
 *
 * The canonical, OWNED public domain for Musaium is `musaium.com`
 * (museum-web `NEXT_PUBLIC_SITE_URL`). `musaium.app` is NOT owned — shipping it
 * in user-facing web content (notably the EAA accessibility-statement contact
 * email) advertises an unreachable feedback channel, a conformance defect under
 * Directive (EU) 2019/882 §6.
 *
 * Why this sentinel exists: a 2026-05-14 fix corrected the markdown statements
 * (`docs/legal/accessibility-statement-{en,fr}.md`) but MISSED the rendered TS
 * content (`museum-web/src/lib/accessibility-content.ts`) that users actually
 * see (CHANGELOG 2026-05-14). The unit test guards that one file; this sentinel
 * guards the whole user-facing surface so a NEW file can't reintroduce the
 * non-owned domain.
 *
 * Scans application source across ALL three apps (not just web) for the literal
 * `musaium.app` — backend outbound User-Agents / contact emails, frontend i18n
 * share footers (user-facing!), and web surfaces. The C11 sweep (2026-05-26)
 * found musaium.app pervasive beyond the web accessibility page.
 *
 * Usage: `node web-domain-canonical.mjs [--root <repoRoot>]`
 * Exit codes:
 *   0 → no non-owned domain in scanned application source
 *   1 → ≥1 occurrence of musaium.app detected
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Non-owned domain that must never appear in user-facing web content. */
const FORBIDDEN = /musaium\.app(?![a-zA-Z])/;

/** File extensions that can carry user-facing strings. */
const SCANNED_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.txt',
  '.md',
  '.mdx',
  '.html',
  '.css',
]);

/** Directories never worth scanning. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  '.turbo',
  '__tests__',
  'e2e',
]);

/**
 * Test files legitimately reference the forbidden domain to assert its absence
 * (e.g. `expect(...).not.toContain('musaium.app')`). They are not user-facing
 * content, so exclude them to avoid a self-defeating false positive.
 */
function isTestFile(name) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = args[i + 1];
      i++;
    }
  }
  if (root === null) {
    root = resolve(__dirname, '../../..');
  }
  return { root };
}

/** Recursively collect scannable files under `dir`. */
function walk(dir, acc) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, acc);
    } else if (SCANNED_EXT.has(extname(entry)) && !isTestFile(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function scanFile(path, root) {
  const issues = [];
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (FORBIDDEN.test(lines[i])) {
      issues.push(
        `${relative(root, path)}:${i + 1} — non-owned domain "musaium.app" (use musaium.com)`,
      );
    }
  }
  return issues;
}

function emitReport(issues) {
  const lines = ['## Sentinel report — web-domain-canonical', ''];
  if (issues.length === 0) {
    lines.push('PASS — scanned application source uses the owned domain only.');
  } else {
    lines.push(`FAIL — ${issues.length} occurrence(s) of the non-owned domain musaium.app:`);
    for (const issue of issues) lines.push(`- ${issue}`);
    lines.push('');
    lines.push('Fix: replace musaium.app with the canonical owned domain musaium.com.');
  }
  process.stderr.write(lines.join('\n') + '\n');
}

function main() {
  const { root } = parseArgs(process.argv);
  const targets = [
    join(root, 'museum-backend', 'src'),
    join(root, 'museum-frontend', 'features'),
    join(root, 'museum-frontend', 'shared'),
    join(root, 'museum-frontend', 'app'),
    join(root, 'museum-frontend', 'components'),
    join(root, 'museum-web', 'src'),
    join(root, 'museum-web', 'public'),
  ];
  const files = [];
  for (const t of targets) {
    if (existsSync(t)) walk(t, files);
  }
  const issues = files.flatMap((f) => scanFile(f, root));
  emitReport(issues);
  process.exit(issues.length === 0 ? 0 : 1);
}

main();
