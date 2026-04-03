import '../helpers/test-utils';
import { render } from '@testing-library/react-native';

jest.mock('@ronradtke/react-native-markdown-display', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: string }) => (
      <Text testID="markdown-content">{children}</Text>
    ),
  };
});

import { MarkdownBubble } from '@/features/chat/ui/MarkdownBubble';

describe('MarkdownBubble', () => {
  it('renders plain text', () => {
    const { getByTestId } = render(<MarkdownBubble text="Hello world" />);
    expect(getByTestId('markdown-content').props.children).toBe('Hello world');
  });

  it('renders markdown text without crashing', () => {
    const markdownText = '**Bold** and *italic* with [link](https://example.com)';
    const { getByTestId } = render(<MarkdownBubble text={markdownText} />);
    expect(getByTestId('markdown-content').props.children).toBe(markdownText);
  });

  it('renders empty string without crashing', () => {
    const { getByTestId } = render(<MarkdownBubble text="" />);
    expect(getByTestId('markdown-content').props.children).toBe('');
  });
});
