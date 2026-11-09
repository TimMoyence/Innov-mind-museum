import React from 'react';
import { act, render } from '@testing-library/react-native';

import '../helpers/test-utils';

let mockIsOnline = true;
jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => ({
    isConnected: mockIsOnline,
    isInternetReachable: mockIsOnline,
    isOnline: mockIsOnline,
  }),
}));

import { GlobalOfflineBannerHost } from '@/shared/infrastructure/connectivity/GlobalOfflineBannerHost';
import { DataModeProvider } from '@/features/chat/application/DataModeProvider';
import { OfflineQueueProvider } from '@/features/chat/application/useOfflineQueue';
import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';

describe('GlobalOfflineBannerHost — offline-only (D-R1, INV-12/INV-13)', () => {
  beforeEach(() => {
    mockIsOnline = true;
  });

  afterEach(() => {
    act(() => {
      useDataModePreferenceStore.setState({ preference: 'auto' });
    });
  });

  it('renders the offline banner (offline.title) when isOnline === false', () => {
    mockIsOnline = false;
    const { getByText } = render(<GlobalOfflineBannerHost />, { wrapper: OfflineQueueProvider });
    expect(getByText('offline.title')).toBeTruthy();
  });

  it('exposes the offline-banner testID for the Maestro flow when offline (INV-13)', () => {
    mockIsOnline = false;
    const { getByTestId } = render(<GlobalOfflineBannerHost />, { wrapper: OfflineQueueProvider });
    expect(getByTestId('offline-banner')).toBeTruthy();
  });

  it('renders null when online', () => {
    mockIsOnline = true;
    const { toJSON } = render(<GlobalOfflineBannerHost />, { wrapper: OfflineQueueProvider });
    expect(toJSON()).toBeNull();
  });

  it('renders null when online EVEN while the resolved data mode is low (INV-12 — host is offline-only)', () => {
    mockIsOnline = true;
    useDataModePreferenceStore.setState({ preference: 'low' });
    const { toJSON } = render(
      <DataModeProvider>
        <GlobalOfflineBannerHost />
      </DataModeProvider>,
      { wrapper: OfflineQueueProvider },
    );
    expect(toJSON()).toBeNull();
  });
});
