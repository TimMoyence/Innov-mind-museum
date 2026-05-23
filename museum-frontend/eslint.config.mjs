import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactNative from 'eslint-plugin-react-native';
import prettierConfig from 'eslint-config-prettier';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const musaiumTestDiscipline = _require('eslint-plugin-musaium-test-discipline');

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────
  {
    ignores: [
      'node_modules/',
      '.expo/',
      'dist/',
      '.test-dist/',
      'android/',
      'ios/',
      'shared/api/generated/',
      'babel.config.js',
      'jest.config.js',
      'eslint.config.mjs',
      'metro.config.js',
      'index.js',
      'scripts/',
      'plugins/',
      'coverage/',
      '__tests__/mocks/*.js',
    ],
  },

  // ── Base JS rules ───────────────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript strict + stylistic ───────────────────────────────
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ── React ───────────────────────────────────────────────────────
  {
    ...react.configs.flat.recommended,
    settings: {
      react: { version: 'detect' },
    },
  },
  react.configs.flat['jsx-runtime'],

  // ── React Hooks (v7 — includes React Compiler rules) ───────────
  reactHooks.configs.flat.recommended,

  // ── React Native (manual — no flat config preset) ──────────────
  {
    plugins: {
      'react-native': reactNative,
    },
    languageOptions: {
      globals: {
        __DEV__: 'readonly',
      },
    },
  },

  // ── Project-wide rule overrides ─────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // React Hooks — escalate exhaustive-deps to error
      'react-hooks/exhaustive-deps': 'error',
      // React Compiler rules — warn until codebase is adapted
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',

      // Deprecated API usage — warn to track migration debt
      '@typescript-eslint/no-deprecated': 'warn',

      // React
      'react/jsx-no-leaked-render': 'error',
      'react/self-closing-comp': 'error',
      'react/display-name': 'warn',

      // React Native
      'react-native/no-unused-styles': 'warn',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-color-literals': 'warn',

      // TypeScript strict
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'warn',

      // Relax rules that are too noisy for RN/Expo codebases
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-dynamic-delete': 'warn',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-invalid-void-type': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/no-unnecessary-type-conversion': 'warn',
    },
  },

  // ── Test files — relax strict type rules ────────────────────────
  {
    files: ['__tests__/**', 'tests/**'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // Test fixtures often declare `async () => undefined` stubs that satisfy
      // promise-returning interfaces without ever awaiting — that's the point
      // of a stub. The project-level `require-await: 'warn'` is too strict for
      // tests ; relax inside `__tests__/`.
      '@typescript-eslint/require-await': 'off',
      'react-native/no-color-literals': 'off',
      'react-native/no-inline-styles': 'off',
    },
  },

  // ── Musaium Test Discipline ──────────────────────────────────────
  {
    files: ['__tests__/**/*.test.{ts,tsx}'],
    plugins: { 'musaium-test-discipline': musaiumTestDiscipline },
    rules: {
      'musaium-test-discipline/no-inline-test-entities': ['error', { detectShapeMatch: true }],
      'musaium-test-discipline/no-undisabled-test-discipline-disable': 'error',
    },
  },

  // ── `eslint-plugin-import` shim ───────────────────────────────────
  //
  // The repo does not load `eslint-plugin-import`, but several test files
  // carry `eslint-disable-next-line import/order, import/first` comments
  // (copy-paste from upstream examples / other monorepo apps). Without a
  // registered plugin, ESLint flags those comments as "unknown rule"
  // errors. Register a no-op stub plugin so the disable directives resolve
  // to a defined-but-off rule. Adding the real plugin would change source
  // ordering across the codebase — out of scope for C1 hexagonal refacto.
  //
  // Test files (`__tests__/**/*.test.{ts,tsx}`) also opt out of the
  // `reportUnusedDisableDirectives` warning so those Jest-hoisting guard
  // comments don't become fatal under `--max-warnings=0`.
  {
    plugins: {
      import: {
        rules: {
          order: { meta: { type: 'suggestion', schema: [] }, create: () => ({}) },
          first: { meta: { type: 'suggestion', schema: [] }, create: () => ({}) },
        },
      },
    },
    rules: {
      'import/order': 'off',
      'import/first': 'off',
    },
  },
  {
    files: ['__tests__/**/*.test.{ts,tsx}'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },

  // ── Grandfather — baseline files exempt from no-inline-test-entities
  //    Phase 7 will migrate these. Until then, rule is 'off' for baselined
  //    paths so 'error' only fires on new code.
  ...(() => {
    const baselinePath = resolve(
      __dirname,
      '../tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json',
    );
    if (!existsSync(baselinePath)) return [];
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
    const ownPaths = baseline.baseline
      .filter((p) => p.startsWith('museum-frontend/'))
      .map((p) => p.replace(/^museum-frontend\//, ''));
    if (ownPaths.length === 0) return [];
    return [
      {
        files: ownPaths,
        rules: { 'musaium-test-discipline/no-inline-test-entities': 'off' },
      },
    ];
  })(),

  // ── Prettier — must be last ───────────────────────────────────────
  prettierConfig,
);
