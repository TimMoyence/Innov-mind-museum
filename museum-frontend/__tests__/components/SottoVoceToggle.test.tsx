/**
 * Red tests for B5 — `<SottoVoceToggle>` component + `<ChatHeader>` integration.
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/B5.md` :
 *
 *   §1.2 (R9-R17) — toggle component shape + a11y + icon swap.
 *   §1.3 (R18-R21) — <ChatHeader> renders <SottoVoceToggle> when handler provided.
 *   §4 (AC7-AC15) — testID + role + state + i18n hints + collapsed survival.
 *
 * Key invariants :
 *   - testID="sotto-voce-toggle".
 *   - `accessibilityRole="button"` (NOT "switch" — convention RN Pressable bascule).
 *   - `accessibilityState={{ selected: enabled }}` reflects the prop.
 *   - Icon `mic-off-outline` (off) / `mic-off` (on).
 *   - Tap → onToggle called exactly once.
 *   - Backward-compat : ChatHeader WITHOUT onToggleSottoVoce does NOT render the toggle.
 *   - A4 collapsed mode preserves the toggle (R21).
 *
 * At baseline (B5 not yet implemented) :
 *   - `@/features/chat/ui/SottoVoceToggle` does not exist.
 *     → Jest fails with "Cannot find module" at module load time.
 */

import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

// Mock ExpertiseBadge to a predictable testID node so ChatHeader renders cleanly.
jest.mock('@/features/chat/ui/ExpertiseBadge', () => {
  const { Text } = require('react-native');
  return {
    ExpertiseBadge: ({ level }: { level: string }) => <Text testID="expertise-badge">{level}</Text>,
  };
});

// RED ASSERTION 1 : SottoVoceToggle module does not exist yet.
import { SottoVoceToggle } from '@/features/chat/ui/SottoVoceToggle';

// ChatHeader already exists ; the integration assertions probe the new optional
// props which the baseline ChatHeader does NOT consume → red.
import { ChatHeader } from '@/features/chat/ui/ChatHeader';

