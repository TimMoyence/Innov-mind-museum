/**
 * Wave C5 / T-C52 — RED test for FE Plausible consent gate.
 *
 * Pins spec.md §R-C5 / §R-C5b + design.md D7 (mobile events routed via BE
 * proxy `POST /api/telemetry/funnel`) + decisions.md D-C5 (Plausible cookieless,
 * consent gate avant toute émission) down BEFORE implementation.
 *
 * Lib-docs consulted : `lib-docs/plausible/PATTERNS.md` §3.3 (RN emit via BE
 * proxy, NEVER plausible.io direct), §3.4 (shared consent hook + server-side
 * gate), §4 (Musaium consent policy : opt-out model, no PII in `props`), §5
 * (anti-pattern : NO PII in props — email/userId/full-name forbidden).
 *
 * Three pinned invariants :
 *
 *  1. Consent NOT granted  → `trackFunnelEvent('paywall_modal_shown', {tier:'free'})`
 *     MUST result in **0 fetch call** (consent gate fail-closed, GDPR Art. 7,
 *     PATTERNS.md §3.4 third-bullet : "trackEvent() short-circuits before the
 *     fetch").
 *
 *  2. Consent granted      → same call MUST result in **exactly 1** HTTP POST
 *     to the BE proxy endpoint `/api/telemetry/funnel` with a JSON body
 *     `{name, props, url, domain}` (design.md D7 ; PATTERNS.md §2 Events API
 *     params : `name`/`url`/`domain` required, `props` ≤30 keys).
 *
 *  3. Consent granted + caller passes a `props.email` field → adapter MUST
 *     strip it (or refuse to forward) — defense-in-depth against PII leakage
 *     (PATTERNS.md §5 anti-pattern #1 : "DON'T put PII into props"). The
 *     emitted POST body MUST NOT contain `email`, `userId`, `phone`, or any
 *     other obvious PII key. We assert on `email` as the canary.
 *
 * RED state — at HEAD `89d2d7b44` neither
 * `museum-frontend/shared/analytics/plausible.ts` nor
 * `museum-frontend/shared/analytics/useAnalyticsConsent.ts` exists (verified
 * via `ls museum-frontend/shared/analytics` → "DOES_NOT_EXIST"). The Jest
 * `require()` of the SUT throws "Cannot find module" inside each `it`, so
 * every assertion FAILS with an explicit "module missing" message that
 * directly identifies the RED contract that T-C54 green must satisfy.
 *
 * We do NOT use `jest.mock(..., {virtual:true})` for the consent hook because
 * jest-expo's moduleNameMapper resolver runs the `@/...` path mapping BEFORE
 * honouring the `virtual` flag → mock registration fails at hoist time and
 * masks the contract pins behind a configuration error. Instead, each `it`
 * requires the SUT directly, and the SUT module under green is expected to
 * export both `trackFunnelEvent` AND a test-injectable consent reader
 * `__setHasAnalyticsConsentForTest(fn)` so we can control consent without
 * needing to mock the hook module. If green prefers a different injection
 * mechanism (e.g. constructor adapter, env flag), it MUST expose an
 * equivalent test seam — the contract is "consent must be observable to a
 * test without mounting React".
 *
 * Frozen-test invariant (UFR-022 phase red) : this file is immutable
 * byte-for-byte once committed. Green agent that finds a test buggy MUST emit
 * `BLOCK-TEST-WRONG <file>:<line> <reason>` and the dispatcher will re-spawn
 * a fresh red phase. NEVER edit this file from a green/reviewer phase.
 *
 * Test runner : Jest (RN test pool — `npm test:rn` / `npm test`). The file
 * sits under `__tests__/analytics/` which matches the global
 * `testMatch: ['<rootDir>/__tests__/**\/*.test.{ts,tsx}']`. Scoped run :
 * `cd museum-frontend && npm test -- --testPathPattern=plausible-consent`.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

// Capture every outbound fetch the SUT performs. We replace the global rather
// than spy on `apiPost` because PATTERNS.md §3.3 wraps the proxy call through
// `apiPost(...)` from `@/shared/api/client`, which itself calls global fetch.
// Mocking at the fetch boundary catches BOTH a direct fetch AND an apiPost
// indirection — strictly stricter than a higher-level spy.
const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 202,
    headers: {
      get: (key: string) => (key.toLowerCase() === 'x-plausible-dropped' ? null : null),
    },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as unknown as Response);
  (globalThis as { fetch?: unknown }).fetch = fetchMock as unknown as typeof fetch;
});

// Environment : pin the proxy URL the SUT is expected to read via
// `readEnvString('PLAUSIBLE_ENDPOINT_URL')` (tasks.md T-C54). The exact env
// var name is implementation detail of green ; what we assert here is that
// the POST goes to the *path* `/api/telemetry/funnel` (D7) — so the URL
// suffix is the contract.
beforeAll(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test.musaium.local';
  process.env.EXPO_PUBLIC_PLAUSIBLE_ENDPOINT_URL =
    'https://api.test.musaium.local/api/telemetry/funnel';
  process.env.EXPO_PUBLIC_PLAUSIBLE_DOMAIN = 'musaium.test';
});

// ── SUT contract surface — what green MUST expose ───────────────────────────
//
// The two modules below are absent at HEAD ; their paths and exported
// signatures ARE the contract being pinned.
//
//   @/shared/analytics/plausible
//     export async function trackFunnelEvent(
//       name: string,
//       props?: Record<string, string>,
//     ): Promise<void>;
//     // Test seam — accepts a synchronous predicate returning current consent.
//     // Production callers obtain consent via `hasAnalyticsConsent()` from
//     // the hook module ; tests inject a fake predicate to bypass React.
//     export function __setHasAnalyticsConsentForTest(
//       fn: (() => boolean) | null,
//     ): void;
//
//   @/shared/analytics/useAnalyticsConsent
//     export function useAnalyticsConsent(): {
//       granted: boolean;
//       grant: () => void;
//       revoke: () => void;
//     };
//     export function hasAnalyticsConsent(): boolean;

interface PlausibleSut {
  trackFunnelEvent: (name: string, props?: Record<string, string>) => Promise<void>;
  __setHasAnalyticsConsentForTest: (fn: (() => boolean) | null) => void;
}

/**
 * Loads the SUT or throws a deterministic error message that names the
 * missing module path. Each `it` calls this — at HEAD every call throws,
 * each assertion FAILS with the same root cause, and the failure summary
 * names the green contract clearly.
 */
