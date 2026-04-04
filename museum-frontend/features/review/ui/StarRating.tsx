import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/shared/ui/ThemeContext';

interface StarRatingProps {
  rating: number;
  size?: number;
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
}

/** Displays 1–5 stars. In interactive mode, stars are tappable to set a rating. */
export const StarRating = ({
  rating,
  size = 20,
  interactive = false,
  onRatingChange,
}: StarRatingProps) => {
  const { theme } = useTheme();
  const starColor = '#F59E0B';

  return (
    <View
      style={styles.row}
      accessibilityRole="adjustable"
      accessibilityValue={{ now: rating, min: 1, max: 5 }}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.round(rating);
        const icon = filled ? 'star' : 'star-outline';

        if (interactive) {
          return (
            <Pressable
              key={star}
              onPress={() => onRatingChange?.(star)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${String(star)} star${star > 1 ? 's' : ''}`}
            >
              <Ionicons name={icon} size={size} color={filled ? starColor : theme.textTertiary} />
            </Pressable>
          );
        }

        return (
          <Ionicons
            key={star}
            name={icon}
            size={size}
            color={filled ? starColor : theme.textTertiary}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 2,
  },
});
