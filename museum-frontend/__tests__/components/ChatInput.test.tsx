import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { ChatInput } from '@/features/chat/ui/ChatInput';

describe('ChatInput', () => {
  const defaultProps = {
    value: '',
    onChangeText: jest.fn(),
    onSend: jest.fn(),
    isSending: false,
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders the text input with placeholder', () => {
    const { getByPlaceholderText } = render(<ChatInput {...defaultProps} />);
    expect(getByPlaceholderText('chatInput.placeholder')).toBeTruthy();
  });

  it('calls onChangeText when text changes', () => {
    const { getByPlaceholderText } = render(<ChatInput {...defaultProps} />);
    fireEvent.changeText(getByPlaceholderText('chatInput.placeholder'), 'Hello');
    expect(defaultProps.onChangeText).toHaveBeenCalledWith('Hello');
  });

  it('renders send button with accessibility label', () => {
    const { getByLabelText } = render(<ChatInput {...defaultProps} value="Hello" />);
    expect(getByLabelText('a11y.chat.send')).toBeTruthy();
  });

  it('renders with disabled state', () => {
    const { getByPlaceholderText } = render(<ChatInput {...defaultProps} disabled />);
    const input = getByPlaceholderText('chatInput.placeholder');
    expect(input.props.editable).toBe(false);
  });
});
