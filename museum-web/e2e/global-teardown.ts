/**
 * Phase 3 e2e — global teardown.
 *
 * Container teardown lives in the CI workflow (docker-compose down). This
 * file is a no-op placeholder; Playwright requires a default export.
 */
export default async function globalTeardown(): Promise<void> {
  // Intentionally empty.
}
