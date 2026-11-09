import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import jsdoc from 'eslint-plugin-jsdoc';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import importX from 'eslint-plugin-import-x';
import security from 'eslint-plugin-security';
import checkFile from 'eslint-plugin-check-file';
import n from 'eslint-plugin-n';
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
      'dist/',
      'node_modules/',
      'coverage/',
      'scripts/',
      '.stryker-tmp/',
      '*.cjs',
      '*.js',
      '*.mjs',
      'jest.config.ts',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  jsdoc.configs['flat/recommended-typescript'],
  sonarjs.configs.recommended,
  security.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'shared', pattern: ['src/shared/**'], mode: 'full' },
        { type: 'config', pattern: ['src/config/**'], mode: 'full' },
        { type: 'data', pattern: ['src/data/**'], mode: 'full' },

        {
          type: 'domain',
          pattern: ['src/modules/*/domain/**', 'src/modules/*/core/domain/**'],
          mode: 'full',
        },

        {
          type: 'application',
          pattern: [
            'src/modules/*/application/**',
            'src/modules/*/core/useCase/**',
            'src/modules/*/useCase/**',
          ],
          mode: 'full',
        },

        {
          type: 'infrastructure',
          pattern: ['src/modules/*/infrastructure/**', 'src/modules/*/adapters/secondary/**'],
          mode: 'full',
        },

        {
          type: 'primary',
          pattern: ['src/modules/*/adapters/primary/**'],
          mode: 'full',
        },

        { type: 'module-root', pattern: ['src/modules/*/index.ts'], mode: 'full' },

        { type: 'entrypoint', pattern: ['src/app.ts', 'src/index.ts'], mode: 'full' },
      ],
      'boundaries/dependency-nodes': ['import', 'dynamic-import'],
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
        node: true,
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: { type: 'domain' },
              disallow: {
                to: {
                  type: [
                    'application',
                    'infrastructure',
                    'primary',
                    'data',
                    'module-root',
                    'entrypoint',
                  ],
                },
              },
            },
          ],
        },
      ],
    },
  },

  {
    files: ['src/**/*.ts'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver': {
        typescript: { alwaysTryTypes: true },
        node: true,
      },
    },
    rules: {
      'import-x/no-duplicates': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'error',
      'import-x/no-cycle': ['error', { maxDepth: 5 }],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  {
    files: ['src/**/*.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/check-param-names': 'error',
      'jsdoc/no-undefined-types': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-throws': 'off',
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
    },
  },

  {
    files: ['src/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', { max: 5 }],
      'max-depth': ['error', { max: 4 }],
      'max-nested-callbacks': ['error', { max: 3 }],

      complexity: ['error', { max: 12 }],
      'sonarjs/cognitive-complexity': ['error', 15],

      'sonarjs/no-duplicate-string': ['warn', { threshold: 4 }],
      'sonarjs/no-identical-functions': 'error',

      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/slow-regex': 'warn',
      'sonarjs/void-use': 'warn',
    },
  },

  {
    files: ['src/**/*.ts'],
    plugins: { unicorn },
    rules: {
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/no-nested-ternary': 'error',
      'unicorn/no-lonely-if': 'error',
      'unicorn/no-useless-undefined': ['error', { checkArrowFunctionBody: false }],
      'unicorn/prefer-ternary': 'warn',
      'unicorn/no-array-for-each': 'warn',
      'unicorn/consistent-function-scoping': 'warn',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/prefer-math-trunc': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/no-array-push-push': 'error',
      'unicorn/throw-new-error': 'error',
      'unicorn/error-message': 'error',
      'unicorn/no-instanceof-builtins': 'error',
      'unicorn/filename-case': [
        'error',
        {
          cases: { kebabCase: true, camelCase: true },
          ignore: ['^index\\.ts$', '^index\\.d\\.ts$', '^\\d+-.*\\.ts$'],
        },
      ],

      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-process-exit': 'off',
      'unicorn/prefer-module': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-static-only-class': 'off',
    },
  },

  {
    files: ['src/**/*.ts'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/folder-naming-convention': [
        'error',
        { 'src/**/': '+([a-zA-Z0-9])*(-+([a-zA-Z0-9]))' },
      ],
    },
  },

  {
    files: ['src/**/*.ts'],
    plugins: { n },
    rules: {
      'n/no-sync': 'warn',
      'n/handle-callback-err': 'error',
    },
  },

  {
    files: ['src/**/*.ts'],
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-implied-eval': 'off',
      '@typescript-eslint/no-implied-eval': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-return-await': 'off',
      '@typescript-eslint/return-await': ['error', 'always'],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',

      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
    },
  },

  {
    files: [
      'src/modules/*/adapters/primary/http/**/*.route.ts',
      'src/modules/*/adapters/secondary/**/*.ts',
      'src/modules/*/infrastructure/**/*.ts',
      'src/data/db/**/*.ts',
      'src/shared/audit/**/*.ts',
    ],
    rules: {
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ['error', { max: 15 }],
      'sonarjs/cognitive-complexity': ['error', 20],

      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },

  {
    files: [
      'src/modules/*/application/**/*.ts',
      'src/modules/*/core/useCase/**/*.ts',
      'src/modules/*/useCase/**/*.ts',
    ],
    rules: {
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ['error', { max: 15 }],
      'sonarjs/cognitive-complexity': ['error', 20],
    },
  },

  {
    files: ['src/shared/logger/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['src/config/**/*.ts'],
    rules: {
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      'max-lines': 'off',
    },
  },

  {
    files: ['src/index.ts'],
    rules: { 'max-lines': 'off' },
  },

  {
    files: ['src/shared/observability/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/prefer-readonly': 'off',

      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      complexity: 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-identical-functions': 'off',

      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',

      'security/detect-non-literal-regexp': 'off',
      'security/detect-possible-timing-attacks': 'off',
    },
  },

  {
    files: ['tests/**/*.test.ts'],
    plugins: { 'musaium-test-discipline': musaiumTestDiscipline },
    rules: {
      'musaium-test-discipline/no-inline-test-entities': ['error', { detectShapeMatch: true }],
      'musaium-test-discipline/no-undisabled-test-discipline-disable': 'error',
    },
  },

  {
    files: ['src/**/*.repository*.ts', 'src/**/*.repo.ts'],
    plugins: { 'musaium-test-discipline': musaiumTestDiscipline },
    rules: {
      'musaium-test-discipline/no-typeorm-set-undefined': 'error',
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

  {
    files: [
      'src/shared/validation/password-breach-check.ts',
      'src/modules/chat/adapters/secondary/storage/s3-operations.ts',
      'src/modules/auth/useCase/session/login-rate-limiter.ts',
    ],
    rules: { 'sonarjs/hashing': 'off' },
  },

  {
    files: [
      'src/modules/daily-art/adapters/secondary/catalog/artworks.data.ts',
      'src/shared/i18n/explanation-reasons.ts',
    ],
    rules: { 'max-lines': 'off', 'sonarjs/no-duplicate-string': 'off' },
  },

  {
    files: ['src/modules/chat/chat-module.ts'],
    rules: { 'max-lines': 'off', 'max-lines-per-function': 'off' },
  },

  {
    files: ['src/shared/observability/opentelemetry.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': [
        'error',
        { allow: ['^@opentelemetry/', '^@shared/logger/logger$'] },
      ],
    },
  },

  prettierConfig,
);
