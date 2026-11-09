import { renderHook, act } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockDataMode = {
  resolved: 'normal' as 'low' | 'normal',
  preference: 'auto' as 'auto' | 'low' | 'normal',
  metered: false,
};

jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({
    preference: mockDataMode.preference,
    resolved: mockDataMode.resolved,
    isLowData: mockDataMode.resolved === 'low',
    metered: mockDataMode.metered,
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
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

import { useCompareImagePicker } from '@/features/chat/application/useCompareImagePicker';
import type { CompareImageFile } from '@/features/chat/application/useCompareImagePicker';

const setDataMode = (overrides: Partial<typeof mockDataMode>): void => {
  Object.assign(mockDataMode, overrides);
};

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

const firstDecisionArg = (): { upload: { maxDimensionPx: number; format: string } } => {
  const calls = mockOptimizeImageAdaptive.mock.calls;
  const decisionArg = calls[0]?.[1] as { upload: { maxDimensionPx: number; format: string } };
  if (!decisionArg) throw new Error('adaptive optimizer was not called with a decision');
  return decisionArg;
};

describe('useCompareImagePicker × useDataMode (cost+quality compression, D-06)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setDataMode({ resolved: 'normal', preference: 'auto', metered: false });
    mockOptimizeImageForUpload.mockImplementation((uri: string) => Promise.resolve(uri));
  });

  it("resolved='low' WebP upload → MIME 'image/webp' from the .webp URI", async () => {
    setDataMode({ resolved: 'low' });
    mockOptimizeImageAdaptive.mockResolvedValue({ uploadUri: 'file:///tmp/upload.webp' });

    const file = await pickForCompare();

    expect(mockOptimizeImageAdaptive).toHaveBeenCalledTimes(1);
    const decisionArg = firstDecisionArg();
    expect(decisionArg.upload.maxDimensionPx).toBe(1024);
    expect(decisionArg.upload.format).toBe('webp');

    expect(file).not.toBeNull();
    expect(file?.uri).toBe('file:///tmp/upload.webp');
    expect(file?.type).toBe('image/webp');
  });

  it("resolved='normal' + metered (pref 'auto') → AGGRESSIVE profile (1024 WebP)", async () => {
    setDataMode({ resolved: 'normal', preference: 'auto', metered: true });
    mockOptimizeImageAdaptive.mockResolvedValue({ uploadUri: 'file:///tmp/upload.webp' });

    const file = await pickForCompare();

    expect(mockOptimizeImageAdaptive).toHaveBeenCalledTimes(1);
    const decisionArg = firstDecisionArg();
    expect(decisionArg.upload.maxDimensionPx).toBe(1024);
    expect(decisionArg.upload.format).toBe('webp');
    expect(file?.type).toBe('image/webp');
  });

  it("resolved='normal' + non-metered → LEGACY profile (1600 JPEG)", async () => {
    setDataMode({ resolved: 'normal', preference: 'auto', metered: false });
    mockOptimizeImageAdaptive.mockResolvedValue({ uploadUri: 'file:///tmp/upload.jpg' });

    const file = await pickForCompare();

    expect(mockOptimizeImageAdaptive).toHaveBeenCalledTimes(1);
    const decisionArg = firstDecisionArg();
    expect(decisionArg.upload.maxDimensionPx).toBe(1600);
    expect(decisionArg.upload.format).toBe('jpeg');
    expect(file?.type).toBe('image/jpeg');
  });

  it('WebP fallback to JPEG → MIME image/jpeg from the .jpg URI', async () => {
    setDataMode({ resolved: 'low' });
    mockOptimizeImageAdaptive.mockResolvedValue({ uploadUri: 'file:///tmp/upload.jpg' });

    const file = await pickForCompare();

    expect(file).not.toBeNull();
    expect(file?.uri).toBe('file:///tmp/upload.jpg');
    expect(file?.type).toBe('image/jpeg');
  });
});
