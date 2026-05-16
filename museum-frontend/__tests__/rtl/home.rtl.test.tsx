import '../helpers/test-utils';
import { render } from '@testing-library/react-native';
import { I18nManager } from 'react-native';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { findPhysicalSideLeaks } from './_rtl-style-audit';

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { createSession: jest.fn() },
}));

jest.mock('@/features/settings/application/useRuntimeSettings', () => ({
  useRuntimeSettings: () => ({ locale: 'ar', museumMode: false, guideLevel: 'standard' }),
}));

const mockUseDailyArt = jest.fn();
jest.mock('@/features/daily-art/application/useDailyArt', () => ({
  useDailyArt: () => mockUseDailyArt(),
}));

jest.mock('@/features/daily-art/ui/DailyArtCard', () => {
  const { View } = require('react-native');
  return {
    DailyArtCard: (props: unknown) => <View testID="daily-art-card" {...(props as object)} />,
  };
});

import HomeScreen from '@/app/(tabs)/home';

describe('HomeScreen RTL audit', () => {
  let originalIsRTL: boolean;

  beforeAll(() => {
    originalIsRTL = (I18nManager as unknown as { isRTL: boolean }).isRTL;
    (I18nManager as unknown as { isRTL: boolean }).isRTL = true;
  });

  afterAll(() => {
    (I18nManager as unknown as { isRTL: boolean }).isRTL = originalIsRTL;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useRuntimeSettingsStore.setState({
      defaultLocale: 'ar',
      defaultMuseumMode: false,
      guideLevel: 'beginner',
      _hydrated: true,
    });
    mockUseDailyArt.mockReturnValue({
      artwork: { id: '1', title: 'مونا ليزا', imageUrl: 'https://example.com/mona.jpg' },
      isLoading: false,
      isSaved: false,
      dismissed: false,
      save: jest.fn(),
      skip: jest.fn(),
    });
  });

  it('renders without physical-side style leakage under I18nManager.isRTL=true', () => {
    const { toJSON } = render(<HomeScreen />);
    const leaks = findPhysicalSideLeaks(toJSON());
    expect(leaks).toEqual([]);
  });
});
