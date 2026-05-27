/**
 * Drop-in `@testing-library/react-native` re-export whose `render` defaults to
 * wrapping the tree in a {@link QueryClientProvider}.
 *
 * Why: the chat screen (`app/(stack)/chat/[sessionId].tsx`) now wires
 * `useCompareTrigger` → `useCompareImage`, a react-query `useMutation`. Rendered
 * outside a provider it throws "No QueryClient set, use QueryClientProvider to
 * set one". In production the screen is always mounted under
 * `PersistQueryClientProvider` (`app/_layout.tsx`) — these screen suites mount
 * it in isolation and previously had no client. This shim supplies one so the
 * pre-existing screen suites stay green without touching production code.
 *
 * Every other API mirrors RTL exactly (`screen`, `fireEvent`, `act`, `waitFor`,
 * …), so swapping the import source is the only change a suite needs. A caller
 * may pass its own `wrapper` / `queryClient` and they compose: the provider
 * wraps the caller's wrapper, which wraps the UI.
 */
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

/**
 * RTL `render` pre-wrapped with a {@link QueryClientProvider}. A fresh
 * retry-disabled client is created per call unless one is supplied. Composes
 * with any caller-provided `wrapper`.
 */
export function render(ui: ReactElement, options: ChatRenderOptions = {}): RenderResult {
  const { queryClient, wrapper: CallerWrapper, ...rest } = options;
  const client = queryClient ?? createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    const inner = CallerWrapper ? <CallerWrapper>{children}</CallerWrapper> : children;
    return <QueryClientProvider client={client}>{inner}</QueryClientProvider>;
  }

  return rtlRender(ui, { wrapper: Wrapper, ...rest });
}
