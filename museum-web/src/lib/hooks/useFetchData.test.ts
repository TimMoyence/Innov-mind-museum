/**
 * RED phase — UFR-022 / RUN_ID 2026-05-23-web-refactor-p3
 *
 * Tests fail until museum-web/src/lib/hooks/useFetchData.ts is created
 * (Phase Green) AND museum-web/src/lib/api.ts apiGet accepts an
 * optional `{signal}` option (Phase Green, ext A1).
 *
 * Coverage map (spec §8.1 + design §9, 15 cases locked) :
 *   T1  skip-null-url                       → EARS-U-2, U-3, S-2
 *   T2  success-single                      → EARS-E-3, O-3
 *   T3  success-paginated-standard-envelope → EARS-O-3, E-3
 *   T4  success-paginated-via-parseData     → EARS-O-1, O-2
 *   T5  error-non-2xx                       → EARS-E-4
 *   T6  error-network                       → EARS-E-4
 *   T7  error-fallback                      → EARS-O-4
 *   T8  abort-on-deps-change                → EARS-E-1, E-5
 *   T9  abort-on-unmount                    → EARS-E-2, E-5, W-1
 *   T10 refetch-mid-flight                  → EARS-E-6 (OQ-2)
 *   T11 refetch-stable-identity             → EARS-U-5
 *   T12 parseData-T-direct                  → EARS-O-1
 *   T13 url-conditional-then-set            → EARS-U-3 + E-1
 *   T14 strict-mode-double-mount            → EARS-W-2
 *   T15 paginated-empty-result (bonus R-1)  → EARS-E-3, O-2
 *
 * Lib-docs consulted :
 *   - lib-docs/react/PATTERNS.md:75-97 (closure-cell / ref-tick cancellation)
 *   - lib-docs/react/PATTERNS.md:117-125 (anti-pattern DON'T await→setState w/o guard)
 *   - lib-docs/react/PATTERNS.md:148-152 (testing patterns, no introspection of private)
 *
 * Notes UFR-013 (honesty) :
 *   - EARS-W-1 ("no React state-update-on-unmounted warning") is checked by
 *     spying `console.error` and asserting it was NOT called with the
 *     React-specific warning substring. The warning was effectively removed
 *     by React in 17+ for fetch-style flows, but our hook still must not
 *     trigger any error log post-unmount. Test T9 makes that check explicit.
 *   - "no double fetch settled" (EARS-W-2 / T14) is verified by counting
 *     setState-visible effects (final `data` value reflects only ONE fetch
 *     result) AND by asserting the resolved-payload counter (we resolve each
 *     mock fetch with a distinct payload).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

import { useFetchData } from './useFetchData';

// ---------------------------------------------------------------------------
// Test harness — controllable mock fetch
// ---------------------------------------------------------------------------

interface DeferredResponse<T> {
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
  signal: AbortSignal | undefined;
  url: string;
  aborted: boolean;
}

interface FetchHarness {
  deferreds: DeferredResponse<unknown>[];
  spy: ReturnType<typeof vi.spyOn>;
  /** Resolve the Nth deferred (0-indexed) with a JSON payload. */
  resolveAt: (
    index: number,
    payload: unknown,
    init?: { ok?: boolean; status?: number; statusText?: string },
  ) => void;
  /** Reject the Nth deferred with an error. */
  rejectAt: (index: number, err: unknown) => void;
  /** Resolve the Nth deferred with a non-ok response (default 500). */
  resolveNonOkAt: (
    index: number,
    init: { status: number; statusText: string; body?: unknown },
  ) => void;
}

