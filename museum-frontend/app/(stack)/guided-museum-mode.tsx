import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, fontSize, lineHeightPx } from '@/shared/ui/tokens.generated';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

export default function GuidedMuseumModeScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const museumMode = useRuntimeSettingsStore((s) => s.defaultMuseumMode);
  const guideLevel = useRuntimeSettingsStore((s) => s.guideLevel);

  return (
    <LiquidScreen background={pickMuseumBackground(3)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'prefs',
              icon: 'options-outline',
              label: t('guidedMode.menu.preferences'),
              onPress: () => {
                router.push('/(stack)/preferences');
              },
            },
            {
              id: 'discover',
              icon: 'sparkles-outline',
              label: t('guidedMode.menu.discover'),
              onPress: () => {
                router.push('/(stack)/discover');
              },
            },
            {
              id: 'home',
              icon: 'home-outline',
              label: t('guidedMode.menu.home'),
              onPress: () => {
                router.push('/(tabs)/home');
              },
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('guidedMode.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('guidedMode.subtitle')}
          </Text>
          <Text style={[styles.stateLine, { color: theme.primary }]}>
            {t('guidedMode.status_line', {
              status: museumMode ? t('common.enabled') : t('common.disabled'),
              level: guideLevel,
            })}
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={54}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('guidedMode.card1_title')}
          </Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('guidedMode.card1_text')}
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('guidedMode.card2_title')}
          </Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('guidedMode.card2_text')}
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('guidedMode.card3_title')}
          </Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('guidedMode.card3_text')}
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('guidedMode.card4_title')}
          </Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('guidedMode.card4_text')}
          </Text>
        </GlassCard>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={() => {
            router.push('/(stack)/preferences');
          }}
          accessibilityRole="button"
          accessibilityLabel={
            museumMode ? t('a11y.guidedMode.toggle_off') : t('a11y.guidedMode.toggle_on')
          }
        >
          <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
            {museumMode ? t('guidedMode.turn_off') : t('guidedMode.turn_on')}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.secondaryButton,
            { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground },
          ]}
          onPress={() => {
            router.push('/(stack)/discover');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.guidedMode.start_exploring')}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
            {t('guidedMode.start_exploring')}
          </Text>
        </Pressable>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: space['4.5'],
    paddingTop: semantic.screen.paddingXL,
    paddingBottom: semantic.form.gapLarge,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: space['2.5'],
  },
  scrollContent: {
    gap: semantic.screen.gapSmall,
    paddingBottom: space['5'],
  },
  heroCard: {
    padding: semantic.card.paddingLarge,
    gap: semantic.card.gapSmall,
  },
  title: {
    fontSize: semantic.section.titleSizeHero,
    fontWeight: '700',
  },
  subtitle: {
    lineHeight: space['5'],
    fontSize: fontSize.sm,
  },
  stateLine: {
    fontWeight: '700',
    fontSize: semantic.card.captionSize,
  },
  card: {
    padding: semantic.card.padding,
    gap: semantic.section.gapTight,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
  cardText: {
    fontSize: semantic.form.labelSize,
    lineHeight: lineHeightPx['19'],
  },
  primaryButton: {
    borderRadius: semantic.button.radius,
    alignItems: 'center',
    paddingVertical: space['3'],
    paddingHorizontal: space['3.5'],
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
    textAlign: 'center',
  },
  secondaryButton: {
    borderRadius: semantic.button.radius,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    paddingVertical: space['3'],
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
});
