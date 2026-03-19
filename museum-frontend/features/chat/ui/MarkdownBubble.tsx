import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Markdown from '@ronradtke/react-native-markdown-display';

import { useTheme } from '@/shared/ui/ThemeContext';

interface MarkdownBubbleProps {
  text: string;
}

/** Renders markdown-formatted text inside a chat bubble using the liquid theme typography. */
export const MarkdownBubble = ({ text }: MarkdownBubbleProps) => {
  const { theme } = useTheme();

  const markdownStyles = useMemo(() => StyleSheet.create({
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
      borderLeftColor: 'rgba(148,163,184,0.4)',
      paddingLeft: 10,
      marginVertical: 4,
    },
  }), [theme]);

  return <Markdown style={markdownStyles}>{text}</Markdown>;
};
