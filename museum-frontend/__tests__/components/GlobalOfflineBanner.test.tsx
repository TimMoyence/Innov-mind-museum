/**
 * GlobalOfflineBannerHost — offline-only host.
 * Run `undefined-network-detection-reliability`, cluster D, task D-R1 (TR-07).
 *
 * CONTRACT EVOLUTION (spec §10 invalidated test #8, INV-12 / INV-13): the host
 * keeps mounting the single global OfflineBanner (offline state surfaced on
 * EVERY screen, auth included — R8/R10 unchanged) but no longer renders ANY
 * low-data UI: the low-data indicator moves to the chat-scoped `LowDataBadge`
 * (own component test, D-R2). The former low-data host cases are replaced by
 * the proof that the host is offline-only.
 *
 * No `useDataMode` mock (D-R1): low-data is produced through the REAL
 * `DataModeProvider` with `preference: 'low'` (INV-03 short-circuit).
 *
 * RED contract: the "null while online even in low-data" case FAILS today
 * because OfflineBanner still renders the yellow variant. If green believes a
 * case is wrong, emit BLOCK-TEST-WRONG — never edit this file (UFR-022).
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';

import '../helpers/test-utils';

// Tri-state connectivity context driven per-test (host consumes useConnectivity).
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
import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';

describe('GlobalOfflineBannerHost — offline-only (D-R1, INV-12/INV-13)', () => {
  beforeEach(() => {
    mockIsOnline = true;
  });

  afterEach(() => {
    // act(): a mounted DataModeProvider subscribes to the zustand store —
    // resetting outside act() triggers the React update warning.
    act(() => {
      useDataModePreferenceStore.setState({ preference: 'auto' });
    });
  });

  it('renders the offline banner (offline.title) when isOnline === false', () => {
    mockIsOnline = false;
    const { getByText } = render(<GlobalOfflineBannerHost />);
    expect(getByText('offline.title')).toBeTruthy();
  });

  it('exposes the offline-banner testID for the Maestro flow when offline (INV-13)', () => {
    mockIsOnline = false;
    const { getByTestId } = render(<GlobalOfflineBannerHost />);
    expect(getByTestId('offline-banner')).toBeTruthy();
  });

  it('renders null when online', () => {
    mockIsOnline = true;
    const { toJSON } = render(<GlobalOfflineBannerHost />);
    expect(toJSON()).toBeNull();
  });

  it('renders null when online EVEN while the resolved data mode is low (INV-12 — host is offline-only)', () => {
    mockIsOnline = true;
    useDataModePreferenceStore.setState({ preference: 'low' });
    const { toJSON } = render(
      <DataModeProvider>
        <GlobalOfflineBannerHost />
      </DataModeProvider>,
    );
    expect(toJSON()).toBeNull();
  });
});
