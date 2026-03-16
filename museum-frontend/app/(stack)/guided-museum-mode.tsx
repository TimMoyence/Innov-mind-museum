import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

export default function GuidedMuseumModeScreen() {
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
              label: 'Preferences',
              onPress: () => router.push('/(stack)/preferences'),
            },
            {
              id: 'discover',
              icon: 'sparkles-outline',
              label: 'Discover',
              onPress: () => router.push('/(stack)/discover'),
            },
            {
              id: 'home',
              icon: 'home-outline',
              label: 'Home',
              onPress: () => router.push('/(tabs)/home'),
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={styles.title}>Guided Museum Mode</Text>
          <Text style={styles.subtitle}>
            Guided mode turns Musaium into a museum companion: it explains the artwork and suggests a
            relevant next step for your visit.
          </Text>
          <Text style={styles.stateLine}>
            Current status: {museumMode ? 'Enabled' : 'Disabled'} • Guide level: {guideLevel}
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={54}>
          <Text style={styles.cardTitle}>What changes in guided mode</Text>
          <Text style={styles.cardText}>
            Musaium adds practical museum-oriented guidance such as the next stop, transitions between
            rooms, and observation prompts tied to nearby works or monuments.
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={styles.cardTitle}>Guided vs standard</Text>
          <Text style={styles.cardText}>
            Standard mode stays concise and descriptive. Guided mode remains art-focused but actively
            supports your path through an exhibition or cultural site.
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={styles.cardTitle}>Guide levels</Text>
          <Text style={styles.cardText}>
            Beginner uses simple educational language. Intermediate introduces short technical terms.
            Expert adds deeper art-history vocabulary and context.
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={styles.cardTitle}>Examples</Text>
          <Text style={styles.cardText}>
            Example guided behavior: explain brushwork, connect the piece to its historical movement,
            then suggest a nearby work to compare composition or symbolism.
          </Text>
        </GlassCard>

        <Pressable style={styles.primaryButton} onPress={() => router.push('/(stack)/preferences')}>
          <Text style={styles.primaryButtonText}>
            {museumMode ? 'Go to Preferences to Turn Off Guided Mode' : 'Go to Preferences to Turn On Guided Mode'}
          </Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/discover')}>
          <Text style={styles.secondaryButtonText}>Start Exploring in Discover</Text>
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
    color: liquidColors.textPrimary,
  },
  subtitle: {
    color: liquidColors.textSecondary,
    lineHeight: 20,
    fontSize: 14,
  },
  stateLine: {
    color: '#1E3A8A',
    fontWeight: '700',
    fontSize: 12,
  },
  card: {
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  cardText: {
    color: liquidColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: liquidColors.primary,
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.48)',
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
});
