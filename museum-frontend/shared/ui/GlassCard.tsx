import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { liquidColors } from './liquidTheme';

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}

/** Renders a frosted-glass card container using BlurView with configurable intensity and rounded borders. */
export const GlassCard = ({
  children,
  style,
  intensity = 52,
}: GlassCardProps) => {
  return (
    <BlurView
      intensity={intensity}
      tint='light'
      style={[styles.card, style]}
    >
      {children}
    </BlurView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: liquidColors.glassBorder,
    backgroundColor: liquidColors.glassBackground,
    overflow: 'hidden',
  },
});
