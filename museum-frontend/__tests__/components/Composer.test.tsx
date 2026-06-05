import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { Composer } from '@/features/chat/ui/Composer';

/**
 * Red tests for A1 — unified composer.
 *
 * The Composer wraps the existing <ChatInput> with a leading `+` button (opens
 * the attachment-picker bottom sheet via C4) and a trailing mic button. An
 * optional "audio ready" mini-pill appears in the row when `recordedAudioUri`
 * is non-null. Doctrine reuse: ChatInput's contract is unchanged (R7); A1 only
 * decorates around it.
 *
 * Spec: docs/chat-ux-refonte/specs/A1.md §1.1, AC1-AC9.
 */
describe('Composer (A1)', () => {
  const defaultProps = {
    text: '',
    onChangeText: jest.fn(),
    onSend: jest.fn(),
    isSending: false,
    imageUri: null,
    onClearImage: jest.fn(),
    recordedAudioUri: null as string | null,
    isRecording: false,
    toggleRecording: jest.fn().mockResolvedValue(undefined),
    onOpenAttachments: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the attach (+) button with a11y label (R4)', () => {
    render(<Composer {...defaultProps} />);
    // testID lives on a host-only inner View (R1 structural — see Composer.tsx
    // implementation note) ; a11y semantics live on the surrounding Pressable
    // per lib-docs/react-native/PATTERNS.md §7 canonical icon-button shape.
    // Query the Pressable by its a11y label rather than introspecting the
    // testID-bearing inner View, so the assertion is implementation-agnostic.
    expect(screen.getByTestId('composer-attach-button')).toBeTruthy();
    const attach = screen.getByLabelText('chat.composer.a11y.open_attachments');
    expect(attach.props.accessibilityHint).toBe('chat.composer.a11y.open_attachments_hint');
  });

  it('fires onOpenAttachments when the attach (+) button is pressed (AC5)', () => {
    render(<Composer {...defaultProps} />);
    fireEvent.press(screen.getByTestId('composer-attach-button'));
    expect(defaultProps.onOpenAttachments).toHaveBeenCalledTimes(1);
  });

  it('renders the mic button with default a11y label when not recording (AC3)', () => {
    render(<Composer {...defaultProps} />);
    expect(screen.getByTestId('composer-mic-button')).toBeTruthy();
    // a11y on the Pressable, testID on inner host View — see attach test above.
    expect(screen.getByLabelText('chat.composer.a11y.mic')).toBeTruthy();
  });

  it('renders the mic button with recording a11y label + busy state when isRecording (AC4, R27)', () => {
    render(<Composer {...defaultProps} isRecording />);
    const mic = screen.getByLabelText('chat.composer.a11y.mic_recording');
    expect(mic.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
  });

  it('fires toggleRecording when the mic button is pressed (AC6)', () => {
    render(<Composer {...defaultProps} />);
    fireEvent.press(screen.getByTestId('composer-mic-button'));
    expect(defaultProps.toggleRecording).toHaveBeenCalledTimes(1);
  });

  it('does NOT render the audio mini-pill when recordedAudioUri is null (R2, AC7)', () => {
    render(<Composer {...defaultProps} recordedAudioUri={null} />);
    expect(screen.queryByTestId('composer-audio-pill')).toBeNull();
  });

  it('renders the audio mini-pill when recordedAudioUri is set (R3, AC7)', () => {
    render(<Composer {...defaultProps} recordedAudioUri="file:///tmp/audio.m4a" />);
    const pill = screen.getByTestId('composer-audio-pill');
    expect(pill).toBeTruthy();
    expect(pill.props.accessibilityLabel).toBe('chat.composer.a11y.audio_pill');
  });

  it('fires onOpenAttachments when the audio mini-pill is pressed (R3, AC8)', () => {
    render(<Composer {...defaultProps} recordedAudioUri="file:///tmp/audio.m4a" />);
    fireEvent.press(screen.getByTestId('composer-audio-pill'));
    expect(defaultProps.onOpenAttachments).toHaveBeenCalledTimes(1);
  });

  it('forwards text input contract to the embedded ChatInput (R7, AC9)', () => {
    // The ChatInput exposes its TextInput via the placeholder. We exercise the
    // forwarded onChangeText to confirm the props pipe through unchanged.
    const onChangeText = jest.fn();
    render(<Composer {...defaultProps} text="Hello" onChangeText={onChangeText} />);
    const input = screen.getByPlaceholderText('chatInput.placeholder');
    expect(input.props.value).toBe('Hello');
    fireEvent.changeText(input, 'Hello world');
    expect(onChangeText).toHaveBeenCalledWith('Hello world');
  });

  it('forwards send action to the embedded ChatInput (R7)', () => {
    const onSend = jest.fn();
    render(<Composer {...defaultProps} text="Hi" onSend={onSend} />);
    fireEvent.press(screen.getByLabelText('a11y.chat.send'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
