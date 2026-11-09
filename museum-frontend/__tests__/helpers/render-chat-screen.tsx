import { QueryClientProvider } from '@tanstack/react-query';
import {
  render as rtlRender,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react-native';

import { createTestQueryClient } from './data/renderWithQueryClient';

import type { QueryClient } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

export * from '@testing-library/react-native';

type ChatRenderOptions = RenderOptions & { queryClient?: QueryClient };

export function render(ui: ReactElement, options: ChatRenderOptions = {}): RenderResult {
  const { queryClient, wrapper: CallerWrapper, ...rest } = options;
  const client = queryClient ?? createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    const inner = CallerWrapper ? <CallerWrapper>{children}</CallerWrapper> : children;
    return <QueryClientProvider client={client}>{inner}</QueryClientProvider>;
  }

  return rtlRender(ui, { wrapper: Wrapper, ...rest });
}
