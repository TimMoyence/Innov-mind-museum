import { useEffect, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { fadeIn } from '@/shared/ui/fadeIn';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';

interface BottomSheetBackdropProps {
  onPress: () => void;
  accessibilityLabel?: string;
  dismissLabel?: string;
}

export const BottomSheetBackdrop = ({
  onPress,
  accessibilityLabel,
  dismissLabel,
}: BottomSheetBackdropProps) => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    fadeIn(opacity, reduceMotion, 180);
  }, [opacity, reduceMotion]);

  const introspectionProps = { onPress } as Record<string, unknown>;

  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.fill, { backgroundColor: theme.modalOverlay, opacity }]}
    >
      <View testID="bottom-sheet-backdrop" style={styles.fill} {...introspectionProps}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel ?? accessibilityLabel}
          style={styles.fill}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
});
