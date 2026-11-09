import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { ChatHeader } from '@/features/chat/ui/ChatHeader';

const baseProps = {
  sessionTitle: 'Mona Lisa',
  isClosing: false,
  onClose: jest.fn(),
  onSummary: jest.fn(),
  audioDescriptionEnabled: false,
  onToggleAudioDescription: jest.fn(),
  onOpenAiDisclosure: jest.fn(),
};

describe('<ChatHeader collapsed> (A4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('still renders the session title in collapsed mode', () => {
    const { getByText } = render(<ChatHeader {...baseProps} collapsed />);
    expect(getByText('Mona Lisa')).toBeTruthy();
  });

  it('remains backward-compatible when called WITHOUT `collapsed` prop (AC15)', () => {
    const { getByText } = render(
      <ChatHeader sessionTitle="X" isClosing={false} onClose={jest.fn()} />,
    );
    expect(getByText('X')).toBeTruthy();
  });

  describe('EU AI Act Article 50 — AI badge visible in both states (R10, R19, AC10)', () => {
    it('renders the AI disclosure badge in expanded mode', () => {
      const { getByTestId } = render(<ChatHeader {...baseProps} collapsed={false} />);
      expect(getByTestId('ai-disclosure-badge')).toBeTruthy();
    });

    it('renders the AI disclosure badge in collapsed mode', () => {
      const { getByTestId } = render(<ChatHeader {...baseProps} collapsed />);
      expect(getByTestId('ai-disclosure-badge')).toBeTruthy();
    });

    it('AI disclosure badge stays tappable in collapsed mode', () => {
      const onOpenAiDisclosure = jest.fn();
      const { getByTestId } = render(
        <ChatHeader {...baseProps} collapsed onOpenAiDisclosure={onOpenAiDisclosure} />,
      );
      fireEvent.press(getByTestId('ai-disclosure-badge'));
      expect(onOpenAiDisclosure).toHaveBeenCalledTimes(1);
    });
  });

  describe('action buttons remain accessible in collapsed mode (R20, AC13)', () => {
    it('close button remains tappable in collapsed mode', () => {
      const onClose = jest.fn();
      const { getByLabelText } = render(<ChatHeader {...baseProps} collapsed onClose={onClose} />);
      fireEvent.press(getByLabelText('a11y.chat.close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('summary button remains tappable in collapsed mode', () => {
      const onSummary = jest.fn();
      const { getByLabelText } = render(
        <ChatHeader {...baseProps} collapsed onSummary={onSummary} />,
      );
      fireEvent.press(getByLabelText('visitSummary.visitSummary'));
      expect(onSummary).toHaveBeenCalledTimes(1);
    });

    it('audio-mode toggle remains tappable in collapsed mode', () => {
      const onToggleAudioDescription = jest.fn();
      const { getByLabelText } = render(
        <ChatHeader
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

  it('uses a smaller fontSize for the title when collapsed (R17, AC14)', () => {
    const expanded = render(
      <ChatHeader
        sessionTitle="Mona Lisa"
        isClosing={false}
        onClose={jest.fn()}
        collapsed={false}
      />,
    );
    const expandedSize = flattenFontSize(expanded.getByText('Mona Lisa').props.style);
    expanded.unmount();

    const collapsed = render(
      <ChatHeader sessionTitle="Mona Lisa" isClosing={false} onClose={jest.fn()} collapsed />,
    );
    const collapsedSize = flattenFontSize(collapsed.getByText('Mona Lisa').props.style);

    expect(typeof expandedSize).toBe('number');
    expect(typeof collapsedSize).toBe('number');
    expect(collapsedSize).toBeLessThan(expandedSize);
  });
});

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
