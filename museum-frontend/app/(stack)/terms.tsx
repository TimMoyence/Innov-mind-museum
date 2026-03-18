import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';

import { TERMS_OF_SERVICE_CONTENT } from '@/features/legal/termsOfServiceContent';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

/** Renders the Terms of Service screen with versioned legal sections and navigation to Privacy Policy. */
export default function TermsScreen() {
  return (
    <LiquidScreen background={pickMuseumBackground(4)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'privacy',
              icon: 'shield-checkmark-outline',
              label: 'Privacy',
              onPress: () => router.push('/(stack)/privacy'),
            },
            {
              id: 'settings',
              icon: 'settings-outline',
              label: 'Settings',
              onPress: () => router.push('/(stack)/settings'),
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={styles.title}>{TERMS_OF_SERVICE_CONTENT.title}</Text>
          <Text style={styles.subtitle}>
            Version {TERMS_OF_SERVICE_CONTENT.version} — Last updated{' '}
            {TERMS_OF_SERVICE_CONTENT.lastUpdated}
          </Text>
        </GlassCard>

        {TERMS_OF_SERVICE_CONTENT.sections.map((section) => (
          <GlassCard key={section.id} style={styles.sectionCard} intensity={52}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.paragraphGroup}>
              {section.paragraphs.map((paragraph, index) => (
                <Text key={`${section.id}-${index}`} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          </GlassCard>
        ))}

        <GlassCard style={styles.ctaCard} intensity={54}>
          <View style={styles.ctaRow}>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/(stack)/privacy')}>
              <Text style={styles.primaryButtonText}>Privacy Policy</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/settings')}>
              <Text style={styles.secondaryButtonText}>Back to Settings</Text>
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
    color: liquidColors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: liquidColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionCard: {
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  paragraphGroup: {
    gap: 8,
  },
  paragraph: {
    color: liquidColors.textSecondary,
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
    backgroundColor: liquidColors.primary,
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
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
});
