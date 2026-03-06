import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

type OnboardingSectionKey = 'flow' | 'tips' | 'help';

interface OnboardingSectionContent {
  title: string;
  subtitle: string;
  bullets: string[];
  primaryLabel: string;
  onPrimaryPress: () => void;
  secondaryLabel: string;
  onSecondaryPress: () => void;
}

export default function OnboardingScreen() {
  const [activeSection, setActiveSection] = useState<OnboardingSectionKey>('flow');

  const sections = useMemo<Record<OnboardingSectionKey, OnboardingSectionContent>>(
    () => ({
      flow: {
        title: 'Onboarding Flow',
        subtitle: 'Understand the real usage flow from home screen to art analysis.',
        bullets: [
          'Open Home and choose Discover, Lens, Audio, or Start Conversation.',
          'Lens creates a chat and opens the camera to capture an artwork or monument.',
          'Audio creates a chat and starts voice recording for spoken questions.',
          'Continue in Dashboard to revisit saved or recent conversations.',
        ],
        primaryLabel: 'Open Discover',
        onPrimaryPress: () => router.push('/(stack)/discover'),
        secondaryLabel: 'Open Dashboard',
        onSecondaryPress: () => router.push('/(tabs)/conversations'),
      },
      tips: {
        title: 'Practical Tips',
        subtitle: 'Get better museum answers with focused image and audio inputs.',
        bullets: [
          'Frame one artwork or monument detail at a time for cleaner visual analysis.',
          'Ask art-focused questions only (artist, style, period, symbolism, monument context).',
          'Use Guided Museum Mode in Preferences for next-stop suggestions during visits.',
          'Choose Beginner or Expert guide level depending on your desired vocabulary depth.',
        ],
        primaryLabel: 'Open Preferences',
        onPrimaryPress: () => router.push('/(stack)/preferences'),
        secondaryLabel: 'Guided Mode Info',
        onSecondaryPress: () => router.push('/(stack)/guided-museum-mode'),
      },
      help: {
        title: 'Help & Compliance',
        subtitle: 'Find support channels and privacy information quickly.',
        bullets: [
          'Use Support for account issues, bugs, and feedback (Instagram / Telegram).',
          'Use Privacy (RGPD) for data processing information and rights.',
          'Settings is now a hub for navigation and account actions.',
          'Backend environment follows the build configuration (local/preview/prod), not an in-app switch.',
        ],
        primaryLabel: 'Open Support',
        onPrimaryPress: () => router.push('/(stack)/support'),
        secondaryLabel: 'Open Privacy',
        onSecondaryPress: () => router.push('/(stack)/privacy'),
      },
    }),
    [],
  );

  const current = sections[activeSection];

  return (
    <LiquidScreen background={pickMuseumBackground(3)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'flow',
              icon: 'trail-sign-outline',
              label: 'Flow',
              onPress: () => setActiveSection('flow'),
            },
            {
              id: 'tips',
              icon: 'bulb-outline',
              label: 'Tips',
              onPress: () => setActiveSection('tips'),
            },
            {
              id: 'help',
              icon: 'help-circle-outline',
              label: 'Help',
              onPress: () => setActiveSection('help'),
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={styles.kicker}>Active section: {activeSection.toUpperCase()}</Text>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.subtitle}>{current.subtitle}</Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={56}>
          <Text style={styles.cardTitle}>What to do</Text>
          <View style={styles.bulletList}>
            {current.bullets.map((bullet, index) => (
              <Text key={`${activeSection}-${index}`} style={styles.bullet}>
                {index + 1}. {bullet}
              </Text>
            ))}
          </View>
        </GlassCard>

        <View style={styles.ctaRow}>
          <Pressable style={styles.primaryButton} onPress={current.onPrimaryPress}>
            <Text style={styles.primaryButtonText}>{current.primaryLabel}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={current.onSecondaryPress}>
            <Text style={styles.secondaryButtonText}>{current.secondaryLabel}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.secondaryButton} onPress={() => router.replace('/(tabs)/home')}>
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </Pressable>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 16,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 18,
  },
  heroCard: {
    padding: 18,
    gap: 8,
  },
  kicker: {
    color: '#1E3A8A',
    fontWeight: '700',
    fontSize: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: liquidColors.textPrimary,
  },
  subtitle: {
    color: liquidColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  bulletList: {
    gap: 8,
  },
  bullet: {
    color: liquidColors.textSecondary,
    lineHeight: 20,
    fontSize: 13,
  },
  ctaRow: {
    gap: 10,
  },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: liquidColors.primary,
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
});
