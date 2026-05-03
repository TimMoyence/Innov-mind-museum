/**
 * F8 (2026-04-30) — Refresh-token TTL defaults tightened for banking-grade hardening.
 *
 * Asserts the F8 contract:
 *   - JWT_REFRESH_TTL default = '14d' (was '30d')
 *   - JWT_REFRESH_IDLE_WINDOW_SECONDS default = 86_400 (24h, was 14 * 86_400)
 *
 * Original design ref: git commit `01233ff21` (banking-grade hardening F8 — design doc deleted 2026-05-03).
 *
 * We assert the defaults at the SOURCE level (no env coupling) by reading
 * `src/config/env.ts` and grepping for the literal defaults — production
 * deploys override via env vars, so a runtime check would only test the
 * local `.env`, not the actual contract change. This guards against an
 * accidental revert of the literal defaults in env.ts itself.
 */
import fs from 'node:fs';
import path from 'node:path';

describe('F8 — refresh TTL hardening defaults (source contract)', () => {
  const envSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'src', 'config', 'env.ts'),
    'utf8',
  );

  it('refresh absolute TTL default literal is "14d"', () => {
    expect(envSource).toMatch(/refreshTokenTtl:\s*process\.env\.JWT_REFRESH_TTL\s*\|\|\s*'14d'/);
  });

  it('refresh idle window default literal is 24 * 60 * 60 (24h)', () => {
    expect(envSource).toMatch(/JWT_REFRESH_IDLE_WINDOW_SECONDS,\s*24\s*\*\s*60\s*\*\s*60/);
  });
});
