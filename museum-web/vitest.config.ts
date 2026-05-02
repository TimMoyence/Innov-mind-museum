/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      // Phase 11 Sprint 11.1: scope coverage to the surface Vitest is the
      // primary signal for — pure logic (`src/lib`) + the admin/auth/shared
      // component slices that have observable contracts. Marketing pages,
      // SEO helpers, and the Next.js page shells are deliberately excluded:
      // Playwright + a11y + Lighthouse cover those routes end-to-end (Phase
      // 3) and Vitest coverage there is mostly snapshot-style render assertions
      // that don't add banking-grade signal.
      include: [
        'src/lib/**/*.{ts,tsx}',
        'src/components/admin/**/*.{ts,tsx}',
        'src/components/auth/**/*.{ts,tsx}',
        'src/components/shared/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/__tests__/**',
        // Next.js page shells — covered by Playwright.
        'src/app/**/layout.tsx',
        'src/app/**/error.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/not-found.tsx',
        // SEO helpers — pure metadata exports, no behaviour.
        'src/lib/seo.ts',
      ],
      // Phase 11 Sprint 11.1 floor — actuals on the focused surface
      // (Vitest scope = pure logic + admin/auth/shared components).
      // Default actuals 68.51 / 54.82 / 64.44 / 70.39. Branches stays
      // at 54 — ADR-007 mutation-kill rationale; the 226-test Vitest
      // suite is intentionally narrow and Playwright covers route flows.
      thresholds: {
        lines: 70,
        branches: 54,
        functions: 64,
        statements: 68,
      },
    },
  },
});
