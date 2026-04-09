import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TERMS_OF_SERVICE_CONTENT } from '@/features/legal/termsOfServiceContent';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space } from '@/shared/ui/tokens.generated';
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

        {TERMS_OF_SERVICE_CONTENT.sections.map((section) => (
          <GlassCard key={section.id} style={styles.sectionCard} intensity={52}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{section.title}</Text>
            <View style={styles.paragraphGroup}>
              {section.paragraphs.map((paragraph, index) => (
                <Text
                  key={`${section.id}-${String(index)}`}
                  style={[styles.paragraph, { color: theme.textSecondary }]}
                >
                  {paragraph}
                </Text>
              ))}
            </View>
          </GlassCard>
        ))}

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
  screen: {
    paddingTop: semantic.screen.paddingXL,
    paddingHorizontal: semantic.card.paddingLarge,
    paddingBottom: space['3.5'],
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: space['2.5'],
  },
  scrollContent: {
    gap: semantic.screen.gapSmall,
    paddingBottom: space['5.5'],
  },
  heroCard: {
    padding: semantic.card.paddingLarge,
    gap: semantic.card.gapSmall,
  },
  title: {
    fontSize: semantic.section.titleSizeLarge,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: semantic.form.labelSize,
    lineHeight: 19,
  },
  sectionCard: {
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15,
  },
  paragraphGroup: {
    gap: semantic.card.gapSmall,
  },
  paragraph: {
    fontSize: semantic.form.labelSize,
    lineHeight: space['5'],
  },
  ctaCard: {
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  ctaRow: {
    gap: space['2.5'],
  },
  primaryButton: {
    borderRadius: semantic.button.radiusSmall,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
  secondaryButton: {
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
});
