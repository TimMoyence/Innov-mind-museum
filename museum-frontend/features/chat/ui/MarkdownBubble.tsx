/* eslint-disable react-native/no-unused-styles -- dynamic styles in useMemo, not detectable by lint */
import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Markdown from '@ronradtke/react-native-markdown-display';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

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
          fontSize: semantic.chat.fontSizeSmall,
          lineHeight: semantic.modal.padding,
        },
        strong: {
          fontWeight: '700',
        },
        em: {
          fontStyle: 'italic',
        },
        bullet_list: {
          marginVertical: semantic.card.gapTiny,
        },
        ordered_list: {
          marginVertical: semantic.card.gapTiny,
        },
        list_item: {
          marginVertical: space['0.5'],
        },
        paragraph: {
          marginTop: 0,
          marginBottom: semantic.card.gapTiny,
        },
        heading1: {
          fontSize: fontSize.lg,
          fontWeight: '700',
          color: theme.textPrimary,
          marginBottom: semantic.card.gapTiny,
        },
        heading2: {
          fontSize: fontSize.base,
          fontWeight: '700',
          color: theme.textPrimary,
          marginBottom: semantic.card.gapTiny,
        },
        link: {
          color: theme.primary,
        },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: theme.cardBorder,
          paddingLeft: space['2.5'],
          marginVertical: semantic.card.gapTiny,
        },
        code_inline: {
          backgroundColor: theme.primaryTint,
          color: theme.primary,
          paddingHorizontal: space['1'],
          borderRadius: radius.xs,
          fontSize: semantic.form.labelSize,
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        },
        fence: {
          backgroundColor: theme.inputBackground,
          color: theme.textPrimary,
          borderColor: theme.cardBorder,
          borderWidth: semantic.input.borderWidth,
          borderRadius: radius.md,
          padding: space['2.5'],
          fontSize: semantic.form.labelSize,
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
