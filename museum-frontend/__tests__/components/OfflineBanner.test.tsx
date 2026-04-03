import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { OfflineBanner } from '@/features/chat/ui/OfflineBanner';

describe('OfflineBanner', () => {
  it('renders offline title', () => {
    const { getByText } = render(<OfflineBanner pendingCount={0} />);
    expect(getByText('offline.title')).toBeTruthy();
  });

  it('shows pending count when > 0', () => {
    const { getByText } = render(<OfflineBanner pendingCount={3} />);
    expect(getByText(/offline\.pending/)).toBeTruthy();
  });

  it('has alert accessibility label', () => {
    const { getByLabelText } = render(<OfflineBanner pendingCount={0} />);
    expect(getByLabelText('offline.title')).toBeTruthy();
  });
});
