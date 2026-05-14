import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AiConsentSheetContent } from '@/features/chat/ui/AiConsentSheetContent';

/**
 * Sheet-content variant of the legacy `AiConsentModal` tests (migrated under
 * C4). The `<Modal>` wrapper is no longer the responsibility of this
 * component — the bottom-sheet router owns it. The CTAs and link
 * interactions remain identical.
 */
describe('AiConsentSheetContent', () => {
  const defaultProps = {
    close: jest.fn(),
    onAccept: jest.fn(),
    onPrivacy: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders the consent copy', () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    expect(getByText('consent.title')).toBeTruthy();
  });

  // The accept button uses LiquidButton, which fires haptic feedback before
  // invoking onPress in an async chain. fireEvent.press resolves synchronously,
  // so the assertion must wait for the microtask queue to drain.
  it('calls onAccept (and close) when accept button is pressed', async () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(getByText('consent.accept'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    expect(defaultProps.close).toHaveBeenCalledTimes(1);
  });

  it('calls onPrivacy when privacy link is pressed', () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(getByText('consent.read_privacy'));
    expect(defaultProps.onPrivacy).toHaveBeenCalledTimes(1);
  });
});
