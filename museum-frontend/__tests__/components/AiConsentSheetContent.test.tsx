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

  // S4-P0-02 — the legacy single-button "consent.accept" is replaced by
  // "consent.save_and_continue" (per Apple Guideline 5.1.2(i) granular gate).
  // Defaults give text→OpenAI consent (the only REQUIRED scope), so pressing
  // Save without further interaction calls onAccept with that one scope.
  it('calls onAccept with the granted scopes (and close) when save is pressed', async () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    expect(defaultProps.onAccept).toHaveBeenCalledWith(['third_party_ai_text_openai']);
    expect(defaultProps.close).toHaveBeenCalledTimes(1);
  });

  it('calls onPrivacy when privacy link is pressed', () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(getByText('consent.read_privacy'));
    expect(defaultProps.onPrivacy).toHaveBeenCalledTimes(1);
  });
});
