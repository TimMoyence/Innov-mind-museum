import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';
import { reportError } from '@/shared/observability/errorReporting';

interface SpeechModule {
  speak: (text: string, options?: { language?: string; onDone?: () => void }) => void;
  stop: () => void;
}

const loadSpeech = (): SpeechModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- mirrors authTokenStore lazy-load pattern from the previous VoiceSessionIntro modal; expo-speech may not be installed in test/web bundles, this graceful fallback preserves Article 50 visual disclosure even when audio fails.
    return require('expo-speech') as SpeechModule;
  } catch {
    return null;
  }
};

interface VoiceSessionIntroSheetContentProps {
  close: () => void;
  locale: string;
  /** Called when the user taps "Start" — typically wired to `useVoiceDisclosure().acknowledge()`. */
  onAcknowledge?: () => void;
}

/**
 * Bottom-sheet content (full-screen, blocking) for the EU AI Act Article 50
 * voice-disclosure gate. Mounted by `<BottomSheetRouter>` for the
 * `voice-intro` route. Plays a TTS greeting on mount and exposes the
 * acknowledge / dismiss controls required for Article 50 visual disclosure.
 *
 * @see docs/legal/AI_DISCLOSURE.md
 */
export const VoiceSessionIntroSheetContent = ({
  close,
  locale,
  onAcknowledge,
}: VoiceSessionIntroSheetContentProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const speechRef = useRef<SpeechModule | null>(null);
  /**
   * `audioStatus` reflects an external resource (the OS TTS engine). The
   * setState calls below project an out-of-React state transition (speak
   * start / speak end / module unavailable) into React state, which is
   * exactly what `useEffect` is for. The `react-hooks/set-state-in-effect`
   * lint rule is a false positive in this shape — we are synchronizing React
   * with an external system, not chaining derived state.
   */
  const [audioStatus, setAudioStatus] = useState<'idle' | 'speaking' | 'unavailable'>('idle');

  useEffect(() => {
    const speech = loadSpeech();
    speechRef.current = speech;
    if (!speech) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- syncing React with external TTS engine; see hook-level comment above. Approved-by: tim@2026-05-14 (C4 migration of legacy VoiceSessionIntro pattern) */
      setAudioStatus('unavailable');
      return;
    }

    const greeting = t('voice.disclosure.audioGreeting');

    setAudioStatus('speaking');
    try {
      speech.speak(greeting, {
        language: locale,
        onDone: () => {
          setAudioStatus('idle');
        },
      });
    } catch (error) {
      reportError(error, { component: 'VoiceSessionIntroSheetContent', action: 'speak' });
      setAudioStatus('unavailable');
    }

    return () => {
      try {
        speech.stop();
      } catch (error) {
        reportError(error, {
          component: 'VoiceSessionIntroSheetContent',
          action: 'stop-on-unmount',
        });
      }
    };
  }, [locale, t]);

  const handleAcknowledge = (): void => {
    onAcknowledge?.();
    close();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.cardBackground }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: theme.primaryTint }]}>
          <Ionicons name="mic" size={36} color={theme.primary} />
        </View>

        <Text
          style={[styles.title, { color: theme.textPrimary }]}
          accessibilityRole="header"
          accessibilityLabel={t('voice.disclosure.title')}
        >
          {t('voice.disclosure.title')}
        </Text>

        <Text
          style={[styles.aiNotice, { color: theme.textPrimary }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel={t('voice.disclosure.aiNotice')}
        >
          {t('voice.disclosure.aiNotice')}
        </Text>

        <View
          style={[
            styles.audioCard,
            { backgroundColor: theme.surface, borderColor: theme.cardBorder },
          ]}
          accessibilityLiveRegion="polite"
        >
          <Ionicons
            name={audioStatus === 'speaking' ? 'volume-high' : 'volume-mute-outline'}
            size={20}
            color={audioStatus === 'speaking' ? theme.primary : theme.textSecondary}
          />
          <Text style={[styles.audioStatus, { color: theme.textSecondary }]}>
            {audioStatus === 'unavailable'
              ? t('voice.disclosure.audioFallback')
              : t('voice.disclosure.audioPreparing')}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.separator }]}>
        <LiquidButton
          label={t('voice.disclosure.startButton')}
          onPress={handleAcknowledge}
          variant="primary"
          size="lg"
          testID="voice-disclosure-start"
          accessibilityLabel={t('voice.disclosure.startButton')}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: semantic.screen.paddingXL,
    paddingTop: semantic.media.safeAreaTop,
    paddingBottom: semantic.screen.paddingLarge,
    gap: semantic.modal.padding,
    alignItems: 'center',
  },
  iconCircle: {
    width: space['18'],
    height: space['18'],
    borderRadius: radius['5xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: semantic.card.gapTiny,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    textAlign: 'center',
  },
  aiNotice: {
    fontSize: fontSize['base-'],
    lineHeight: semantic.chat.iconSize,
    textAlign: 'center',
    fontWeight: '600',
  },
  audioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2.5'],
    width: '100%',
    borderRadius: semantic.button.radius,
    borderWidth: semantic.input.borderWidth,
    padding: semantic.card.padding,
  },
  audioStatus: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  footer: {
    paddingHorizontal: semantic.screen.paddingXL,
    paddingVertical: semantic.modal.padding,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
