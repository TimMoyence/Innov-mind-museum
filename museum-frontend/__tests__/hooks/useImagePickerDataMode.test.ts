/**
 * RED — W1-D1FE-06.
 *
 * The chat-send picker (`useImagePicker`) must read `useDataMode().resolved`
 * and drive the NEW adaptive optimizer with the matching profile:
 * - resolved='low'    → adaptive optimizer called with the EDGE upload profile
 *                       (1024px WebP) — the small-upload path.
 * - resolved='normal' → adaptive optimizer called with the LEGACY profile
 *                       (1600px JPEG, no localDerivative).
 *
 * `useImagePicker.test.ts` (10 frozen cases) is NOT touched. This file mocks
 * `useDataMode` + the adaptive optimizer and asserts the arg the picker passes.
 * The picker does not call the adaptive optimizer yet → assertions fail (RED).
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
  requestCameraPermissionsAsync: () => Promise.resolve({ status: 'denied' }),
  launchCameraAsync: () => Promise.resolve({ canceled: true, assets: [] }),
}));

import { useImagePicker } from '@/features/chat/application/useImagePicker';

const pickOne = async () => {
  mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockLaunchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///tmp/picked.jpg' }],
  });
  const { result } = renderHook(() => useImagePicker());
  await act(async () => {
    await result.current.onPickImage();
  });
  return result;
};

const firstDecisionArg = (): { upload: { maxDimensionPx: number; format: string } } => {
  const calls = mockOptimizeImageAdaptive.mock.calls;
  const decisionArg = calls[0]?.[1] as { upload: { maxDimensionPx: number; format: string } };
  if (!decisionArg) throw new Error('adaptive optimizer was not called with a decision');
  return decisionArg;
};

describe('useImagePicker × useDataMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOptimizeImageAdaptive.mockResolvedValue({ uploadUri: 'file:///tmp/picked.webp' });
    mockOptimizeImageForUpload.mockImplementation((uri: string) => Promise.resolve(uri));
  });

  it("resolved='low' → adaptive optimizer invoked with the EDGE upload profile (1024 WebP)", async () => {
    mockResolved.value = 'low';

    await pickOne();

    expect(mockOptimizeImageAdaptive).toHaveBeenCalledTimes(1);
    const decision = firstDecisionArg();
    expect(decision.upload.maxDimensionPx).toBe(1024);
    expect(decision.upload.format).toBe('webp');
  });

  it("resolved='normal' → adaptive optimizer invoked with the LEGACY profile (1600 JPEG)", async () => {
    mockResolved.value = 'normal';

    await pickOne();

    expect(mockOptimizeImageAdaptive).toHaveBeenCalledTimes(1);
    const decision = firstDecisionArg();
    expect(decision.upload.maxDimensionPx).toBe(1600);
    expect(decision.upload.format).toBe('jpeg');
  });
});
