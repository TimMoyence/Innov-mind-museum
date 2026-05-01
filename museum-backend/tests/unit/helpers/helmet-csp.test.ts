/**
 * F5 (2026-04-30) — Helmet CSP + HSTS preload contract test (source-level).
 *
 * Asserts the production directives shipped in `src/app.ts`. We grep the source
 * rather than booting the app under NODE_ENV=production (which would invoke the
 * production-validation invariants and require a full secrets pack) — this is a
 * lightweight contract guard against a regression that drops the locked-down CSP.
 */
import fs from 'node:fs';
import path from 'node:path';

describe('F5 — Helmet CSP + HSTS preload (source contract)', () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'src', 'app.ts'),
    'utf8',
  );

  it('production HSTS uses 2y max-age + includeSubDomains + preload', () => {
    expect(appSource).toMatch(
      /hsts:\s*\{\s*maxAge:\s*63_?072_?000\s*,\s*includeSubDomains:\s*true\s*,\s*preload:\s*true\s*\}/,
    );
  });

  it('production CSP defaultSrc locked to self', () => {
    expect(appSource).toMatch(/defaultSrc:\s*\["'self'"\]/);
  });

  it('production CSP scriptSrc has no unsafe-inline', () => {
    // Match the scriptSrc directive but NOT styleSrc (which retains unsafe-inline as a stop-gap).
    expect(appSource).toMatch(/scriptSrc:\s*\["'self'"\]/);
    // Sanity: the literal "scriptSrc.*unsafe-inline" must not appear.
    expect(appSource).not.toMatch(/scriptSrc:[^\]]*unsafe-inline/);
  });

  it('production CSP frameAncestors is none (clickjack defense)', () => {
    expect(appSource).toMatch(/frameAncestors:\s*\["'none'"\]/);
  });

  it('production CSP objectSrc is none', () => {
    expect(appSource).toMatch(/objectSrc:\s*\["'none'"\]/);
  });

  it('production CSP upgrade-insecure-requests is enabled', () => {
    expect(appSource).toMatch(/upgradeInsecureRequests:\s*\[\]/);
  });
});
