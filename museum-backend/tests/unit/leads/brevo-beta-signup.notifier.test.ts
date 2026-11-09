import {
  BrevoBetaSignupNotifier,
  NoopBetaSignupNotifier,
} from '@modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier';
import { logger } from '@shared/logger/logger';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';

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

describe('BrevoBetaSignupNotifier (R3 §3.4)', () => {
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

  it('POSTs to /v3/contacts with api-key header + listIds (R3 R13)', async () => {
    const fetchMock = mockFetchOnce({ status: 201, body: '{"id":42}' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);

    await notifier.subscribe(makeBetaSignupPayload());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/contacts');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['api-key']).toBe(API_KEY);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      email: 'visitor@example.com',
      listIds: [LIST_ID],
    });
    expect(body).toHaveProperty('updateEnabled');
  });

  it('resolves with outcome "subscribed" on 201 Created', async () => {
    mockFetchOnce({ status: 201, body: '{"id":42}' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);

    const result = await notifier.subscribe(makeBetaSignupPayload());
    expect(result).toEqual(expect.objectContaining({ outcome: 'subscribed' }));
  });

  it('resolves with outcome "duplicate" on 400 + duplicate_parameter (R16)', async () => {
    mockFetchOnce({
      status: 400,
      body: JSON.stringify({
        code: 'duplicate_parameter',
        message: 'Contact already exists',
      }),
    });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);

    const result = await notifier.subscribe(makeBetaSignupPayload());
    expect(result).toEqual(expect.objectContaining({ outcome: 'duplicate' }));
  });

  it('throws on other 4xx (e.g. 401 unauthorized)', async () => {
    mockFetchOnce({ status: 401, body: '{"message":"unauthorized"}' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);

    await expect(notifier.subscribe(makeBetaSignupPayload())).rejects.toThrow(/401/);
  });

  it('throws on 5xx (R15 — route propagates as 5xx)', async () => {
    mockFetchOnce({ status: 502, body: 'bad gateway' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);

    await expect(notifier.subscribe(makeBetaSignupPayload())).rejects.toThrow(/502/);
  });

  it('does NOT include the api key in thrown error messages', async () => {
    mockFetchOnce({ status: 503, body: 'service unavailable' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);

    try {
      await notifier.subscribe(makeBetaSignupPayload());
      throw new Error('expected subscribe to throw');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(API_KEY);
    }
  });
});

describe('NoopBetaSignupNotifier (R3 §1 R14)', () => {
  it('resolves with outcome "noop" without performing any fetch', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const notifier = new NoopBetaSignupNotifier();
    const result = await notifier.subscribe(makeBetaSignupPayload());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ outcome: 'noop' }));
  });
});
