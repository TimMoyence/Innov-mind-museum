import '@/__tests__/helpers/test-utils';
import { renderHook, act } from '@testing-library/react-native';
import { useImageManipulation } from '@/features/chat/application/useImageManipulation';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockManipulateAsync = jest.fn<Promise<{ uri: string }>, [string, unknown[], unknown]>();

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: [string, unknown[], unknown]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useImageManipulation', () => {
  const sourceUri = 'file:///tmp/photo.jpg';
  const resultUri = 'file:///tmp/photo-rotated.jpg';

  beforeEach(() => {
    jest.clearAllMocks();
    mockManipulateAsync.mockResolvedValue({ uri: resultUri });
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
    expect(mockManipulateAsync).toHaveBeenCalledWith(sourceUri, [{ rotate: 90 }], {
      compress: 0.8,
      format: 'jpeg',
    });
  });

  it('crops an image with the given region and returns the new URI', async () => {
    const { result } = renderHook(() => useImageManipulation());

    const crop = { originX: 10, originY: 20, width: 100, height: 200 };
    let croppedUri: string | undefined;
    await act(async () => {
      croppedUri = await result.current.cropImage(sourceUri, crop);
    });

    expect(croppedUri).toBe(resultUri);
    expect(mockManipulateAsync).toHaveBeenCalledWith(sourceUri, [{ crop }], {
      compress: 0.8,
      format: 'jpeg',
    });
  });

  it('sets isProcessing to false after rotation completes', async () => {
    const { result } = renderHook(() => useImageManipulation());

    await act(async () => {
      await result.current.rotateImage(sourceUri);
    });

    expect(result.current.isProcessing).toBe(false);
  });

  it('resets isProcessing to false even when manipulation throws', async () => {
    mockManipulateAsync.mockRejectedValue(new Error('Manipulation failed'));

    const { result } = renderHook(() => useImageManipulation());

    await act(async () => {
      try {
        await result.current.rotateImage(sourceUri);
      } catch {
        // Expected to throw
      }
    });

    expect(result.current.isProcessing).toBe(false);
  });

  it('resets isProcessing to false even when crop throws', async () => {
    mockManipulateAsync.mockRejectedValue(new Error('Crop failed'));

    const { result } = renderHook(() => useImageManipulation());

    await act(async () => {
      try {
        await result.current.cropImage(sourceUri, {
          originX: 0,
          originY: 0,
          width: 50,
          height: 50,
        });
      } catch {
        // Expected to throw
      }
    });

    expect(result.current.isProcessing).toBe(false);
  });

  it('uses JPEG format and 0.8 compression for both operations', async () => {
    const { result } = renderHook(() => useImageManipulation());

    await act(async () => {
      await result.current.rotateImage(sourceUri);
    });

    const callArgs = mockManipulateAsync.mock.calls[0]!;
    expect(callArgs[2]).toEqual({ compress: 0.8, format: 'jpeg' });
  });
});
