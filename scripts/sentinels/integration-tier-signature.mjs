#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * ADR-012 §4.2 tier-signature sentinel.
 *
 * Walks museum-backend/tests/integration/, reads each *.test.ts, and asserts
 * the file imports a real-infra signature (DB testcontainer, DataSource, or
 * a real outbound network call). Files explicitly listed in the baseline JSON
 * are exempted with a documented reason.
 *
 * Exit codes:
 *   0 — all files match the rule (or are baselined)
 *   1 — at least one file violates the rule
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..', '..');
const INTEGRATION_DIR = resolve(REPO_ROOT, 'museum-backend/tests/integration');
const BASELINE_PATH = resolve(__dirname, '.integration-tier-baseline.json');

const REAL_INTEGRATION_PATTERNS = [
  /from ['"]tests\/helpers\/(e2e|integration)\/(postgres-testcontainer|integration-harness|e2e-app-harness)['"]/,
  /from ['"]tests\/helpers\/integration\/[^'"]+['"]/,
  /\bDataSource\b[\s\S]{0,200}?from ['"]typeorm['"]/,
  /\bgetRepository\s*\(/,
  /\bfetch\s*\(\s*['"`]https?:/,
  /\baxios\.(get|post|put|delete|patch)\s*\(/,
];

function listTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

function fileMatchesTierSignature(content) {
  return REAL_INTEGRATION_PATTERNS.some((re) => re.test(content));
}

function loadBaseline() {
  try {
    const raw = readFileSync(BASELINE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return new Set((parsed.exempt ?? []).map((e) => e.path));
  } catch {
    return new Set();
  }
}

function main() {
  const files = listTsFiles(INTEGRATION_DIR);
  const baseline = loadBaseline();
  const offenders = [];

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    if (baseline.has(rel)) continue;
    const content = readFileSync(file, 'utf-8');
    if (!fileMatchesTierSignature(content)) {
      offenders.push(rel);
    }
  }

  if (offenders.length > 0) {
    console.error('ADR-012 tier-signature violations:');
    for (const f of offenders) {
      console.error(`  - ${f}`);
    }
    console.error('');
    console.error('Each file under tests/integration/ MUST import either:');
    console.error('  - tests/helpers/integration/integration-harness, OR');
    console.error('  - tests/helpers/e2e/postgres-testcontainer, OR');
    console.error('  - tests/helpers/e2e/e2e-app-harness, OR');
    console.error('  - a real DataSource / getRepository against TypeORM, OR');
    console.error('  - issue a real outbound fetch/axios call');
    console.error('');
    console.error('If a file legitimately belongs in tests/integration/ without');
    console.error('crossing an infra boundary (e.g., Express smoke), add an entry');
    console.error('to scripts/sentinels/.integration-tier-baseline.json with a reason.');
    process.exit(1);
  }

  console.log(
    `OK — ${files.length} integration files comply with ADR-012 §4.2 (${baseline.size} baselined).`,
  );
  process.exit(0);
}

main();
