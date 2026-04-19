/* eslint-disable react-hooks/refs -- Animated.Value ref is a stable object read once at creation; safe RN pattern */
import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { MarkdownBubble } from '@/features/chat/ui/MarkdownBubble';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic } from '@/shared/ui/tokens';

interface StreamingBodyProps {
  text: string;
  isStreaming: boolean;
  onLinkPress?: (url: string) => boolean;
}

/** Assistant markdown body with a blinking streaming cursor. Respects reduce-motion (WCAG 2.3.3). */
export const StreamingBody = memo(function StreamingBody({
  text,
  isStreaming,
  onLinkPress,
}: StreamingBodyProps) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isStreaming) return;
    if (reduceMotion) {
      cursorOpacity.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [isStreaming, cursorOpacity, reduceMotion]);

  return (
    <>
      <MarkdownBubble text={text} onLinkPress={onLinkPress} />
      {isStreaming ? (
        <Animated.Text style={[styles.cursor, { color: theme.primary, opacity: cursorOpacity }]}>
          {'▍'}
        </Animated.Text>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  cursor: {
    fontSize: fontSize.lg,
    lineHeight: semantic.chat.iconSize,
  },
});
