// P1-9 (2026-05-13) — dedicated minimal ESLint config that runs ONLY the
// musaium-test-discipline rules across BOTH `tests/unit/**` and
// `tests/integration/**` (plus the rest of tests/), without dragging in the
// strict TypeScript / sonarjs / security stacks the main `eslint.config.mjs`
// applies. The main config covers tests too, but `pnpm lint` runs ESLint
// against `src/` only — so without this dedicated entry point the ratchet
// never fires and pre-existing inline-entity violations grow invisibly.
//
// Wired from package.json → `lint:test-discipline`, called by `lint`.
//
// The grandfather baseline (`baselines/no-inline-test-entities.json`) is
// honoured by switching the rule off on baselined paths — same pattern as
// the main eslint.config.mjs (lines 514-535).
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const musaiumTestDiscipline = _require('eslint-plugin-musaium-test-discipline');

export default [
  // TypeScript parser — needed for TSAsExpression / TSTypeAssertion AST nodes
  // the discipline rule walks. Non-type-aware (no projectService) to keep this
  // lint pass fast and decoupled from tsconfig drift.
  {
    files: ['tests/**/*.test.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },
  {
    // Cover BOTH unit and integration test suites — audit P1-9 flagged that
    // tests/integration/ was effectively invisible because `pnpm lint` only
    // walks `src/`. This dedicated config plugs that gap.
    files: ['tests/**/*.test.ts'],
    plugins: { 'musaium-test-discipline': musaiumTestDiscipline },
    rules: {
      'musaium-test-discipline/no-inline-test-entities': ['error', { detectShapeMatch: true }],
      'musaium-test-discipline/no-undisabled-test-discipline-disable': 'error',
    },
  },
  // Grandfather — baseline files exempt; rule is 'off' on baselined paths so
  // 'error' only fires on new violations. Future PRs cannot grow the list.
  ...(() => {
    const baselinePath = resolve(
      __dirname,
      '../tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json',
    );
    if (!existsSync(baselinePath)) return [];
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
    const ownPaths = baseline.baseline
      .filter((p) => p.startsWith('museum-backend/'))
      .map((p) => p.replace(/^museum-backend\//, ''));
    if (ownPaths.length === 0) return [];
    return [
      {
        files: ownPaths,
        rules: { 'musaium-test-discipline/no-inline-test-entities': 'off' },
      },
    ];
  })(),
];
