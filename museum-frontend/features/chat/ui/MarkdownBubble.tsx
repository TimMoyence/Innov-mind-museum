/* eslint-disable react-native/no-unused-styles -- dynamic styles in useMemo, not detectable by lint */
import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Markdown, { type RenderRules } from '@ronradtke/react-native-markdown-display';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

// TD-MD-03 + TD-MD-04 — assistant markdown is LLM-authored + prompt-injectable.
// Suppress the `image` render rule entirely so an injected
// `![](https://evil/x.png)` produces NO <Image> element and therefore NO
// network fetch (a markdown image is otherwise an automatic GET to an
// attacker-chosen URL = tracking-pixel / SSRF-from-client vector). Enriched
// artwork images render through the dedicated carousel, never via markdown
// `![]()`, so nothing legitimate is lost. Rendering `null` is equivalent in
// outcome to the parser-level `allowedImageHandlers` allowlist but stays
// fully typed (no untyped `markdown-it` instance). `link` stays enabled —
// taps route through the confirm dialog + scheme allowlist in
// `useChatSessionActions` (TD-MD-01 / TD-MD-02).
const markdownRules: RenderRules = {
  image: () => null,
};

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
          borderStartWidth: 3,
          borderStartColor: theme.cardBorder,
          paddingStart: space['2.5'],
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
    <Markdown style={markdownStyles} rules={markdownRules} onLinkPress={onLinkPress}>
      {text}
    </Markdown>
  );
};
