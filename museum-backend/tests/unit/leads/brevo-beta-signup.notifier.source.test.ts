/**
 * R1 RED — BrevoBetaSignupNotifier `source` widening (T1, R1 §3.9 D9).
 *
 * Pins R1 §1 R19 + §3.9 D9 (chosen option c) down BEFORE implementation :
 *  - The `BetaSignupPayload` port is widened with an optional `source` field
 *    `'landing_beta_waitlist' | 'paywall_premium_interest'`.
 *  - The Brevo adapter reads `payload.source ?? 'landing_beta_waitlist'` and
 *    forwards as the `OPT_IN_SOURCE` Brevo contact attribute.
 *  - R3 callers that omit `source` retain the existing
 *    `'landing_beta_waitlist'` behavior (backward-compat — N12 of R3 stays
 *    intact).
 *  - R1 callers passing `source: 'paywall_premium_interest'` see the value
 *    propagated to Brevo verbatim — this is the funnel-discriminator
 *    `paywall_premium_interest` cohort that drives C6.5 telemetry (R1 §0.1).
 *
 * MUST FAIL at baseline `cd7e22bc` — `brevo-beta-signup.notifier.ts` hardcodes
 * `OPT_IN_SOURCE: 'landing_beta_waitlist'` (verified by inspection :
 * `src/modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier.ts:49`).
 *
 * This file is the dedicated R1 sister to the R3 brevo notifier test ; it
 * doesn't replace the existing tests, it widens the contract assertion to
 * cover the new optional field. Existing R3 assertions stay GREEN at HEAD
 * (verified in step 7 of the brief).
 */
import { BrevoBetaSignupNotifier } from '@modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier';
import { logger } from '@shared/logger/logger';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';
import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';

type FetchMock = jest.Mock<Promise<Response>, [string | URL | Request, RequestInit?]>;

function mockFetchOnce(response: { status: number; body: string }): FetchMock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    text: () => Promise.resolve(response.body),
  } as unknown as Response) as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('BrevoBetaSignupNotifier — source widening (R1 §3.9 D9)', () => {
  const API_KEY = 'test-brevo-api-key';
  const LIST_ID = 17;

  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ── R1 — new source propagates to Brevo OPT_IN_SOURCE ────────────────

  it("R1 §1 R19: source='paywall_premium_interest' propagates to Brevo OPT_IN_SOURCE attribute", async () => {
    const fetchMock = mockFetchOnce({ status: 201, body: '{"id":42}' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);

    await notifier.subscribe(makePaywallInterestPayload({ email: 'p@example.com' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      attributes?: Record<string, unknown>;
    };
    expect(body.attributes?.OPT_IN_SOURCE).toBe('paywall_premium_interest');
  });

  // ── R3 backward-compat — omitted source falls back to landing_beta_waitlist

  it('R3 backward-compat: payload without source keeps OPT_IN_SOURCE=landing_beta_waitlist', async () => {
    const fetchMock = mockFetchOnce({ status: 201, body: '{"id":43}' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);

    // `makeBetaSignupPayload` does NOT set `source` — mirrors the existing
    // R3 route handler call site that doesn't pass it. The adapter must
    // default to the legacy value so R3 funnel cohort labelling stays stable.
    await notifier.subscribe(makeBetaSignupPayload({ email: 'r3@example.com' }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      attributes?: Record<string, unknown>;
    };
    expect(body.attributes?.OPT_IN_SOURCE).toBe('landing_beta_waitlist');
  });

  it("explicit source='landing_beta_waitlist' (defensive) still produces the legacy attribute", async () => {
    const fetchMock = mockFetchOnce({ status: 201, body: '{"id":44}' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);

    await notifier.subscribe({
      email: 'legacy@example.com',
      consent: true,
      website: '',
      source: 'landing_beta_waitlist',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      attributes?: Record<string, unknown>;
    };
    expect(body.attributes?.OPT_IN_SOURCE).toBe('landing_beta_waitlist');
  });

  // ── Port-shape sanity — the optional field must be on the public payload

  it('BetaSignupPayload accepts an optional `source` typed value at the port', () => {
    // Compile-time + runtime smoke : the port file must export a
    // `BetaSignupPayload` whose `source` field accepts the R1 cohort literal.
    // At HEAD the field is absent — TypeScript will infer `unknown`/`never`
    // and the runtime structural assignment below still typechecks loosely,
    // but the brevo-adapter assertion above is what fails for the right
    // reason (`OPT_IN_SOURCE` doesn't switch).
    const payload = makePaywallInterestPayload({ email: 'shape@example.com' });
    expect(payload.source).toBe('paywall_premium_interest');
  });
});
