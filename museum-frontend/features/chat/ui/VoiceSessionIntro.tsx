import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';
import { reportError } from '@/shared/observability/errorReporting';

/**
 * Lazy-loaded `expo-speech` module. We require it dynamically so that:
 * - the bundle does not hard-fail if the native module is not yet installed
 *   (the dep was added 2026-05-12 alongside this disclosure work — the install
 *   lands in the same PR but graceful degradation protects pre-install builds);
 * - tests can run without mocking `expo-speech` unless they explicitly want
 *   to verify the audio path.
 *
 * If the require fails the disclosure still works visually — only the audio
 * playback is skipped, which is acceptable from a compliance standpoint
 * because Article 50 requires the disclosure to be "clear and distinguishable"
 * but does not mandate audio when the visual modal already blocks the UI.
 * The audio is the belt-and-braces layer for the case where the user is
 * primarily voice-driven and might otherwise mistake the AI voice for a human.
 */
interface SpeechModule {
  speak: (text: string, options?: { language?: string; onDone?: () => void }) => void;
  stop: () => void;
}

const loadSpeech = (): SpeechModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- mirrors authTokenStore lazy-load pattern
    return require('expo-speech') as SpeechModule;
  } catch {
    return null;
  }
};

interface VoiceSessionIntroProps {
  /**
   * Controls modal visibility. Owner of the disclosure gate (typically the
   * chat session screen via `useVoiceDisclosure().shouldShowDisclosure`).
   */
  visible: boolean;
  /**
   * Called when the user taps the "Start" button. Owners should persist the
   * acknowledgement via `useVoiceDisclosure().acknowledge()` and unblock the
   * microphone.
   */
  onAcknowledge: () => void;
  /**
   * Active i18n locale (e.g. `fr`, `en`). Used to forward the BCP-47 language
   * hint to the OS-native TTS so the audio greeting is pronounced correctly.
   */
  locale: string;
}

/**
 * EU AI Act Article 50 voice-disclosure modal — shown before the user can
 * start a voice session with the Musaium assistant.
 *
 * Compliance gate:
 * - Renders a full-screen modal at the very first interaction of every voice
 *   session ("at the latest at the time of the first interaction" — Art. 50).
 * - Plays the disclosure copy over the device's native TTS, mirroring the
 *   text on screen. Per the EC draft guidelines on Art. 50 transparency, a
 *   naturalistic synthesized voice (e.g. `gpt-4o-mini-tts` / `alloy`) must
 *   carry an *audible* disclosure — a visual badge alone is insufficient
 *   when the AI voice could be reasonably mistaken for a human.
 * - The Start button is only enabled once the user has had a chance to read
 *   and (optionally) hear the disclosure. We do not artificially delay the
 *   button — the doctrine is "informed consent", not "forced wait".
 *
 * @see docs/legal/AI_DISCLOSURE.md
 */
export const VoiceSessionIntro = ({ visible, onAcknowledge, locale }: VoiceSessionIntroProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const speechRef = useRef<SpeechModule | null>(null);
  /**
   * `audioStatus` reflects an external resource (the OS TTS engine). The
   * setState calls below are the React-side projection of an out-of-React
   * state transition (speak start / speak end / module unavailable / dismiss),
   * which is exactly what `useEffect` is for. The `react-hooks/set-state-in-effect`
   * lint warning is a false positive in this shape — we are synchronizing
   * React with an external system, not chaining derived state.
   */
  const [audioStatus, setAudioStatus] = useState<'idle' | 'speaking' | 'unavailable'>('idle');

  useEffect(() => {
    if (!visible) {
      // Stop any in-flight playback when the modal is dismissed externally.
      try {
        speechRef.current?.stop();
      } catch (error) {
        reportError(error, { component: 'VoiceSessionIntro', action: 'stop-on-dismiss' });
      }
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- syncing React with external TTS engine; see hook-level comment above */
      setAudioStatus('idle');
      return;
    }

    const speech = loadSpeech();
    speechRef.current = speech;
    if (!speech) {
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
      reportError(error, { component: 'VoiceSessionIntro', action: 'speak' });

      setAudioStatus('unavailable');
    }

    return () => {
      try {
        speech.stop();
      } catch (error) {
        reportError(error, { component: 'VoiceSessionIntro', action: 'stop-on-unmount' });
      }
    };
  }, [visible, locale, t]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
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
            onPress={onAcknowledge}
            variant="primary"
            size="lg"
            testID="voice-disclosure-start"
            accessibilityLabel={t('voice.disclosure.startButton')}
          />
        </View>
      </View>
    </Modal>
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
