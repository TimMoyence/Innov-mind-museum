import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { LiquidScreen } from '@/shared/ui/LiquidScreen';

jest.unmock('@/shared/ui/LiquidScreen');

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

  it('renders without crashing with responsive background', () => {
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
