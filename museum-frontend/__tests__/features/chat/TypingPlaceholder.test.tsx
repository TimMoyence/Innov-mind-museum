import '@/__tests__/helpers/test-utils';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TypingPlaceholder } from '@/features/chat/ui/TypingPlaceholder';

describe('TypingPlaceholder', () => {
  it('returns null when visible is false', () => {
    const { toJSON } = render(<TypingPlaceholder visible={false} />);
    expect(toJSON()).toBeNull();
  });

  it('renders skeleton + label when visible', () => {
    render(<TypingPlaceholder visible testID="typing" />);
    expect(screen.getByTestId('typing')).toBeTruthy();
    // i18n mock returns the key as text
    expect(screen.getByText('chat.typing.label')).toBeTruthy();
  });

  it('exposes accessibilityLiveRegion=polite', () => {
    render(<TypingPlaceholder visible testID="typing" />);
    const node = screen.getByTestId('typing');
    expect(node.props.accessibilityLiveRegion).toBe('polite');
  });

  it('renders with accessibilityLabel from i18n key', () => {
    render(<TypingPlaceholder visible testID="typing" />);
    const node = screen.getByTestId('typing');
    expect(node.props.accessibilityLabel).toBe('chat.typing.label');
  });
});
