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
      overlay: 'rgba(255,255,255,0.70)',
      surface: 'rgba(255,255,255,0.64)',
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

  it('renders with desktop viewport dimensions', () => {
    // Mock useWindowDimensions to return desktop width
    jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
      width: 1280,
      height: 800,
      scale: 1,
      fontScale: 1,
    });

    render(
      <LiquidScreen background={background}>
        <Text>Desktop View</Text>
      </LiquidScreen>,
    );

    expect(screen.getByText('Desktop View')).toBeTruthy();

    jest.restoreAllMocks();
  });

  it('renders with non-responsive (plain ImageSourcePropType) background', () => {
    const plainBg = 42; // Numeric source (RN require() returns a number)

    render(
      <LiquidScreen background={plainBg}>
        <Text>Plain BG</Text>
      </LiquidScreen>,
    );

    expect(screen.getByText('Plain BG')).toBeTruthy();
  });

  it('accepts custom contentStyle', () => {
    render(
      <LiquidScreen background={background} contentStyle={{ padding: 20 }}>
        <Text>Styled</Text>
      </LiquidScreen>,
    );

    expect(screen.getByText('Styled')).toBeTruthy();
  });

  it('handles array as background (not responsive)', () => {
    // Arrays are valid ImageSourcePropType but not ResponsiveBackground
    const arrayBg = [{ uri: 'https://example.com/a.jpg' }];

    render(
      <LiquidScreen background={arrayBg as unknown as number}>
        <Text>Array BG</Text>
      </LiquidScreen>,
    );

    expect(screen.getByText('Array BG')).toBeTruthy();
  });
});
