/**
 * RED — C-R2 (cluster cost-consumers, run undefined-network-detection-reliability).
 *
 * CONTRACT CHANGE (spec §10 invalidated #10, design §2.5/D-06): the chat-send
 * picker (`useImagePicker`) now feeds the adaptive optimizer through
 * `decideCompression(resolveCompressionMode({ resolved, preference, metered }), true)`
 * — the three values read from `useDataMode()`. Matrix:
 * - resolved='low'                          → aggressive 1024 WebP (unchanged);
 * - resolved='normal' + metered, pref 'auto' → aggressive 1024 WebP (US-02.3 —
 *   an upload's volume is a COST; the old contract was unconditionally legacy);
 * - resolved='normal' + non-metered          → LEGACY 1600 JPEG (unchanged);
 * - resolved='normal' + metered, pref 'normal' → LEGACY 1600 JPEG (US-08.2 —
 *   explicit preference bypasses the cost gate, INV-03).
 *
 * `useImagePicker.test.ts` (frozen cases) is NOT touched. This file mocks
 * `useDataMode` + the adaptive optimizer and asserts the arg the picker passes.
 */
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

const setDataMode = (overrides: Partial<typeof mockDataMode>): void => {
  Object.assign(mockDataMode, overrides);
};

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

describe('useImagePicker × useDataMode (cost+quality compression, D-06)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setDataMode({ resolved: 'normal', preference: 'auto', metered: false });
    mockOptimizeImageAdaptive.mockResolvedValue({ uploadUri: 'file:///tmp/picked.webp' });
    mockOptimizeImageForUpload.mockImplementation((uri: string) => Promise.resolve(uri));
  });

  it("resolved='low' → adaptive optimizer invoked with the AGGRESSIVE upload profile (1024 WebP)", async () => {
    setDataMode({ resolved: 'low' });

    await pickOne();

    expect(mockOptimizeImageAdaptive).toHaveBeenCalledTimes(1);
    const decision = firstDecisionArg();
    expect(decision.upload.maxDimensionPx).toBe(1024);
    expect(decision.upload.format).toBe('webp');
  });

  // US-02.3 / INV-02 — metered in auto compresses aggressively even on a healthy network.
  it("resolved='normal' + metered (pref 'auto') → AGGRESSIVE profile (1024 WebP)", async () => {
    setDataMode({ resolved: 'normal', preference: 'auto', metered: true });

    await pickOne();

    expect(mockOptimizeImageAdaptive).toHaveBeenCalledTimes(1);
    const decision = firstDecisionArg();
    expect(decision.upload.maxDimensionPx).toBe(1024);
    expect(decision.upload.format).toBe('webp');
  });

  it("resolved='normal' + non-metered → LEGACY profile (1600 JPEG)", async () => {
    setDataMode({ resolved: 'normal', preference: 'auto', metered: false });

    await pickOne();

    expect(mockOptimizeImageAdaptive).toHaveBeenCalledTimes(1);
    const decision = firstDecisionArg();
    expect(decision.upload.maxDimensionPx).toBe(1600);
    expect(decision.upload.format).toBe('jpeg');
  });

  // US-08.2 / INV-03 — explicit 'normal' preference bypasses the metered cost gate.
  it("resolved='normal' + metered (pref 'normal') → LEGACY profile (1600 JPEG)", async () => {
    setDataMode({ resolved: 'normal', preference: 'normal', metered: true });

    await pickOne();

    expect(mockOptimizeImageAdaptive).toHaveBeenCalledTimes(1);
    const decision = firstDecisionArg();
    expect(decision.upload.maxDimensionPx).toBe(1600);
    expect(decision.upload.format).toBe('jpeg');
  });
});
