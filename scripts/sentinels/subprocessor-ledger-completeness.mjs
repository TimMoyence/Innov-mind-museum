#!/usr/bin/env node
// @ts-check
/**
 * subprocessor-ledger-completeness sentinel (COMP-03 / COMP-08).
 *
 * GDPR Art 28/30: every third-party processor reachable from production code
 * must appear in docs/compliance/SUBPROCESSORS.md. The existing
 * privacy-content-drift sentinel only checks public surfaces ↔ canonical JSON;
 * it never checks code ↔ Art 28 ledger, which let Langfuse + CARTO ship
 * undocumented (COMP-03).
 *
 * This guard binds a curated set of vendor host-markers to their ledger vendor
 * name: if a marker appears anywhere in the scanned application source, the
 * ledger MUST mention the vendor. Extend VENDOR_HOSTS when adding any outbound
 * processor (the ledger's own §93 verification protocol).
 *
 * Usage: node subprocessor-ledger-completeness.mjs [--root <repoRoot>]
 * Exit codes: 0 → ledger covers every detected vendor · 1 → ≥1 gap.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Curated vendor map. `marker` = a string that, if present in code, proves the
 * vendor is reachable; `vendor` = the name that must appear in the ledger;
 * `scan` = source roots (relative to repo root) to search for the marker.
 */
const VENDOR_HOSTS = [
  { marker: 'cloud.langfuse.com', vendor: 'Langfuse', scan: ['museum-backend/src'] },
  { marker: 'langfuse.client', vendor: 'Langfuse', scan: ['museum-backend/src'] },
  { marker: 'cartocdn.com', vendor: 'CARTO', scan: ['museum-frontend/features', 'museum-web/src'] },
];

const SCANNED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo', '__tests__']);
const LEDGER = 'docs/compliance/SUBPROCESSORS.md';

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = args[i + 1];
      i++;
    }
  }
  return { root: root ?? resolve(__dirname, '../..') };
}

function walk(dir, acc) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, acc);
    } else if (SCANNED_EXT.has(extname(entry)) && !/\.(test|spec)\./.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function markerPresent(marker, scanRoots, repo) {
  for (const r of scanRoots) {
    for (const file of walk(join(repo, r), [])) {
      if (readFileSync(file, 'utf8').includes(marker)) return true;
    }
  }
  return false;
}

function main() {
  const { root } = parseArgs(process.argv);
  const ledgerPath = join(root, LEDGER);
  if (!existsSync(ledgerPath)) {
    process.stderr.write(`## subprocessor-ledger-completeness\n\nFAIL — ledger not found: ${LEDGER}\n`);
    process.exit(1);
  }
  const ledger = readFileSync(ledgerPath, 'utf8').toLowerCase();

  const gaps = [];
  const seen = new Set();
  for (const { marker, vendor, scan } of VENDOR_HOSTS) {
    if (seen.has(`${vendor}`)) continue;
    if (markerPresent(marker, scan, root) && !ledger.includes(vendor.toLowerCase())) {
      gaps.push(`${vendor} reachable in code (marker "${marker}") but absent from ${LEDGER}`);
      seen.add(vendor);
    }
  }

  const lines = ['## subprocessor-ledger-completeness', ''];
  if (gaps.length === 0) {
    lines.push('PASS — every detected vendor is documented in the Art 28 ledger.');
  } else {
    lines.push(`FAIL — ${gaps.length} undocumented sub-processor(s):`);
    for (const g of gaps) lines.push(`- ${g}`);
    lines.push('', 'Add an Art 28 row to docs/compliance/SUBPROCESSORS.md (host, data classes,');
    lines.push('lawful basis, transfer mechanism, DPA).');
  }
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(gaps.length === 0 ? 0 : 1);
}

main();
