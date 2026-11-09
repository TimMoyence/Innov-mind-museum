import type React from 'react';
import { StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { OfflineBanner } from '@/features/chat/ui/OfflineBanner';
import { DataModeProvider } from '@/features/chat/application/DataModeProvider';
import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';

const themeModule = jest.requireMock('@/shared/ui/ThemeContext');

const renderInLowDataMode = (ui: React.ReactElement) => {
  useDataModePreferenceStore.setState({ preference: 'low' });
  return render(<DataModeProvider>{ui}</DataModeProvider>);
};

describe('OfflineBanner — offline-only (D-R1, INV-12/INV-13)', () => {
  afterEach(() => {
    act(() => {
      useDataModePreferenceStore.setState({ preference: 'auto' });
    });
  });

  it('renders offline title when isOffline is true', () => {
    const { getByText } = render(<OfflineBanner pendingCount={0} isOffline={true} />);
    expect(getByText('offline.title')).toBeTruthy();
  });

  it('shows pending count when > 0 and offline', () => {
    const { getByText } = render(<OfflineBanner pendingCount={3} isOffline={true} />);
    expect(getByText(/offline\.pending/)).toBeTruthy();
  });

  it('has alert accessibility role and label when offline (INV-13)', () => {
    const { getByTestId, getByLabelText } = render(
      <OfflineBanner pendingCount={0} isOffline={true} />,
    );
    expect(getByLabelText('offline.title')).toBeTruthy();
    expect(getByTestId('offline-banner').props.accessibilityRole).toBe('alert');
  });

  it('keeps the stable offline-banner testID and errorBackground color (INV-13)', () => {
    const { getByTestId } = render(<OfflineBanner pendingCount={0} isOffline={true} />);
    const banner = getByTestId('offline-banner');
    const style = StyleSheet.flatten(banner.props.style) as { backgroundColor?: string };
    expect(style.backgroundColor).toBe(themeModule.useTheme().theme.errorBackground);
  });

  it('still renders the offline variant when offline AND resolved mode is low (offline has exclusive priority — US-06.2/INV-13)', () => {
    const { getByTestId } = renderInLowDataMode(
      <OfflineBanner pendingCount={0} isOffline={true} />,
    );
    expect(getByTestId('offline-banner')).toBeTruthy();
  });

  it('returns null when not offline', () => {
    const { toJSON } = render(<OfflineBanner pendingCount={0} isOffline={false} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when not offline EVEN while the resolved data mode is low (INV-12 — low-data UI is the chat badge, not this banner)', () => {
    const { toJSON } = renderInLowDataMode(<OfflineBanner pendingCount={0} isOffline={false} />);
    expect(toJSON()).toBeNull();
  });
});
