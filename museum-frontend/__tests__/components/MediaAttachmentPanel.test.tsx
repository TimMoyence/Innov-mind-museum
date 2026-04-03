import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { MediaAttachmentPanel } from '@/features/chat/ui/MediaAttachmentPanel';

describe('MediaAttachmentPanel', () => {
  const defaultProps = {
    selectedImage: null,
    onPickImage: jest.fn(),
    clearSelectedImage: jest.fn(),
    recordedAudioUri: null,
    isPlayingAudio: false,
    isRecording: false,
    playRecordedAudio: jest.fn().mockResolvedValue(undefined),
    clearMedia: jest.fn(),
    onTakePicture: jest.fn(),
    toggleRecording: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders gallery, camera, and audio buttons', () => {
    render(<MediaAttachmentPanel {...defaultProps} />);
    expect(screen.getByLabelText('chat.gallery')).toBeTruthy();
    expect(screen.getByLabelText('chat.lens')).toBeTruthy();
    expect(screen.getByLabelText('chat.audio')).toBeTruthy();
  });

  it('fires onPickImage when gallery button is pressed', () => {
    render(<MediaAttachmentPanel {...defaultProps} />);
    fireEvent.press(screen.getByLabelText('chat.gallery'));
    expect(defaultProps.onPickImage).toHaveBeenCalled();
  });

  it('fires onTakePicture when camera button is pressed', () => {
    render(<MediaAttachmentPanel {...defaultProps} />);
    fireEvent.press(screen.getByLabelText('chat.lens'));
    expect(defaultProps.onTakePicture).toHaveBeenCalled();
  });

  it('fires toggleRecording when audio button is pressed', () => {
    render(<MediaAttachmentPanel {...defaultProps} />);
    fireEvent.press(screen.getByLabelText('chat.audio'));
    expect(defaultProps.toggleRecording).toHaveBeenCalled();
  });

  it('shows stop label when recording', () => {
    render(<MediaAttachmentPanel {...defaultProps} isRecording />);
    expect(screen.getByLabelText('chat.stop_audio')).toBeTruthy();
  });

  it('shows image preview when selectedImage is set', () => {
    render(<MediaAttachmentPanel {...defaultProps} selectedImage="file:///tmp/photo.jpg" />);
    // The floating context menu is mocked; the image preview wrap should be rendered
    expect(screen.getByTestId('floating-context-menu')).toBeTruthy();
  });

  it('shows audio card when recordedAudioUri is set', () => {
    render(<MediaAttachmentPanel {...defaultProps} recordedAudioUri="file:///tmp/audio.m4a" />);
    expect(screen.getByText('chat.voice_ready')).toBeTruthy();
    expect(screen.getByLabelText('chat.play')).toBeTruthy();
    expect(screen.getByLabelText('chat.clear')).toBeTruthy();
  });

  it('fires clearMedia when clear button is pressed on audio card', () => {
    render(<MediaAttachmentPanel {...defaultProps} recordedAudioUri="file:///tmp/audio.m4a" />);
    fireEvent.press(screen.getByLabelText('chat.clear'));
    expect(defaultProps.clearMedia).toHaveBeenCalled();
  });
});
