import { useMemo } from 'react';
import { Platform, type TextStyle } from 'react-native';
import Markdown, { type RenderRules } from '@ronradtke/react-native-markdown-display';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

const markdownRules: RenderRules = {
  image: () => null,
};

interface MarkdownBubbleProps {
  text: string;
  onLinkPress?: (url: string) => boolean;
}

export const MarkdownBubble = ({ text, onLinkPress }: MarkdownBubbleProps) => {
  const { theme } = useTheme();

  const markdownStyles = useMemo(
    (): Record<string, TextStyle> => ({
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
