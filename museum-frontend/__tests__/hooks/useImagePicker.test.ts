import { renderHook, act } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useImagePicker } from '@/features/chat/application/useImagePicker';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockOptimizeImageForUpload = jest.fn<Promise<string>, [string]>();
const mockRequestMediaLibraryPermissionsAsync = jest.fn<Promise<{ status: string }>, []>();
const mockLaunchImageLibraryAsync = jest.fn<
  Promise<{ canceled: boolean; assets: { uri: string }[] }>,
  []
>();
const mockRequestCameraPermissionsAsync = jest.fn<Promise<{ status: string }>, []>();
const mockLaunchCameraAsync = jest.fn<
  Promise<{ canceled: boolean; assets: { uri: string }[] }>,
  []
>();

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockRequestMediaLibraryPermissionsAsync(),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(),
  requestCameraPermissionsAsync: (...args: unknown[]) => mockRequestCameraPermissionsAsync(),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCameraAsync(),
}));

jest.mock('@/features/chat/application/imageUploadOptimization', () => ({
  optimizeImageForUpload: (...args: unknown[]) => mockOptimizeImageForUpload(args[0] as string),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useImagePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOptimizeImageForUpload.mockImplementation((uri: string) => Promise.resolve(uri));
  });

  it('initialises with null selectedImage', () => {
    const { result } = renderHook(() => useImagePicker());
    expect(result.current.selectedImage).toBeNull();
  });

  it('onPickImage() requests permissions and sets selectedImage on success', async () => {
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
    expect(mockOptimizeImageForUpload).toHaveBeenCalledWith('file://photo.jpg');
    expect(result.current.selectedImage).toBe('file://photo.jpg');
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

    expect(result.current.selectedImage).toBeNull();
  });

  it('onPickImage() does nothing when permissions are denied', async () => {
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onPickImage();
    });

    expect(mockLaunchImageLibraryAsync).not.toHaveBeenCalled();
    expect(result.current.selectedImage).toBeNull();
  });

  it('onTakePicture() launches native camera and sets selectedImage on capture', async () => {
    mockRequestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://camera-photo.jpg' }],
    });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onTakePicture();
    });

    expect(mockRequestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockLaunchCameraAsync).toHaveBeenCalledTimes(1);
    expect(mockOptimizeImageForUpload).toHaveBeenCalledWith('file://camera-photo.jpg');
    expect(result.current.selectedImage).toBe('file://camera-photo.jpg');
  });

  it('falls back to original image URI when optimization fails', async () => {
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://original.jpg' }],
    });
    mockOptimizeImageForUpload.mockRejectedValue(new Error('optimize failed'));

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onPickImage();
    });

    expect(result.current.selectedImage).toBe('file://original.jpg');
  });

  it('onTakePicture() does nothing when camera permission denied', async () => {
    mockRequestCameraPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onTakePicture();
    });

    expect(mockLaunchCameraAsync).not.toHaveBeenCalled();
    expect(result.current.selectedImage).toBeNull();
  });

  it('onTakePicture() does nothing when user cancels the camera', async () => {
    mockRequestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchCameraAsync.mockResolvedValue({
      canceled: true,
      assets: [],
    });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onTakePicture();
    });

    expect(result.current.selectedImage).toBeNull();
  });

  it('onTakePicture() handles camera launch failure gracefully', async () => {
    mockRequestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchCameraAsync.mockRejectedValue(new Error('Camera unavailable'));

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onTakePicture();
    });

    expect(result.current.selectedImage).toBeNull();
  });

  it('onPickImage() handles gallery launch failure gracefully', async () => {
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchImageLibraryAsync.mockRejectedValue(new Error('Gallery unavailable'));

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onPickImage();
    });

    expect(result.current.selectedImage).toBeNull();
  });

  it('clearSelectedImage() resets selectedImage to null', async () => {
    mockRequestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://to-clear.jpg' }],
    });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onTakePicture();
    });
    expect(result.current.selectedImage).toBe('file://to-clear.jpg');

    act(() => {
      result.current.clearSelectedImage();
    });

    expect(result.current.selectedImage).toBeNull();
  });
});
