import { fetchWithTimeout } from '@shared/http/fetch-with-timeout';

describe('fetchWithTimeout (T5.1–T5.5)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('T5.1 — resolves with the Response and clears the timer on success', async () => {
    const okResponse = new Response('ok');
    const fetchImpl: jest.Mock = jest.fn(async () => okResponse);

    const promise = fetchWithTimeout('http://x', {}, 1000, fetchImpl as unknown as typeof fetch);

    await expect(promise).resolves.toBe(okResponse);
    jest.advanceTimersByTime(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('T5.2 — aborts with AbortError when timeoutMs elapses before fetch resolves', async () => {
    const fetchImpl: jest.Mock = jest.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('test bug: fetchWithTimeout must pass a signal'));
            return;
          }
          signal.addEventListener('abort', () => {
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          });
        }),
    );

    const promise = fetchWithTimeout('http://x', {}, 50, fetchImpl as unknown as typeof fetch);

    const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    jest.advanceTimersByTime(60);
    await rejection;

    expect(jest.getTimerCount()).toBe(0);
  });

  it('T5.3 — honours `fetchImpl` DI (mock invoked) and clears the timer when it rejects', async () => {
    const boom = new TypeError('network');
    const fetchImpl: jest.Mock = jest.fn(async () => {
      throw boom;
    });

    await expect(
      fetchWithTimeout('http://x', {}, 1000, fetchImpl as unknown as typeof fetch),
    ).rejects.toBe(boom);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('T5.4 — composes caller-supplied `init.signal` via AbortSignal.any (caller abort aborts fetch)', async () => {
    const callerController = new AbortController();
    const fetchImpl: jest.Mock = jest.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('test bug: fetchWithTimeout must pass a signal'));
            return;
          }
          signal.addEventListener('abort', () => {
            reject(new DOMException('aborted via caller signal', 'AbortError'));
          });
        }),
    );

    const promise = fetchWithTimeout(
      'http://x',
      { signal: callerController.signal },
      5000,
      fetchImpl as unknown as typeof fetch,
    );

    const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    callerController.abort();
    await rejection;

    const passedInit = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(passedInit?.signal).toBeDefined();
    expect(passedInit?.signal).not.toBe(callerController.signal);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('T5.5 — does not mutate the caller-supplied `init` object', async () => {
    const init: RequestInit = { method: 'POST', body: 'payload' };
    const before = { ...init };
    const fetchImpl = jest.fn(async () => new Response('ok')) as unknown as typeof fetch;

    await fetchWithTimeout('http://x', init, 1000, fetchImpl);

    expect(init).toEqual(before);
    expect(init).not.toHaveProperty('signal');
  });
});
