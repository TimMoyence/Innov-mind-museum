/**
 * RED test — T2.5 (run 2026-05-21-connectivity-offline-first).
 *
 * Proves the absence of a global offline-banner host. Today `OfflineBanner` is
 * only mounted inside the chat screen (app/(stack)/chat/[sessionId].tsx:493);
 * there is no app-root host that sources `isOnline` from the connectivity
 * context and renders the banner on every screen.
 *
 * Spec R8 (exactly one global mount) / R10 (offline surfaced on any screen),
 * design §D5. Target: a small `GlobalOfflineBannerHost` component (mirrors the
 * PaywallModalHost pattern) reading `useConnectivity().isOnline` and rendering
 * `<OfflineBanner isOffline={!isOnline} pendingCount={0} />`. Also requires a
 * `testID="offline-banner"` on the offline `<View>` for the Maestro flow (T3.1).
 *
 * Green-phase path contract: `GlobalOfflineBannerHost` is exported from
 *   shared/infrastructure/connectivity/GlobalOfflineBannerHost.tsx
 * (co-located with the connectivity module). If green chooses another path it
 * MUST keep this import resolvable — emit BLOCK-TEST-WRONG instead of relocating.
 *
 * lib-docs cited: none lib-specific (React composition) — design §D5. NetInfo /
 * react-query are not imported by the banner.
 *
 * RED contract: FAILS before T2.5 because the module/component does not exist
 * (import resolution error).
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';

// Tri-state connectivity context driven per-test.
let mockIsOnline = true;
jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => ({
    isConnected: mockIsOnline ? true : false,
    isInternetReachable: mockIsOnline ? true : false,
    isOnline: mockIsOnline,
  }),
}));

// OfflineBanner also consumes useDataMode for the low-data branch.
let mockIsLowData = false;
jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({ isLowData: mockIsLowData }),
}));

import { GlobalOfflineBannerHost } from '@/shared/infrastructure/connectivity/GlobalOfflineBannerHost';

describe('GlobalOfflineBannerHost — T2.5 / spec R8+R10 / design D5', () => {
  beforeEach(() => {
    mockIsOnline = true;
    mockIsLowData = false;
  });

  it('renders the offline banner (offline.title) when isOnline === false', () => {
    mockIsOnline = false;
    const { getByText } = render(<GlobalOfflineBannerHost />);
    expect(getByText('offline.title')).toBeTruthy();
  });

  it('exposes the offline-banner testID for the Maestro flow when offline', () => {
    mockIsOnline = false;
    const { getByTestId } = render(<GlobalOfflineBannerHost />);
    expect(getByTestId('offline-banner')).toBeTruthy();
  });

  it('renders null when online and not in low-data mode', () => {
    mockIsOnline = true;
    mockIsLowData = false;
    const { toJSON } = render(<GlobalOfflineBannerHost />);
    expect(toJSON()).toBeNull();
  });
});
