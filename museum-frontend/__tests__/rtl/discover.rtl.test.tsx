import '../helpers/test-utils';
import { render } from '@testing-library/react-native';
import { I18nManager } from 'react-native';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { findPhysicalSideLeaks } from './_rtl-style-audit';

const mockCreateSession = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { createSession: (...args: unknown[]) => mockCreateSession(...args) },
}));

import DiscoverScreen from '@/app/(stack)/discover';

describe('DiscoverScreen RTL audit', () => {
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
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      _hydrated: true,
    });
    mockCreateSession.mockResolvedValue({ session: { id: 'new-session' } });
  });

  it('renders without physical-side style leakage under I18nManager.isRTL=true', () => {
    const { toJSON } = render(<DiscoverScreen />);
    const leaks = findPhysicalSideLeaks(toJSON());
    expect(leaks).toEqual([]);
  });
});
