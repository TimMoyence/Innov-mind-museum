import { useCallback, useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { TypingIndicator } from '@/features/chat/ui/TypingIndicator';
import { useTypewriter } from '@/features/onboarding/application/useTypewriter';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic, space } from '@/shared/ui/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TYPING_DURATION_MS = 1200;
const CHAR_DELAY_MS = 28;
const LOOP_REST_MS = 3000;

type Phase = 'user' | 'typing' | 'assistant' | 'rest';

const DemoUserBubble = ({ text }: { text: string }) => {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.bubble,
        styles.userBubble,
        { backgroundColor: theme.userBubble, borderColor: theme.userBubbleBorder },
      ]}
    >
      <Text style={[styles.bubbleText, { color: theme.textPrimary }]}>{text}</Text>
    </View>
  );
};

const DemoAssistantBubble = ({ text }: { text: string }) => {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.bubble,
        styles.assistantBubble,
        { backgroundColor: theme.assistantBubble, borderColor: theme.assistantBubbleBorder },
      ]}
    >
      <Text style={[styles.bubbleText, { color: theme.textPrimary }]}>
        {text}
        <Text style={[styles.caret, { color: theme.textSecondary }]}> |</Text>
      </Text>
    </View>
  );
};

/** Slide 1 of onboarding v2: animated chat demo that plays a scripted user→assistant exchange. */
export const ChatDemoSlide = () => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  const demoUser = t('onboarding.v2.slide1.demo_user');
  const demoAssistant = t('onboarding.v2.slide1.demo_assistant');

  const [phase, setPhase] = useState<Phase>(reduceMotion ? 'assistant' : 'user');

  const handleAssistantDone = useCallback(() => {
    setPhase('rest');
  }, []);

  const { visible: assistantVisible, reset: resetTypewriter } = useTypewriter({
    text: demoAssistant,
    enabled: !reduceMotion && phase === 'assistant',
    charDelayMs: CHAR_DELAY_MS,
    onDone: handleAssistantDone,
  });

  useEffect(() => {
    if (reduceMotion) return;

    if (phase === 'user') {
      const timer = setTimeout(() => {
        setPhase('typing');
      }, 900);
      return () => {
        clearTimeout(timer);
      };
    }

    if (phase === 'typing') {
      const timer = setTimeout(() => {
        setPhase('assistant');
      }, TYPING_DURATION_MS);
      return () => {
        clearTimeout(timer);
      };
    }

    if (phase === 'rest') {
      const timer = setTimeout(() => {
        setPhase('user');
        resetTypewriter();
      }, LOOP_REST_MS);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [phase, reduceMotion, resetTypewriter]);

  const containerOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const containerTranslate = useSharedValue(reduceMotion ? 0 : 20);

  useEffect(() => {
    if (reduceMotion) {
      containerOpacity.value = 1;
      containerTranslate.value = 0;
      return;
    }
    containerOpacity.value = withDelay(100, withTiming(1, { duration: 400 }));
    containerTranslate.value = withDelay(100, withTiming(0, { duration: 400 }));
  }, [containerOpacity, containerTranslate, reduceMotion]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ translateY: containerTranslate.value }],
  }));

  const assistantText = reduceMotion ? demoAssistant : assistantVisible;

  return (
    <View
      style={[styles.slide, { width: SCREEN_WIDTH - 36 }]}
      accessible
      accessibilityLabel={`${t('onboarding.v2.slide1.title')}. ${demoUser}. ${demoAssistant}`}
    >
      <Animated.View style={containerStyle}>
        <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
          {t('onboarding.v2.slide1.title')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t('onboarding.v2.slide1.subtitle')}
        </Text>

        <View style={styles.conversation}>
          <DemoUserBubble text={demoUser} />

          {phase === 'typing' ? (
            <View style={styles.typingRow}>
              <TypingIndicator />
            </View>
          ) : null}

          {phase === 'assistant' || phase === 'rest' || reduceMotion ? (
            <DemoAssistantBubble text={assistantText} />
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  slide: {
    paddingHorizontal: semantic.card.paddingLarge,
    justifyContent: 'center',
  },
  title: {
    fontSize: semantic.section.titleSizeLarge,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: space['2'],
  },
  subtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: space['5'],
    marginBottom: space['6'],
  },
  conversation: {
    gap: semantic.chat.gap,
  },
  bubble: {
    borderRadius: semantic.chat.bubbleRadius,
    paddingHorizontal: semantic.chat.bubblePaddingX,
    paddingVertical: semantic.chat.bubblePadding,
    borderWidth: semantic.input.borderWidth,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
  },
  bubbleText: {
    fontSize: semantic.chat.fontSize,
    lineHeight: semantic.chat.fontSize + 6,
  },
  caret: {
    fontWeight: '400',
  },
  typingRow: {
    alignSelf: 'flex-start',
  },
});
