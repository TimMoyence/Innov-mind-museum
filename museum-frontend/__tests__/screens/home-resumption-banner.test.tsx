import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

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

import HomeScreen from '@/app/(tabs)/home';

describe('HomeScreen — B2 resumption banner integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRuntimeSettingsStore.setState({
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
      expect(mockCreateSession).not.toHaveBeenCalled();
    });
  });

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
      expect(router.push).not.toHaveBeenCalled();
    });
  });
});
