/**
 * Red tests for A4 — `<CollapsibleTopBar>` + `<ChatHeader collapsed>`.
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/A4.md` :
 *
 *   §1.2 (R8-R15) — wrapper Animated.View + forwarded props.
 *   §1.3 (R16-R21) — <ChatHeader> accepts new `collapsed` prop.
 *   §4 (AC8-AC15) — render expectations for collapsed/expanded.
 *
 * Key invariants :
 *   - Root element has testID="collapsible-top-bar".
 *   - <ChatHeader> receives the forwarded `collapsed` prop.
 *   - EU AI Act Art.50 — AI disclosure badge visible in BOTH states (R10, R19, AC10).
 *   - <ExpertiseBadge> hidden when collapsed (R18, AC12).
 *   - Title fontSize differs between collapsed / expanded (R17, AC14).
 *   - Action buttons remain visible+tappable in both states (R20, AC13).
 *   - <ChatHeader> backward-compat without the prop (AC15).
 *
 * At baseline (A4 not yet implemented) :
 *   - `@/features/chat/ui/CollapsibleTopBar` does not exist.
 *     → Jest fails with "Cannot find module" at module load time.
 */

import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

// Mock ExpertiseBadge to a predictable testID node so we can assert visibility.
jest.mock('@/features/chat/ui/ExpertiseBadge', () => {
  const { Text } = require('react-native');
  return {
    ExpertiseBadge: ({ level }: { level: string }) => <Text testID="expertise-badge">{level}</Text>,
  };
});

// RED ASSERTION 1 : wrapper module does not exist yet.
import { CollapsibleTopBar } from '@/features/chat/ui/CollapsibleTopBar';

// The <ChatHeader> module is also being extended with a new `collapsed` prop.
// At baseline, importing it must keep working (it already exists), but the
// expected new behaviour (hides badge, smaller font) will FAIL.
import { ChatHeader } from '@/features/chat/ui/ChatHeader';

interface BaseProps {
  sessionTitle: string | null;
  isClosing: boolean;
  onClose: () => void;
  onSummary?: () => void;
  audioDescriptionEnabled?: boolean;
  onToggleAudioDescription?: () => void;
  onOpenAiDisclosure?: () => void;
  expertiseLevel?: 'beginner' | 'intermediate' | 'expert';
}

const baseProps: BaseProps = {
  sessionTitle: 'Mona Lisa',
  isClosing: false,
  onClose: jest.fn(),
  onSummary: jest.fn(),
  audioDescriptionEnabled: false,
  onToggleAudioDescription: jest.fn(),
  onOpenAiDisclosure: jest.fn(),
  expertiseLevel: 'expert',
};

describe('<CollapsibleTopBar> (A4 wrapper)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('root testID + structure', () => {
    it('renders an animated root with testID="collapsible-top-bar" (R15, AC8)', () => {
      const { getByTestId } = render(<CollapsibleTopBar {...baseProps} />);
      expect(getByTestId('collapsible-top-bar')).toBeTruthy();
    });

    it('renders the wrapped <ChatHeader> session title (R8)', () => {
      const { getByText } = render(<CollapsibleTopBar {...baseProps} />);
      expect(getByText('Mona Lisa')).toBeTruthy();
    });
  });

  describe('expanded mode (default — R8, AC8, AC11)', () => {
    it('shows the <ExpertiseBadge> when collapsed prop is omitted', () => {
      const { getByTestId } = render(<CollapsibleTopBar {...baseProps} />);
      expect(getByTestId('expertise-badge')).toBeTruthy();
    });

    it('shows the <ExpertiseBadge> when collapsed={false}', () => {
      const { getByTestId } = render(<CollapsibleTopBar {...baseProps} collapsed={false} />);
      expect(getByTestId('expertise-badge')).toBeTruthy();
    });
  });

  describe('collapsed mode (R9, AC9, AC12)', () => {
    it('hides the <ExpertiseBadge> when collapsed (R18, AC12)', () => {
      const { queryByTestId } = render(<CollapsibleTopBar {...baseProps} collapsed />);
      expect(queryByTestId('expertise-badge')).toBeNull();
    });

    it('still renders the session title in collapsed mode', () => {
      const { getByText } = render(<CollapsibleTopBar {...baseProps} collapsed />);
      expect(getByText('Mona Lisa')).toBeTruthy();
    });
  });

  describe('EU AI Act Article 50 — AI badge visible in both states (R10, R19, AC10)', () => {
    it('renders the AI disclosure badge in expanded mode', () => {
      const { getByTestId } = render(<CollapsibleTopBar {...baseProps} collapsed={false} />);
      expect(getByTestId('ai-disclosure-badge')).toBeTruthy();
    });

    it('renders the AI disclosure badge in collapsed mode', () => {
      const { getByTestId } = render(<CollapsibleTopBar {...baseProps} collapsed />);
      expect(getByTestId('ai-disclosure-badge')).toBeTruthy();
    });

    it('AI disclosure badge stays tappable in collapsed mode', () => {
      const onOpenAiDisclosure = jest.fn();
      const { getByTestId } = render(
        <CollapsibleTopBar {...baseProps} collapsed onOpenAiDisclosure={onOpenAiDisclosure} />,
      );
      fireEvent.press(getByTestId('ai-disclosure-badge'));
      expect(onOpenAiDisclosure).toHaveBeenCalledTimes(1);
    });
  });

  describe('action buttons remain accessible in collapsed mode (R20, AC13)', () => {
    it('close button remains tappable in collapsed mode', () => {
      const onClose = jest.fn();
      const { getByLabelText } = render(
        <CollapsibleTopBar {...baseProps} collapsed onClose={onClose} />,
      );
      fireEvent.press(getByLabelText('a11y.chat.close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('summary button remains tappable in collapsed mode', () => {
      const onSummary = jest.fn();
      const { getByLabelText } = render(
        <CollapsibleTopBar {...baseProps} collapsed onSummary={onSummary} />,
      );
      fireEvent.press(getByLabelText('visitSummary.visitSummary'));
      expect(onSummary).toHaveBeenCalledTimes(1);
    });

    it('audio-mode toggle remains tappable in collapsed mode', () => {
      const onToggleAudioDescription = jest.fn();
      const { getByLabelText } = render(
        <CollapsibleTopBar
          {...baseProps}
          collapsed
          audioDescriptionEnabled={false}
          onToggleAudioDescription={onToggleAudioDescription}
        />,
      );
      fireEvent.press(getByLabelText('chat.audio_mode_on'));
      expect(onToggleAudioDescription).toHaveBeenCalledTimes(1);
    });
  });
});

