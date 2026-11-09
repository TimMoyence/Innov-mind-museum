import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

jest.mock('@/features/chat/ui/MarkdownBubble', () => {
  const { Text } = require('react-native');
  return {
    MarkdownBubble: ({ text }: { text: string }) => <Text testID="markdown-bubble">{text}</Text>,
  };
});

import { StreamingBody } from '@/features/chat/ui/bubbleSections/StreamingBody';

describe('StreamingBody live region (I-CMP3(4) / R7)', () => {
  it('renders the markdown body inside a polite accessibility live region', () => {
    render(<StreamingBody text="The Mona Lisa was painted by Leonardo." isStreaming />);

    const body = screen.getByTestId('markdown-bubble');
    expect(body).toBeTruthy();

    const liveRegions = screen.UNSAFE_queryAllByProps({
      accessibilityLiveRegion: 'polite',
    });
    expect(liveRegions.length).toBeGreaterThan(0);
  });

  it('keeps a polite live region even when not streaming (announce final text)', () => {
    render(<StreamingBody text="Final answer." isStreaming={false} />);

    expect(screen.getByTestId('markdown-bubble')).toBeTruthy();
    const liveRegions = screen.UNSAFE_queryAllByProps({
      accessibilityLiveRegion: 'polite',
    });
    expect(liveRegions.length).toBeGreaterThan(0);
  });
});
