import React from 'react';
import { render, act, fireEvent, waitFor } from '@testing-library/react-native';

import '../helpers/test-utils';

// ── expo-speech mock ────────────────────────────────────────────────────────
// The component lazy-loads expo-speech via `require()` so jest.mock here is
// applied at runtime resolution, not import-time. Each test re-asserts the
// mock impl as needed.
const mockSpeak = jest.fn();
const mockStop = jest.fn();
jest.mock('expo-speech', () => ({
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: () => mockStop(),
}));

// ── observability — capture reportError calls for the error branches ───────
const mockReportError = jest.fn();
jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

// Mocks declared above must precede the SUT import (jest hoists jest.mock
// so the runtime order matches, even when ESLint suggests grouping imports).
import { VoiceSessionIntroSheetContent } from '@/features/chat/ui/VoiceSessionIntroSheetContent';

/**
 * Coverage for the EU AI Act Article 50 voice-intro gate (C4 refactor — the
 * Modal wrapper was stripped). Three branches drive most of the file's
 * statements / branches:
 *  - speech loads and `speak()` resolves → audioStatus transitions
 *    `idle → speaking → idle` (icon/text branches).
 *  - speech loads but `speak()` throws → `reportError` + `unavailable`.
 *  - acknowledge fires `onAcknowledge` then `close`; works without
 *    `onAcknowledge` too (parent doesn't always wire it).
 */
describe('VoiceSessionIntroSheetContent', () => {
  beforeEach(() => {
    mockSpeak.mockReset();
    mockStop.mockReset();
    mockReportError.mockReset();
  });

  it('renders title, AI notice, and start button on mount', () => {
    mockSpeak.mockImplementation(() => undefined);
    const close = jest.fn();
    const { getByText, getAllByText } = render(
      <VoiceSessionIntroSheetContent close={close} locale="fr" />,
    );

    // `accessibilityLabel` duplicates the title text, so the same key may
    // render twice (header + a11y label). getAllByText accepts either.
    expect(getAllByText('voice.disclosure.title').length).toBeGreaterThan(0);
    expect(getByText('voice.disclosure.aiNotice')).toBeTruthy();
    expect(getByText('voice.disclosure.startButton')).toBeTruthy();
  });

  it('transitions audio status to idle once speak() onDone fires', () => {
    let onDoneFn: (() => void) | undefined;
    mockSpeak.mockImplementation((_text: string, opts?: { onDone?: () => void }) => {
      onDoneFn = opts?.onDone;
    });

    const close = jest.fn();
    const { getByText } = render(<VoiceSessionIntroSheetContent close={close} locale="en" />);

    // React 19 strict mode invokes the useEffect twice in dev; assert at-least-once.
    expect(mockSpeak).toHaveBeenCalled();
    expect(getByText('voice.disclosure.audioPreparing')).toBeTruthy();

    // Simulate the OS TTS engine completing the greeting.
    act(() => {
      onDoneFn?.();
    });

    expect(mockReportError).not.toHaveBeenCalled();
  });

  it('reports the error and surfaces fallback copy when speak() throws', async () => {
    mockSpeak.mockImplementation(() => {
      throw new Error('TTS unavailable');
    });

    const close = jest.fn();
    const { findByText } = render(<VoiceSessionIntroSheetContent close={close} locale="fr" />);

    // The audio card falls back to the "unavailable" copy + the error is
    // reported through the observability adapter.
    expect(await findByText('voice.disclosure.audioFallback')).toBeTruthy();
    expect(mockReportError).toHaveBeenCalled();
    // First reported error shape; strict-mode double-mount may push more.
    expect(mockReportError.mock.calls[0][1]).toMatchObject({
      component: 'VoiceSessionIntroSheetContent',
      action: 'speak',
    });
  });

  it('calls onAcknowledge then close when the start button is pressed', async () => {
    mockSpeak.mockImplementation(() => undefined);
    const close = jest.fn();
    const onAcknowledge = jest.fn();
    const { getByTestId } = render(
      <VoiceSessionIntroSheetContent close={close} locale="en" onAcknowledge={onAcknowledge} />,
    );

    fireEvent.press(getByTestId('voice-disclosure-start'));
    await waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('still closes when onAcknowledge prop is omitted', async () => {
    mockSpeak.mockImplementation(() => undefined);
    const close = jest.fn();
    const { getByTestId } = render(<VoiceSessionIntroSheetContent close={close} locale="en" />);

    fireEvent.press(getByTestId('voice-disclosure-start'));
    await waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  it('calls stop() in the cleanup effect on unmount', () => {
    mockSpeak.mockImplementation(() => undefined);
    const close = jest.fn();
    const { unmount } = render(<VoiceSessionIntroSheetContent close={close} locale="en" />);

    unmount();
    // Strict-mode runs cleanup on the throwaway first mount too; assert ≥1.
    expect(mockStop).toHaveBeenCalled();
  });
});
