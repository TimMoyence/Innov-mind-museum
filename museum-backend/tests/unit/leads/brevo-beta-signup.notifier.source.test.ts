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

  it('R3 backward-compat: payload without source keeps OPT_IN_SOURCE=landing_beta_waitlist', async () => {
    const fetchMock = mockFetchOnce({ status: 201, body: '{"id":43}' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);

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

  it('BetaSignupPayload accepts an optional `source` typed value at the port', () => {
    const payload = makePaywallInterestPayload({ email: 'shape@example.com' });
    expect(payload.source).toBe('paywall_premium_interest');
  });
});
