import '@/__tests__/helpers/test-utils';
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WalkSuggestionChips } from '@/features/chat/ui/WalkSuggestionChips';

describe('WalkSuggestionChips', () => {
  it('renders one chip per suggestion', () => {
    const suggestions = ['Tell me more', 'Who painted this?', 'What era is this?'];
    const onSelect = jest.fn();
    const { getByText } = render(
      <WalkSuggestionChips suggestions={suggestions} onSelect={onSelect} />,
    );

    expect(getByText('Tell me more')).toBeTruthy();
    expect(getByText('Who painted this?')).toBeTruthy();
    expect(getByText('What era is this?')).toBeTruthy();
  });

  it('calls onSelect with chip text when tapped', () => {
    const suggestions = ['Tell me more', 'Who painted this?'];
    const onSelect = jest.fn();
    const { getByText } = render(
      <WalkSuggestionChips suggestions={suggestions} onSelect={onSelect} />,
    );

    fireEvent.press(getByText('Tell me more'));
    expect(onSelect).toHaveBeenCalledWith('Tell me more');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders null for empty suggestions array', () => {
    const onSelect = jest.fn();
    const { toJSON } = render(<WalkSuggestionChips suggestions={[]} onSelect={onSelect} />);

    expect(toJSON()).toBeNull();
  });

  it('renders an accessible list for non-empty suggestions', () => {
    const suggestions = ['Suggestion A'];
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <WalkSuggestionChips suggestions={suggestions} onSelect={onSelect} />,
    );

    // The i18n mock returns the key; ScrollView renders with accessibilityLabel set
    expect(getByLabelText('chat.walk.suggestionsLabel')).toBeTruthy();
  });
});
