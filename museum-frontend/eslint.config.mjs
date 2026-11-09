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
      'api-url.config.js',
      'scripts/',
      'plugins/',
      'coverage/',
      '__tests__/mocks/*.js',
    ],
  },

  eslint.configs.recommended,

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

  {
    ...react.configs.flat.recommended,
    settings: {
      react: { version: 'detect' },
    },
  },
  react.configs.flat['jsx-runtime'],

  reactHooks.configs.flat.recommended,

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

  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',

      '@typescript-eslint/no-deprecated': 'warn',

      'react/jsx-no-leaked-render': 'error',
      'react/self-closing-comp': 'error',
      'react/display-name': 'warn',

      'react-native/no-unused-styles': 'warn',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-color-literals': 'warn',

      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'warn',

      '@typescript-eslint/no-require-imports': [
        'warn',
        { allow: ['\\.(png|jpe?g|gif|webp|m4a|mp3|wav)$'] },
      ],
      '@typescript-eslint/no-empty-function': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
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

  {
    files: ['app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/shared/testing/*', '@/shared/testing'],
              message:
                'shared/testing/* is a TEST-ONLY harness and must not be imported by app/** (it would ship in the bundle). Use it only from __tests__/**.',
            },
          ],
        },
      ],
    },
  },

  {
    ...tseslint.configs.disableTypeChecked,
    files: [
      'app/**/.boundary-fixture-*/**/*.{ts,tsx}',
      '__tests__/**/.boundary-fixture-*/**/*.{ts,tsx}',
    ],
  },

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
      '@typescript-eslint/require-await': 'off',
      'react-native/no-color-literals': 'off',
      'react-native/no-inline-styles': 'off',
    },
  },

  {
    files: ['__tests__/**/*.test.{ts,tsx}'],
    plugins: { 'musaium-test-discipline': musaiumTestDiscipline },
    rules: {
      'musaium-test-discipline/no-inline-test-entities': ['error', { detectShapeMatch: true }],
      'musaium-test-discipline/no-undisabled-test-discipline-disable': 'error',
    },
  },

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

  prettierConfig,
);
