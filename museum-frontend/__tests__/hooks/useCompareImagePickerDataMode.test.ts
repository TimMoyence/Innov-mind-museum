/**
 * RED — W1-D1FE-07.
 *
 * The compare picker (`useCompareImagePicker`) must read `useDataMode().resolved`
 * and drive the NEW adaptive optimizer with the edge profile when on a weak
 * network, then derive the MIME type from the optimized URI extension:
 * - resolved='low' + WebP upload → `CompareImageFile.type === 'image/webp'`
 *   (uploadUri ends `.webp`).
 * - WebP fallback to JPEG       → `CompareImageFile.type === 'image/jpeg'`.
 *
 * `_internals.normalizeImageMimeTypeFromExtension` is the REAL implementation
 * (URI extension → MIME). The picker does not call the adaptive optimizer yet,
 * so the WebP MIME assertion fails (RED).
 */
import { renderHook, act } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockResolved = { value: 'normal' as 'low' | 'normal' };

jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({
    preference: 'auto',
    resolved: mockResolved.value,
    isLowData: mockResolved.value === 'low',
    setPreference: () => undefined,
  }),
}));

const mockOptimizeImageAdaptive = jest.fn();
const mockOptimizeImageForUpload = jest.fn<Promise<string>, [string]>();

jest.mock('@/features/chat/application/imageUploadOptimization', () => ({
  optimizeImageForUpload: (...args: unknown[]) => mockOptimizeImageForUpload(args[0] as string),
  optimizeImageAdaptive: (...args: unknown[]) => mockOptimizeImageAdaptive(...args),
}));

const mockRequestMediaLibraryPermissionsAsync = jest.fn<Promise<{ status: string }>, []>();
const mockLaunchImageLibraryAsync = jest.fn<
  Promise<{ canceled: boolean; assets: { uri: string }[] }>,
  []
>();

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissionsAsync(),
  launchImageLibraryAsync: () => mockLaunchImageLibraryAsync(),
}));

import { useCompareImagePicker } from '@/features/chat/application/useCompareImagePicker';
import type { CompareImageFile } from '@/features/chat/application/useCompareImagePicker';

const pickForCompare = async (): Promise<CompareImageFile | null> => {
  mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockLaunchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///tmp/picked.jpg' }],
  });
  const { result } = renderHook(() => useCompareImagePicker());
  let file: CompareImageFile | null = null;
  await act(async () => {
    file = await result.current.pickForCompare();
  });
  return file;
};

describe('useCompareImagePicker × useDataMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOptimizeImageForUpload.mockImplementation((uri: string) => Promise.resolve(uri));
  });

  it("resolved='low' WebP upload → MIME 'image/webp' from the .webp URI", async () => {
    mockResolved.value = 'low';
    mockOptimizeImageAdaptive.mockResolvedValue({ uploadUri: 'file:///tmp/upload.webp' });

    const file = await pickForCompare();

    expect(mockOptimizeImageAdaptive).toHaveBeenCalledTimes(1);
    const decisionArg = mockOptimizeImageAdaptive.mock.calls[0]?.[1] as {
      upload: { maxDimensionPx: number; format: string };
    };
    if (!decisionArg) throw new Error('adaptive optimizer was not called with a decision');
    expect(decisionArg.upload.maxDimensionPx).toBe(1024);
    expect(decisionArg.upload.format).toBe('webp');

    expect(file).not.toBeNull();
    expect(file?.uri).toBe('file:///tmp/upload.webp');
    expect(file?.type).toBe('image/webp');
  });

  it('WebP fallback to JPEG → MIME image/jpeg from the .jpg URI', async () => {
    mockResolved.value = 'low';
    mockOptimizeImageAdaptive.mockResolvedValue({ uploadUri: 'file:///tmp/upload.jpg' });

    const file = await pickForCompare();

    expect(file).not.toBeNull();
    expect(file?.uri).toBe('file:///tmp/upload.jpg');
    expect(file?.type).toBe('image/jpeg');
  });
});
