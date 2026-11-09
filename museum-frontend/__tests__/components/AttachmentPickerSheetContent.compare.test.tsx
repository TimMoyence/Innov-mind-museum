import type React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AttachmentPickerSheetContent } from '@/features/chat/ui/AttachmentPickerSheetContent';

type SheetProps = React.ComponentProps<typeof AttachmentPickerSheetContent> & {
  onCompareImage?: () => void;
};

describe('AttachmentPickerSheetContent — compare action (D-01, Option C)', () => {
  const onCompareImage = jest.fn();
  const close = jest.fn();

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
    close,
  };

  const renderSheet = () => {
    const props: SheetProps = { ...baseProps, onCompareImage };
    return render(<AttachmentPickerSheetContent {...props} />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a "compare" action with an accessible label (D-01 déclencheur)', () => {
    renderSheet();
    const compare = screen.getByTestId('attachment-picker-compare');
    expect(compare).toBeTruthy();
    expect(compare.props.accessibilityLabel).toBe('chat.attachmentPicker.compare');
  });

  it('invokes onCompareImage AND close when the compare action is pressed (D-01 wiring entry point)', () => {
    renderSheet();
    fireEvent.press(screen.getByTestId('attachment-picker-compare'));
    expect(onCompareImage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
