import { queryClient } from '@/shared/data/queryClient';
import type { AppError } from '@/shared/types/AppError';

describe('queryClient defaults', () => {
  it('sets a 5 minute stale time', () => {
    const defaults = queryClient.getDefaultOptions().queries;
    expect(defaults?.staleTime).toBe(5 * 60 * 1000);
  });

  it('sets a 24h gc time so persisted cache stays usable at cold start', () => {
    const defaults = queryClient.getDefaultOptions().queries;
    expect(defaults?.gcTime).toBe(24 * 60 * 60 * 1000);
  });

  it('refetches on reconnect but not on window focus (mobile AppState handles it)', () => {
    const defaults = queryClient.getDefaultOptions().queries;
    expect(defaults?.refetchOnReconnect).toBe(true);
    expect(defaults?.refetchOnWindowFocus).toBe(false);
  });

  it('disables retries for terminal AppError kinds', () => {
    const retry = queryClient.getDefaultOptions().queries?.retry as
      | ((failureCount: number, error: unknown) => boolean)
      | undefined;
    expect(retry).toBeDefined();

    const terminalKinds: AppError['kind'][] = [
      'Unauthorized',
      'Forbidden',
      'NotFound',
      'Validation',
      'DailyLimitReached',
      'RateLimited',
    ];
    for (const kind of terminalKinds) {
      expect(retry?.(0, { kind, message: 'x' } as unknown)).toBe(false);
    }
  });

  it('retries retriable AppError kinds up to 2 times', () => {
    const retry = queryClient.getDefaultOptions().queries?.retry as
      | ((failureCount: number, error: unknown) => boolean)
      | undefined;
    expect(retry?.(0, { kind: 'Network', message: 'x' })).toBe(true);
    expect(retry?.(1, { kind: 'Timeout', message: 'x' })).toBe(true);
    expect(retry?.(2, { kind: 'Network', message: 'x' })).toBe(false);
  });
});
