import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
// TD-RNGH-04 — migrated from deprecated `Swipeable` (RN Animated v1) to
// `ReanimatedSwipeable` (Reanimated v3 worklets, Fabric/New Arch safe).
// lib-docs/react-native-gesture-handler/PATTERNS.md.
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface SwipeableConversationCardProps {
  /** The conversation card content to render. */
  children: React.ReactNode;
  /** Called when the user confirms deletion via the swipe action. */
  onDelete: () => void;
  /** Whether the card is in edit/selection mode (disables swipe). */
  editMode?: boolean;
}

interface DeleteActionProps {
  translation: SharedValue<number>;
  backgroundColor: string;
  foregroundColor: string;
  label: string;
  onPress: () => void;
}

/**
 * Renders the right-swipe-revealed delete button. Owns the `useAnimatedStyle`
 * hook so we can read the `translation` SharedValue inside a worklet
 * (ReanimatedSwipeable contract — the parent `renderRightActions` is called
 * inside the swipeable's render phase and CANNOT host hooks itself).
 */
function DeleteAction({
  translation,
  backgroundColor,
  foregroundColor,
  label,
  onPress,
}: DeleteActionProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(translation.value, [-80, 0], [1, 0.5], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });
  return (
    <Pressable
      style={[styles.deleteAction, { backgroundColor }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.deleteContent, animatedStyle]}>
        <Ionicons name="trash-outline" size={22} color={foregroundColor} />
        <Text style={[styles.deleteText, { color: foregroundColor }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** Wraps a conversation card with swipe-left-to-reveal-delete functionality. */
export const SwipeableConversationCard = ({
  children,
  onDelete,
  editMode = false,
}: SwipeableConversationCardProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const handleDelete = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeableRef.current?.close();
    onDelete();
  }, [onDelete]);

  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, translation: SharedValue<number>) => (
      <DeleteAction
        translation={translation}
        backgroundColor={theme.error}
        foregroundColor={theme.primaryContrast}
        label={t('common.delete')}
        onPress={handleDelete}
      />
    ),
    [handleDelete, theme.error, theme.primaryContrast, t],
  );

  if (editMode) {
    return <View>{children}</View>;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      {children}
    </ReanimatedSwipeable>
  );
};

const styles = StyleSheet.create({
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: space['20'],
    borderTopRightRadius: semantic.card.paddingLarge,
    borderBottomRightRadius: semantic.card.paddingLarge,
  },
  deleteContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['1'],
  },
  deleteText: {
    fontSize: semantic.card.captionSize,
    fontWeight: '600',
  },
});
