import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { TERMS_OF_SERVICE_CONTENT } from '@/features/legal/termsOfServiceContent';
import { LegalSections } from '@/features/legal/ui/LegalSections';
import { legalScreenStyles } from '@/features/legal/ui/legal.styles';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { semantic, space } from '@/shared/ui/tokens';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

export default function TermsScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <LiquidScreen
      background={pickMuseumBackground(4)}
      contentStyle={[styles.screen, { paddingTop: insets.top + semantic.screen.gapSmall }]}
    >
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'privacy',
              icon: 'shield-checkmark-outline',
              label: t('terms.menu.privacy'),
              onPress: () => {
                router.push('/(stack)/privacy');
              },
            },
            {
              id: 'settings',
              icon: 'settings-outline',
              label: t('terms.menu.settings'),
              onPress: () => {
                router.push('/(stack)/settings');
              },
            },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + semantic.screen.padding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {TERMS_OF_SERVICE_CONTENT.title}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('terms.version_note', {
              version: TERMS_OF_SERVICE_CONTENT.version,
              lastUpdated: TERMS_OF_SERVICE_CONTENT.lastUpdated,
            })}
          </Text>
        </GlassCard>

        <LegalSections sections={TERMS_OF_SERVICE_CONTENT.sections} />

        <GlassCard style={styles.ctaCard} intensity={54}>
          <View style={styles.ctaRow}>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                router.push('/(stack)/privacy');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.terms.privacy_policy')}
            >
              <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
                {t('terms.privacy_policy')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.secondaryButton,
                { borderColor: theme.inputBorder, backgroundColor: theme.overlay },
              ]}
              onPress={() => {
                router.push('/(stack)/settings');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.terms.back_settings')}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
                {t('terms.back_settings')}
              </Text>
            </Pressable>
          </View>
        </GlassCard>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  ...legalScreenStyles,
  heroCard: {
    padding: semantic.card.paddingLarge,
    gap: semantic.card.gapSmall,
  },
  ctaRow: {
    gap: space['2.5'],
  },
});
