import { useEffect, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';

interface BottomSheetBackdropProps {
  /** Called when the user taps the overlay. The router decides whether to close. */
  onPress: () => void;
  /** Accessibility hint announced for the backdrop tappable region. */
  accessibilityLabel?: string;
}

/**
 * Semi-transparent overlay behind the active sheet. Opacity animates in on
 * mount (skipped under Reduce Motion).
 *
 * Rendering shape:
 *   - Outer `<View testID="bottom-sheet-backdrop" onPress={...}>` carries the
 *     testID. We attach `onPress` as a custom prop on the View so tests can
 *     drive dismissal via `backdrop.props.onPress?.()` — Pressable consumes
 *     `onPress` internally and does not forward it as a prop on the rendered
 *     element, which would otherwise make the prop invisible to test queries.
 *   - Inner `<Pressable>` is the actual touchable region in production
 *     (native press feedback, accessibility role).
 */
export const BottomSheetBackdrop = ({ onPress, accessibilityLabel }: BottomSheetBackdropProps) => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [opacity, reduceMotion]);

  // `onPress` is forwarded as a custom prop on the testID View so unit tests
  // can dispatch the close gesture synchronously via
  // `backdrop.props.onPress?.()`. Pressable consumes `onPress` internally and
  // does NOT forward it as a prop on its rendered host element, so attaching
  // the same callback to an outer View is the simplest test-stable shape.
  // RN ignores the extra prop on real native views.
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
          accessibilityLabel={accessibilityLabel}
          style={styles.fill}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
});
