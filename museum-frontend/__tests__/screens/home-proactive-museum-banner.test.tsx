import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

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
        onChooseAnother?: () => void;
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
          ReactNS.createElement(RN.Pressable, {
            testID: 'mock-ProactiveMuseumBanner-choose-another',
            onPress: () => props.onChooseAnother?.(),
          }),
        );
      },
    };
  },
  { virtual: true },
);

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
  RESUMPTION_BANNER_DISMISS_STORAGE_KEY: 'musaium.settings.resumptionBannerDismissedUntil',
  RESUMPTION_BANNER_DISMISS_DURATION_MS: 86_400_000,
  RESUMPTION_BANNER_WINDOW_MS: 604_800_000,
}));

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

import HomeScreen from '@/app/(tabs)/home';

describe('HomeScreen — B6 proactive museum banner integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSession.mockResolvedValue({ session: { id: 'new-sess-id' } });
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
    mockUseProactiveMuseumSuggestion.mockReturnValue({
      museum: null,
      isLoading: false,
      dismiss: jest.fn().mockResolvedValue(undefined),
    });
  });

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

      expect(router.push).toHaveBeenCalledWith(
        expect.stringContaining('/(stack)/chat/new-sess-id'),
      );
      const pushArg = String(router.push.mock.calls[0]?.[0] ?? '');
      expect(pushArg).toContain('intent=audio');
    });
  });

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
      expect(mockCreateSession).not.toHaveBeenCalled();
    });
  });

  describe('onChooseAnother wiring (C10)', () => {
    const louvre = {
      id: 7,
      name: 'Louvre',
      latitude: 48.8606,
      longitude: 2.3376,
      distanceMeters: 50,
    };

    it('navigates to the museum picker when choose-another is pressed (AC1)', () => {
      mockUseProactiveMuseumSuggestion.mockReturnValue({
        museum: louvre,
        isLoading: false,
        dismiss: jest.fn().mockResolvedValue(undefined),
      });

      const { getByTestId } = render(<HomeScreen />);
      fireEvent.press(getByTestId('mock-ProactiveMuseumBanner-choose-another'));

      expect(router.push).toHaveBeenCalledWith('/(stack)/museums-picker');
    });

    it('does not start a chat session nor route to chat on choose-another (AC2)', () => {
      mockUseProactiveMuseumSuggestion.mockReturnValue({
        museum: louvre,
        isLoading: false,
        dismiss: jest.fn().mockResolvedValue(undefined),
      });

      const { getByTestId } = render(<HomeScreen />);
      fireEvent.press(getByTestId('mock-ProactiveMuseumBanner-choose-another'));

      expect(mockCreateSession).not.toHaveBeenCalled();
      const chatPush = router.push.mock.calls.find((call) =>
        String(call[0] ?? '').includes('/(stack)/chat/'),
      );
      expect(chatPush).toBeUndefined();
    });
  });
});
