/**
 * CYCLE 3 / C3.2 (T1.2) — RED unit test for the non-blocking prod-env WARN on
 * missing Plausible analytics configuration.
 *
 * Pins spec-c3.md §4 REQ-C3.2.1/2/3/4 + design-c3.md §6 / D3 / D5 down BEFORE
 * the green change. In production, if `PLAUSIBLE_DOMAIN` and/or
 * `PLAUSIBLE_ENDPOINT_URL` are absent, the `PlausibleAdapter` no-ops silently
 * (`plausible.adapter.ts:57`,`:59`) → the KR4 funnel is muted with NO operator
 * signal. C3.2 makes `validateProductionEnv` emit a NON-BLOCKING `console.warn`
 * (same shape as the existing BREVO_API_KEY warn) naming the missing var(s).
 *
 * Assertion strategy (design D5) : SUBSTRING match on the Plausible warn
 * message (`PLAUSIBLE_DOMAIN` / `PLAUSIBLE_ENDPOINT_URL`), NOT
 * `toHaveBeenCalledTimes` — robust to the parasitic BREVO warn. We also supply
 * `brevoApiKey: 'brevo'` in the env stub so that warn does not fire anyway.
 *
 * Pattern mirrors `env-production-validation-distinctness.test.ts:25-55` —
 * `validProductionEnv()` fixtures for `process.env` + a local `makeEnv()` that
 * builds the `AppEnv` stub, EXTENDED here with `plausible: { domain,
 * endpointUrl }` (the distinctness test's `makeEnv` does not set it). Shared
 * fixtures only — no inline test entity beyond the existing
 * `as unknown as AppEnv` pattern.
 *
 * Lib-docs consulted :
 *  - `lib-docs/express/PATTERNS.md` §3.9 (NODE_ENV=production gates this path)
 *    — `validateProductionEnv` runs only when `NODE_ENV === 'production'`.
 *  - `lib-docs/express/LESSONS.md` — n/a (config layer, no Express request path).
 *  - `lib-docs/plausible/PATTERNS.md` — ABSENT (design-c3.md OQ1). The var names
 *    `PLAUSIBLE_DOMAIN`/`PLAUSIBLE_ENDPOINT_URL` and the no-op behaviour come
 *    from the real adapter (`plausible.adapter.ts`) + env types
 *    (`env.types.ts:642-648`), not an invented pattern. WARN-tag: use-stale.
 *
 * RED state — at baseline `a0654e7c6` : `validateProductionEnv` NEVER mentions
 * Plausible (grep `PLAUSIBLE` in `env.production-validation.ts` = 0) → no warn
 * is emitted when the vars are absent → the "absent → warn expected"
 * assertions FAIL. That is the targeted RED signal (AC-C3.2.d).
 *
 * Frozen-test invariant (UFR-022 phase red) : immutable byte-for-byte once
 * committed. Suspected wrong test → `BLOCK-TEST-WRONG` + fresh red, never edit
 * from a green/reviewer phase.
 *
 * Scoped run :
 *   cd museum-backend && pnpm test \
 *     --testPathPattern=env-production-validation-plausible --no-coverage
 */

import { validateProductionEnv } from '@src/config/env.production-validation';
import {
  VALID_CSRF_SECRET,
  VALID_EXPORT_PSEUDONYM_SALT,
  VALID_JWT_ACCESS_SECRET,
  VALID_JWT_REFRESH_SECRET,
  VALID_MFA_ENCRYPTION_KEY,
  VALID_MFA_SESSION_TOKEN_SECRET,
  validProductionEnv,
} from 'tests/helpers/config/prod-env.fixtures';

import type { AppEnv } from '@src/config/env.types';

interface PlausibleStub {
  domain?: string;
  endpointUrl?: string;
}

const makeEnv = (plausible: PlausibleStub | undefined): AppEnv =>
  ({
    nodeEnv: 'production',
    // brevoApiKey non-empty → suppresses the parasitic BREVO warn (design D5).
    brevoApiKey: 'brevo',
    llm: { provider: 'openai', openAiApiKey: 'sk-test' },
    storage: { driver: 'local', s3: {} },
    cache: undefined,
    exportPseudonymSalt: VALID_EXPORT_PSEUDONYM_SALT,
    plausible,
    auth: {
      accessTokenSecret: VALID_JWT_ACCESS_SECRET,
      refreshTokenSecret: VALID_JWT_REFRESH_SECRET,
      mfaEncryptionKey: VALID_MFA_ENCRYPTION_KEY,
      mfaSessionTokenSecret: VALID_MFA_SESSION_TOKEN_SECRET,
      csrfSecret: VALID_CSRF_SECRET,
      passwordBreachCheckEnabled: true,
    },
  }) as unknown as AppEnv;

/** True iff any console.warn call argument contains the given substring. */
const warnedWith = (warnSpy: jest.SpyInstance, needle: string): boolean =>
  warnSpy.mock.calls.some((args) =>
    args.some((arg: unknown) => typeof arg === 'string' && arg.includes(needle)),
  );

describe('validateProductionEnv — Plausible analytics WARN (C3.2)', () => {
  const originalEnv = { ...process.env };
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv, ...validProductionEnv() } as NodeJS.ProcessEnv;
    delete process.env.JWT_SECRET;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  it('AC-C3.2.a/b — both Plausible vars absent → warns (names both vars) and does NOT throw', () => {
    const env = makeEnv({ domain: undefined, endpointUrl: undefined });

    expect(() => {
      validateProductionEnv(env);
    }).not.toThrow();
    expect(warnedWith(warnSpy, 'PLAUSIBLE_DOMAIN')).toBe(true);
    expect(warnedWith(warnSpy, 'PLAUSIBLE_ENDPOINT_URL')).toBe(true);
  });

  it('AC-C3.2.c — only endpointUrl missing → warn names PLAUSIBLE_ENDPOINT_URL', () => {
    const env = makeEnv({ domain: 'musaium.com', endpointUrl: undefined });

    expect(() => {
      validateProductionEnv(env);
    }).not.toThrow();
    expect(warnedWith(warnSpy, 'PLAUSIBLE_ENDPOINT_URL')).toBe(true);
  });

  it('REQ-C3.2.3 — both Plausible vars present → NO Plausible warn', () => {
    const env = makeEnv({
      domain: 'musaium.com',
      endpointUrl: 'https://plausible.example/api/event',
    });

    expect(() => {
      validateProductionEnv(env);
    }).not.toThrow();
    expect(warnedWith(warnSpy, 'PLAUSIBLE')).toBe(false);
  });
});
