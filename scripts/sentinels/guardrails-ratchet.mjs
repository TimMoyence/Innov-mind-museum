#!/usr/bin/env node
/**
 * Sentinel: guardrails-ratchet
 *
 * Counts pattern entries declared in the chat art-topic guardrail
 * (museum-backend/src/modules/chat/useCase/guardrail/art-topic-guardrail.ts)
 * and asserts the total never drops below the committed baseline.
 *
 * The count is derived from quoted-string entries inside the four arrays:
 *   INSULT_KEYWORDS, INJECTION_PATTERNS, OFF_TOPIC_KEYWORDS, UNSAFE_OUTPUT_*
 * and is approximated by counting top-level string literals between
 * `const <NAME> = [` and the closing `]`.
 *
 * Baseline: scripts/sentinels/guardrails-baseline.json (commit it).
 * On first run with no baseline, the script writes one and exits 0 with an
 * ACTION REQUIRED notice.
 *
 * Exit 0 = pass / 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const target = path.join(
  repoRoot,
  'museum-backend',
  'src',
  'modules',
  'chat',
  'useCase',
  'guardrail',
  'art-topic-guardrail.ts',
);
const baselinePath = path.join(__dirname, 'guardrails-baseline.json');

if (!fs.existsSync(target)) {
  console.error(`[sentinel:guardrails-ratchet] FAIL: ${target} missing`);
  process.exit(1);
}

const text = fs.readFileSync(target, 'utf8');

// Count quoted string entries in any `const FOO = [ ... ]` block whose name
// is fully uppercase (the convention for guardrail keyword arrays).
const arrayBlockRe = /const\s+([A-Z_]+)\s*=\s*\[([\s\S]*?)\];/g;
let total = 0;
const perArray = {};
for (const m of text.matchAll(arrayBlockRe)) {
  const name = m[1];
  const body = m[2];
  // Count single-quoted or double-quoted top-level entries.
  const matches = body.match(/(['"])(?:(?!\1).)*\1/g) ?? [];
  perArray[name] = matches.length;
  total += matches.length;
}

if (total === 0) {
  console.error(
    '[sentinel:guardrails-ratchet] FAIL: no keyword arrays detected — file shape changed unexpectedly.',
  );
  process.exit(1);
}

if (!fs.existsSync(baselinePath)) {
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        _comment:
          'Minimum allowed guardrail keyword count. The ratchet only allows the count to go UP. Lower the bar manually only when intentionally pruning keywords.',
        total,
        perArray,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[sentinel:guardrails-ratchet] PASS — baseline created (total=${total})`);
  console.log('[sentinel:guardrails-ratchet] ACTION REQUIRED: commit scripts/sentinels/guardrails-baseline.json');
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

if (total < baseline.total) {
  console.error(
    `[sentinel:guardrails-ratchet] FAIL: keyword count dropped (${baseline.total} -> ${total}). Guardrail surface shrank.`,
  );
  console.error(
    `[sentinel:guardrails-ratchet] Restore the keywords or, if the prune is intentional, regenerate the baseline.`,
  );
  process.exit(1);
}

console.log(`[sentinel:guardrails-ratchet] PASS (total=${total} >= baseline=${baseline.total})`);
process.exit(0);
