import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

export default function GuidedMuseumModeScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [museumMode, setMuseumMode] = useState(true);
  const [guideLevel, setGuideLevel] = useState<'beginner' | 'intermediate' | 'expert'>('beginner');

  useEffect(() => {
    loadRuntimeSettings()
      .then((settings) => {
        setMuseumMode(settings.defaultMuseumMode);
        setGuideLevel(settings.guideLevel);
      })
      .catch(() => undefined);
  }, []);

  return (
    <LiquidScreen background={pickMuseumBackground(3)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'prefs',
              icon: 'options-outline',
              label: t('guidedMode.menu.preferences'),
              onPress: () => { router.push('/(stack)/preferences'); },
            },
            {
              id: 'discover',
              icon: 'sparkles-outline',
              label: t('guidedMode.menu.discover'),
              onPress: () => { router.push('/(stack)/discover'); },
            },
            {
              id: 'home',
              icon: 'home-outline',
              label: t('guidedMode.menu.home'),
              onPress: () => { router.push('/(tabs)/home'); },
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
            {t('guidedMode.status_line', { status: museumMode ? t('common.enabled') : t('common.disabled'), level: guideLevel })}
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={54}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('guidedMode.card1_title')}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('guidedMode.card1_text')}
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('guidedMode.card2_title')}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('guidedMode.card2_text')}
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('guidedMode.card3_title')}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('guidedMode.card3_text')}
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('guidedMode.card4_title')}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('guidedMode.card4_text')}
          </Text>
        </GlassCard>

        <Pressable style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={() => { router.push('/(stack)/preferences'); }} accessibilityRole="button" accessibilityLabel={museumMode ? t('a11y.guidedMode.toggle_off') : t('a11y.guidedMode.toggle_on')}>
          <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
            {museumMode ? t('guidedMode.turn_off') : t('guidedMode.turn_on')}
          </Text>
        </Pressable>

        <Pressable style={[styles.secondaryButton, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground }]} onPress={() => { router.push('/(stack)/discover'); }} accessibilityRole="button" accessibilityLabel={t('a11y.guidedMode.start_exploring')}>
          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('guidedMode.start_exploring')}</Text>
        </Pressable>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 14,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 20,
  },
  heroCard: {
    padding: 18,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    lineHeight: 20,
    fontSize: 14,
  },
  stateLine: {
    fontWeight: '700',
    fontSize: 12,
  },
  card: {
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 15,
  },
  cardText: {
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 13,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
