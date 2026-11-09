import '@/__tests__/helpers/test-utils';
import { renderHook, act } from '@testing-library/react-native';
import { useImageManipulation } from '@/features/chat/application/useImageManipulation';

const mockManipulate = jest.fn();
const mockRotate = jest.fn();
const mockCrop = jest.fn();
const mockSaveAsync = jest.fn<Promise<{ uri: string }>, [unknown]>();

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (uri: string) => mockManipulate(uri) },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

describe('useImageManipulation', () => {
  const sourceUri = 'file:///tmp/photo.jpg';
  const resultUri = 'file:///tmp/photo-rotated.jpg';

  beforeEach(() => {
    jest.clearAllMocks();
    const context = {
      rotate: (degrees: number) => {
        mockRotate(degrees);
        return context;
      },
      crop: (rect: unknown) => {
        mockCrop(rect);
        return context;
      },
      renderAsync: () =>
        Promise.resolve({ saveAsync: (options: unknown) => mockSaveAsync(options) }),
    };
    mockManipulate.mockReturnValue(context);
    mockSaveAsync.mockResolvedValue({ uri: resultUri });
  });

  it('starts with isProcessing false', () => {
    const { result } = renderHook(() => useImageManipulation());
    expect(result.current.isProcessing).toBe(false);
  });

  it('rotates an image 90 degrees and returns the new URI', async () => {
    const { result } = renderHook(() => useImageManipulation());

    let rotatedUri: string | undefined;
    await act(async () => {
      rotatedUri = await result.current.rotateImage(sourceUri);
    });

    expect(rotatedUri).toBe(resultUri);
    expect(mockManipulate).toHaveBeenCalledWith(sourceUri);
    expect(mockRotate).toHaveBeenCalledWith(90);
    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: 0.8, format: 'jpeg' });
  });

  it('crops an image with the given region and returns the new URI', async () => {
    const { result } = renderHook(() => useImageManipulation());

    const crop = { originX: 10, originY: 20, width: 100, height: 200 };
    let croppedUri: string | undefined;
    await act(async () => {
      croppedUri = await result.current.cropImage(sourceUri, crop);
    });

    expect(croppedUri).toBe(resultUri);
    expect(mockManipulate).toHaveBeenCalledWith(sourceUri);
    expect(mockCrop).toHaveBeenCalledWith(crop);
    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: 0.8, format: 'jpeg' });
  });

  it('sets isProcessing to false after rotation completes', async () => {
    const { result } = renderHook(() => useImageManipulation());

    await act(async () => {
      await result.current.rotateImage(sourceUri);
    });

    expect(result.current.isProcessing).toBe(false);
  });

  it('resets isProcessing to false even when manipulation throws', async () => {
    mockSaveAsync.mockRejectedValue(new Error('Manipulation failed'));

    const { result } = renderHook(() => useImageManipulation());

    await act(async () => {
      await expect(result.current.rotateImage(sourceUri)).rejects.toThrow('Manipulation failed');
    });

    expect(result.current.isProcessing).toBe(false);
  });

  it('resets isProcessing to false even when crop throws', async () => {
    mockSaveAsync.mockRejectedValue(new Error('Crop failed'));

    const { result } = renderHook(() => useImageManipulation());

    await act(async () => {
      await expect(
        result.current.cropImage(sourceUri, { originX: 0, originY: 0, width: 50, height: 50 }),
      ).rejects.toThrow('Crop failed');
    });

    expect(result.current.isProcessing).toBe(false);
  });
});
