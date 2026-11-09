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
        'src/app/**/layout.tsx',
        'src/app/**/error.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/not-found.tsx',
        'src/lib/seo.ts',
      ],
      thresholds: {
        lines: 70,
        branches: 54,
        functions: 64,
        statements: 68,
      },
    },
  },
});