describe('<SottoVoceToggle> (B5 atomic toggle)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('root testID + structure (R11, AC7)', () => {
    it('renders a Pressable with testID="sotto-voce-toggle"', () => {
      const { getByTestId } = render(<SottoVoceToggle enabled={false} onToggle={jest.fn()} />);
      expect(getByTestId('sotto-voce-toggle')).toBeTruthy();
    });
  });

  describe('icon swap (R12, AC7-AC8)', () => {
    it('renders Ionicons name="mic-off-outline" when enabled=false', () => {
      // Ionicons is mocked in test-utils to render its name as text content.
      const { getByText } = render(<SottoVoceToggle enabled={false} onToggle={jest.fn()} />);
      expect(getByText('mic-off-outline')).toBeTruthy();
    });

    it('renders Ionicons name="mic-off" (filled) when enabled=true', () => {
      const { getByText } = render(<SottoVoceToggle enabled onToggle={jest.fn()} />);
      expect(getByText('mic-off')).toBeTruthy();
    });
  });

  describe('a11y role + state (R13, AC7-AC8)', () => {
    it('exposes accessibilityRole="button" (convention RN Pressable bascule)', () => {
      const { getByTestId } = render(<SottoVoceToggle enabled={false} onToggle={jest.fn()} />);
      const node = getByTestId('sotto-voce-toggle');
      expect(node.props.accessibilityRole).toBe('button');
    });

    it('does NOT use accessibilityRole="switch" (reserved for native <Switch>)', () => {
      const { getByTestId } = render(<SottoVoceToggle enabled onToggle={jest.fn()} />);
      const node = getByTestId('sotto-voce-toggle');
      expect(node.props.accessibilityRole).not.toBe('switch');
    });

    it('reflects enabled=false via accessibilityState.selected=false (AC7)', () => {
      const { getByTestId } = render(<SottoVoceToggle enabled={false} onToggle={jest.fn()} />);
      const node = getByTestId('sotto-voce-toggle');
      expect(node.props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    });

    it('reflects enabled=true via accessibilityState.selected=true (AC8)', () => {
      const { getByTestId } = render(<SottoVoceToggle enabled onToggle={jest.fn()} />);
      const node = getByTestId('sotto-voce-toggle');
      expect(node.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    });
  });

  describe('a11y labels + hints (R14, AC10-AC11)', () => {
    it('uses i18n key "chat.sottoVoce.a11y_label" for accessibilityLabel', () => {
      const { getByTestId } = render(<SottoVoceToggle enabled={false} onToggle={jest.fn()} />);
      const node = getByTestId('sotto-voce-toggle');
      // test-utils i18n mock returns the key verbatim.
      expect(node.props.accessibilityLabel).toBe('chat.sottoVoce.a11y_label');
    });

    it('uses "chat.sottoVoce.a11y_hint_off" when enabled=false (AC11)', () => {
      const { getByTestId } = render(<SottoVoceToggle enabled={false} onToggle={jest.fn()} />);
      const node = getByTestId('sotto-voce-toggle');
      expect(node.props.accessibilityHint).toBe('chat.sottoVoce.a11y_hint_off');
    });

    it('uses "chat.sottoVoce.a11y_hint_on" when enabled=true (AC11)', () => {
      const { getByTestId } = render(<SottoVoceToggle enabled onToggle={jest.fn()} />);
      const node = getByTestId('sotto-voce-toggle');
      expect(node.props.accessibilityHint).toBe('chat.sottoVoce.a11y_hint_on');
    });
  });

  describe('press handling (R17, AC9)', () => {
    it('invokes onToggle exactly once when tapped (off → on path)', () => {
      const onToggle = jest.fn();
      const { getByTestId } = render(<SottoVoceToggle enabled={false} onToggle={onToggle} />);
      fireEvent.press(getByTestId('sotto-voce-toggle'));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('invokes onToggle exactly once when tapped (on → off path)', () => {
      const onToggle = jest.fn();
      const { getByTestId } = render(<SottoVoceToggle enabled onToggle={onToggle} />);
      fireEvent.press(getByTestId('sotto-voce-toggle'));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });
});

describe('<ChatHeader> — B5 sotto-voce integration (R18-R21, AC12-AC15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders <SottoVoceToggle> when onToggleSottoVoce is provided (R19, AC12)', () => {
    const { getByTestId } = render(
      <ChatHeader
        sessionTitle="Mona Lisa"
        isClosing={false}
        onClose={jest.fn()}
        sottoVoceEnabled={false}
        onToggleSottoVoce={jest.fn()}
      />,
    );
    expect(getByTestId('sotto-voce-toggle')).toBeTruthy();
  });

  it('does NOT render <SottoVoceToggle> when onToggleSottoVoce is omitted (R20, AC13)', () => {
    const { queryByTestId } = render(
      <ChatHeader sessionTitle="Mona Lisa" isClosing={false} onClose={jest.fn()} />,
    );
    expect(queryByTestId('sotto-voce-toggle')).toBeNull();
  });

  it('forwards the toggle press through to onToggleSottoVoce (AC14)', () => {
    const onToggleSottoVoce = jest.fn();
    const { getByTestId } = render(
      <ChatHeader
        sessionTitle="Mona Lisa"
        isClosing={false}
        onClose={jest.fn()}
        sottoVoceEnabled={false}
        onToggleSottoVoce={onToggleSottoVoce}
      />,
    );
    fireEvent.press(getByTestId('sotto-voce-toggle'));
    expect(onToggleSottoVoce).toHaveBeenCalledTimes(1);
  });

  it('reflects sottoVoceEnabled=true on the toggle accessibilityState (AC12)', () => {
    const { getByTestId } = render(
      <ChatHeader
        sessionTitle="Mona Lisa"
        isClosing={false}
        onClose={jest.fn()}
        sottoVoceEnabled
        onToggleSottoVoce={jest.fn()}
      />,
    );
    const node = getByTestId('sotto-voce-toggle');
    expect(node.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  });

  it('keeps the toggle rendered and tappable in A4 collapsed mode (R21, AC15)', () => {
    const onToggleSottoVoce = jest.fn();
    const { getByTestId } = render(
      <ChatHeader
        sessionTitle="Mona Lisa"
        isClosing={false}
        onClose={jest.fn()}
        sottoVoceEnabled={false}
        onToggleSottoVoce={onToggleSottoVoce}
        collapsed
      />,
    );
    const node = getByTestId('sotto-voce-toggle');
    expect(node).toBeTruthy();
    fireEvent.press(node);
    expect(onToggleSottoVoce).toHaveBeenCalledTimes(1);
  });

  it('preserves the AI disclosure badge alongside the sotto-voce toggle (EU AI Act Art.50)', () => {
    const { getByTestId } = render(
      <ChatHeader
        sessionTitle="Mona Lisa"
        isClosing={false}
        onClose={jest.fn()}
        sottoVoceEnabled
        onToggleSottoVoce={jest.fn()}
        onOpenAiDisclosure={jest.fn()}
        collapsed
      />,
    );
    // Both must coexist : sotto-voce toggle AND legal AI badge.
    expect(getByTestId('sotto-voce-toggle')).toBeTruthy();
    expect(getByTestId('ai-disclosure-badge')).toBeTruthy();
  });
});
