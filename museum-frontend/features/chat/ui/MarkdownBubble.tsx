/* eslint-disable react-native/no-unused-styles -- dynamic styles in useMemo, not detectable by lint */
import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Markdown from '@ronradtke/react-native-markdown-display';

import { useTheme } from '@/shared/ui/ThemeContext';

interface MarkdownBubbleProps {
  text: string;
  /**
   * Called when the user taps a markdown link.
   *
   * The underlying `@ronradtke/react-native-markdown-display` library calls
   * `Linking.openURL(url)` when this returns `true`. Return `false` to suppress
   * that and handle the link entirely in your callback (e.g. opening it in
   * an in-app browser).
   */
  onLinkPress?: (url: string) => boolean;
}

/** Renders markdown-formatted text inside a chat bubble using the liquid theme typography. */
export const MarkdownBubble = ({ text, onLinkPress }: MarkdownBubbleProps) => {
  const { theme } = useTheme();

  const markdownStyles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          color: theme.textPrimary,
          fontSize: 14,
          lineHeight: 20,
        },
        strong: {
          fontWeight: '700',
        },
        em: {
          fontStyle: 'italic',
        },
        bullet_list: {
          marginVertical: 4,
        },
        ordered_list: {
          marginVertical: 4,
        },
        list_item: {
          marginVertical: 2,
        },
        paragraph: {
          marginTop: 0,
          marginBottom: 4,
        },
        heading1: {
          fontSize: 18,
          fontWeight: '700',
          color: theme.textPrimary,
          marginBottom: 4,
        },
        heading2: {
          fontSize: 16,
          fontWeight: '700',
          color: theme.textPrimary,
          marginBottom: 4,
        },
        link: {
          color: theme.primary,
        },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: theme.cardBorder,
          paddingLeft: 10,
          marginVertical: 4,
        },
        code_inline: {
          backgroundColor: theme.primaryTint,
          color: theme.primary,
          paddingHorizontal: 4,
          borderRadius: 4,
          fontSize: 13,
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        },
        fence: {
          backgroundColor: theme.inputBackground,
          color: theme.textPrimary,
          borderColor: theme.cardBorder,
          borderWidth: 1,
          borderRadius: 8,
          padding: 10,
          fontSize: 13,
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        },
      }),
    [theme],
  );

  return (
    <Markdown style={markdownStyles} onLinkPress={onLinkPress}>
      {text}
    </Markdown>
  );
};
