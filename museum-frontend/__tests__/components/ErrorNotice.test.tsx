import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock i18n and theme directly — DO NOT import test-utils because it mocks ErrorNotice itself
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      errorBackground: '#fee2e2',
      error: '#dc2626',
      primary: '#2563eb',
    },
  }),
}));

import { ErrorNotice } from '@/shared/ui/ErrorNotice';

describe('ErrorNotice', () => {
  it('renders the error message', () => {
    const { getByText } = render(<ErrorNotice message="Something went wrong" />);

    expect(getByText('Something went wrong')).toBeTruthy();
  });

  it('shows no action buttons when neither onDismiss nor onRetry are provided', () => {
    const { queryByText } = render(<ErrorNotice message="Error" />);

    expect(queryByText('errorNotice.retry')).toBeNull();
    expect(queryByText('errorNotice.dismiss')).toBeNull();
  });

  it('shows retry button when onRetry is provided', () => {
    const onRetry = jest.fn();
    const { getByText } = render(<ErrorNotice message="Error" onRetry={onRetry} />);

    fireEvent.press(getByText('errorNotice.retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows dismiss button when onDismiss is provided', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(<ErrorNotice message="Error" onDismiss={onDismiss} />);

    fireEvent.press(getByText('errorNotice.dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows both buttons when both callbacks are provided', () => {
    const onRetry = jest.fn();
    const onDismiss = jest.fn();
    const { getByText } = render(
      <ErrorNotice message="Error" onRetry={onRetry} onDismiss={onDismiss} />,
    );

    expect(getByText('errorNotice.retry')).toBeTruthy();
    expect(getByText('errorNotice.dismiss')).toBeTruthy();
  });
});
