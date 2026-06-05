/**
 * useFetchData — generic GET hook for the admin app.
 *
 * Shipped 2026-05-23 (web refactor Phase 3, RUN_ID 2026-05-23-web-refactor-p3).
 * Consolidates the `useState(loading) + useState(error) + useState(data) +
 * useCallback(fetchX) + useEffect(() => void fetchX())` boilerplate that 9
 * admin pages repeated.
 *
 * Key behaviours :
 *   - Skips fetch when `url === null` (loading=false, data=undefined).
 *   - Aborts the in-flight fetch when `url` or any value in `options.deps`
 *     changes, when the component unmounts, OR when `refetch()` is called
 *     mid-flight. Cancellation is implemented with the closure-cell / ref-tick
 *     pattern documented in `lib-docs/react/PATTERNS.md` §3 (lines 75-97).
 *   - Detects a "paginated envelope" response shape
 *     (`{ data: T, totalPages?: number, total?: number }`) and exposes the
 *     pagination separately. Either the standard envelope returned by the
 *     backend OR a `parseData` callback that produces the same shape works.
 *   - Preserves the last successful `data` on a subsequent error — the UI
 *     keeps showing stale rows + an error banner rather than clearing.
 *
 * @example Paginated (standard envelope, no parseData needed)
 * ```ts
 * const { data, loading, error, pagination, refetch } = useFetchData<Ticket[]>(
 *   `/api/admin/tickets?${params}`,
 *   { deps: [page, statusFilter] },
 * );
 * const tickets = data ?? [];
 * const totalPages = pagination?.totalPages ?? 0;
 * ```
 *
 * @example Single-resource (response wrapped in a `{ ticket }` envelope)
 * ```ts
 * const { data: ticket, loading, error } = useFetchData<TicketDetail>(
 *   ticketId ? `/api/support/tickets/${ticketId}` : null,
 *   { deps: [ticketId], parseData: (raw) => (raw as { ticket: TicketDetail }).ticket },
 * );
 * ```
 *
 * Anti-pattern reminder (`lib-docs/react/PATTERNS.md` §5 lines 117-125) :
 *   - DON'T await a fetch then setState without a cancellation guard. This
 *     hook embeds that guard via `AbortController.signal.aborted`. New call
 *     sites that wrap their own awaits must reproduce the same guard.
 *
 * Out of scope (V2 backlog) :
 *   - `apiPost/apiPatch/apiPut/apiDelete` extensions for `{signal}`. Only
 *     `apiGet` accepts it today.
 *   - Distinct `isRefetching` / `idle` states. `loading=true` covers both
 *     initial-load and refetch ; consumers don't currently need finer-grained
 *     status.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { apiGet } from '@/lib/api';

// ── Public types ─────────────────────────────────────────────────────────

export interface UseFetchDataOptions<T> {
  /**
   * Reactive dependencies — when any changes (by reference/value), any in-flight
   * fetch is aborted and a new fetch is triggered. Default `[]`.
   */
  deps?: readonly unknown[];

  /**
   * Fallback string used as `error` when the caught value is not an `Error`.
   * Default `'Failed to load data'`.
   */
  errorFallback?: string;

  /**
   * Optional transformer. Receives the raw `unknown` response (post `apiGet`).
   * MAY return either:
   *   - `T` directly (single-value endpoint), OR
   *   - `{ data: T; totalPages?: number; total?: number }` (paginated wrapper).
   *
   * Wrapper-detection heuristic: if the returned value is a non-null,
   * non-array object that owns a `data` property AND (`totalPages` OR
   * `total`), it is treated as a paginated wrapper. Otherwise it is cast as
   * `T` directly.
   *
   * When omitted, the same heuristic is applied to the raw response.
   */
  parseData?: (response: unknown) => T | { data: T; totalPages?: number; total?: number };
}

export interface UseFetchDataPagination {
  totalPages: number;
  total: number;
}

export interface UseFetchDataResult<T> {
  /** Last successfully-fetched value, or `undefined` before first success. NEVER reset on refetch. */
  data: T | undefined;
  /** `true` from mount (when url !== null) until first fetch settles. Also `true` during refetch. */
  loading: boolean;
  /** Last fetch error message, or `null` on success / not-yet-fetched. */
  error: string | null;
  /** Present only when the response matched a paginated shape (envelope OR parseData wrapper). */
  pagination?: UseFetchDataPagination;
  /** Manually re-trigger a fetch with the current url + deps. Aborts any in-flight fetch. */
  refetch: () => Promise<void>;
}

// ── Internal helpers ────────────────────────────────────────────────────

