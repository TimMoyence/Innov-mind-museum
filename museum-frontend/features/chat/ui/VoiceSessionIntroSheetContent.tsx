import { defer } from '@/shared/lib/defer';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useTranslation } from 'react-i18next';

import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';
import { reportError } from '@/shared/observability/errorReporting';

interface VoiceSessionIntroSheetContentProps {
  close: () => void;
  locale: string;
  onAcknowledge?: () => void;
}

export const VoiceSessionIntroSheetContent = ({
  close,
  locale,
  onAcknowledge,
}: VoiceSessionIntroSheetContentProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [audioStatus, setAudioStatus] = useState<'idle' | 'speaking' | 'unavailable'>('speaking');

  useEffect(() => {
    try {
      Speech.speak(t('voice.disclosure.audioGreeting'), {
        language: locale,
        onDone: () => {
          setAudioStatus('idle');
        },
        onError: (error) => {
          reportError(error, { component: 'VoiceSessionIntroSheetContent', action: 'speak' });
          setAudioStatus('unavailable');
        },
      });
    } catch (error) {
      reportError(error, { component: 'VoiceSessionIntroSheetContent', action: 'speak' });
      defer(() => {
        setAudioStatus('unavailable');
      });
    }

    return () => {
      void Speech.stop().catch((error: unknown) => {
        reportError(error, {
          component: 'VoiceSessionIntroSheetContent',
          action: 'stop-on-unmount',
        });
      });
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
