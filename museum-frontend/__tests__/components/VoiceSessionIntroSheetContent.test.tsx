import React from 'react';
import { render, act, fireEvent, waitFor } from '@testing-library/react-native';

import '../helpers/test-utils';

const mockSpeak = jest.fn();
const mockStop = jest.fn();
jest.mock('expo-speech', () => ({
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: () => {
    mockStop();
    return Promise.resolve();
  },
}));

const mockReportError = jest.fn();
jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import { VoiceSessionIntroSheetContent } from '@/features/chat/ui/VoiceSessionIntroSheetContent';

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

    expect(mockSpeak).toHaveBeenCalled();
    expect(getByText('voice.disclosure.audioPreparing')).toBeTruthy();

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

    expect(await findByText('voice.disclosure.audioFallback')).toBeTruthy();
    expect(mockReportError).toHaveBeenCalled();
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
    expect(mockStop).toHaveBeenCalled();
  });
});
