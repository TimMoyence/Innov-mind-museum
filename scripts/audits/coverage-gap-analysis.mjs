#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 8 audit: parses lcov coverage outputs from BE + FE and emits a
 * markdown gap-analysis doc.
 *
 * For each file:
 *   - lines covered / total
 *   - branches covered / total
 *   - whether file is in Phase 4 hot-files registry
 *
 * Output: per-app, sorted by uncovered-line count descending. Top-N
 * shows highest-ROI uplift candidates.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..', '..');

function parseLcov(path) {
  let lcov;
  try {
    lcov = readFileSync(path, 'utf-8');
  } catch (err) {
    return [];
  }
  const out = [];
  let cur = null;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('SF:')) cur = { file: line.slice(3), lf: 0, lh: 0, bf: 0, bh: 0, fnf: 0, fnh: 0 };
    else if (line.startsWith('LF:') && cur) cur.lf = Number(line.slice(3));
    else if (line.startsWith('LH:') && cur) cur.lh = Number(line.slice(3));
    else if (line.startsWith('BRF:') && cur) cur.bf = Number(line.slice(4));
    else if (line.startsWith('BRH:') && cur) cur.bh = Number(line.slice(4));
    else if (line.startsWith('FNF:') && cur) cur.fnf = Number(line.slice(4));
    else if (line.startsWith('FNH:') && cur) cur.fnh = Number(line.slice(4));
    else if (line === 'end_of_record' && cur) {
      out.push(cur);
      cur = null;
    }
  }
  return out;
}

function pct(hit, total) {
  if (total === 0) return 100;
  return (hit / total) * 100;
}

function loadHotFiles() {
  try {
    const reg = JSON.parse(readFileSync(resolve(ROOT, 'museum-backend/.stryker-hot-files.json'), 'utf-8'));
    return new Set(reg.hotFiles.map((e) => e.path));
  } catch {
    return new Set();
  }
}

function formatApp(name, lcovPath, hotFiles, target) {
  const records = parseLcov(lcovPath);
  if (records.length === 0) return `## ${name}\n\n_No lcov found at ${lcovPath} — run \`pnpm test:coverage\` first._\n`;

  const totals = records.reduce(
    (acc, r) => ({
      lf: acc.lf + r.lf, lh: acc.lh + r.lh,
      bf: acc.bf + r.bf, bh: acc.bh + r.bh,
      fnf: acc.fnf + r.fnf, fnh: acc.fnh + r.fnh,
    }),
    { lf: 0, lh: 0, bf: 0, bh: 0, fnf: 0, fnh: 0 },
  );

  const lines = [`## ${name}`, ''];
  lines.push(`**Globals:** lines ${pct(totals.lh, totals.lf).toFixed(2)}% (target ${target.lines}) | branches ${pct(totals.bh, totals.bf).toFixed(2)}% (target ${target.branches}) | functions ${pct(totals.fnh, totals.fnf).toFixed(2)}% (target ${target.functions})`);
  lines.push('');
  lines.push('### Top 30 files by uncovered-line count');
  lines.push('');
  lines.push('| File | Lines | Branches | Functions | Hot? |');
  lines.push('|---|---|---|---|---|');
  records
    .map((r) => ({ ...r, uncovered: r.lf - r.lh }))
    .sort((a, b) => b.uncovered - a.uncovered)
    .slice(0, 30)
    .forEach((r) => {
      const rel = r.file.replace(ROOT + '/', '').replace('museum-backend/', '').replace('museum-frontend/', '');
      const hot = hotFiles.has(rel) || hotFiles.has(r.file.replace(ROOT + '/', ''));
      lines.push(
        `| ${rel} | ${r.lh}/${r.lf} (${pct(r.lh, r.lf).toFixed(0)}%) | ${r.bh}/${r.bf} (${pct(r.bh, r.bf).toFixed(0)}%) | ${r.fnh}/${r.fnf} (${pct(r.fnh, r.fnf).toFixed(0)}%) | ${hot ? '🔥' : ''} |`,
      );
    });
  lines.push('');
  return lines.join('\n');
}

function main() {
  const hotFiles = loadHotFiles();
  const beLcov = resolve(ROOT, 'museum-backend/coverage/lcov.info');
  const feLcov = resolve(ROOT, 'museum-frontend/coverage/lcov.info');

  const out = [
    '# Phase 8 — Coverage Gap Analysis',
    '',
    `_Generated 2026-05-01 by scripts/audits/coverage-gap-analysis.mjs_`,
    '',
    formatApp('museum-backend', beLcov, hotFiles, { lines: 90, branches: 78, functions: 85 }),
    formatApp('museum-frontend', feLcov, hotFiles, { lines: 90, branches: 80, functions: 80 }),
    '## Recommendations',
    '',
    '1. **Hot files (🔥)** are highest priority — Phase 4 Stryker registry overlap.',
    '2. **Top-uncovered services / use-cases** next.',
    '3. **Skip** generated code, migrations, type-only files.',
    '4. **Banking-grade rule**: every new test must pin a named regression. NO cosmetic tests.',
    '',
  ].join('\n');

  const outPath = resolve(ROOT, 'docs/audits/2026-05-01-coverage-gaps.md');
  writeFileSync(outPath, out);
  console.log(`Wrote ${outPath}`);
}

main();