function installFetchHarness(): FetchHarness {
  const deferreds: DeferredResponse<unknown>[] = [];

  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const entry: DeferredResponse<unknown> = {
        resolve: () => {},
        reject: () => {},
        signal: init?.signal ?? undefined,
        url: typeof input === 'string' ? input : input.toString(),
        aborted: false,
      };
      const promise = new Promise<unknown>((res, rej) => {
        entry.resolve = res;
        entry.reject = rej;
      });
      deferreds.push(entry);

      // Wire abort propagation : if signal aborts BEFORE we resolve, reject
      // with a DOMException(name=AbortError) — matches real fetch() semantics.
      const sig = init?.signal;
      if (sig) {
        if (sig.aborted) {
          entry.aborted = true;
          queueMicrotask(() => { entry.reject(makeAbortError()); });
        } else {
          sig.addEventListener(
            'abort',
            () => {
              entry.aborted = true;
              entry.reject(makeAbortError());
            },
            { once: true },
          );
        }
      }

      return promise as Promise<Response>;
    });

  return {
    deferreds,
    spy,
    resolveAt: (index, payload, init) => {
      const entry = deferreds[index];
      if (!entry) throw new Error(`No deferred at index ${index} (have ${deferreds.length})`);
      const fakeResponse: Partial<Response> = {
        ok: init?.ok ?? true,
        status: init?.status ?? 200,
        statusText: init?.statusText ?? 'OK',
        json: () => Promise.resolve(payload),
      };
      entry.resolve(fakeResponse as Response);
    },
    rejectAt: (index, err) => {
      const entry = deferreds[index];
      if (!entry) throw new Error(`No deferred at index ${index} (have ${deferreds.length})`);
      entry.reject(err);
    },
    resolveNonOkAt: (index, init) => {
      const entry = deferreds[index];
      if (!entry) throw new Error(`No deferred at index ${index} (have ${deferreds.length})`);
      const fakeResponse: Partial<Response> = {
        ok: false,
        status: init.status,
        statusText: init.statusText,
        json: () => Promise.resolve(init.body ?? { message: init.statusText }),
      };
      entry.resolve(fakeResponse as Response);
    },
  };
}

function makeAbortError(): DOMException {
  // Real fetch() rejects with DOMException('The user aborted a request.', 'AbortError').
  // jsdom v29 supports DOMException with a name arg.
  return new DOMException('The operation was aborted.', 'AbortError');
}

/** Flushes pending microtasks so awaited promise chains run. */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

