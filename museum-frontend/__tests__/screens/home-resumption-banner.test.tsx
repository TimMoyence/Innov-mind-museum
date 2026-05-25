/**
 * Red tests for B2 — `HomeScreen` integration of `<ConversationResumptionBanner>`.
 *
 * Asserts that `HomeScreen` :
 *   1. Mounts `<ConversationResumptionBanner>` once when
 *      `useResumableSession().session` is non-null (AC20).
 *   2. Does NOT mount the banner (or mounts with session=null) when the
 *      hook returns no resumable session (AC20 negative).
 *   3. Wires `onResume={(id) => router.push(`/(stack)/chat/${id}`)}` —
 *      tapping the banner navigates directly to the existing session,
 *      WITHOUT creating a new session (R35).
 *   4. Wires `onDismiss={() => void dismiss()}` — tapping dismiss calls
 *      the hook's dismiss function.
 *
 * At baseline (B2 not yet implemented) :
 *   - `HomeScreen` does NOT import `useResumableSession` nor render
 *     `<ConversationResumptionBanner>`. The spy mocks below register
 *     fake modules, but the mocks never fire because the screen does
 *     not (yet) reference them → assertions fail.
 *
 * Why a dedicated file (not merged into home.test.tsx) :
 *   - home.test.tsx is a green baseline test suite ; adding B2 mocks
 *     there would mix dead and live assertions. Independent green/red
 *     lifecycle for B2.
 *
 * Spec : `docs/chat-ux-refonte/specs/B2.md` §2.4 wire ; §4 AC20.
 */

import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

// ── Mock B2 banner so we can spy on its render contract ────────────────────
// RED ASSERTION : `@/features/chat/ui/ConversationResumptionBanner` does NOT
// exist at baseline — `jest.mock(..., { virtual: true })` lets us register
// a fake module even when the underlying file is absent. The spy fires only
// when HomeScreen imports + renders the banner — at baseline HomeScreen
// does NOT import it, so the spy never fires.
const mockBannerRender = jest.fn();
jest.mock(
  '@/features/chat/ui/ConversationResumptionBanner',
  () => {
    const RN = require('react-native');
    const ReactNS = require('react');
    return {
      ConversationResumptionBanner: (props: {
        session: unknown;
        onResume?: (id: string) => void;
        onDismiss?: () => void;
      }) => {
        mockBannerRender(props);
        const sess = props.session as { id?: string } | null;
        if (!sess) return null;
        return ReactNS.createElement(
          RN.Pressable,
          {
            testID: 'mock-ConversationResumptionBanner',
            onPress: () => props.onResume?.(sess.id ?? ''),
          },
          ReactNS.createElement(RN.Pressable, {
            testID: 'mock-ConversationResumptionBanner-dismiss',
            onPress: () => props.onDismiss?.(),
          }),
        );
      },
      formatResumptionTimeAgo: (_iso: string, _now: number) => 'just_now',
    };
  },
  { virtual: true },
);

// ── Mock useResumableSession so we drive the screen state ──────────────────
const mockUseResumableSession = jest.fn();
jest.mock(
  '@/features/chat/application/useResumableSession',
  () => ({
    useResumableSession: () => mockUseResumableSession(),
    RESUMPTION_BANNER_DISMISS_STORAGE_KEY: 'musaium.settings.resumptionBannerDismissedUntil',
    RESUMPTION_BANNER_DISMISS_DURATION_MS: 86_400_000,
    RESUMPTION_BANNER_WINDOW_MS: 604_800_000,
  }),
  { virtual: true },
);

// ── Standard home-screen mocks (mirrored from home.test.tsx) ───────────────
jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { createSession: jest.fn() },
}));
const mockCreateSession = jest.requireMock<{
  chatApi: { createSession: jest.Mock };
}>('@/features/chat/infrastructure/chatApi').chatApi.createSession;

const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>(
  'expo-router',
);

jest.mock('@/features/settings/application/useRuntimeSettings', () => ({
  useRuntimeSettings: () => ({
    locale: 'en-US',
    museumMode: false,
    guideLevel: 'standard',
  }),
}));

const mockUseDailyArt = jest.fn();
jest.mock('@/features/daily-art/application/useDailyArt', () => ({
  useDailyArt: () => mockUseDailyArt(),
}));

