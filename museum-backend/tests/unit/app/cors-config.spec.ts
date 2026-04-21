import { resolveCorsOrigin } from '@src/helpers/cors.config';

describe('resolveCorsOrigin — CORS policy matrix', () => {
  it('returns false when prod + empty origins (safe-by-default rejection)', () => {
    expect(resolveCorsOrigin([], true)).toBe(false);
  });

  it('returns the array when prod + populated origins (allow-listed)', () => {
    const origins = ['https://musaium.app', 'https://www.musaium.app'];
    expect(resolveCorsOrigin(origins, true)).toEqual(origins);
  });

  it('returns true when non-prod + empty origins (DX wildcard)', () => {
    expect(resolveCorsOrigin([], false)).toBe(true);
  });

  it('returns the array when non-prod + populated origins', () => {
    const origins = ['http://localhost:3000', 'http://localhost:3001'];
    expect(resolveCorsOrigin(origins, false)).toEqual(origins);
  });

  it('copies the input array (no reference leak into cors middleware)', () => {
    const origins = ['https://musaium.app'];
    const result = resolveCorsOrigin(origins, true);
    expect(result).toEqual(origins);
    expect(result).not.toBe(origins);
  });

  it('treats an empty-string element as populated (explicit wildcard intent by operator)', () => {
    // `toList()` in config/env.ts already drops empty strings — this is the
    // defense-in-depth layer: even if a single '' slipped through, we treat
    // it as an intentional entry (not "empty"), preserving the principle of
    // "origins.length > 0 → allow list is authoritative".
    const result = resolveCorsOrigin([''], true);
    expect(result).toEqual(['']);
  });

  it('never returns a true wildcard in production even with malformed input', () => {
    // Regression guard: the audit flagged a perceived "CORS self-DoS in prod
    // when origins is empty". That behaviour is intentional — `false` is
    // strictly safer than `true`. This test pins the contract so future
    // refactors cannot flip it.
    expect(resolveCorsOrigin([], true)).not.toBe(true);
  });
});
