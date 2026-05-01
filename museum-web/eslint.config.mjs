import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  // ── Global ignores ────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/',
      '.next/',
      'out/',
      'public/',
      'deploy/',
      'eslint.config.mjs',
      'postcss.config.mjs',
      'next.config.ts',
      'sentry.*.config.ts',
      'next-env.d.ts',
      // Auto-generated from backend OpenAPI spec — do not lint
      'src/lib/api/generated/',
    ],
  },

  // ── Base JS rules ─────────────────────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript strict + stylistic ─────────────────────────────────────
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

  // ── React ─────────────────────────────────────────────────────────────
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  {
    settings: {
      react: { version: 'detect' },
    },
  },

  // ── React Hooks ───────────────────────────────────────────────────────
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // ── Next.js ───────────────────────────────────────────────────────────
  // Use object-form plugin registration (flat config requires plugins as object, not array of strings)
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },

  // ── Accessibility ─────────────────────────────────────────────────────
  jsxA11y.flatConfigs.recommended,

  // ── Custom rule overrides ─────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // TypeScript strict — errors
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Disable non-nullable-type-assertion-style (conflicts with no-non-null-assertion)
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',

      // Allow numbers and booleans in template literals
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],

      // TypeScript strict — warnings (pragmatic for Next.js patterns)
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Downgrade no-unsafe-* to warn (common in Next.js / dynamic patterns)
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      // Next.js
      '@next/next/no-html-link-for-pages': 'error',
      '@next/next/no-img-element': 'error',
    },
  },
);
