import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { OfflineBanner } from '@/features/chat/ui/OfflineBanner';

// ── DataModeProvider mock ───────────────────────────────────────────────────
let mockIsLowData = false;
jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({ isLowData: mockIsLowData }),
}));

describe('OfflineBanner', () => {
  beforeEach(() => {
    mockIsLowData = false;
  });

  it('renders offline title when isOffline is true', () => {
    const { getByText } = render(<OfflineBanner pendingCount={0} isOffline={true} />);
    expect(getByText('offline.title')).toBeTruthy();
  });

  it('shows pending count when > 0 and offline', () => {
    const { getByText } = render(<OfflineBanner pendingCount={3} isOffline={true} />);
    expect(getByText(/offline\.pending/)).toBeTruthy();
  });

  it('has alert accessibility label when offline', () => {
    const { getByLabelText } = render(<OfflineBanner pendingCount={0} isOffline={true} />);
    expect(getByLabelText('offline.title')).toBeTruthy();
  });

  it('returns null when not offline and not low-data', () => {
    const { toJSON } = render(<OfflineBanner pendingCount={0} isOffline={false} />);
    expect(toJSON()).toBeNull();
  });

  it('shows low-data banner when not offline but in low-data mode', () => {
    mockIsLowData = true;
    const { getByText, getByLabelText } = render(
      <OfflineBanner pendingCount={0} isOffline={false} />,
    );
    expect(getByText('chat.lowDataActive')).toBeTruthy();
    expect(getByLabelText('chat.lowDataActive')).toBeTruthy();
  });
});
