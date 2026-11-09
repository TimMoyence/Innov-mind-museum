import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheetRouter, useBottomSheetRouter } from '@/features/chat/ui/bottom-sheet-router';
import type {
  BottomSheetRouteDefinition,
  BottomSheetRouteId,
} from '@/features/chat/ui/bottom-sheet-router/routes';

const MockConsentContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-consent-content">
    <Text>mock-consent</Text>
    <Pressable accessibilityLabel="consent.accept" onPress={close} testID="mock-consent-accept">
      <Text>consent.accept</Text>
    </Pressable>
  </View>
);

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
