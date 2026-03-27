import { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

interface SwipeableConversationCardProps {
  /** The conversation card content to render. */
  children: React.ReactNode;
  /** Called when the user confirms deletion via the swipe action. */
  onDelete: () => void;
  /** Whether the card is in edit/selection mode (disables swipe). */
  editMode?: boolean;
}

/** Wraps a conversation card with swipe-left-to-reveal-delete functionality. */
export const SwipeableConversationCard = ({
  children,
  onDelete,
  editMode = false,
}: SwipeableConversationCardProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const swipeableRef = useRef<Swipeable>(null);

  const handleDelete = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeableRef.current?.close();
    onDelete();
  }, [onDelete]);

  const renderRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
    ) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.5],
        extrapolate: 'clamp',
      });

      return (
        <Pressable
          style={[styles.deleteAction, { backgroundColor: theme.error }]}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
        >
          <Animated.View style={[styles.deleteContent, { transform: [{ scale }] }]}>
            <Ionicons name="trash-outline" size={22} color={theme.primaryContrast} />
            <Text style={[styles.deleteText, { color: theme.primaryContrast }]}>
              {t('common.delete')}
            </Text>
          </Animated.View>
        </Pressable>
      );
    },
    [theme, handleDelete, t],
  );

  if (editMode) {
    return <View>{children}</View>;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      {children}
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
  },
  deleteContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
