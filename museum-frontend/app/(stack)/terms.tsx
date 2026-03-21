import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TERMS_OF_SERVICE_CONTENT } from '@/features/legal/termsOfServiceContent';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/** Renders the Terms of Service screen with versioned legal sections and navigation to Privacy Policy. */
export default function TermsScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <LiquidScreen background={pickMuseumBackground(4)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'privacy',
              icon: 'shield-checkmark-outline',
              label: t('terms.menu.privacy'),
              onPress: () => router.push('/(stack)/privacy'),
            },
            {
              id: 'settings',
              icon: 'settings-outline',
              label: t('terms.menu.settings'),
              onPress: () => router.push('/(stack)/settings'),
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{TERMS_OF_SERVICE_CONTENT.title}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('terms.version_note', { version: TERMS_OF_SERVICE_CONTENT.version, lastUpdated: TERMS_OF_SERVICE_CONTENT.lastUpdated })}
          </Text>
        </GlassCard>

        {TERMS_OF_SERVICE_CONTENT.sections.map((section) => (
          <GlassCard key={section.id} style={styles.sectionCard} intensity={52}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{section.title}</Text>
            <View style={styles.paragraphGroup}>
              {section.paragraphs.map((paragraph, index) => (
                <Text key={`${section.id}-${index}`} style={[styles.paragraph, { color: theme.textSecondary }]}>
                  {paragraph}
                </Text>
              ))}
            </View>
          </GlassCard>
        ))}

        <GlassCard style={styles.ctaCard} intensity={54}>
          <View style={styles.ctaRow}>
            <Pressable style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={() => router.push('/(stack)/privacy')} accessibilityRole="button" accessibilityLabel={t('a11y.terms.privacy_policy')}>
              <Text style={styles.primaryButtonText}>{t('terms.privacy_policy')}</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/settings')} accessibilityRole="button" accessibilityLabel={t('a11y.terms.back_settings')}>
              <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('terms.back_settings')}</Text>
            </Pressable>
          </View>
        </GlassCard>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 22,
  },
  heroCard: {
    padding: 18,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  sectionCard: {
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15,
  },
  paragraphGroup: {
    gap: 8,
  },
  paragraph: {
    fontSize: 13,
    lineHeight: 20,
  },
  ctaCard: {
    padding: 16,
    gap: 8,
  },
  ctaRow: {
    gap: 10,
  },
  primaryButton: {
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(255,255,255,0.70)',
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
