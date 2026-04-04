import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { ConversationsHeader } from '@/features/conversation/ui/ConversationsHeader';

describe('ConversationsHeader', () => {
  const defaultProps = {
    editMode: false,
    onToggleEdit: jest.fn(),
    onToggleSortMode: jest.fn(),
    onToggleSavedFilter: jest.fn(),
    onShareDashboard: jest.fn().mockResolvedValue(undefined),
    isSavedOnly: false,
    sortMode: 'recent',
  };

  it('renders the dashboard title', () => {
    const { getByText } = render(<ConversationsHeader {...defaultProps} />);
    expect(getByText('conversations.title')).toBeTruthy();
  });

  it('renders sort mode info', () => {
    const { getByText } = render(<ConversationsHeader {...defaultProps} sortMode="oldest" />);
    expect(getByText(/conversations\.sort_label/)).toBeTruthy();
  });

  it('shows saved filter indicator when active', () => {
    const { getByText } = render(<ConversationsHeader {...defaultProps} isSavedOnly />);
    expect(getByText(/conversations\.saved_filter_on/)).toBeTruthy();
  });

  it('renders title in edit mode', () => {
    const { getByText } = render(<ConversationsHeader {...defaultProps} editMode />);
    expect(getByText('conversations.title')).toBeTruthy();
  });
});
