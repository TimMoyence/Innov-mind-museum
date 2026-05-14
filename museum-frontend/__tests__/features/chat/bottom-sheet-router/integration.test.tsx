/**
 * Red integration tests for the BottomSheetRouter (C4 / AC8 partial).
 *
 * Bigger than the unit-component tests in `BottomSheetRouter.test.tsx`:
 * exercises sequential transitions (replace-pattern between blocking routes)
 * and gesture-level dismissal rules (backdrop tap on blocking vs non-blocking).
 *
 * Q1 hypothesis traced for green-code-agent:
 *
 *   The spec (§7 Q1) leaves the ordering of blocking modals unsettled.
 *   This test follows the §1.2 R2 "last-write-wins replace" rule LITERALLY
 *   even when both routes are blocking: open(consent) then open(voice-intro)
 *   replaces consent with voice-intro. R6 only gates NON-BLOCKING openers,
 *   per its EARS wording ("system SHALL refuse open() calls for non-blocking
 *   routes"). If the product owner answers Q1 with strict ordering
 *   (`consent > voice-intro` always), this test will need adapting and the
 *   reducer/router gain a priority table.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { act, render } from '@testing-library/react-native';

import '../../../helpers/test-utils';

jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

import { BottomSheetRouter, useBottomSheetRouter } from '@/features/chat/ui/bottom-sheet-router';
import type {
  BottomSheetRouteDefinition,
  BottomSheetRouteId,
} from '@/features/chat/ui/bottom-sheet-router/routes';

// ── mock content registry ────────────────────────────────────────────────────

const MockConsentContent: React.FC<{ close: () => void }> = ({ close }) => (
  <View testID="mock-consent-content">
    <Text>mock-consent</Text>
    <Pressable accessibilityLabel="consent.accept" onPress={close}>
      <Text>consent.accept</Text>
    </Pressable>
  </View>
);

const MockVoiceIntroContent: React.FC<{ locale: string; close: () => void }> = ({
  locale,
  close,
}) => (
  <View testID="mock-voice-intro-content">
    <Text>mock-voice-intro:{locale}</Text>
    <Pressable accessibilityLabel="voice.disclosure.ack" onPress={close}>
      <Text>voice.disclosure.ack</Text>
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

function installMockRoutes(): void {
  const routesModule = require('@/features/chat/ui/bottom-sheet-router/routes') as {
    ROUTES: Record<BottomSheetRouteId, BottomSheetRouteDefinition<BottomSheetRouteId>>;
  };
  routesModule.ROUTES.consent = {
    id: 'consent',
    presentation: 'fullscreen',
    blocking: true,
    a11yAnnounceKey: 'a11y.consent.opened',
    Content: MockConsentContent as BottomSheetRouteDefinition<'consent'>['Content'],
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;
  routesModule.ROUTES['voice-intro'] = {
    id: 'voice-intro',
    presentation: 'fullscreen',
    blocking: true,
    a11yAnnounceKey: 'a11y.voiceIntro.opened',
    Content: MockVoiceIntroContent as BottomSheetRouteDefinition<'voice-intro'>['Content'],
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;
  routesModule.ROUTES['context-menu'] = {
    id: 'context-menu',
    presentation: 'sheet',
    blocking: false,
    a11yAnnounceKey: 'a11y.contextMenu.opened',
    Content: MockContextMenuContent as BottomSheetRouteDefinition<'context-menu'>['Content'],
  } as BottomSheetRouteDefinition<BottomSheetRouteId>;
}

// ── imperative driver bridge ────────────────────────────────────────────────

interface RouterHandle {
  open: (route: BottomSheetRouteId, params: unknown) => void;
  close: () => void;
}

const HandleBridge = React.forwardRef<RouterHandle, object>((_props, ref) => {
  const router = useBottomSheetRouter();
  React.useImperativeHandle(
    ref,
    () => ({
      open: (route, params) => {
        (router.open as (r: BottomSheetRouteId, p: unknown) => void)(route, params);
      },
      close: () => {
        router.close();
      },
    }),
    [router],
  );
  return null;
});
HandleBridge.displayName = 'HandleBridge';

function renderRouter() {
  const ref = React.createRef<RouterHandle>();
  const view = render(
    <View>
      <HandleBridge ref={ref} />
      <BottomSheetRouter />
    </View>,
  );
  return { ref, view };
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('BottomSheetRouter — integration scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installMockRoutes();
  });

  describe('Q1 hypothesis — last-write-wins replace between blocking routes', () => {
    it('open(consent) then open(voice-intro) replaces consent with voice-intro', () => {
      jest.useFakeTimers();
      const { ref, view } = renderRouter();

      act(() => {
        ref.current?.open('consent', {});
      });
      act(() => {
        jest.runAllTimers();
      });
      expect(view.getByLabelText('consent.accept')).toBeTruthy();

      act(() => {
        ref.current?.open('voice-intro', { locale: 'fr' });
      });
      // Sequencing per spec R12 — exit anim of consent must settle before
      // voice-intro's entrance anim runs. Drain timers twice so both anims
      // resolve (the second `runAllTimers` covers the queued OPEN's entrance).
      act(() => {
        jest.runAllTimers();
      });
      act(() => {
        jest.runAllTimers();
      });

      // After the close+open chain settles, voice-intro should be the visible content.
      expect(view.queryByLabelText('consent.accept')).toBeNull();
      expect(view.getByLabelText('voice.disclosure.ack')).toBeTruthy();
      jest.useRealTimers();
    });
  });

  describe('R11 — backdrop tap on blocking route does NOT close', () => {
    it('keeps consent mounted after backdrop press', () => {
      const { ref, view } = renderRouter();

      act(() => {
        ref.current?.open('consent', {});
      });
      expect(view.getByLabelText('consent.accept')).toBeTruthy();

      // The backdrop is rendered by `BottomSheetBackdrop.tsx`; it MUST expose
      // a stable testID `bottom-sheet-backdrop` so call-sites can target it.
      const backdrop = view.queryByTestId('bottom-sheet-backdrop');
      expect(backdrop).not.toBeNull();
      if (backdrop) {
        act(() => {
          backdrop.props.onPress?.();
        });
      }

      expect(view.getByLabelText('consent.accept')).toBeTruthy();
    });
  });

  describe('R7 — backdrop tap on non-blocking route closes', () => {
    it('unmounts context-menu after backdrop press', () => {
      jest.useFakeTimers();
      const { ref, view } = renderRouter();

      act(() => {
        ref.current?.open('context-menu', { message: { id: 'msg-9' } });
      });
      act(() => {
        jest.runAllTimers();
      });
      expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();

      const backdrop = view.queryByTestId('bottom-sheet-backdrop');
      expect(backdrop).not.toBeNull();
      if (backdrop) {
        act(() => {
          backdrop.props.onPress?.();
        });
      }
      // Drain exit timing → container dispatches CLOSE_DONE (spec R12).
      act(() => {
        jest.runAllTimers();
      });

      expect(view.queryByLabelText('messageMenu.cancel')).toBeNull();
      jest.useRealTimers();
    });
  });
});
