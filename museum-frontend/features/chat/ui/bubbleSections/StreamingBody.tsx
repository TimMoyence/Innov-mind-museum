import { memo, useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { MarkdownBubble } from '@/features/chat/ui/MarkdownBubble';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic } from '@/shared/ui/tokens';

interface StreamingBodyProps {
  text: string;
  isStreaming: boolean;
  onLinkPress?: (url: string) => boolean;
}

export const StreamingBody = memo(function StreamingBody({
  text,
  isStreaming,
  onLinkPress,
}: StreamingBodyProps) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [cursorOpacity] = useState(() => new Animated.Value(1));

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
      <View accessibilityLiveRegion="polite">
        <MarkdownBubble text={text} onLinkPress={onLinkPress} />
      </View>
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
