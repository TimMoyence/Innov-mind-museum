import { useCallback, useEffect, useRef, useState } from 'react';

import { apiGet } from '@/lib/api';

export interface UseFetchDataOptions<T> {
  deps?: readonly (string | number | boolean | null | undefined)[];

  errorFallback?: string;

  parseData?: (response: unknown) => T | { data: T; totalPages?: number; total?: number };
}

export interface UseFetchDataPagination {
  totalPages: number;
  total: number;
}

export interface UseFetchDataResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  pagination?: UseFetchDataPagination;
  refetch: () => Promise<void>;
}

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

const DEFAULT_ERROR_FALLBACK = 'Failed to load data';

export function useFetchData<T>(
  url: string | null,
  options?: UseFetchDataOptions<T>,
): UseFetchDataResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(url !== null);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<UseFetchDataPagination | undefined>(undefined);

  const controllerRef = useRef<AbortController | null>(null);

  const optionsRef = useRef<UseFetchDataOptions<T> | undefined>(options);
  optionsRef.current = options;

  const depsKey = JSON.stringify(options?.deps ?? []);

  const refetch = useCallback((): Promise<void> => {
    if (url === null) return Promise.resolve();

    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;
    const signal = controller.signal;

    setLoading(true);
    setError(null);

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

    void settle;
    return Promise.resolve();
  }, [url]);

  useEffect(() => {
    if (url === null) {
      setLoading(false);
      return undefined;
    }

    void refetch();

    return () => {
      controllerRef.current?.abort();
    };
  }, [refetch, url, depsKey]);

  return { data, loading, error, pagination, refetch };
}
