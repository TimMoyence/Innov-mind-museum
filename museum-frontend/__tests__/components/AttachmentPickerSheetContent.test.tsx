import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AttachmentPickerSheetContent } from '@/features/chat/ui/AttachmentPickerSheetContent';

/**
 * Red tests for A1 — attachment-picker sheet content.
 *
 * Sheet body that the C4 BottomSheetRouter renders for the `attachment-picker`
 * route. Hosts camera / gallery / record actions and (when audio was recorded)
 * the play + clear preview block migrated from the legacy MediaAttachmentPanel.
 *
 * Spec: docs/chat-ux-refonte/specs/A1.md §1.3, AC10-AC19.
 */
describe('AttachmentPickerSheetContent (A1)', () => {
  const defaultProps = {
    recordedAudioUri: null as string | null,
    isPlayingAudio: false,
    isRecording: false,
    onPickImage: jest.fn(),
    onTakePicture: jest.fn(),
    toggleRecording: jest.fn().mockResolvedValue(undefined),
    playRecordedAudio: jest.fn().mockResolvedValue(undefined),
    clearMedia: jest.fn(),
    onOpenScanner: jest.fn(),
    close: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title header (R12)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    expect(screen.getByText('chat.attachmentPicker.title')).toBeTruthy();
  });

  it('renders camera and gallery primary actions (R13, AC11)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    const camera = screen.getByTestId('attachment-picker-camera');
    const gallery = screen.getByTestId('attachment-picker-gallery');
    expect(camera).toBeTruthy();
    expect(gallery).toBeTruthy();
    expect(camera.props.accessibilityLabel).toBe('chat.attachmentPicker.camera');
    expect(gallery.props.accessibilityLabel).toBe('chat.attachmentPicker.gallery');
  });

  it('renders record action with record_audio label when not recording (R16, AC12)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    const record = screen.getByTestId('attachment-picker-record');
    expect(record).toBeTruthy();
    expect(record.props.accessibilityLabel).toBe('chat.attachmentPicker.record_audio');
  });

  it('renders record action with stop_audio label when isRecording (R17, AC13)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} isRecording />);
    const record = screen.getByTestId('attachment-picker-record');
    expect(record.props.accessibilityLabel).toBe('chat.attachmentPicker.stop_audio');
    expect(record.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
  });

  it('invokes onTakePicture AND close when camera is pressed (R14, AC14)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    fireEvent.press(screen.getByTestId('attachment-picker-camera'));
    expect(defaultProps.onTakePicture).toHaveBeenCalledTimes(1);
    expect(defaultProps.close).toHaveBeenCalledTimes(1);
  });

  it('invokes onPickImage AND close when gallery is pressed (R15, AC15)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    fireEvent.press(screen.getByTestId('attachment-picker-gallery'));
    expect(defaultProps.onPickImage).toHaveBeenCalledTimes(1);
    expect(defaultProps.close).toHaveBeenCalledTimes(1);
  });

  it('invokes toggleRecording but NOT close when record is pressed (R16, AC16)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    fireEvent.press(screen.getByTestId('attachment-picker-record'));
    expect(defaultProps.toggleRecording).toHaveBeenCalledTimes(1);
    expect(defaultProps.close).not.toHaveBeenCalled();
  });

  it('does NOT render the audio preview block when recordedAudioUri is null (R18, AC17)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} recordedAudioUri={null} />);
    expect(screen.queryByText('chat.voice_ready')).toBeNull();
    expect(screen.queryByLabelText('chat.play')).toBeNull();
    expect(screen.queryByLabelText('chat.clear')).toBeNull();
  });

  it('renders the audio preview block when recordedAudioUri is set (R18, AC17)', () => {
    render(
      <AttachmentPickerSheetContent {...defaultProps} recordedAudioUri="file:///tmp/audio.m4a" />,
    );
    expect(screen.getByText('chat.voice_ready')).toBeTruthy();
    expect(screen.getByLabelText('chat.play')).toBeTruthy();
    expect(screen.getByLabelText('chat.clear')).toBeTruthy();
  });

  it('invokes playRecordedAudio but NOT close when play is pressed (R19, AC18)', () => {
    render(
      <AttachmentPickerSheetContent {...defaultProps} recordedAudioUri="file:///tmp/audio.m4a" />,
    );
    fireEvent.press(screen.getByLabelText('chat.play'));
    expect(defaultProps.playRecordedAudio).toHaveBeenCalledTimes(1);
    expect(defaultProps.close).not.toHaveBeenCalled();
  });

  it('invokes clearMedia AND close when clear is pressed (R19, AC19)', () => {
    render(
      <AttachmentPickerSheetContent {...defaultProps} recordedAudioUri="file:///tmp/audio.m4a" />,
    );
    fireEvent.press(screen.getByLabelText('chat.clear'));
    expect(defaultProps.clearMedia).toHaveBeenCalledTimes(1);
    expect(defaultProps.close).toHaveBeenCalledTimes(1);
  });

  it('shows playing label when isPlayingAudio (R18, parity with legacy panel)', () => {
    render(
      <AttachmentPickerSheetContent
        {...defaultProps}
        recordedAudioUri="file:///tmp/audio.m4a"
        isPlayingAudio
      />,
    );
    expect(screen.getByLabelText('chat.playing')).toBeTruthy();
  });
});
