/**
 * B1 — Carnet (visit notebook) list item.
 *
 * Pure presentational `<Pressable>` row : title + dateLabel + chevron.
 * Wrapped in `React.memo` with a shallow-compare on id/title/dateLabel
 * (R18) so a list re-render does not invalidate stable rows.
 *
 * Spec : `docs/chat-ux-refonte/specs/B1.md` §1.3 R18-R22 ; §4 AC15.
 */

import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { VisitCarnetCard } from '@/features/chat/domain/carnet';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface CarnetSessionCardProps {
  card: VisitCarnetCard;
  onPress: (id: string) => void;
}

/**
 * Renders a single carnet session row. Accessibility (R19, AC15) :
 *  - `accessibilityRole="button"` on the pressable container.
 *  - `accessibilityLabel` interpolates title / museum / date so screen
 *    readers announce all 3 anchor data points.
 *  - `accessibilityHint` opens the visit (read-only) — never the chat.
 */
function CarnetSessionCardComponent({ card, onPress }: CarnetSessionCardProps): React.ReactElement {
  const { t } = useTranslation();
  const { theme } = useTheme();

  // The pure helper returns an i18n KEY when no title could be derived (R5);
  // resolve it here so the rendered row stays locale-aware.
  const displayTitle =
    card.title === 'carnet.untitledSession' ? t('carnet.untitledSession') : card.title;
  const displayMuseum =
    card.museumLabel === 'carnet.unknownMuseum' ? t('carnet.unknownMuseum') : card.museumLabel;

  const handlePress = useCallback(() => {
    onPress(card.id);
  }, [card.id, onPress]);

  // Compose the label with interpolation, then guarantee the three anchor
  // values are present even if the i18n backend did not interpolate (defensive
  // contract — also makes the test-utils stub-`t` produce a usable label).
  const interpolated = t('a11y.carnet.session_card', {
    title: displayTitle,
    museum: displayMuseum,
    date: card.dateLabel,
  });
  const hasAllAnchors =
    interpolated.includes(displayTitle) &&
    interpolated.includes(displayMuseum) &&
    interpolated.includes(card.dateLabel);
  const a11yLabel = hasAllAnchors
    ? interpolated
    : `${displayTitle}, ${displayMuseum}, ${card.dateLabel}`;

  return (
    <Pressable
      onPress={handlePress}
      android_ripple={{ color: theme.primaryTint }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.cardBackground,
          borderColor: theme.cardBorder,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={t('a11y.carnet.continue_hint')}
      testID={`carnet-session-card-${card.id}`}
    >
      <View style={styles.textCol}>
        <Text
          style={[styles.title, { color: theme.textPrimary }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {displayTitle}
        </Text>
        <Text style={[styles.dateLabel, { color: theme.textSecondary }]} numberOfLines={1}>
          {card.dateLabel}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={semantic.chat.iconSize} color={theme.textTertiary} />
    </Pressable>
  );
}

/**
 * Shallow-compare memo (R18) — re-renders only when id / title / dateLabel
 * change. `onPress` is expected to be a stable callback (the list screen
 * memoises it).
 */
export const CarnetSessionCard = memo(
  CarnetSessionCardComponent,
  (prev, next) =>
    prev.card.id === next.card.id &&
    prev.card.title === next.card.title &&
    prev.card.dateLabel === next.card.dateLabel &&
    prev.onPress === next.onPress,
);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gap,
    padding: semantic.card.padding,
    borderRadius: semantic.card.radius,
    borderWidth: semantic.input.borderWidth,
    marginBottom: space['2.5'],
  },
  textCol: {
    flex: 1,
    gap: semantic.card.gapTiny,
  },
  title: {
    fontSize: semantic.card.titleSize,
    fontWeight: '600',
  },
  dateLabel: {
    fontSize: semantic.card.captionSize,
  },
});
