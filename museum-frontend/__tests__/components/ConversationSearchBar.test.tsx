import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { ConversationSearchBar } from '@/features/conversation/ui/ConversationSearchBar';

describe('ConversationSearchBar', () => {
  it('renders with default placeholder', () => {
    const { getByPlaceholderText } = render(
      <ConversationSearchBar value="" onChangeText={jest.fn()} />,
    );
    expect(getByPlaceholderText('conversationSearch.placeholder')).toBeTruthy();
  });

  it('renders with custom placeholder', () => {
    const { getByPlaceholderText } = render(
      <ConversationSearchBar value="" onChangeText={jest.fn()} placeholder="Search..." />,
    );
    expect(getByPlaceholderText('Search...')).toBeTruthy();
  });

  it('calls onChangeText when text changes', () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = render(
      <ConversationSearchBar value="" onChangeText={onChangeText} />,
    );
    fireEvent.changeText(getByLabelText('a11y.conversations.search_input'), 'test query');
    expect(onChangeText).toHaveBeenCalledWith('test query');
  });

  it('displays the current value', () => {
    const { getByDisplayValue } = render(
      <ConversationSearchBar value="existing search" onChangeText={jest.fn()} />,
    );
    expect(getByDisplayValue('existing search')).toBeTruthy();
  });
});
