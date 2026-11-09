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

function CarnetSessionCardComponent({ card, onPress }: CarnetSessionCardProps): React.ReactElement {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const displayTitle =
    card.title === 'carnet.untitledSession' ? t('carnet.untitledSession') : card.title;
  const displayMuseum =
    card.museumLabel === 'carnet.unknownMuseum' ? t('carnet.unknownMuseum') : card.museumLabel;

  const handlePress = useCallback(() => {
    onPress(card.id);
  }, [card.id, onPress]);

  const a11yLabel = card.dateLabel
    ? t('a11y.carnet.session_card', {
        title: displayTitle,
        museum: displayMuseum,
        date: card.dateLabel,
      })
    : t('a11y.carnet.session_card_no_date', { title: displayTitle, museum: displayMuseum });

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
        {card.dateLabel ? (
          <Text style={[styles.dateLabel, { color: theme.textSecondary }]} numberOfLines={1}>
            {card.dateLabel}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={semantic.chat.iconSize} color={theme.textTertiary} />
    </Pressable>
  );
}

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
