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
  // ═══════════════════════════════════════════════════════════════════
  //  GLOBAL IGNORES
  // ═══════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════
  //  BASE CONFIGS
  // ═══════════════════════════════════════════════════════════════════
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  jsdoc.configs['flat/recommended-typescript'],
  sonarjs.configs.recommended,
  security.configs.recommended,

  // ═══════════════════════════════════════════════════════════════════
  //  PARSER — type-aware linting
  // ═══════════════════════════════════════════════════════════════════
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  1. ARCHITECTURE — Hexagonal boundaries enforcement
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        // ── Shared layer (cross-cutting) ──
        { type: 'shared', pattern: ['src/shared/**'], mode: 'full' },
        { type: 'config', pattern: ['src/config/**'], mode: 'full' },
        { type: 'helpers', pattern: ['src/helpers/**'], mode: 'full' },
        { type: 'data', pattern: ['src/data/**'], mode: 'full' },

        // ── Domain layer (pure business logic, zero external deps) ──
        {
          type: 'domain',
          pattern: ['src/modules/*/domain/**', 'src/modules/*/core/domain/**'],
          mode: 'full',
        },

        // ── Application layer (use cases, orchestration) ──
        {
          type: 'application',
          pattern: [
            'src/modules/*/application/**',
            'src/modules/*/core/useCase/**',
            'src/modules/*/useCase/**',
          ],
          mode: 'full',
        },

        // ── Infrastructure layer (DB adapters, external services) ──
        {
          type: 'infrastructure',
          pattern: ['src/modules/*/infrastructure/**', 'src/modules/*/adapters/secondary/**'],
          mode: 'full',
        },

        // ── Primary adapters (HTTP routes, controllers) ──
        {
          type: 'primary',
          pattern: ['src/modules/*/adapters/primary/**'],
          mode: 'full',
        },

        // ── Module composition roots ──
        { type: 'module-root', pattern: ['src/modules/*/index.ts'], mode: 'full' },

        // ── App entrypoints ──
        { type: 'entrypoint', pattern: ['src/app.ts', 'src/index.ts'], mode: 'full' },
      ],
      'boundaries/dependency-nodes': ['import', 'dynamic-import'],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            // Domain CANNOT import application, infrastructure, primary, helpers, data
            {
              from: ['domain'],
              disallow: [
                'application',
                'infrastructure',
                'primary',
                'helpers',
                'data',
                'module-root',
                'entrypoint',
              ],
            },
            // Application CANNOT import infrastructure, primary, helpers, data
            {
              from: ['application'],
              disallow: [
                'infrastructure',
                'primary',
                'helpers',
                'data',
                'module-root',
                'entrypoint',
              ],
            },
            // Infrastructure CANNOT import primary, application (except via domain ports)
            {
              from: ['infrastructure'],
              disallow: ['primary', 'application', 'module-root', 'entrypoint'],
            },
          ],
        },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  2. IMPORTS — order, no-cycle, no-duplicates
  // ═══════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════
  //  3. JSDOC — mandatory on all exports
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['src/**/*.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
          contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'],
          checkConstructors: false,
        },
      ],
      'jsdoc/require-description': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/no-undefined-types': 'off', // TypeScript handles types
      'jsdoc/require-param': 'off', // TypeScript handles param types
      'jsdoc/require-returns': 'off', // TypeScript handles return types
      'jsdoc/require-throws': 'off', // TS handles error types; @throws enforcement is noisy
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  4. COMPLEXITY — fichiers courts, fonctions simples, KISS
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['src/**/*.ts'],
    rules: {
      // ── Taille ──
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', { max: 5 }],
      'max-depth': ['error', { max: 4 }],
      'max-nested-callbacks': ['error', { max: 3 }],

      // ── Complexite ──
      complexity: ['error', { max: 12 }],
      'sonarjs/cognitive-complexity': ['error', 15],

      // ── DRY ──
      'sonarjs/no-duplicate-string': ['warn', { threshold: 4 }],
      'sonarjs/no-identical-functions': 'error',

      // ── SonarJS pragmatic ──
      'sonarjs/no-hardcoded-passwords': 'off', // false positives on audit action enums
      'sonarjs/slow-regex': 'warn', // validation patterns need review, not block
      'sonarjs/void-use': 'warn',
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  5. UNICORN — strict best practices
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['src/**/*.ts'],
    plugins: { unicorn },
    rules: {
      // ── Actives ──
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/no-nested-ternary': 'error',
      'unicorn/no-lonely-if': 'error',
      'unicorn/no-useless-undefined': 'error',
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
          ignore: [
            '^index\\.ts$',
            '^index\\.d\\.ts$',
            '^\\d+-.*\\.ts$', // TypeORM migrations: 1771427010387-InitDatabase.ts
          ],
        },
      ],

      // ── Off (trop invasif ou non pertinent pour Express/TypeORM) ──
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-process-exit': 'off', // handled by n/no-process-exit
      'unicorn/prefer-module': 'off', // CJS project
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/no-null': 'off', // DB returns null
      'unicorn/no-static-only-class': 'off', // use case pattern
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  6. FILE NAMING — kebab-case, enforce suffixes
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['src/**/*.ts'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/folder-naming-convention': [
        'error',
        { 'src/**/': '+([a-zA-Z0-9])*(-+([a-zA-Z0-9]))' },
        // allows: kebab-case, camelCase, single-word (covers useCase, feature-flags, db, etc.)
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  7. NODE.JS — best practices
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['src/**/*.ts'],
    plugins: { n },
    rules: {
      'n/no-sync': 'warn',
      'n/handle-callback-err': 'error',
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  8. SECURITY — hardened
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'off',
      '@typescript-eslint/no-implied-eval': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-object-injection': 'off', // trop de faux positifs en TS
      'security/detect-non-literal-fs-filename': 'off', // false positives with path.join
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  9. TYPESCRIPT — strict rules (source files)
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['src/**/*.ts'],
    rules: {
      // ── Erreurs critiques ──
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

      // ── Warn (pragmatique pour Express/TypeORM) ──
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

  // ═══════════════════════════════════════════════════════════════════
  //  OVERRIDES — infrastructure, adapters, routes (external boundary)
  //  These files interface with untyped externals (DB results, HTTP
  //  request bodies, S3 responses) — unsafe-* noise is structural.
  // ═══════════════════════════════════════════════════════════════════
  {
    files: [
      'src/modules/*/adapters/primary/http/**/*.route.ts',
      'src/modules/*/adapters/secondary/**/*.ts',
      'src/modules/*/infrastructure/**/*.ts',
      'src/data/db/**/*.ts',
      'src/shared/audit/**/*.ts',
    ],
    rules: {
      // ── Complexity ──
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ['error', { max: 15 }],
      'sonarjs/cognitive-complexity': ['error', 20],

      // ── Type safety relaxed at external boundary ──
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },

  // ── Application layer: naturally higher complexity (orchestration, business logic) ──
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

  // ── Logger: must use console ──
  {
    files: ['src/shared/logger/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // ── Config/env files: process.env || 'default' is intentional (empty string fallback) ──
  {
    files: ['src/config/**/*.ts'],
    rules: {
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      // env.ts is a single-responsibility config file that grows with each
      // new env var block; splitting it would break the single-source-of-truth
      // pattern. max-lines-per-function still applies per function.
      'max-lines': 'off',
    },
  },

  // ── OpenTelemetry: CJS requires needed, dynamic instrumentation ──
  {
    files: ['src/shared/observability/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  TESTS — relax pour les fichiers de test
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['tests/**/*.ts'],
    rules: {
      // ── TypeScript relax ──
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

      // ── Complexity relax ──
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      complexity: 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-identical-functions': 'off',

      // ── JSDoc relax ──
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',

      // ── Security relax ──
      'security/detect-non-literal-regexp': 'off',
      'security/detect-possible-timing-attacks': 'off',
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  MUSAIUM TEST DISCIPLINE
  // ═══════════════════════════════════════════════════════════════════
  {
    files: ['tests/**/*.test.ts'],
    plugins: { 'musaium-test-discipline': musaiumTestDiscipline },
    rules: {
      'musaium-test-discipline/no-inline-test-entities': ['error', { detectShapeMatch: true }],
      'musaium-test-discipline/no-undisabled-test-discipline-disable': 'error',
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  //  GRANDFATHER — baseline files exempt from no-inline-test-entities
  //  Phase 7 will migrate these. Until then, rule is 'off' for baselined
  //  paths so 'error' only fires on new code.
  // ═══════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════
  //  PRETTIER — must be last to disable conflicting formatting rules
  // ═══════════════════════════════════════════════════════════════════
  prettierConfig,
);
