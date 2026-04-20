import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, type RenderOptions } from '@testing-library/react-native';

/**
 * Creates a fresh {@link QueryClient} tuned for tests: zero retries, zero
 * stale-time, no network retries. Every test should build its own client to
 * guarantee isolation.
 */
export const createTestQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

const withClient =
  (client: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

/** Wraps `render` with a QueryClient scoped to the test. */
export const renderWithQueryClient = (
  ui: React.ReactElement,
  options: Omit<RenderOptions, 'wrapper'> & { queryClient?: QueryClient } = {},
) => {
  const { queryClient, ...rest } = options;
  const client = queryClient ?? createTestQueryClient();
  return {
    client,
    ...render(ui, { wrapper: withClient(client), ...rest }),
  };
};

/** Wraps `renderHook` with a QueryClient scoped to the test. */
export const renderHookWithQueryClient = <TProps, TResult>(
  callback: (props: TProps) => TResult,
  options: { queryClient?: QueryClient; initialProps?: TProps } = {},
) => {
  const { queryClient, initialProps } = options;
  const client = queryClient ?? createTestQueryClient();
  const result = renderHook(callback, {
    wrapper: withClient(client),
    initialProps,
  });
  return { client, ...result };
};
