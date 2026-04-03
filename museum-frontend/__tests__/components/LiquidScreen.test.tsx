// DO NOT import test-utils — it mocks LiquidScreen itself
import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      pageGradient: ['#EAF2FF', '#D8E8FF', '#D5F0FF'],
    },
  }),
}));

jest.mock('@/shared/ui/liquidTheme', () => ({
  viewportConfig: {
    desktopBreakpoint: 1024,
    mobileBackgroundOpacity: 0.18,
    desktopBackgroundOpacity: 0.24,
    mobileResizeMode: 'cover',
    desktopResizeMode: 'contain',
    desktopMaxContentWidth: 1180,
  },
}));

import { LiquidScreen } from '@/shared/ui/LiquidScreen';

describe('LiquidScreen', () => {
  const background = { uri: 'https://example.com/bg.jpg' };

  it('renders children', () => {
    render(
      <LiquidScreen background={background}>
        <Text>Hello Child</Text>
      </LiquidScreen>,
    );

    expect(screen.getByText('Hello Child')).toBeTruthy();
  });

  it('renders with responsive background', () => {
    const responsiveBg = {
      mobile: { uri: 'https://example.com/mobile.jpg' },
      desktop: { uri: 'https://example.com/desktop.jpg' },
    };

    render(
      <LiquidScreen background={responsiveBg}>
        <Text>Responsive</Text>
      </LiquidScreen>,
    );

    expect(screen.getByText('Responsive')).toBeTruthy();
  });
});
