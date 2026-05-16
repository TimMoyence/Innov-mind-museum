/**
 * Red tests for B6 — `HomeScreen` integration of `<ProactiveMuseumBanner>`.
 *
 * Asserts that `HomeScreen` :
 *   1. Mounts `<ProactiveMuseumBanner>` when `useProactiveMuseumSuggestion().museum`
 *      is non-null (AC21).
 *   2. Does NOT mount the banner when the hook returns no proactive museum.
 *   3. Wires `onStart` to `chatApi.createSession` via `useStartConversation`
 *      with payload containing `intent: 'audio'`, `museumId`, `museumName`,
 *      `coordinates` (AC22).
 *   4. Wires `onDismiss` to the hook's dismiss function.
 *
 * At baseline (B6 not yet implemented) :
 *   - `HomeScreen` does NOT import `useProactiveMuseumSuggestion` nor render
 *     `<ProactiveMuseumBanner>`. The spy mocks below register fake modules,
 *     but the mocks never fire because the screen does not (yet) reference
 *     them → assertions fail.
 *
 * Why a dedicated file (not merged into home.test.tsx or home-resumption-banner.test.tsx) :
 *   - Independent green/red lifecycle for B6.
 *   - Mirrors the B2 pattern (`home-resumption-banner.test.tsx`).
 *
 * Spec : `docs/chat-ux-refonte/specs/B6.md` §1.3 R27-R29 ; §2.4 wire ;
 *        §4 AC21-AC22.
 * Baseline : `325873b3` (worktree HEAD post-B2 done).
 */

import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

// ── Mock B6 banner so we can spy on its render contract ────────────────────
// RED ASSERTION : `@/features/chat/ui/ProactiveMuseumBanner` does NOT exist
// at baseline — `jest.mock(..., { virtual: true })` lets us register a fake
// module even when the underlying file is absent. The spy fires only when
// HomeScreen imports + renders the banner — at baseline HomeScreen does NOT
// import it, so the spy never fires.
const mockBannerRender = jest.fn();
jest.mock(
  '@/features/chat/ui/ProactiveMuseumBanner',
  () => {
    const RN = require('react-native');
    const ReactNS = require('react');
    return {
      ProactiveMuseumBanner: (props: {
        museum: {
          id: number;
          name: string;
          latitude: number;
          longitude: number;
          distanceMeters: number;
        } | null;
        onStart?: (museum: {
          id: number;
          name: string;
          latitude: number;
          longitude: number;
          distanceMeters: number;
        }) => void;
        onDismiss?: () => void;
      }) => {
        mockBannerRender(props);
        const m = props.museum;
        if (!m) return null;
        return ReactNS.createElement(
          RN.Pressable,
          {
            testID: 'mock-ProactiveMuseumBanner',
            onPress: () => props.onStart?.(m),
          },
          ReactNS.createElement(RN.Pressable, {
            testID: 'mock-ProactiveMuseumBanner-dismiss',
            onPress: () => props.onDismiss?.(),
          }),
        );
      },
    };
  },
  { virtual: true },
);

// ── Mock useProactiveMuseumSuggestion so we drive the screen state ─────────
const mockUseProactiveMuseumSuggestion = jest.fn();
jest.mock(
  '@/features/chat/application/useProactiveMuseumSuggestion',
  () => ({
    useProactiveMuseumSuggestion: () => mockUseProactiveMuseumSuggestion(),
    PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY: 'settings.proactive_museum_banner_dismissed_until',
    PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS: 14_400_000,
    PROACTIVE_MUSEUM_IN_MUSEUM_THRESHOLD_M: 200,
  }),
  { virtual: true },
);

// ── Mock B2 banner + hook (already merged on baseline 325873b3) ────────────
// We render the resumption banner as null so it doesn't interfere with B6.
jest.mock('@/features/chat/ui/ConversationResumptionBanner', () => {
  return {
    ConversationResumptionBanner: () => null,
    formatResumptionTimeAgo: () => 'just_now',
  };
});
jest.mock('@/features/chat/application/useResumableSession', () => ({
  useResumableSession: () => ({
    session: null,
    isLoading: false,
    dismiss: jest.fn().mockResolvedValue(undefined),
  }),
  RESUMPTION_BANNER_DISMISS_STORAGE_KEY: 'settings.resumption_banner_dismissed_until',
  RESUMPTION_BANNER_DISMISS_DURATION_MS: 86_400_000,
  RESUMPTION_BANNER_WINDOW_MS: 604_800_000,
}));

// ── Standard home-screen mocks (mirrored from home-resumption-banner.test.tsx) ──
jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    createSession: jest.fn().mockResolvedValue({ session: { id: 'new-sess-id' } }),
  },
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

