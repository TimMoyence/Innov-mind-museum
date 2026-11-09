import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize, lineHeightPx } from '@/shared/ui/tokens';

import type { ReviewDTO } from '../infrastructure/reviewApi';

interface ReviewCardProps {
  review: ReviewDTO;
}

const reviewAge = (
  iso: string,
): { unit: 'today' | 'yesterday' | 'days' | 'months' | 'years'; count: number } => {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  if (diffDays <= 0) return { unit: 'today', count: 0 };
  if (diffDays === 1) return { unit: 'yesterday', count: 1 };
  if (diffDays < 30) return { unit: 'days', count: diffDays };
  if (diffDays < 365) return { unit: 'months', count: Math.floor(diffDays / 30) };
  return { unit: 'years', count: Math.floor(diffDays / 365) };
};

export const ReviewCard = ({ review }: ReviewCardProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const age = reviewAge(review.createdAt);

  return (
    <View
      style={[
        styles.card,
        { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground },
      ]}
      accessibilityRole="summary"
    >
      <View style={styles.header}>
        <Text style={[styles.userName, { color: theme.textPrimary }]}>{review.userName}</Text>
        <Text style={[styles.date, { color: theme.textTertiary }]}>
          {t(`reviews.age.${age.unit}`, { count: age.count })}
        </Text>
      </View>
      <View style={styles.ratingRow}>
        <Text style={[styles.ratingNumber, { color: theme.textPrimary }]}>
          {String(review.rating)}
        </Text>
        <Text style={[styles.ratingScale, { color: theme.textTertiary }]}>
          {t('reviews.ratingOutOf10')}
        </Text>
      </View>
      <Text style={[styles.comment, { color: theme.textSecondary }]}>{review.comment}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: semantic.input.borderWidth,
    padding: space['3.5'],
    gap: space['1.5'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  date: {
    fontSize: fontSize.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  ratingNumber: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
  ratingScale: {
    fontSize: fontSize.xs,
  },
  comment: {
    fontSize: semantic.form.labelSize,
    lineHeight: lineHeightPx['19'],
  },
});
