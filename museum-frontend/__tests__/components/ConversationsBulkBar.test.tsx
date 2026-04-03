import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { ConversationsBulkBar } from '@/features/conversation/ui/ConversationsBulkBar';

describe('ConversationsBulkBar', () => {
  const defaultProps = {
    selectedCount: 3,
    onSelectAll: jest.fn(),
    onDeleteSelected: jest.fn(),
    isDeleting: false,
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders select all button', () => {
    const { getByLabelText } = render(<ConversationsBulkBar {...defaultProps} />);
    expect(getByLabelText('conversations.select_all')).toBeTruthy();
  });

  it('renders delete button with selected count', () => {
    const { getByText } = render(<ConversationsBulkBar {...defaultProps} />);
    expect(getByText(/conversations\.delete_selected/)).toBeTruthy();
  });

  it('fires onSelectAll when select all is pressed', () => {
    const { getByLabelText } = render(<ConversationsBulkBar {...defaultProps} />);
    fireEvent.press(getByLabelText('conversations.select_all'));
    expect(defaultProps.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('fires onDeleteSelected when delete is pressed', () => {
    const { getByText } = render(<ConversationsBulkBar {...defaultProps} />);
    fireEvent.press(getByText(/conversations\.delete_selected/));
    expect(defaultProps.onDeleteSelected).toHaveBeenCalledTimes(1);
  });
});
