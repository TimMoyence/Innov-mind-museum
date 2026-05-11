#!/usr/bin/env node
// merge-halluc-corpus.mjs — T4.2d merge.
//
// Reads the 5 halluc-corpus-*.partial.json files (versioned source-of-truth) and
// produces:
//   - halluc-corpus.json       (Promptfoo-flat: array of {description, vars, assert, metadata})
//   - halluc-corpus.meta.json  (provenance: schema_version, partials list, per_category counts)
//
// The flat shape is required because the halluc.config.yaml references the corpus via
// `tests: 'file://halluc-corpus.json'` — Promptfoo expects an array at the top level.
//
// Usage (from museum-backend/):
//   node security/promptfoo/scripts/merge-halluc-corpus.mjs
//
// Exit 1 if duplicate IDs, missing required fields, or category count drift > 0.
// Exit 0 PASS — writes both files.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseDir = join(__dirname, '..');

const PARTIALS = [
  ['halluc-corpus-realtime.partial.json', 'realtime', 10],
  ['halluc-corpus-postcutoff.partial.json', 'postcutoff', 10],
  ['halluc-corpus-domain.partial.json', 'domain', 15],
  ['halluc-corpus-multilingual.partial.json', 'multilingual', 15],
  ['halluc-corpus-injection.partial.json', 'injection', 10],
];

const REQUIRED_FIELDS = ['id', 'prompt', 'expected_behavior', 'assertions', 'metadata'];

const tests = [];
const perCat = {};
const ids = new Set();

for (const [fname, cat, expected] of PARTIALS) {
  const arr = JSON.parse(readFileSync(join(baseDir, fname), 'utf8'));
  if (!Array.isArray(arr)) {
    console.error(`FAIL: ${fname} is not an array`);
    process.exit(1);
  }
  if (arr.length !== expected) {
    console.error(`FAIL: ${fname} expected ${expected} entries, got ${arr.length}`);
    process.exit(1);
  }
  for (const e of arr) {
    for (const k of REQUIRED_FIELDS) {
      if (!(k in e)) {
        console.error(`FAIL: ${fname} entry missing field "${k}":`, e.id ?? '<unknown>');
        process.exit(1);
      }
    }
    if (ids.has(e.id)) {
      console.error(`FAIL: duplicate id ${e.id} in ${fname}`);
      process.exit(1);
    }
    ids.add(e.id);
    tests.push({
      description: `${e.metadata.category}: ${e.id}`,
      vars: {
        prompt: e.prompt,
        expected_behavior: e.expected_behavior,
      },
      assert: e.assertions,
      metadata: { id: e.id, ...e.metadata },
    });
  }
  perCat[cat] = arr.length;
}

const totalAssertions = tests.reduce((n, t) => n + t.assert.length, 0);
const llmRubricCount = tests.reduce(
  (n, t) => n + t.assert.filter((a) => a.type === 'llm-rubric').length,
  0,
);
const llmRubricPct = (100 * llmRubricCount) / totalAssertions;
if (llmRubricPct > 30) {
  console.error(`FAIL: llm-rubric ${llmRubricPct.toFixed(1)}% exceeds 30% cost cap (D6)`);
  process.exit(1);
}

writeFileSync(join(baseDir, 'halluc-corpus.json'), JSON.stringify(tests, null, 2) + '\n');
writeFileSync(
  join(baseDir, 'halluc-corpus.meta.json'),
  JSON.stringify(
    {
      comment:
        'Auto-generated index for halluc-corpus.json by merge-halluc-corpus.mjs. DO NOT EDIT BY HAND. Edit a partial then re-run.',
      schema_version: 1,
      partials: PARTIALS.map(([fname]) => fname),
      total: tests.length,
      per_category: perCat,
      total_assertions: totalAssertions,
      llm_rubric_pct: Number(llmRubricPct.toFixed(2)),
    },
    null,
    2,
  ) + '\n',
);

console.log(`merge OK — ${tests.length} entries, per_category:`, perCat);
console.log(`assertions: ${totalAssertions}, llm-rubric: ${llmRubricCount} (${llmRubricPct.toFixed(1)}%)`);
