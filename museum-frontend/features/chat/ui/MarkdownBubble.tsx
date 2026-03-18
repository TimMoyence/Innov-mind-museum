import { StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { liquidColors } from '@/shared/ui/liquidTheme';

interface MarkdownBubbleProps {
  text: string;
}

/** Renders markdown-formatted text inside a chat bubble using the liquid theme typography. */
export const MarkdownBubble = ({ text }: MarkdownBubbleProps) => {
  return <Markdown style={markdownStyles}>{text}</Markdown>;
};

const markdownStyles = StyleSheet.create({
  body: {
    color: liquidColors.textPrimary,
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
    color: liquidColors.textPrimary,
    marginBottom: 4,
  },
  heading2: {
    fontSize: 16,
    fontWeight: '700',
    color: liquidColors.textPrimary,
    marginBottom: 4,
  },
  link: {
    color: liquidColors.primary,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(148,163,184,0.4)',
    paddingLeft: 10,
    marginVertical: 4,
  },
});
