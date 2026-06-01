#!/usr/bin/env node
// @ts-check
/**
 * Sentinel: ai-tests-count
 *
 * AUDIT-ONLY ratchet on the integration-LLM test suite (`museum-backend/
 * tests/ai/**\/*.ts`). Locks the floor: deleting tests without an explicit
 * PR-reviewed bump to MIN_TOTAL_AI_TESTS becomes a sentinel failure.
 *
 * Why this exists (and not a Jest coverage threshold):
 *   The `ai-tests` CI job runs `tests/ai/` in isolation (gated on
 *   workflow_dispatch / schedule, because real OpenAI calls cost tokens).
 *   Jest's global coverage thresholds (88/74/89/86) are designed for the
 *   FULL sharded suite — mathematically unreachable from a 19-test subset.
 *   Applying them to the isolated run measured nothing meaningful and
 *   was failing the job by construction. Removing the misapplied threshold
 *   is not a bypass — it's correcting a misplaced check. This sentinel
 *   takes over the "lock what these tests do" role, with a granularity
 *   that fits an integration-LLM suite (count ratchet, not coverage %).
 *
 * What it does NOT protect against (honest limits):
 *   - A capability removal masked by adding duplicate tests elsewhere
 *     (e.g., drop all 5 vision tests, add 5 redundant guardrail-live
 *     tests → total stays ≥19, sentinel passes). The Mid-granularity
 *     option (per-file count) would catch that; the project chose Loose
 *     here for minimal maintenance overhead. If a capability is dropped
 *     deliberately, PR review is the human gate.
 *
 * Run: pnpm sentinel:ai-tests-count  (exit 0 = pass, 1 = regression)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AI_TESTS_DIR = resolve(__dirname, '../../tests/ai');

/**
 * Frozen floor — bump deliberately when adding new ai-tests (and never
 * decrement without a PR that documents the capability removal).
 *
 * 2026-06-01 — bumped 19 → 49 after adding the comprehensive real-LLM
 * conversation test matrix (vision-matrix / guardrail-matrix /
 * conversation-matrix .ai.test.ts), which locks the chat AI behavior
 * end-to-end through the full pipeline (V1 keyword guardrail → input
 * sanitize → LLM vision/text → output guardrail). The 3 new files add 25
 * real `it()` test blocks on top of the original 19 (44 actual tests); the
 * sentinel's tolerant matcher additionally counts a few `it(`-shaped tokens
 * in helper code, and reports 49 total for the current tree. Pin to that.
 *
 * 2026-06-01 (b) — bumped 49 → 79 after the exhaustive-catalog expansion
 * (CHAT_BEHAVIOR_CATALOG.md, 180 behaviors). Adds a new geo-matrix.ai.test.ts
 * (in-museum anchoring / nearby-museum proximity / GDPR consent floor via an
 * injected deterministic LocationResolver + real LLM) plus more IMAGE cases
 * (sculpture / person-privacy / image+off-topic), multilingual fidelity
 * (ES/DE), meta-capability, voice-mode prose, multi-subject, and DET
 * multilingual insult/injection blocks (DE/JA/AR/FR/ZH) verified against the
 * real INSULT_KEYWORDS / INJECTION_PATTERNS lists. Current tree = 79 it()
 * blocks across 8 files.
 */
const MIN_TOTAL_AI_TESTS = 79;

/**
 * Matches: it(, test(, it.skip(, it.only(, it.each(`...`)(, it.todo(,
 *          fit(, xit(, fdescribe.it( etc.
 * Anchored on word boundary so `await this.unit(` etc. are not counted.
 */
const TEST_BLOCK_RE = /\b(?:it|test|fit|xit)\s*(?:\.[a-zA-Z]+(?:\s*\([^)]*\))?)?\s*\(/g;

/**
 * @param {string} dir
 * @returns {string[]} Absolute paths to `.test.ts` / `.spec.ts` files (recursive).
 */
function findTestFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...findTestFiles(full));
    } else if (/\.(test|spec)\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {string} src
 * @returns {number}
 */
function countTestBlocks(src) {
  // Strip line + block comments so commented-out `it(` don't inflate the count.
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const matches = stripped.match(TEST_BLOCK_RE);
  return matches ? matches.length : 0;
}

const files = findTestFiles(AI_TESTS_DIR).sort();

if (files.length === 0) {
  console.error('[sentinel:ai-tests-count] FAIL — no test files found under tests/ai/');
  console.error(`  scanned: ${AI_TESTS_DIR}`);
  process.exit(1);
}

let total = 0;
/** @type {{ file: string; count: number }[]} */
const perFile = [];
for (const file of files) {
  const count = countTestBlocks(readFileSync(file, 'utf8'));
  total += count;
  perFile.push({ file: file.replace(`${AI_TESTS_DIR}/`, ''), count });
}

if (total < MIN_TOTAL_AI_TESTS) {
  console.error(
    `[sentinel:ai-tests-count] FAIL — ${total} < ${MIN_TOTAL_AI_TESTS} (MIN_TOTAL_AI_TESTS)`,
  );
  console.error('');
  console.error('  Per-file breakdown:');
  for (const { file, count } of perFile) {
    console.error(`    ${file}: ${count}`);
  }
  console.error('');
  console.error('  ai-tests are the integration-LLM contract for V1 (vision, guardrail,');
  console.error('  conversation context, text generation). If you intentionally dropped a');
  console.error('  test, update MIN_TOTAL_AI_TESTS in this script in the same PR and');
  console.error('  justify the removal in the commit message.');
  process.exit(1);
}

console.log(
  `[sentinel:ai-tests-count] PASS — ${total} it() blocks across ${files.length} file(s), floor = ${MIN_TOTAL_AI_TESTS}.`,
);