describe('<ChatHeader collapsed> (A4 — new prop, backward-compat)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts the new `collapsed` prop without crashing (R16, AC15)', () => {
    expect(() =>
      render(<ChatHeader sessionTitle="X" isClosing={false} onClose={jest.fn()} collapsed />),
    ).not.toThrow();
  });

  it('remains backward-compatible when called WITHOUT `collapsed` prop (AC15)', () => {
    const { getByText } = render(
      <ChatHeader sessionTitle="X" isClosing={false} onClose={jest.fn()} expertiseLevel="expert" />,
    );
    // Expanded by default — expertise badge is rendered.
    expect(getByText('X')).toBeTruthy();
  });

  it('hides <ExpertiseBadge> when collapsed=true (R18, AC12)', () => {
    const { queryByTestId } = render(
      <ChatHeader
        sessionTitle="X"
        isClosing={false}
        onClose={jest.fn()}
        expertiseLevel="expert"
        collapsed
      />,
    );
    expect(queryByTestId('expertise-badge')).toBeNull();
  });

  it('renders <ExpertiseBadge> when collapsed=false (R18 inverse, AC11)', () => {
    const { getByTestId } = render(
      <ChatHeader
        sessionTitle="X"
        isClosing={false}
        onClose={jest.fn()}
        expertiseLevel="expert"
        collapsed={false}
      />,
    );
    expect(getByTestId('expertise-badge')).toBeTruthy();
  });

  it('renders the AI disclosure badge even when collapsed (R19, AC10)', () => {
    const { getByTestId } = render(
      <ChatHeader
        sessionTitle="X"
        isClosing={false}
        onClose={jest.fn()}
        onOpenAiDisclosure={jest.fn()}
        collapsed
      />,
    );
    expect(getByTestId('ai-disclosure-badge')).toBeTruthy();
  });

  it('uses a smaller fontSize for the title when collapsed (R17, AC14)', () => {
    // Render twice and compare the title style. The collapsed variant must
    // produce a strictly smaller fontSize than the expanded one.
    const expanded = render(
      <ChatHeader
        sessionTitle="Mona Lisa"
        isClosing={false}
        onClose={jest.fn()}
        collapsed={false}
      />,
    );
    const expandedTitle = expanded.getByText('Mona Lisa');
    const expandedSize = flattenFontSize(expandedTitle.props.style);
    expanded.unmount();

    const collapsed = render(
      <ChatHeader sessionTitle="Mona Lisa" isClosing={false} onClose={jest.fn()} collapsed />,
    );
    const collapsedTitle = collapsed.getByText('Mona Lisa');
    const collapsedSize = flattenFontSize(collapsedTitle.props.style);

    expect(typeof expandedSize).toBe('number');
    expect(typeof collapsedSize).toBe('number');
    expect(collapsedSize).toBeLessThan(expandedSize);
  });
});

/**
 * Walks an arbitrary RN style prop (object | array | nullable) and returns the
 * effective `fontSize` (last-write-wins). Returns NaN if not found.
 */
function flattenFontSize(style: unknown): number {
  let size = NaN;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (value && typeof value === 'object' && 'fontSize' in (value as Record<string, unknown>)) {
      const raw = (value as Record<string, unknown>).fontSize;
      if (typeof raw === 'number') size = raw;
    }
  };
  walk(style);
  return size;
}