describe('HomeScreen — B6 proactive museum banner integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSession.mockResolvedValue({ session: { id: 'new-sess-id' } });
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
    mockUseProactiveMuseumSuggestion.mockReturnValue({
      museum: null,
      isLoading: false,
      dismiss: jest.fn().mockResolvedValue(undefined),
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §2.4 wire / §4 AC21 — banner renders when museum non-null
  // ────────────────────────────────────────────────────────────────────────
  describe('banner rendering (AC21)', () => {
    it('renders <ProactiveMuseumBanner> when useProactiveMuseumSuggestion returns a museum', () => {
      mockUseProactiveMuseumSuggestion.mockReturnValue({
        museum: {
          id: 7,
          name: 'Louvre',
          latitude: 48.8606,
          longitude: 2.3376,
          distanceMeters: 87,
        },
        isLoading: false,
        dismiss: jest.fn().mockResolvedValue(undefined),
      });

      const { getByTestId } = render(<HomeScreen />);
      expect(getByTestId('mock-ProactiveMuseumBanner')).toBeTruthy();
      expect(mockBannerRender).toHaveBeenCalled();
      const callIndex = mockBannerRender.mock.calls.length - 1;
      const lastCall = mockBannerRender.mock.calls[callIndex] ?? [];
      const props = (lastCall[0] ?? null) as {
        museum: { id: number; name: string } | null;
      } | null;
      expect(props?.museum?.id).toBe(7);
      expect(props?.museum?.name).toBe('Louvre');
    });

    it('does NOT render the banner when useProactiveMuseumSuggestion returns null museum (AC21 negative)', () => {
      mockUseProactiveMuseumSuggestion.mockReturnValue({
        museum: null,
        isLoading: false,
        dismiss: jest.fn().mockResolvedValue(undefined),
      });

      const { queryByTestId } = render(<HomeScreen />);
      expect(queryByTestId('mock-ProactiveMuseumBanner')).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.3 R27 / §4 AC22 — wire onStart creates an audio session.
  //
  // NOTE — intent propagation is split:
  //   • PAYLOAD : BE Zod enum (`CHAT_SESSION_INTENTS` in chat.types.ts) accepts only
  //     'default' | 'walk'. useStartConversation downcasts 'audio'/'camera' to omitted so
  //     the BE returns 200, not 400.
  //   • URL QUERY : the UI-level intent ('audio') is forwarded as `?intent=audio` in the
  //     router.push URL so the chat screen can switch to voice-first.
  // The first test below asserts museum context fields land in the payload; the second
  // asserts intent='audio' lands in the URL query (the actual AC22 propagation surface).
  // ────────────────────────────────────────────────────────────────────────
  describe('onStart wiring (R27, AC22)', () => {
    it('on banner press calls chatApi.createSession with museumId, museumName, coordinates', async () => {
      mockUseProactiveMuseumSuggestion.mockReturnValue({
        museum: {
          id: 42,
          name: "Musée d'Orsay",
          latitude: 48.86,
          longitude: 2.326,
          distanceMeters: 110,
        },
        isLoading: false,
        dismiss: jest.fn().mockResolvedValue(undefined),
      });

      const { getByTestId } = render(<HomeScreen />);
      fireEvent.press(getByTestId('mock-ProactiveMuseumBanner'));

      // useStartConversation runs createSession asynchronously — wait a microtask.
      await Promise.resolve();
      await Promise.resolve();

      expect(mockCreateSession).toHaveBeenCalledTimes(1);
      const firstCall = mockCreateSession.mock.calls[0] ?? [];
      const payload = (firstCall[0] ?? {}) as {
        intent?: string;
        museumId?: number;
        museumName?: string;
        coordinates?: { lat: number; lng: number };
      };
      // intent='audio' is NOT a BE-accepted value — must NOT leak into the payload.
      // The URL-query assertion below is the actual AC22 propagation surface.
      expect(payload.intent).toBeUndefined();
      expect(payload.museumId).toBe(42);
      expect(payload.museumName).toBe("Musée d'Orsay");
      expect(payload.coordinates).toEqual({ lat: 48.86, lng: 2.326 });
    });

    it('navigates to the new chat session with intent=audio in URL query (AC22)', async () => {
      mockUseProactiveMuseumSuggestion.mockReturnValue({
        museum: {
          id: 7,
          name: 'Louvre',
          latitude: 48.8606,
          longitude: 2.3376,
          distanceMeters: 50,
        },
        isLoading: false,
        dismiss: jest.fn().mockResolvedValue(undefined),
      });

      const { getByTestId } = render(<HomeScreen />);
      fireEvent.press(getByTestId('mock-ProactiveMuseumBanner'));

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // useStartConversation appends ?intent=audio when intent !== 'default'.
      expect(router.push).toHaveBeenCalledWith(
        expect.stringContaining('/(stack)/chat/new-sess-id'),
      );
      const pushArg = String(router.push.mock.calls[0]?.[0] ?? '');
      expect(pushArg).toContain('intent=audio');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §2.4 wire — onDismiss wired to hook.dismiss
  // ────────────────────────────────────────────────────────────────────────
  describe('onDismiss wiring', () => {
    it('invokes the hook dismiss callback on dismiss press', () => {
      const dismiss = jest.fn().mockResolvedValue(undefined);
      mockUseProactiveMuseumSuggestion.mockReturnValue({
        museum: {
          id: 7,
          name: 'Louvre',
          latitude: 48.8606,
          longitude: 2.3376,
          distanceMeters: 50,
        },
        isLoading: false,
        dismiss,
      });

      const { getByTestId } = render(<HomeScreen />);
      fireEvent.press(getByTestId('mock-ProactiveMuseumBanner-dismiss'));

      expect(dismiss).toHaveBeenCalledTimes(1);
      // Banner press path NOT triggered by dismiss tap → no session created.
      expect(mockCreateSession).not.toHaveBeenCalled();
    });
  });
});
