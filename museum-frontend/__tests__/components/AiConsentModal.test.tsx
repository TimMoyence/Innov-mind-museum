import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

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

  it('calls onAccept when accept button is pressed', () => {
    const { getByText } = render(<AiConsentModal {...defaultProps} />);
    fireEvent.press(getByText('consent.accept'));
    expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onPrivacy when privacy link is pressed', () => {
    const { getByText } = render(<AiConsentModal {...defaultProps} />);
    fireEvent.press(getByText('consent.read_privacy'));
    expect(defaultProps.onPrivacy).toHaveBeenCalledTimes(1);
  });
});
