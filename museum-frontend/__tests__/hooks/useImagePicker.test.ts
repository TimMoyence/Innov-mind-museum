import { renderHook, act } from '@testing-library/react-native';
import { useImagePicker } from '@/features/chat/application/useImagePicker';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRequestMediaLibraryPermissionsAsync = jest.fn<
  Promise<{ status: string }>,
  []
>();
const mockLaunchImageLibraryAsync = jest.fn<
  Promise<{ canceled: boolean; assets: Array<{ uri: string }> }>,
  []
>();

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockRequestMediaLibraryPermissionsAsync(),
  launchImageLibraryAsync: (...args: unknown[]) =>
    mockLaunchImageLibraryAsync(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useImagePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initialises with null selectedImage, null pendingImage, and isCameraOpen=false', () => {
    const { result } = renderHook(() => useImagePicker());

    expect(result.current.selectedImage).toBeNull();
    expect(result.current.pendingImage).toBeNull();
    expect(result.current.isCameraOpen).toBe(false);
  });

  it('onPickImage() requests permissions and sets pendingImage on success', async () => {
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg' }],
    });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onPickImage();
    });

    expect(mockRequestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockLaunchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(result.current.pendingImage).toBe('file://photo.jpg');
    // selectedImage stays null until confirmation
    expect(result.current.selectedImage).toBeNull();
  });

  it('onPickImage() does nothing when user cancels the picker', async () => {
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: [],
    });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onPickImage();
    });

    expect(result.current.pendingImage).toBeNull();
    expect(result.current.selectedImage).toBeNull();
  });

  it('onPickImage() does nothing when permissions are denied', async () => {
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onPickImage();
    });

    expect(mockLaunchImageLibraryAsync).not.toHaveBeenCalled();
    expect(result.current.pendingImage).toBeNull();
  });

  it('onTakePicture() sets isCameraOpen to true', () => {
    const { result } = renderHook(() => useImagePicker());

    act(() => {
      result.current.onTakePicture();
    });

    expect(result.current.isCameraOpen).toBe(true);
  });

  it('onCameraCapture() sets pendingImage and closes the camera', () => {
    const { result } = renderHook(() => useImagePicker());

    act(() => {
      result.current.onTakePicture();
    });
    expect(result.current.isCameraOpen).toBe(true);

    act(() => {
      result.current.onCameraCapture('file://camera-photo.jpg');
    });

    expect(result.current.pendingImage).toBe('file://camera-photo.jpg');
    expect(result.current.isCameraOpen).toBe(false);
  });

  it('confirmPendingImage() promotes pendingImage to selectedImage', () => {
    const { result } = renderHook(() => useImagePicker());

    // Simulate a camera capture first
    act(() => {
      result.current.onCameraCapture('file://confirmed.jpg');
    });
    expect(result.current.pendingImage).toBe('file://confirmed.jpg');

    act(() => {
      result.current.confirmPendingImage('file://confirmed.jpg');
    });

    expect(result.current.selectedImage).toBe('file://confirmed.jpg');
    expect(result.current.pendingImage).toBeNull();
  });

  it('cancelPendingImage() clears pendingImage without affecting selectedImage', () => {
    const { result } = renderHook(() => useImagePicker());

    act(() => {
      result.current.onCameraCapture('file://to-cancel.jpg');
    });
    expect(result.current.pendingImage).toBe('file://to-cancel.jpg');

    act(() => {
      result.current.cancelPendingImage();
    });

    expect(result.current.pendingImage).toBeNull();
    expect(result.current.selectedImage).toBeNull();
  });

  it('clearSelectedImage() resets selectedImage to null', () => {
    const { result } = renderHook(() => useImagePicker());

    // Go through the full flow: capture → confirm → clear
    act(() => {
      result.current.onCameraCapture('file://to-clear.jpg');
    });
    act(() => {
      result.current.confirmPendingImage('file://to-clear.jpg');
    });
    expect(result.current.selectedImage).toBe('file://to-clear.jpg');

    act(() => {
      result.current.clearSelectedImage();
    });

    expect(result.current.selectedImage).toBeNull();
  });
});