interface PaginatedWrapper<T> {
  data: T;
  totalPages?: number;
  total?: number;
}

function isPaginatedWrapper(value: unknown): value is PaginatedWrapper<unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!('data' in v)) return false;
  return 'totalPages' in v || 'total' in v;
}

interface ParsedResponse<T> {
  data: T;
  pagination: UseFetchDataPagination | undefined;
}

function parseResponse<T>(raw: unknown, options?: UseFetchDataOptions<T>): ParsedResponse<T> {
  const candidate: unknown = options?.parseData ? options.parseData(raw) : raw;
  if (isPaginatedWrapper(candidate)) {
    const wrapper = candidate;
    return {
      data: wrapper.data as T,
      pagination: {
        totalPages: typeof wrapper.totalPages === 'number' ? wrapper.totalPages : 0,
        total: typeof wrapper.total === 'number' ? wrapper.total : 0,
      },
    };
  }
  return { data: candidate as T, pagination: undefined };
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err !== null && typeof err === 'object' && 'name' in err) {
    return (err as { name: unknown }).name === 'AbortError';
  }
  return false;
}

// ── Hook ────────────────────────────────────────────────────────────────

const DEFAULT_ERROR_FALLBACK = 'Failed to load data';

export function useFetchData<T>(
  url: string | null,
  options?: UseFetchDataOptions<T>,
): UseFetchDataResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  // Initial loading mirrors whether a fetch is going to fire on mount.
  const [loading, setLoading] = useState<boolean>(url !== null);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<UseFetchDataPagination | undefined>(undefined);

  // Hold the latest AbortController so cleanup / refetch / deps-change can cancel.
  // The closure-cell pattern (PATTERNS.md §3 b) uses a ref so the async callback
  // observes the *latest* tick, not a stale one captured at render time.
  const controllerRef = useRef<AbortController | null>(null);

  // Cache options that drive parsing without forcing the refetch identity to churn.
  // `parseData` and `errorFallback` references can change on every render in
  // call sites that build them inline — we read the latest from a ref instead
  // of treating them as deps.
  const optionsRef = useRef<UseFetchDataOptions<T> | undefined>(options);
  optionsRef.current = options;

  const deps = options?.deps ?? [];

  const refetch = useCallback(
    (): Promise<void> => {
      if (url === null) return Promise.resolve();

      // Abort any in-flight fetch before starting a new one. `.abort()` is a
      // no-op when nothing is pending, so this is safe to call unconditionally.
      // The previous controller's signal becoming aborted is the "completion"
      // event for whichever invocation owned it (initial useEffect or a prior
      // refetch) — its awaiter catches AbortError and short-circuits.
      controllerRef.current?.abort();

      const controller = new AbortController();
      controllerRef.current = controller;
      const signal = controller.signal;

      setLoading(true);
      setError(null);

      // Kick off the fetch synchronously (so the call-count + signal-propagation
      // are observable on the next microtask). State-update handlers run when
      // the fetch settles — they no-op if the controller has since been aborted
      // (closure-cell guard, `lib-docs/react/PATTERNS.md` §3 b lines 88-95).
      const settle = apiGet<unknown>(url, { signal }).then(
        (raw) => {
          if (signal.aborted) return;
          const parsed = parseResponse<T>(raw, optionsRef.current);
          setData(parsed.data);
          setPagination(parsed.pagination);
          setError(null);
          setLoading(false);
        },
        (err: unknown) => {
          if (signal.aborted || isAbortError(err)) return;
          const fallback = optionsRef.current?.errorFallback ?? DEFAULT_ERROR_FALLBACK;
          setError(err instanceof Error ? err.message : fallback);
          setLoading(false);
        },
      );

      // refetch() resolves once the fetch has been INITIATED (kick-off). The
      // settle handlers above continue to update state independently. This
      // contract matches the test expectations in `useFetchData.test.ts` T10
      // (`await refetch()` then resolve deferred outside the await).
      void settle;
      return Promise.resolve();
    },
    // Reactive deps : `url` plus any caller-supplied deps (spread). The
    // ESLint rule `react-hooks/exhaustive-deps` cannot statically introspect
    // the spread; this is a known and accepted limitation upstream. We do
    // NOT depend on `optionsRef.current` (read inline via ref to keep
    // refetch identity stable when callers pass inline option objects).
    [url, ...deps],
  );

  useEffect(() => {
    if (url === null) {
      // Null url path: ensure loading=false and no fetch fires.
      setLoading(false);
      return undefined;
    }

    void refetch();

    return () => {
      controllerRef.current?.abort();
    };
  }, [refetch, url]);

  return { data, loading, error, pagination, refetch };
}
