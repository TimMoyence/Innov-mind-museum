#!/usr/bin/env node
/**
 * Sentinel: integration-gate-discipline  (STREAM H9 — dark integration suites)
 *
 * Guards against an integration test that runs in NO CI job because its enable
 * gate keys ONLY on `process.env.RUN_E2E === 'true'`. The CI integration job
 * sets `RUN_INTEGRATION=true` (NOT `RUN_E2E`), and the e2e job path-excludes
 * `tests/integration/`. So a `tests/integration/**` suite gated purely on
 * `RUN_E2E` is silently SKIPPED everywhere: it boots no testcontainer, asserts
 * nothing, and never goes red — a dark suite that gives false coverage.
 *
 * Four such files were found dark on 2026-06-14 (user-memory-recent-sessions,
 * user-memory-personalization, post-message-c2-enrichment, db-resilience) and
 * fixed to the correct OR pattern used by their siblings, e.g.
 * `tests/integration/auth/deleteAccount-cascade.int.test.ts:35`:
 *
 *   const shouldRun = process.env.RUN_E2E === 'true'
 *                  || process.env.RUN_INTEGRATION === 'true';
 *
 * Rule (precise, zero-false-positive):
 *   For each file under `tests/integration/**`, IF it references
 *   `process.env.RUN_E2E` it MUST also reference `RUN_INTEGRATION` (so the
 *   integration CI job can actually enable it). A file that references neither
 *   is NOT flagged (it is unconditional, or gated on some other capability).
 *
 * Pure-Node text scan. No AST dep.
 * Exit 0 = every gated integration file also honours RUN_INTEGRATION.
 * Exit 1 = at least one integration file gates on RUN_E2E without RUN_INTEGRATION.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(__dirname, '..', '..');
const INTEGRATION_DIR = join(BACKEND_ROOT, 'tests', 'integration');

// `process.env.RUN_E2E` (with the env prefix) — the dark-gate signal.
const RUN_E2E_RE = /process\.env\.RUN_E2E\b/;
// `RUN_INTEGRATION` anywhere — the arm the CI integration job actually sets.
const RUN_INTEGRATION_RE = /\bRUN_INTEGRATION\b/;

// No allowlist — every `tests/integration/**` suite gated on RUN_E2E MUST also
// honour RUN_INTEGRATION. There is no legitimate reason to gate an integration
// test on RUN_E2E only (it would run in no CI job). The four dark suites found
// on 2026-06-14 plus tests/integration/security/idor-matrix.test.ts were all
// fixed to the OR pattern; this sentinel keeps it that way with zero exceptions.

function walk(dir, predicate) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(entry.name)) out.push(full);
  }
  return out;
}

function main() {
  const files = walk(INTEGRATION_DIR, (n) => n.endsWith('.ts'));
  const violations = [];
  let gatedCount = 0;

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!RUN_E2E_RE.test(src)) continue; // not RUN_E2E-gated — nothing to enforce
    gatedCount += 1;
    if (RUN_INTEGRATION_RE.test(src)) continue; // honours the integration job — OK
    violations.push(relative(BACKEND_ROOT, file));
  }

  console.log(`[integration-gate-discipline] scanned ${String(files.length)} integration test file(s), ${String(gatedCount)} reference process.env.RUN_E2E`);

  if (violations.length) {
    console.error('\n[integration-gate-discipline] ✗ integration test file(s) gate on process.env.RUN_E2E WITHOUT RUN_INTEGRATION — they run in NO CI job (dark suite, silent false coverage):');
    for (const v of violations) {
      console.error(`  • ${v}`);
    }
    console.error('\n  Fix: gate with the OR pattern so the CI integration job can enable it:');
    console.error("    const shouldRun = process.env.RUN_E2E === 'true' || process.env.RUN_INTEGRATION === 'true';");
    console.error('  (sibling reference: tests/integration/auth/deleteAccount-cascade.int.test.ts:35)');
    process.exit(1);
  }

  console.log('[integration-gate-discipline] ✓ every RUN_E2E-gated integration file also honours RUN_INTEGRATION');
  process.exit(0);
}

main();
