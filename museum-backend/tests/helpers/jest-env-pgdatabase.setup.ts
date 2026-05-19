/**
 * Jest `setupFiles` entry — runs BEFORE the test file is loaded.
 *
 * Pins PGDATABASE for the unit-integration project. `@src/config/env` reads
 * PGDATABASE eagerly at module load via `required()` (no fallback per
 * 2026-05-18 decision). Without this pin, any test file that transitively
 * imports `@src/config/env` would crash with "Missing required environment
 * variable: PGDATABASE" because env.ts deliberately skips dotenv.config() when
 * NODE_ENV === 'test' to preserve test isolation.
 *
 * Tests that need a specific PGDATABASE value (e.g. integration harness with
 * a real container) overwrite it themselves before importing modules that read
 * it.
 */
process.env.PGDATABASE = process.env.PGDATABASE ?? 'museum_test';
