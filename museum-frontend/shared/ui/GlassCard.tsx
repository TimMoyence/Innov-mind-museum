import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { useTheme } from './ThemeContext';
import { semantic } from './tokens.semantic';
import { radius } from './tokens.generated';

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}

/** Renders a frosted-glass card container using BlurView with configurable intensity and rounded borders. */
export const GlassCard = ({ children, style, intensity = 52 }: GlassCardProps) => {
  const { theme } = useTheme();

  return (
    <BlurView
      intensity={intensity}
      tint={theme.blurTint}
      style={[
        styles.card,
        {
          borderColor: theme.glassBorder,
          backgroundColor: theme.glassBackground,
        },
        style,
      ]}
    >
      {children}
    </BlurView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['4xl'],
    borderWidth: semantic.input.borderWidth,
    overflow: 'hidden',
  },
});
