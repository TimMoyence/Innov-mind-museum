/**
 * Test harness extension for the backdrop-dismiss / pointer-events red phase
 * (UFR-022 run `2026-05-23-chat-composer-buttons-modal-dismiss`).
 *
 * Adds mock content + route definitions for the non-blocking + blocking C4
 * routes the original `test-harness.tsx` does NOT register
 * (`attachment-picker`, `browser`, `summary`, `voice-intro`, `daily-limit`).
 *
 * This file is additive and does NOT mutate the existing `test-harness.tsx`
 * — it imports & re-exports `installMockRoutes` / `RouterTestHost` so the
 * existing tests stay byte-stable.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheetRouter, useBottomSheetRouter } from '@/features/chat/ui/bottom-sheet-router';
import type {
  BottomSheetRouteDefinition,
  BottomSheetRouteId,
} from '@/features/chat/ui/bottom-sheet-router/routes';

const MockAttachmentPickerContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-attachment-picker-content">
    <Text>mock-attachment-picker</Text>
    <Pressable
      accessibilityLabel="attachmentPicker.close"
      onPress={close}
      testID="mock-attachment-picker-close"
    >
      <Text>attachmentPicker.close</Text>
    </Pressable>
  </View>
);

const MockBrowserContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-browser-content">
    <Text>mock-browser</Text>
    <Pressable accessibilityLabel="browser.close" onPress={close} testID="mock-browser-close">
      <Text>browser.close</Text>
    </Pressable>
  </View>
);

const MockSummaryContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-summary-content">
    <Text>mock-summary</Text>
    <Pressable accessibilityLabel="summary.close" onPress={close} testID="mock-summary-close">
      <Text>summary.close</Text>
    </Pressable>
  </View>
);

const MockAiDisclosureContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-ai-disclosure-content">
    <Text>mock-ai-disclosure</Text>
    <Pressable
      accessibilityLabel="aiDisclosure.close"
      onPress={close}
      testID="mock-ai-disclosure-close"
    >
      <Text>aiDisclosure.close</Text>
    </Pressable>
  </View>
);

const MockCartelScannerContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-cartel-scanner-content">
    <Text>mock-cartel-scanner</Text>
    <Pressable
      accessibilityLabel="cartelScanner.close"
      onPress={close}
      testID="mock-cartel-scanner-close"
    >
      <Text>cartelScanner.close</Text>
    </Pressable>
  </View>
);

const MockContextMenuContent: React.FC<{
  message: { id: string };
  close: () => void;
}> = ({ message, close }) => (
  <View testID="mock-context-menu-content">
    <Text>mock-context-menu:{message.id}</Text>
    <Pressable
      accessibilityLabel="messageMenu.cancel"
      onPress={close}
      testID="mock-context-menu-close"
    >
      <Text>messageMenu.cancel</Text>
    </Pressable>
  </View>
);

const MockConsentContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-consent-content">
    <Text>mock-consent</Text>
    <Pressable accessibilityLabel="consent.accept" onPress={close} testID="mock-consent-accept">
      <Text>consent.accept</Text>
    </Pressable>
  </View>
);

const MockVoiceIntroContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-voice-intro-content">
    <Text>mock-voice-intro</Text>
    <Pressable
      accessibilityLabel="voiceIntro.acknowledge"
      onPress={close}
      testID="mock-voice-intro-acknowledge"
    >
      <Text>voiceIntro.acknowledge</Text>
    </Pressable>
  </View>
);

const MockDailyLimitContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-daily-limit-content">
    <Text>mock-daily-limit</Text>
    <Pressable
      accessibilityLabel="dailyLimit.acknowledge"
      onPress={close}
      testID="mock-daily-limit-acknowledge"
    >
      <Text>dailyLimit.acknowledge</Text>
    </Pressable>
  </View>
);

/**
 * Install mock routes for every C4 route id (9 routes). Mutates the imported
 * `ROUTES` map. Tests call this in `beforeEach` so each test runs against a
 * clean registry of test-stable mocks.
 */
export function installAllMockRoutes(): void {
  const routesModule = require('@/features/chat/ui/bottom-sheet-router/routes') as {
    ROUTES: Record<BottomSheetRouteId, BottomSheetRouteDefinition<BottomSheetRouteId>>;
  };

  routesModule.ROUTES['attachment-picker'] = {
    id: 'attachment-picker',
    presentation: 'sheet',
    blocking: false,
    a11yAnnounceKey: 'a11y.attachmentPicker.opened',
    Content: MockAttachmentPickerContent,
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;

  routesModule.ROUTES.browser = {
    id: 'browser',
    presentation: 'fullscreen',
    blocking: false,
    a11yAnnounceKey: 'a11y.browser.opened',
    Content: MockBrowserContent,
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;

  routesModule.ROUTES.summary = {
    id: 'summary',
    presentation: 'card',
    blocking: false,
    a11yAnnounceKey: 'a11y.summary.opened',
    Content: MockSummaryContent,
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;

  routesModule.ROUTES['ai-disclosure'] = {
    id: 'ai-disclosure',
    presentation: 'fullscreen',
    blocking: false,
    a11yAnnounceKey: 'a11y.aiDisclosure.opened',
    Content: MockAiDisclosureContent,
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;

  routesModule.ROUTES['cartel-scanner'] = {
    id: 'cartel-scanner',
    presentation: 'fullscreen',
    blocking: false,
    a11yAnnounceKey: 'a11y.cartelScanner.opened',
    Content: MockCartelScannerContent,
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;

  routesModule.ROUTES['context-menu'] = {
    id: 'context-menu',
    presentation: 'sheet',
    blocking: false,
    a11yAnnounceKey: 'a11y.contextMenu.opened',
    Content:
      MockContextMenuContent as unknown as BottomSheetRouteDefinition<'context-menu'>['Content'],
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;

  routesModule.ROUTES.consent = {
    id: 'consent',
    presentation: 'fullscreen',
    blocking: true,
    a11yAnnounceKey: 'a11y.consent.opened',
    Content: MockConsentContent,
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;

  routesModule.ROUTES['voice-intro'] = {
    id: 'voice-intro',
    presentation: 'fullscreen',
    blocking: true,
    a11yAnnounceKey: 'a11y.voiceIntro.opened',
    Content: MockVoiceIntroContent,
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;

  routesModule.ROUTES['daily-limit'] = {
    id: 'daily-limit',
    presentation: 'card',
    blocking: true,
    a11yAnnounceKey: 'a11y.dailyLimit.opened',
    Content: MockDailyLimitContent,
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;
}

/** Imperative handle exposed by `DismissRouterTestHost`. */
export interface DismissRouterHandle {
  open: (
    route: BottomSheetRouteId,
    params: unknown,
    options?: { triggerNodeHandle?: number | null },
  ) => void;
  close: () => void;
  activeRoute: BottomSheetRouteId | null;
}

const HandleBridge = React.forwardRef<DismissRouterHandle, object>((_props, ref) => {
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
HandleBridge.displayName = 'DismissHandleBridge';

export const DismissRouterTestHost = React.forwardRef<DismissRouterHandle, object>(
  (_props, ref) => (
    <View testID="dismiss-router-test-host">
      <HandleBridge ref={ref} />
      <BottomSheetRouter />
    </View>
  ),
);
DismissRouterTestHost.displayName = 'DismissRouterTestHost';
