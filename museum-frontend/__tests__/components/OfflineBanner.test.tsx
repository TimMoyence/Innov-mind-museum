/**
 * OfflineBanner — offline-only contract.
 * Run `undefined-network-detection-reliability`, cluster D, task D-R1 (TR-07).
 *
 * CONTRACT EVOLUTION (spec §10 invalidated test #7, US-09 / INV-12 / INV-13):
 * the full-width yellow low-data variant (OfflineBanner.tsx:38-47) is REMOVED.
 * The banner now renders iff `isOffline`; the low-data state moves to the
 * chat-scoped `LowDataBadge` (own component test, D-R2). The offline variant
 * must stay byte-identical in behavior (INV-13: testID "offline-banner",
 * accessibilityRole "alert", theme.errorBackground, same i18n keys).
 *
 * No `useDataMode` mock in this suite (D-R1): the low-data condition is
 * produced through the REAL `DataModeProvider` with an explicit
 * `preference: 'low'` (INV-03 short-circuit — preference beats every network
 * signal), which proves the banner is INDIFFERENT to the resolved data mode.
 *
 * RED contract: the "null even while low-data" cases FAIL today because the
 * yellow variant still renders. If green believes a case is wrong, emit
 * BLOCK-TEST-WRONG — never edit this file (frozen test, UFR-022).
 */
import type React from 'react';
import { StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { OfflineBanner } from '@/features/chat/ui/OfflineBanner';
import { DataModeProvider } from '@/features/chat/application/DataModeProvider';
import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';

// Shared light theme registered by test-utils — assert against the mocked
// token values instead of re-pinning color literals here.
const themeModule = jest.requireMock('@/shared/ui/ThemeContext');

/** Renders under the REAL provider with the user preference forced to 'low'. */
const renderInLowDataMode = (ui: React.ReactElement) => {
  useDataModePreferenceStore.setState({ preference: 'low' });
  return render(<DataModeProvider>{ui}</DataModeProvider>);
};

describe('OfflineBanner — offline-only (D-R1, INV-12/INV-13)', () => {
  afterEach(() => {
    // act(): a mounted DataModeProvider subscribes to the zustand store —
    // resetting outside act() triggers the React update warning.
    act(() => {
      useDataModePreferenceStore.setState({ preference: 'auto' });
    });
  });

  // ── INV-13 — offline variant unchanged ────────────────────────────────────
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

  // ── New contract — the yellow low-data bar is buried (UFR-016) ───────────
  it('returns null when not offline', () => {
    const { toJSON } = render(<OfflineBanner pendingCount={0} isOffline={false} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when not offline EVEN while the resolved data mode is low (INV-12 — low-data UI is the chat badge, not this banner)', () => {
    const { toJSON } = renderInLowDataMode(<OfflineBanner pendingCount={0} isOffline={false} />);
    expect(toJSON()).toBeNull();
  });
});
