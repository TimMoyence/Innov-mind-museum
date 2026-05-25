import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

/**
 * I-CMP3(4) / R7 — the streamed assistant response body must be exposed as an
 * accessibility live region so screen-reader users hear the response as it
 * arrives. Pre-fix `StreamingBody` returns a bare fragment
 * (<MarkdownBubble/> + blinking cursor) with NO live region on the body, so
 * VoiceOver/TalkBack never announces the incremental content.
 *
 * Precedent: StatusIndicator.tsx:46 uses accessibilityLiveRegion="polite"
 * (PATTERNS.md react-native §7 — dynamic announcements). The cursor "▍"
 * (Animated.Text) MUST stay OUTSIDE the live region to avoid announcing the
 * blink (design §R7 note); this spec asserts the body wrapper carries the
 * prop, not the cursor.
 */

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

    // Body is rendered.
    const body = screen.getByTestId('markdown-bubble');
    expect(body).toBeTruthy();

    // A host node MUST carry accessibilityLiveRegion="polite". Pre-fix none does.
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
