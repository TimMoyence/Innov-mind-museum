import type React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AttachmentPickerSheetContent } from '@/features/chat/ui/AttachmentPickerSheetContent';

type SheetProps = React.ComponentProps<typeof AttachmentPickerSheetContent> & {
  onCompareImage?: () => void;
};

const ACTION_TEST_IDS = [
  'attachment-picker-camera',
  'attachment-picker-gallery',
  'attachment-picker-record',
  'attachment-picker-scan-cartel',
  'attachment-picker-compare',
] as const;

describe('AttachmentPickerSheetContent — uniform grid layout (QA-03)', () => {
  const baseProps = {
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

  const renderSheet = () => {
    const props: SheetProps = { ...baseProps, onCompareImage: jest.fn() };
    return render(<AttachmentPickerSheetContent {...props} />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(ACTION_TEST_IDS)(
    'lays out "%s" as a column tile (icon above label, not a row pill)',
    (testId) => {
      renderSheet();
      const tile = screen.getByTestId(testId);
      const style = StyleSheet.flatten(tile.props.style) as Record<string, unknown>;
      expect(style.flexDirection).toBe('column');
    },
  );

  it.each(ACTION_TEST_IDS)(
    'gives "%s" a fixed cross-axis size so all tiles are uniform',
    (testId) => {
      renderSheet();
      const tile = screen.getByTestId(testId);
      const style = StyleSheet.flatten(tile.props.style) as Record<string, unknown>;
      const hasFixedSize = style.width !== undefined || style.flexBasis !== undefined;
      expect(hasFixedSize).toBe(true);
    },
  );

  it('centers each action label and clamps it to avoid overflow', () => {
    renderSheet();
    const labelKeys = [
      'chat.attachmentPicker.camera',
      'chat.attachmentPicker.gallery',
      'chat.attachmentPicker.record_audio',
      'chat.attachmentPicker.scan_cartel',
      'chat.attachmentPicker.compare',
    ];
    for (const key of labelKeys) {
      const label = screen.getByText(key);
      const labelStyle = StyleSheet.flatten(label.props.style) as Record<string, unknown>;
      expect(labelStyle.textAlign).toBe('center');
      expect(label.props.numberOfLines).toBeGreaterThanOrEqual(1);
      expect(label.props.numberOfLines).toBeLessThanOrEqual(2);
    }
  });
});
