#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN = /musaium\.app(?![a-zA-Z])/;

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

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  '.turbo',
  '__tests__',
  'e2e',
]);

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