jest.mock('@/features/daily-art/ui/DailyArtCard', () => {
  const { View } = require('react-native');
  return {
    DailyArtCard: (props: Record<string, unknown>) => <View testID="daily-art-card" {...props} />,
  };
});

// SUT — must be imported AFTER all jest.mock declarations above.
import HomeScreen from '@/app/(tabs)/home';

describe('HomeScreen — B2 resumption banner integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRuntimeSettingsStore.setState({
      defaultLocale: 'en-US',
      defaultMuseumMode: false,
      guideLevel: 'beginner',
      _hydrated: true,
    });
    mockUseDailyArt.mockReturnValue({
      artwork: null,
      isLoading: false,
      isSaved: false,
      dismissed: false,
      save: jest.fn(),
      skip: jest.fn(),
    });
    mockUseResumableSession.mockReturnValue({
      session: null,
      isLoading: false,
      dismiss: jest.fn().mockResolvedValue(undefined),
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §2.4 wire / §4 AC20 — banner renders when session non-null
  // ────────────────────────────────────────────────────────────────────────
  describe('banner rendering (AC20)', () => {
    it('renders <ConversationResumptionBanner> when useResumableSession returns a session', () => {
      mockUseResumableSession.mockReturnValue({
        session: {
          id: 'sess-resume',
          museumId: 7,
          museumName: 'Louvre',
          lastArtworkTitle: 'La Liseuse',
          updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
        },
        isLoading: false,
        dismiss: jest.fn().mockResolvedValue(undefined),
      });

      const { getByTestId } = render(<HomeScreen />);
      expect(getByTestId('mock-ConversationResumptionBanner')).toBeTruthy();
      expect(mockBannerRender).toHaveBeenCalled();
      const callIndex = mockBannerRender.mock.calls.length - 1;
      const lastCall = mockBannerRender.mock.calls[callIndex] ?? [];
      const props = (lastCall[0] ?? null) as { session: { id: string } | null } | null;
      expect(props?.session?.id).toBe('sess-resume');
    });

    it('does NOT render the banner when useResumableSession returns null session (AC20 negative)', () => {
      mockUseResumableSession.mockReturnValue({
        session: null,
        isLoading: false,
        dismiss: jest.fn().mockResolvedValue(undefined),
      });

      const { queryByTestId } = render(<HomeScreen />);
      expect(queryByTestId('mock-ConversationResumptionBanner')).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.5 R35-R36 — wire onResume navigates without createSession
  // ────────────────────────────────────────────────────────────────────────
  describe('onResume wiring (R35, R36)', () => {
    it('navigates to /(stack)/chat/<sessionId> on banner press, WITHOUT calling chatApi.createSession', () => {
      mockUseResumableSession.mockReturnValue({
        session: {
          id: 'sess-resume-42',
          museumId: 7,
          museumName: 'Louvre',
          lastArtworkTitle: 'La Liseuse',
          updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
        },
        isLoading: false,
        dismiss: jest.fn().mockResolvedValue(undefined),
      });

      const { getByTestId } = render(<HomeScreen />);
      fireEvent.press(getByTestId('mock-ConversationResumptionBanner'));

      expect(router.push).toHaveBeenCalledWith('/(stack)/chat/sess-resume-42');
      // CRITICAL : B2 NEVER creates a new session (R35).
      expect(mockCreateSession).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §2.4 wire — onDismiss wired to hook.dismiss
  // ────────────────────────────────────────────────────────────────────────
  describe('onDismiss wiring', () => {
    it('invokes the hook dismiss callback on dismiss press', () => {
      const dismiss = jest.fn().mockResolvedValue(undefined);
      mockUseResumableSession.mockReturnValue({
        session: {
          id: 'sess-dismissable',
          museumId: 7,
          museumName: 'Louvre',
          lastArtworkTitle: 'La Liseuse',
          updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
        },
        isLoading: false,
        dismiss,
      });

      const { getByTestId } = render(<HomeScreen />);
      fireEvent.press(getByTestId('mock-ConversationResumptionBanner-dismiss'));

      expect(dismiss).toHaveBeenCalledTimes(1);
      // Banner press path NOT triggered by dismiss tap.
      expect(router.push).not.toHaveBeenCalled();
    });
  });
});
