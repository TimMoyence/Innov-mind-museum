import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AttachmentPickerSheetContent } from '@/features/chat/ui/AttachmentPickerSheetContent';

/**
 * Red tests for B4 — `attachment-picker-scan-cartel` button added to the
 * existing AttachmentPickerSheetContent (post-A1) as the 4th picker action.
 *
 * Adds a required prop `onOpenScanner: () => void`. The button renders an
 * Ionicons `qr-code-outline` glyph + the i18n label
 * `chat.attachmentPicker.scan_cartel`. Pressing it invokes `onOpenScanner()`
 * AND `close()` (the picker collapses, the C4 router opens the scanner
 * fullscreen route — see `cartel-scanner-route.test.ts`).
 *
 * Spec: docs/chat-ux-refonte/specs/B4.md §1.1 (R1-R4), AC12-AC14.
 */
describe('AttachmentPickerSheetContent — scan cartel button (B4)', () => {
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

  it('renders the scan-cartel button with QR icon and i18n label (R1, AC13)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    const scan = screen.getByTestId('attachment-picker-scan-cartel');
    expect(scan).toBeTruthy();
    expect(scan.props.accessibilityLabel).toBe('chat.attachmentPicker.scan_cartel');
    expect(scan.props.accessibilityRole).toBe('button');
  });

  it('shows the scan-cartel label as visible Text (parity with the 3 other actions)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    expect(screen.getByText('chat.attachmentPicker.scan_cartel')).toBeTruthy();
  });

  it('invokes onOpenScanner AND close when scan-cartel is pressed (R2, AC14)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    fireEvent.press(screen.getByTestId('attachment-picker-scan-cartel'));
    expect(defaultProps.onOpenScanner).toHaveBeenCalledTimes(1);
    expect(defaultProps.close).toHaveBeenCalledTimes(1);
  });

  it('does NOT invoke onOpenScanner when other actions are pressed (isolation)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    fireEvent.press(screen.getByTestId('attachment-picker-camera'));
    fireEvent.press(screen.getByTestId('attachment-picker-gallery'));
    fireEvent.press(screen.getByTestId('attachment-picker-record'));
    expect(defaultProps.onOpenScanner).not.toHaveBeenCalled();
  });

  it('renders the scan button alongside the 3 legacy actions (4 total in actionsRow, R3)', () => {
    render(<AttachmentPickerSheetContent {...defaultProps} />);
    expect(screen.getByTestId('attachment-picker-camera')).toBeTruthy();
    expect(screen.getByTestId('attachment-picker-gallery')).toBeTruthy();
    expect(screen.getByTestId('attachment-picker-record')).toBeTruthy();
    expect(screen.getByTestId('attachment-picker-scan-cartel')).toBeTruthy();
  });
});
