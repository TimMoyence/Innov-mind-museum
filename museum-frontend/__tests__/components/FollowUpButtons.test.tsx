import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { FollowUpButtons } from '@/features/chat/ui/FollowUpButtons';

describe('FollowUpButtons', () => {
  const questions = ['What is the style?', 'Who was the artist?', 'When was it created?'];

  it('renders nothing when questions list is empty', () => {
    const { toJSON } = render(<FollowUpButtons questions={[]} onPress={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('renders all questions as buttons', () => {
    const { getByText } = render(<FollowUpButtons questions={questions} onPress={jest.fn()} />);

    expect(getByText('What is the style?')).toBeTruthy();
    expect(getByText('Who was the artist?')).toBeTruthy();
    expect(getByText('When was it created?')).toBeTruthy();
  });

  it('calls onPress with the question text when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<FollowUpButtons questions={questions} onPress={onPress} />);

    fireEvent.press(getByText('What is the style?'));
    expect(onPress).toHaveBeenCalledWith('What is the style?');
  });

  it('renders section label', () => {
    const { getByText } = render(<FollowUpButtons questions={questions} onPress={jest.fn()} />);

    expect(getByText('followUpButtons.section_label')).toBeTruthy();
  });
});
