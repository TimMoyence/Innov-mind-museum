import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

export default function WalkComposerScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <LiquidScreen background={pickMuseumBackground(2)} contentStyle={styles.screen}>
      <View style={styles.headerRow}>
        <Pressable
          testID="walk-composer-back"
          onPress={() => {
            router.back();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[
            styles.backButton,
            { backgroundColor: theme.surface, borderColor: theme.cardBorder },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={theme.textPrimary} />
        </Pressable>
      </View>

      <GlassCard style={styles.heroCard} intensity={60}>
        <View style={[styles.iconBadge, { backgroundColor: theme.primaryTint }]}>
          <Ionicons name="walk-outline" size={32} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.textPrimary }]} testID="walk-composer-title">
          {t('walkComposer.title')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t('walkComposer.subtitle')}
        </Text>
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.primaryTint, borderColor: theme.primaryBorderSubtle },
          ]}
        >
          <Text style={[styles.badgeText, { color: theme.primary }]}>
            {t('walkComposer.coming_soon')}
          </Text>
        </View>
      </GlassCard>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: space['4.5'],
    paddingTop: semantic.screen.paddingXL,
    paddingBottom: semantic.form.gapLarge,
    gap: semantic.screen.gap,
  },
  headerRow: {
    flexDirection: 'row',
  },
  backButton: {
    width: space['10'],
    height: space['10'],
    borderRadius: semantic.badge.radiusFull,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    padding: semantic.modal.padding,
    gap: semantic.form.gap,
    alignItems: 'center',
  },
  iconBadge: {
    width: space['14'],
    height: space['14'],
    borderRadius: semantic.badge.radiusFull,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: semantic.section.titleSize,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: semantic.section.subtitleSize,
    lineHeight: space['6'],
    textAlign: 'center',
  },
  badge: {
    paddingVertical: semantic.badge.paddingY,
    paddingHorizontal: semantic.card.paddingCompact,
    borderRadius: semantic.badge.radiusFull,
    borderWidth: semantic.input.borderWidth,
  },
  badgeText: {
    fontSize: semantic.badge.fontSize,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
