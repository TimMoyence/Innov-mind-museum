import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

import type { ReviewDTO } from '../infrastructure/reviewApi';

import { StarRating } from './StarRating';

interface ReviewCardProps {
  review: ReviewDTO;
}

const formatRelativeDate = (iso: string, locale: string): string => {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0) return locale === 'fr' ? "Aujourd'hui" : 'Today';
  if (diffDays === 1) return locale === 'fr' ? 'Hier' : 'Yesterday';
  if (diffDays < 30) return `${String(diffDays)}d`;
  if (diffDays < 365) return `${String(Math.floor(diffDays / 30))}mo`;
  return `${String(Math.floor(diffDays / 365))}y`;
};

/** Displays a single review with stars, username, comment, and relative date. */
export const ReviewCard = ({ review }: ReviewCardProps) => {
  const { theme } = useTheme();
  const { i18n } = useTranslation();

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
          {formatRelativeDate(review.createdAt, i18n.language)}
        </Text>
      </View>
      <StarRating rating={review.rating} size={16} />
      <Text style={[styles.comment, { color: theme.textSecondary }]}>{review.comment}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontWeight: '700',
    fontSize: 14,
  },
  date: {
    fontSize: 12,
  },
  comment: {
    fontSize: 13,
    lineHeight: 19,
  },
});
