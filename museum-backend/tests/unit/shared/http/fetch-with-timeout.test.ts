/**
 * UFR-022 red phase — PR-14 `fetchWithTimeout()` helper unit tests.
 * RUN_ID: 2026-05-23-pr-14-fetchWithTimeout.
 *
 * Behavioural contract tests for the shared helper at
 * `@shared/http/fetch-with-timeout`. The helper consolidates the
 * inline `AbortController + setTimeout + clearTimeout(finally)` pattern
 * previously duplicated across guardrail / embeddings adapters.
 *
 * Five cases (T5.1–T5.5 in design.md §3):
 *   T5.1 — resolves with the `Response` returned by `fetchImpl`; the internal
 *          timer is cleared on success (no leaked timer post-deadline).
 *   T5.2 — aborts with `AbortError` when `timeoutMs` elapses before fetch
 *          resolves; timer cleared on the abort path.
 *   T5.3 — `fetchImpl` DI is honoured: a custom fetch mock is invoked
 *          (the helper never falls back to global `fetch` when an impl is
 *          supplied) and timer is cleared when the mock rejects.
 *   T5.4 — caller-supplied `init.signal` composes via `AbortSignal.any`
 *          with the helper's internal controller; aborting the caller
 *          signal aborts the in-flight fetch.
 *   T5.5 — helper does NOT mutate the caller-supplied `init` object
 *          (shallow-cloned via spread; `signal` not assigned back into
 *          the original ref).
 *
 * Pre-green: this file FAILS because `@shared/http/fetch-with-timeout`
 * does not exist yet (module resolution error at import time, OR all 5
 * cases fail at runtime). Either is the desired red signal.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-14-fetchWithTimeout/spec.md §5.1 R1 / §5.1 R5 / §6 ED-3 / §6 ED-5
 *   .claude/skills/team/team-state/2026-05-23-pr-14-fetchWithTimeout/design.md §2 / §3
 *   .claude/skills/team/team-state/2026-05-23-pr-14-fetchWithTimeout/tasks.md T5
 */
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
    // Advance well past the deadline; a leaked timer would fire `controller.abort()`
    // here. With `clearTimeout` in `finally`, no pending timer remains.
    jest.advanceTimersByTime(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('T5.2 — aborts with AbortError when timeoutMs elapses before fetch resolves', async () => {
    // The fetch mock listens on `init.signal` and rejects only when aborted,
    // mirroring native `fetch` semantics so we can drive the timeout deterministically.
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

    // Capture the rejection synchronously to avoid unhandled-rejection warnings
    // when fake timers fire the abort.
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

    // The helper must have built a composed signal (NOT pass the caller signal
    // raw — that would prevent the internal timeout from also aborting it).
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
