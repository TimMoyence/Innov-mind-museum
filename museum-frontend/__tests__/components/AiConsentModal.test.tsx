import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AiConsentModal } from '@/features/chat/ui/AiConsentModal';

describe('AiConsentModal', () => {
  const defaultProps = {
    visible: true,
    onAccept: jest.fn(),
    onPrivacy: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders when visible', () => {
    const { getByText } = render(<AiConsentModal {...defaultProps} />);
    expect(getByText('consent.title')).toBeTruthy();
  });

  // The accept button uses LiquidButton, which fires haptic feedback before
  // invoking onPress in an async chain. fireEvent.press resolves synchronously,
  // so the assertion must wait for the microtask queue to drain.
  it('calls onAccept when accept button is pressed', async () => {
    const { getByText } = render(<AiConsentModal {...defaultProps} />);
    fireEvent.press(getByText('consent.accept'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onPrivacy when privacy link is pressed', () => {
    const { getByText } = render(<AiConsentModal {...defaultProps} />);
    fireEvent.press(getByText('consent.read_privacy'));
    expect(defaultProps.onPrivacy).toHaveBeenCalledTimes(1);
  });
});
