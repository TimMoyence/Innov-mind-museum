import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useReviews } from '@/features/review/application/useReviews';
import { semantic, space, fontSize, radius } from '@/shared/ui/tokens';
import { ReviewCard } from '@/features/review/ui/ReviewCard';
import { StarRating } from '@/features/review/ui/StarRating';
import type { ReviewDTO } from '@/features/review/infrastructure/reviewApi';
import { EmptyState } from '@/shared/ui/EmptyState';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/** Reviews screen: view stats, browse reviews, and submit a new review. */
export default function ReviewsScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const {
    reviews,
    stats,
    loading,
    error,
    hasMore,
    submitLoading,
    submitError,
    loadMore,
    submitReview,
    clearSubmitError,
  } = useReviews();

  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [userName, setUserName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = useCallback(async () => {
    if (rating === 0 || comment.trim().length === 0 || userName.trim().length === 0) return;
    const ok = await submitReview(rating, comment.trim(), userName.trim());
    if (ok) {
      setSubmitted(true);
      setShowForm(false);
      setRating(0);
      setComment('');
      setUserName('');
    }
  }, [rating, comment, userName, submitReview]);

  const renderHeader = () => (
    <View style={styles.headerSection}>
      {/* Stats header */}
      <GlassCard style={styles.statsCard} intensity={60}>
        {stats ? (
          <View style={styles.statsRow}>
            <View style={styles.statsLeft}>
              <Text style={[styles.avgNumber, { color: theme.textPrimary }]}>
                {stats.average.toFixed(1)}
              </Text>
              <StarRating rating={stats.average} size={18} />
            </View>
            <Text style={[styles.reviewCount, { color: theme.textSecondary }]}>
              {t('reviews.reviewCount', { count: stats.count })}
            </Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color={theme.primary} />
        ) : null}
      </GlassCard>

      {/* Submit form or button */}
      {submitted ? (
        <GlassCard style={styles.successCard} intensity={52}>
          <Text style={[styles.successText, { color: theme.success }]}>{t('reviews.success')}</Text>
        </GlassCard>
      ) : submitError === 'already_reviewed' ? (
        <GlassCard style={styles.successCard} intensity={52}>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            {t('reviews.alreadyReviewed')}
          </Text>
        </GlassCard>
      ) : showForm ? (
        <GlassCard style={styles.formCard} intensity={52}>
          <Text style={[styles.formTitle, { color: theme.textPrimary }]}>
            {t('reviews.writeReview')}
          </Text>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            {t('reviews.ratingLabel')}
          </Text>
          <StarRating rating={rating} size={32} interactive onRatingChange={setRating} />

          <TextInput
            style={[
              styles.input,
              {
                color: theme.textPrimary,
                borderColor: theme.inputBorder,
                backgroundColor: theme.inputBackground,
              },
            ]}
            placeholder={t('reviews.namePlaceholder')}
            placeholderTextColor={theme.placeholderText}
            value={userName}
            onChangeText={setUserName}
            maxLength={50}
            accessibilityLabel={t('a11y.reviews.name_input')}
          />

          <TextInput
            style={[
              styles.input,
              styles.commentInput,
              {
                color: theme.textPrimary,
                borderColor: theme.inputBorder,
                backgroundColor: theme.inputBackground,
              },
            ]}
            placeholder={t('reviews.commentPlaceholder')}
            placeholderTextColor={theme.placeholderText}
            value={comment}
            onChangeText={(text) => {
              setComment(text);
              clearSubmitError();
            }}
            multiline
            maxLength={500}
            accessibilityLabel={t('a11y.reviews.comment_input')}
          />

          {submitError !== null && submitError !== 'already_reviewed' && (
            <Text style={[styles.errorText, { color: theme.error }]}>
              {t('reviews.submitFailed')}
            </Text>
          )}

          <Pressable
            style={[
              styles.submitButton,
              {
                backgroundColor:
                  rating > 0 && comment.trim() && userName.trim() ? theme.primary : theme.separator,
              },
            ]}
            onPress={() => void onSubmit()}
            disabled={submitLoading || rating === 0 || !comment.trim() || !userName.trim()}
            accessibilityRole="button"
            accessibilityLabel={t('reviews.submit')}
          >
            {submitLoading ? (
              <ActivityIndicator color={theme.primaryContrast} />
            ) : (
              <Text style={[styles.submitButtonText, { color: theme.primaryContrast }]}>
                {t('reviews.submit')}
              </Text>
            )}
          </Pressable>
        </GlassCard>
      ) : (
        <Pressable
          style={[styles.writeButton, { backgroundColor: theme.primary }]}
          onPress={() => {
            setShowForm(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('reviews.writeReview')}
        >
          <Text style={[styles.writeButtonText, { color: theme.primaryContrast }]}>
            {t('reviews.writeReview')}
          </Text>
        </Pressable>
      )}
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: ReviewDTO }) => <ReviewCard review={item} />,
    [],
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <EmptyState
        variant="reviews"
        title={t('empty.reviews.title')}
        description={t('empty.reviews.description')}
        testID="reviews-empty-state"
      />
    );
  };

  const renderFooter = () => {
    if (!hasMore || !loading) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  };

  return (
    <LiquidScreen
      background={pickMuseumBackground(5)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 8 }]}
    >
      <Text style={[styles.screenTitle, { color: theme.textPrimary }]}>{t('reviews.title')}</Text>

      {error && !reviews.length ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
        </View>
      ) : (
        <FlashList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={ReviewSeparator}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
        />
      )}
    </LiquidScreen>
  );
}

const ReviewSeparator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: space['4.5'],
    paddingBottom: semantic.screen.padding,
  },
  screenTitle: {
    fontSize: semantic.section.titleSizeHero,
    fontWeight: '700',
    marginBottom: semantic.section.gap,
  },
  headerSection: {
    gap: semantic.screen.gapSmall,
    marginBottom: semantic.form.gapLarge,
  },
  statsCard: {
    padding: semantic.card.padding,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2.5'],
  },
  avgNumber: {
    fontSize: space['8'],
    fontWeight: '700',
  },
  reviewCount: {
    fontSize: fontSize.sm,
  },
  writeButton: {
    borderRadius: semantic.button.radiusSmall,
    paddingVertical: semantic.button.paddingYCompact,
    alignItems: 'center',
  },
  writeButtonText: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
  formCard: {
    padding: semantic.card.padding,
    gap: semantic.form.gap,
  },
  formTitle: {
    fontWeight: '700',
    fontSize: fontSize['lg-'],
  },
  fieldLabel: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
  input: {
    borderRadius: radius.DEFAULT,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: semantic.input.paddingCompact,
    paddingVertical: space['2.5'],
    fontSize: fontSize.sm,
  },
  commentInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    borderRadius: semantic.button.radiusSmall,
    paddingVertical: space['3'],
    alignItems: 'center',
    marginTop: space['0.5'],
  },
  submitButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
  successCard: {
    padding: semantic.card.padding,
    alignItems: 'center',
  },
  successText: {
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  infoText: {
    fontSize: fontSize.sm,
  },
  errorText: {
    fontSize: semantic.form.labelSize,
  },
  listContent: {
    paddingBottom: space['5'],
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: space['10'],
  },
  separator: {
    height: space['2.5'],
  },
  footerLoader: {
    paddingVertical: semantic.card.padding,
    alignItems: 'center',
  },
});
