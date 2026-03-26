import '../helpers/test-utils';
import React from 'react';
import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import * as Sentry from '@sentry/react-native';

import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';

// ErrorBoundary uses i18n.t() directly (not useTranslation hook)
jest.mock('@/shared/i18n/i18n', () => ({
  __esModule: true,
  default: {
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  },
}));

// Mock the themes import used by ErrorBoundary styles
jest.mock('@/shared/ui/themes', () => ({
  darkTheme: {
    pageGradient: ['#0F172A', '#1E293B', '#0F172A'] as readonly [string, string, ...string[]],
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    primaryContrast: '#FFFFFF',
  },
}));

/** A component that throws on render, used to trigger the error boundary. */
const ThrowError = ({ message }: { message: string }) => {
  throw new Error(message);
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <Text>Safe content</Text>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Safe content')).toBeTruthy();
  });

  it('catches an error and shows the fallback UI with error title', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError message="Test crash" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(
      screen.getByText('The app encountered an unexpected error. Your data is safe.'),
    ).toBeTruthy();

    spy.mockRestore();
  });

  it('shows a reload button in the fallback UI', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError message="Test crash" />
      </ErrorBoundary>,
    );

    const reloadButton = screen.getByLabelText('Reload');
    expect(reloadButton).toBeTruthy();
    expect(reloadButton.props.accessibilityRole).toBe('button');

    // Verify button text also shows
    expect(screen.getByText('Reload')).toBeTruthy();

    spy.mockRestore();
  });

  it('reports the error to Sentry via captureException', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError message="Sentry test error" />
      </ErrorBoundary>,
    );

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Sentry test error' }),
      expect.objectContaining({
        contexts: expect.objectContaining({
          react: expect.objectContaining({
            componentStack: expect.any(String),
          }),
        }),
      }),
    );

    spy.mockRestore();
  });

  it('re-renders children after reload resets the error state', () => {
    let shouldThrow = true;

    const MaybeThrow = () => {
      if (shouldThrow) throw new Error('Conditional crash');
      return <Text>Recovered</Text>;
    };

    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();

    // Simulate reload: stop throwing, then press the button
    shouldThrow = false;
    fireEvent.press(screen.getByLabelText('Reload'));

    expect(screen.getByText('Recovered')).toBeTruthy();

    spy.mockRestore();
  });
});
