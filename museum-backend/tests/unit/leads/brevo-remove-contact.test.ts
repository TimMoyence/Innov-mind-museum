import {
  BrevoBetaSignupNotifier,
  NoopBetaSignupNotifier,
} from '@modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier';
import { logger } from '@shared/logger/logger';

import { getRemoveContact } from 'tests/helpers/leads/remove-contact.accessor';

type FetchMock = jest.Mock<Promise<Response>, [string | URL | Request, RequestInit?]>;

function mockFetchOnce(response: { status: number; body?: string }): FetchMock {
  const status = response.status;
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(response.body ?? ''),
  } as unknown as Response) as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('BrevoBetaSignupNotifier.removeContact (B2 / R4–R6)', () => {
  const API_KEY = 'super-secret-brevo-api-key';
  const LIST_ID = 17;
  const EMAIL = 'visitor+tag@example.com';

  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('is implemented on BrevoBetaSignupNotifier (RED: not yet implemented)', () => {
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);
    expect(getRemoveContact(notifier)).toBeInstanceOf(Function);
  });

  it('issues DELETE /v3/contacts/<encoded-email>?identifierType=email_id with api-key header (R4)', async () => {
    const fetchMock = mockFetchOnce({ status: 204 });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);
    const removeContact = getRemoveContact(notifier);
    expect(removeContact).toBeInstanceOf(Function);

    await removeContact!(EMAIL);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(EMAIL)}?identifierType=email_id`,
    );
    expect(init.method).toBe('DELETE');
    const headers = init.headers as Record<string, string>;
    expect(headers['api-key']).toBe(API_KEY);
  });

  it('treats a 404 (contact does not exist) as idempotent success — no throw (R5)', async () => {
    mockFetchOnce({ status: 404, body: '{"code":"document_not_found"}' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);
    const removeContact = getRemoveContact(notifier);
    expect(removeContact).toBeInstanceOf(Function);

    await expect(removeContact!(EMAIL)).resolves.not.toThrow();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('throws on 5xx WITHOUT leaking the api-key in the error message (R6, security)', async () => {
    mockFetchOnce({ status: 502, body: 'bad gateway' });
    const notifier = new BrevoBetaSignupNotifier(API_KEY, LIST_ID);
    const removeContact = getRemoveContact(notifier);
    expect(removeContact).toBeInstanceOf(Function);

    let caught: unknown;
    try {
      await removeContact!(EMAIL);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/502/);
    expect((caught as Error).message).not.toContain(API_KEY);
  });
});

describe('NoopBetaSignupNotifier.removeContact (R6)', () => {
  it('resolves with { outcome: "noop" } and makes no network call', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const notifier = new NoopBetaSignupNotifier();
    const removeContact = getRemoveContact(notifier);
    expect(removeContact).toBeInstanceOf(Function);

    const result = await removeContact!('anyone@example.com');
    expect(result).toEqual(expect.objectContaining({ outcome: 'noop' }));
    expect(fetchSpy).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});