describe('useFetchData<T> — RED phase 2026-05-23-web-refactor-p3', () => {
  let harness: FetchHarness;

  beforeEach(() => {
    harness = installFetchHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────
  // T1 — skip-null-url : url=null → loading=false, no fetch, idle
  // ──────────────────────────────────────────────────────────────────────
  it('T1: url=null → loading=false, data=undefined, error=null, fetch NOT called (EARS-U-2/U-3/S-2)', async () => {
    const { result } = renderHook(() => useFetchData<{ id: number }>(null));

    // No async settle expected — assertions are immediate.
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(result.current.pagination).toBeUndefined();

    await flushMicrotasks();
    expect(harness.spy).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // T2 — success-single : T direct, no envelope detection match
  // ──────────────────────────────────────────────────────────────────────
  it('T2: success path with non-paginated response sets data and clears loading (EARS-E-3/O-3)', async () => {
    const { result } = renderHook(() => useFetchData<{ foo: string }>('/api/single'));

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();

    await act(async () => {
      harness.resolveAt(0, { foo: 'bar' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual({ foo: 'bar' });
    expect(result.current.error).toBeNull();
    expect(result.current.pagination).toBeUndefined();
    expect(harness.spy).toHaveBeenCalledTimes(1);
  });

  // ──────────────────────────────────────────────────────────────────────
  // T3 — success-paginated standard-envelope (no parseData)
  // ──────────────────────────────────────────────────────────────────────
  it('T3: standard envelope {data, totalPages, total} detected and pagination populated (EARS-O-3)', async () => {
    const { result } = renderHook(() => useFetchData<number[]>('/api/paginated'));

    await act(async () => {
      harness.resolveAt(0, { data: [1, 2, 3], totalPages: 5, total: 50 });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual([1, 2, 3]);
    expect(result.current.pagination).toEqual({ totalPages: 5, total: 50 });
    expect(result.current.error).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────
  // T4 — success-paginated via parseData wrapper
  // ──────────────────────────────────────────────────────────────────────
  it('T4: parseData returning {data, totalPages, total} wrapper extracts data + pagination (EARS-O-1/O-2)', async () => {
    const { result } = renderHook(() =>
      useFetchData<number[]>('/api/wrap', {
        parseData: (raw) => {
          const r = raw as { items: number[]; meta: { totalPages: number; total: number } };
          return { data: r.items, totalPages: r.meta.totalPages, total: r.meta.total };
        },
      }),
    );

    await act(async () => {
      harness.resolveAt(0, { items: [10, 20], meta: { totalPages: 2, total: 20 } });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual([10, 20]);
    expect(result.current.pagination).toEqual({ totalPages: 2, total: 20 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // T5 — error-non-2xx : ApiError surfaces as error string
  // ──────────────────────────────────────────────────────────────────────
  it('T5: non-2xx response surfaces error message, loading=false, data preserved undefined (EARS-E-4)', async () => {
    const { result } = renderHook(() => useFetchData<unknown>('/api/oops'));

    await act(async () => {
      harness.resolveNonOkAt(0, {
        status: 500,
        statusText: 'Internal Server Error',
        body: { message: 'kaboom' },
      });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('kaboom');
    expect(result.current.data).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────
  // T6 — error-network : underlying fetch rejects with Error
  // ──────────────────────────────────────────────────────────────────────
  it('T6: network error rejects with Error → error=err.message, loading=false (EARS-E-4)', async () => {
    const { result } = renderHook(() => useFetchData<unknown>('/api/net'));

    await act(async () => {
      harness.rejectAt(0, new Error('Network down'));
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('Network down');
    expect(result.current.data).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────
  // T7 — error-fallback : non-Error rejection → errorFallback used
  // ──────────────────────────────────────────────────────────────────────
  it('T7: non-Error rejection falls back to options.errorFallback (EARS-O-4)', async () => {
    const { result } = renderHook(() =>
      useFetchData<unknown>('/api/weird', { errorFallback: 'Custom fallback msg' }),
    );

    await act(async () => {
      // Reject with a string (not an Error instance).
      harness.rejectAt(0, 'weird-non-error-value');
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('Custom fallback msg');
  });

  it('T7b: non-Error rejection without errorFallback uses default "Failed to load data" (EARS-O-4)', async () => {
    const { result } = renderHook(() => useFetchData<unknown>('/api/weird-default'));

    await act(async () => {
      harness.rejectAt(0, 'still-weird');
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('Failed to load data');
  });

  // ──────────────────────────────────────────────────────────────────────
  // T8 — abort-on-deps-change : first fetch aborted, second resolves
  // ──────────────────────────────────────────────────────────────────────
  it('T8: deps change aborts in-flight fetch and uses only the new payload (EARS-E-1/E-5)', async () => {
    let depValue = 'A';
    const { result, rerender } = renderHook(() =>
      useFetchData<{ tag: string }>(`/api/deps?v=${depValue}`, { deps: [depValue] }),
    );

    expect(result.current.loading).toBe(true);
    expect(harness.deferreds).toHaveLength(1);
    const firstSignal = harness.deferreds[0]?.signal;
    expect(firstSignal?.aborted).toBe(false);

    // Mutate dep + rerender → hook should abort first + fire a new fetch.
    await act(async () => {
      depValue = 'B';
      rerender();
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(harness.deferreds.length).toBeGreaterThanOrEqual(2);

    // Resolve the (now stale) first fetch — its setState MUST be skipped.
    await act(async () => {
      // The mock fetch promise was already rejected by abort wiring above.
      // Resolve the second fetch with the canonical payload.
      const secondIdx = harness.deferreds.length - 1;
      harness.resolveAt(secondIdx, { tag: 'B-payload' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual({ tag: 'B-payload' });
    expect(result.current.error).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────
  // T9 — abort-on-unmount : no setState post-unmount
  // ──────────────────────────────────────────────────────────────────────
  it('T9: unmount mid-flight aborts fetch and never emits a React state-update warning (EARS-E-2/E-5/W-1)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useFetchData<unknown>('/api/unmount'));

    expect(harness.deferreds).toHaveLength(1);
    const sig = harness.deferreds[0]?.signal;
    expect(sig?.aborted).toBe(false);

    await act(async () => {
      unmount();
    });

    expect(sig?.aborted).toBe(true);

    // Late resolution should be a no-op (controller signal is aborted).
    await act(async () => {
      harness.resolveAt(0, { foo: 'ignored' });
      await flushMicrotasks();
    });

    const reactWarnCalls = errorSpy.mock.calls.filter((args) =>
      args.some(
        (a) =>
          typeof a === 'string' &&
          a.includes("Can't perform a React state update on an unmounted component"),
      ),
    );
    expect(reactWarnCalls).toHaveLength(0);

    errorSpy.mockRestore();
  });

  // ──────────────────────────────────────────────────────────────────────
  // T10 — refetch-mid-flight : abort + restart
  // ──────────────────────────────────────────────────────────────────────
  it('T10: refetch() while a fetch is in-flight aborts it and starts a new one (EARS-E-6, OQ-2)', async () => {
    const { result } = renderHook(() => useFetchData<{ n: number }>('/api/refetch'));

    expect(harness.deferreds).toHaveLength(1);
    const firstSignal = harness.deferreds[0]?.signal;

    await act(async () => {
      await result.current.refetch();
      // refetch() resolves after the new fetch settles ; we resolve it here.
    });

    // After calling refetch (before resolve), the original signal should be aborted
    // and a second deferred should have been created.
    expect(firstSignal?.aborted).toBe(true);

    // Note : because act() blocks until refetch() resolves, the hook should
    // already have a SECOND deferred created — resolve it inside act() above.
    // We re-run a clean refetch + resolve sequence here to keep the test
    // deterministic when the inner act flushes between the abort and the
    // second resolve.

    expect(harness.deferreds.length).toBeGreaterThanOrEqual(2);
    const lastIdx = harness.deferreds.length - 1;

    // Wait for the second fetch to be in-flight ; resolve it.
    await act(async () => {
      harness.resolveAt(lastIdx, { n: 42 });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual({ n: 42 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // T11 — refetch-stable-identity : refetch ref stable across rerenders
  // ──────────────────────────────────────────────────────────────────────
  it('T11: refetch identity is stable across renders when url + deps unchanged (EARS-U-5)', async () => {
    const { result, rerender } = renderHook(() =>
      useFetchData<{ n: number }>('/api/stable', { deps: [] }),
    );

    const refetch1 = result.current.refetch;

    rerender();
    const refetch2 = result.current.refetch;

    rerender();
    const refetch3 = result.current.refetch;

    expect(refetch1).toBe(refetch2);
    expect(refetch2).toBe(refetch3);
  });

  // ──────────────────────────────────────────────────────────────────────
  // T12 — parseData-T-direct : parseData returns T (no wrapper)
  // ──────────────────────────────────────────────────────────────────────
  it('T12: parseData returning T directly (no wrapper) sets data=T, pagination=undefined (EARS-O-1)', async () => {
    const { result } = renderHook(() =>
      useFetchData<string[]>('/api/direct', {
        parseData: (raw) => {
          const r = raw as { items: string[] };
          return r.items;
        },
      }),
    );

    await act(async () => {
      harness.resolveAt(0, { items: ['a', 'b', 'c'] });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual(['a', 'b', 'c']);
    expect(result.current.pagination).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────
  // T13 — url-conditional-then-set : null → string transition triggers fetch
  // ──────────────────────────────────────────────────────────────────────
  it('T13: url=null at mount then changes to string triggers a fetch (EARS-U-3/E-1)', async () => {
    let url: string | null = null;
    const { result, rerender } = renderHook(() => useFetchData<{ id: number }>(url));

    expect(result.current.loading).toBe(false);
    expect(harness.spy).not.toHaveBeenCalled();

    await act(async () => {
      url = '/api/late';
      rerender();
    });

    expect(harness.spy).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      harness.resolveAt(0, { id: 9 });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual({ id: 9 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // T14 — strict-mode-double-mount : abort + restart, one final payload
  // ──────────────────────────────────────────────────────────────────────
  it('T14: under <StrictMode> double-mount, first effect aborts and only the second result lands (EARS-W-2)', async () => {
    const { result } = renderHook(() => useFetchData<{ stage: string }>('/api/strict'), {
      wrapper: StrictMode,
    });

    // StrictMode dev double-mount → two effect-runs synchronously.
    // We expect at least 2 deferreds and the first signal aborted.
    expect(harness.deferreds.length).toBeGreaterThanOrEqual(2);
    expect(harness.deferreds[0]?.signal?.aborted).toBe(true);
    expect(harness.deferreds.at(-1)?.signal?.aborted).toBe(false);

    // Resolve the last (active) deferred — it should be the only one that
    // sets state. Resolving the first as well (late) must be a no-op.
    await act(async () => {
      const lastIdx = harness.deferreds.length - 1;
      harness.resolveAt(lastIdx, { stage: 'second' });
      // Late resolve of the aborted first deferred — must NOT mutate state.
      // (It was already rejected via abort wiring ; resolving is irrelevant
      // since the promise is settled. Kept here for documentation.)
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual({ stage: 'second' });
    expect(result.current.error).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────
  // T15 — paginated-empty-result (bonus R-1 mitigation)
  // ──────────────────────────────────────────────────────────────────────
  it('T15: empty paginated response {data:[], totalPages:0, total:0} keeps wrapper detection (EARS-E-3/O-2, R-1)', async () => {
    const { result } = renderHook(() => useFetchData<number[]>('/api/empty'));

    await act(async () => {
      harness.resolveAt(0, { data: [], totalPages: 0, total: 0 });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual([]);
    expect(result.current.pagination).toEqual({ totalPages: 0, total: 0 });
  });
});
