import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('@/features/chat/application/useImageManipulation', () => ({
  useImageManipulation: () => ({
    rotateImage: jest.fn().mockResolvedValue('file:///rotated.jpg'),
    cropImage: jest.fn().mockResolvedValue('file:///cropped.jpg'),
    isProcessing: false,
  }),
}));

import { ImagePreviewModal } from '@/features/chat/ui/ImagePreviewModal';

describe('ImagePreviewModal', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when imageUri is null', () => {
    const { toJSON } = render(
      <ImagePreviewModal imageUri={null} onConfirm={onConfirm} onCancel={onCancel} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders image preview when imageUri is provided', () => {
    render(
      <ImagePreviewModal
        imageUri="file:///tmp/photo.jpg"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByLabelText('imagePreview.title')).toBeTruthy();
  });

  it('renders title text', () => {
    render(
      <ImagePreviewModal
        imageUri="file:///tmp/photo.jpg"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('imagePreview.title')).toBeTruthy();
  });

  it('fires onCancel when close button is pressed', () => {
    render(
      <ImagePreviewModal
        imageUri="file:///tmp/photo.jpg"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(screen.getByLabelText('common.close'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('fires onCancel when cancel button is pressed', () => {
    render(
      <ImagePreviewModal
        imageUri="file:///tmp/photo.jpg"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(screen.getByLabelText('common.cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('fires onConfirm when send button is pressed', () => {
    render(
      <ImagePreviewModal
        imageUri="file:///tmp/photo.jpg"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(screen.getByLabelText('common.send'));
    expect(onConfirm).toHaveBeenCalledWith('file:///tmp/photo.jpg');
  });
});
