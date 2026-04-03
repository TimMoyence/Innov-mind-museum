import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

// DO NOT import test-utils — it mocks GlassCard itself
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: (props: Record<string, unknown>) => <View {...props} /> };
});
jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: { glassBorder: '#ccc', glassBackground: '#fff', blurTint: 'light' },
  }),
}));

import { GlassCard } from '@/shared/ui/GlassCard';

describe('GlassCard', () => {
  it('renders children', () => {
    const { getByText } = render(
      <GlassCard>
        <Text>Card content</Text>
      </GlassCard>,
    );

    expect(getByText('Card content')).toBeTruthy();
  });

  it('renders with custom intensity', () => {
    const { getByText } = render(
      <GlassCard intensity={80}>
        <Text>High blur</Text>
      </GlassCard>,
    );

    expect(getByText('High blur')).toBeTruthy();
  });

  it('renders with custom style', () => {
    const { toJSON } = render(
      <GlassCard style={{ marginTop: 20 }}>
        <Text>Styled</Text>
      </GlassCard>,
    );

    expect(toJSON()).toBeTruthy();
  });
});
