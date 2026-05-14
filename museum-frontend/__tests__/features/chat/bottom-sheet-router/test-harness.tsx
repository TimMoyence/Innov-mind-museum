/**
 * Test harness for BottomSheetRouter component-level tests (C4 / AC4-AC7).
 *
 * The real `*SheetContent` components do not yet exist (green-code-agent will
 * create them in T2-T7). To isolate router orchestration from the content
 * components, this harness defines mock content components with predictable
 * testIDs / a11y labels, then exposes `setupRouterWithRoutes()` which the
 * tests use to inject these mocks into the routes registry.
 *
 * Contract assumed (defined by spec §2.3):
 *   - `routes.ts` exports a mutable `ROUTES` map keyed by `BottomSheetRouteId`,
 *     each entry conforming to `BottomSheetRouteDefinition<K>`.
 *   - `BottomSheetRouter` reads `ROUTES[activeRoute]` to render the matching
 *     `Content` component, passing `params` + `close`.
 *   - `useBottomSheetRouter()` returns `{ activeRoute, open, close }`.
 *
 * If green-code-agent chooses a different registration mechanism (e.g.
 * `<BottomSheetRouter routes={...} />` prop injection), this harness will
 * need adjusting — but the test SEMANTICS (AC4-AC7) stay valid.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheetRouter, useBottomSheetRouter } from '@/features/chat/ui/bottom-sheet-router';
import type {
  BottomSheetRouteDefinition,
  BottomSheetRouteId,
} from '@/features/chat/ui/bottom-sheet-router/routes';

/** Mock content for the `consent` route (blocking, fullscreen). */
const MockConsentContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-consent-content">
    <Text>mock-consent</Text>
    <Pressable accessibilityLabel="consent.accept" onPress={close} testID="mock-consent-accept">
      <Text>consent.accept</Text>
    </Pressable>
  </View>
);

/** Mock content for the `context-menu` route (non-blocking, sheet). */
const MockContextMenuContent: React.FC<{
  message: { id: string };
  close: () => void;
}> = ({ message, close }) => (
  <View testID="mock-context-menu-content">
    <Text>mock-context-menu:{message.id}</Text>
    <Pressable accessibilityLabel="messageMenu.cancel" onPress={close}>
      <Text>messageMenu.cancel</Text>
    </Pressable>
  </View>
);

/**
 * Mock route definitions. Cast routes by-id for typing — the registry shape
 * uses generics per-id, mock values intentionally narrow the param type for
 * the test scope.
 */
export const mockRouteDefinitions: {
  consent: BottomSheetRouteDefinition<'consent'>;
  'context-menu': BottomSheetRouteDefinition<'context-menu'>;
} = {
  consent: {
    id: 'consent',
    presentation: 'fullscreen',
    blocking: true,
    a11yAnnounceKey: 'a11y.consent.opened',
    Content: MockConsentContent as BottomSheetRouteDefinition<'consent'>['Content'],
  },
  'context-menu': {
    id: 'context-menu',
    presentation: 'sheet',
    blocking: false,
    a11yAnnounceKey: 'a11y.contextMenu.opened',
    Content: MockContextMenuContent as BottomSheetRouteDefinition<'context-menu'>['Content'],
  },
};

/**
 * Replace the entries in the routes registry with the mock definitions above.
 * Mutates the imported `ROUTES` map; tests should call this in `beforeEach`.
 *
 * The contract assumed: `routes.ts` exports a top-level mutable `ROUTES`
 * record. If green-code-agent prefers `setRoute()` / immutability, adapt
 * this helper rather than the test bodies.
 */
export function installMockRoutes(): void {
  const routesModule = require('@/features/chat/ui/bottom-sheet-router/routes') as {
    ROUTES: Record<BottomSheetRouteId, BottomSheetRouteDefinition<BottomSheetRouteId>>;
  };
  routesModule.ROUTES.consent =
    mockRouteDefinitions.consent as BottomSheetRouteDefinition<BottomSheetRouteId>;
  routesModule.ROUTES['context-menu'] = mockRouteDefinitions[
    'context-menu'
  ] as BottomSheetRouteDefinition<BottomSheetRouteId>;
}

/**
 * Bridge component: mounts the router AND exposes an imperative handle so
 * tests can call `.open(...)` / `.close()` without rendering a real call-site.
 */
export interface RouterHandle {
  open: (
    route: BottomSheetRouteId,
    params: unknown,
    options?: { triggerNodeHandle?: number | null },
  ) => void;
  close: () => void;
  activeRoute: BottomSheetRouteId | null;
}

const HandleBridge = React.forwardRef<RouterHandle, object>((_props, ref) => {
  const router = useBottomSheetRouter();
  React.useImperativeHandle(
    ref,
    () => ({
      open: (route, params, options) => {
        // The hook is generically typed per route id — params are unknown here
        // because the test passes runtime objects shaped to each route.
        (
          router.open as (
            r: BottomSheetRouteId,
            p: unknown,
            o?: { triggerNodeHandle?: number | null },
          ) => void
        )(route, params, options);
      },
      close: () => {
        router.close();
      },
      get activeRoute() {
        return router.activeRoute;
      },
    }),
    [router],
  );
  return null;
});
HandleBridge.displayName = 'HandleBridge';

export const RouterTestHost = React.forwardRef<RouterHandle, object>((_props, ref) => (
  <View testID="router-test-host">
    <HandleBridge ref={ref} />
    <BottomSheetRouter />
  </View>
));
RouterTestHost.displayName = 'RouterTestHost';
