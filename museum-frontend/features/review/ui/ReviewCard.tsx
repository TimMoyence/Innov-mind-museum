import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize, lineHeightPx } from '@/shared/ui/tokens';

import type { ReviewDTO } from '../infrastructure/reviewApi';

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

/** Displays a single review with its 0-10 NPS rating, username, comment, and relative date. */
export const ReviewCard = ({ review }: ReviewCardProps) => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();

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
      {/* NPS score on a 0-10 scale (no 5-star clamp). R26/Q4.
          The numerator and the "/10" suffix are two adjacent Text nodes so the
          number can be emphasised; the suffix dict value is a bare "/10" (no
          {{rating}} interpolation) — rendering the rating exactly ONCE → "9/10"
          (C2FE-F1: the prior duplicated "{{rating}}/10" produced "9 9/10"). */}
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