function loadPlausibleSut(): PlausibleSut {
  const mod = require('@/shared/analytics/plausible') as PlausibleSut;
  if (typeof mod.trackFunnelEvent !== 'function') {
    throw new Error(
      'Green contract violation: `@/shared/analytics/plausible` must export `trackFunnelEvent(name, props)` (PATTERNS.md §3.3).',
    );
  }
  if (typeof mod.__setHasAnalyticsConsentForTest !== 'function') {
    throw new Error(
      'Green contract violation: `@/shared/analytics/plausible` must export `__setHasAnalyticsConsentForTest(fn)` test seam so tests can control consent without mounting React.',
    );
  }
  return mod;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Wave C5 / T-C52 — Plausible consent gate (FE)', () => {
  afterEach(() => {
    // Defensive teardown — succeeds only after green ships the SUT, but
    // tolerates the RED state.
    try {
      const mod = require('@/shared/analytics/plausible') as Partial<PlausibleSut>;
      mod.__setHasAnalyticsConsentForTest?.(null);
    } catch {
      // SUT not loaded yet at HEAD — nothing to reset.
    }
    jest.resetModules();
  });

  it('R-C5b — consent NOT granted → 0 fetch call (fail-closed)', async () => {
    const sut = loadPlausibleSut();
    sut.__setHasAnalyticsConsentForTest(() => false);

    await sut.trackFunnelEvent('paywall_modal_shown', { tier: 'free' });

    // GDPR Art. 7 + R-C5b : ZERO network call when consent absent.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('R-C5 — consent granted → exactly 1 POST to /api/telemetry/funnel with {name, props, url, domain}', async () => {
    const sut = loadPlausibleSut();
    sut.__setHasAnalyticsConsentForTest(() => true);

    await sut.trackFunnelEvent('paywall_modal_shown', { tier: 'free' });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();

    const [requestUrl, init] = call as [unknown, RequestInit | undefined];
    const urlString = typeof requestUrl === 'string' ? requestUrl : String(requestUrl);

    // D7 (design.md) : mobile events routed via BE proxy at this path.
    expect(urlString).toContain('/api/telemetry/funnel');

    expect(init).toBeDefined();
    expect(init?.method).toBe('POST');

    // PATTERNS.md §2 : body MUST be JSON-encoded with name/url/domain present.
    const bodyRaw = init?.body;
    expect(typeof bodyRaw).toBe('string');
    const body = JSON.parse(bodyRaw as string) as Record<string, unknown>;

    expect(body.name).toBe('paywall_modal_shown');
    expect(typeof body.url).toBe('string');
    expect((body.url as string).length).toBeGreaterThan(0);
    expect(typeof body.domain).toBe('string');
    expect((body.domain as string).length).toBeGreaterThan(0);

    // The caller-supplied props are forwarded under `props` (PATTERNS.md §2 row 5).
    expect(body.props).toEqual(expect.objectContaining({ tier: 'free' }));
  });

  it('R-C5 anti-PII — consent granted + props.email supplied → emitted body MUST NOT contain email (defense-in-depth)', async () => {
    const sut = loadPlausibleSut();
    sut.__setHasAnalyticsConsentForTest(() => true);

    await sut.trackFunnelEvent('paywall_email_captured', {
      tier: 'free',
      // Adversarial caller — should NEVER reach the wire.
      email: 'leak@example.test',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as [unknown, RequestInit])[1];
    const body = JSON.parse(init.body as string) as { props?: Record<string, unknown> };

    // PATTERNS.md §5 anti-pattern #1 : "DON'T put PII into props". The
    // adapter MUST strip `email` before forwarding to Plausible.
    expect(body.props).toBeDefined();
    expect(body.props).not.toHaveProperty('email');

    // Defense-in-depth : the non-PII prop survives.
    expect(body.props).toEqual(expect.objectContaining({ tier: 'free' }));
  });
});
