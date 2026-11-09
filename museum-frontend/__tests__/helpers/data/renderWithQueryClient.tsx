import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, type RenderOptions } from '@testing-library/react-native';

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
        gcTime: Infinity,
      },
    },
  });

const withClient = (client: QueryClient) => {
  function QueryClientTestWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return QueryClientTestWrapper;
};

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
