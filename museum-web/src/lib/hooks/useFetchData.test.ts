import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

import { useFetchData } from './useFetchData';

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
  resolveAt: (
    index: number,
    payload: unknown,
    init?: { ok?: boolean; status?: number; statusText?: string },
  ) => void;
  rejectAt: (index: number, err: unknown) => void;
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

      const sig = init?.signal;
      if (sig) {
        if (sig.aborted) {
          entry.aborted = true;
          queueMicrotask(() => {
            entry.reject(makeAbortError());
          });
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
  return new DOMException('The operation was aborted.', 'AbortError');
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('useFetchData<T> — RED phase 2026-05-23-web-refactor-p3', () => {
  let harness: FetchHarness;

  beforeEach(() => {
    harness = installFetchHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T1: url=null → loading=false, data=undefined, error=null, fetch NOT called (EARS-U-2/U-3/S-2)', async () => {
    const { result } = renderHook(() => useFetchData<{ id: number }>(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(result.current.pagination).toBeUndefined();

    await flushMicrotasks();
    expect(harness.spy).not.toHaveBeenCalled();
  });

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

  it('T7: non-Error rejection falls back to options.errorFallback (EARS-O-4)', async () => {
    const { result } = renderHook(() =>
      useFetchData<unknown>('/api/weird', { errorFallback: 'Custom fallback msg' }),
    );

    await act(async () => {
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

  it('T8: deps change aborts in-flight fetch and uses only the new payload (EARS-E-1/E-5)', async () => {
    let depValue = 'A';
    const { result, rerender } = renderHook(() =>
      useFetchData<{ tag: string }>(`/api/deps?v=${depValue}`, { deps: [depValue] }),
    );

    expect(result.current.loading).toBe(true);
    expect(harness.deferreds).toHaveLength(1);
    const firstSignal = harness.deferreds[0]?.signal;
    expect(firstSignal?.aborted).toBe(false);

    await act(async () => {
      depValue = 'B';
      rerender();
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(harness.deferreds.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      const secondIdx = harness.deferreds.length - 1;
      harness.resolveAt(secondIdx, { tag: 'B-payload' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual({ tag: 'B-payload' });
    expect(result.current.error).toBeNull();
  });

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

  it('T10: refetch() while a fetch is in-flight aborts it and starts a new one (EARS-E-6, OQ-2)', async () => {
    const { result } = renderHook(() => useFetchData<{ n: number }>('/api/refetch'));

    expect(harness.deferreds).toHaveLength(1);
    const firstSignal = harness.deferreds[0]?.signal;

    await act(async () => {
      await result.current.refetch();
    });

    expect(firstSignal?.aborted).toBe(true);

    expect(harness.deferreds.length).toBeGreaterThanOrEqual(2);
    const lastIdx = harness.deferreds.length - 1;

    await act(async () => {
      harness.resolveAt(lastIdx, { n: 42 });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual({ n: 42 });
  });

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

  it('T14: under <StrictMode> double-mount, first effect aborts and only the second result lands (EARS-W-2)', async () => {
    const { result } = renderHook(() => useFetchData<{ stage: string }>('/api/strict'), {
      wrapper: StrictMode,
    });

    expect(harness.deferreds.length).toBeGreaterThanOrEqual(2);
    expect(harness.deferreds[0]?.signal?.aborted).toBe(true);
    expect(harness.deferreds.at(-1)?.signal?.aborted).toBe(false);

    await act(async () => {
      const lastIdx = harness.deferreds.length - 1;
      harness.resolveAt(lastIdx, { stage: 'second' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual({ stage: 'second' });
    expect(result.current.error).toBeNull();
  });

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
