/**
 * Tests for `useAudioDescriptionMode` compat shim (TD-2 Option B 2026-05-15).
 *
 * The shim wraps `useAudioDescriptionStore` and preserves the historical
 * `{ enabled, isLoading, toggle }` shape so existing call sites
 * (`SettingsAccessibilityCard`, `useChatSession`, chat session screen) keep
 * working with zero changes. This file pins the public surface.
 */
import '@/__tests__/helpers/test-utils';
import { act, renderHook } from '@testing-library/react-native';

import { useAudioDescriptionMode } from '@/features/settings/application/useAudioDescriptionMode';
import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';

describe('useAudioDescriptionMode (compat shim)', () => {
  beforeEach(() => {
    useAudioDescriptionStore.setState({ enabled: false, _hydrated: true });
  });

  it('exposes the canonical `{ enabled, isLoading, toggle }` shape', () => {
    const { result } = renderHook(() => useAudioDescriptionMode());
    expect(result.current).toEqual(
      expect.objectContaining({
        enabled: expect.any(Boolean),
        isLoading: expect.any(Boolean),
        toggle: expect.any(Function),
      }),
    );
  });

  it('mirrors enabled from the underlying Zustand store', () => {
    useAudioDescriptionStore.setState({ enabled: true, _hydrated: true });
    const { result } = renderHook(() => useAudioDescriptionMode());
    expect(result.current.enabled).toBe(true);
  });

  it('reports isLoading=true while the store is not yet hydrated', () => {
    useAudioDescriptionStore.setState({ enabled: false, _hydrated: false });
    const { result } = renderHook(() => useAudioDescriptionMode());
    expect(result.current.isLoading).toBe(true);
  });

  it('reports isLoading=false once the store is hydrated', () => {
    useAudioDescriptionStore.setState({ enabled: false, _hydrated: true });
    const { result } = renderHook(() => useAudioDescriptionMode());
    expect(result.current.isLoading).toBe(false);
  });

  it('toggle flips the underlying store and resolves', async () => {
    const { result } = renderHook(() => useAudioDescriptionMode());
    expect(result.current.enabled).toBe(false);

    await act(async () => {
      await result.current.toggle();
    });

    expect(useAudioDescriptionStore.getState().enabled).toBe(true);
  });

  it('toggle returns a Promise (preserves the async call-site contract)', async () => {
    const { result } = renderHook(() => useAudioDescriptionMode());
    let ret: Promise<void> | undefined;
    await act(async () => {
      ret = result.current.toggle();
      await ret;
    });
    expect(ret).toBeInstanceOf(Promise);
  });

  it('reactively re-renders when the store changes', () => {
    const { result } = renderHook(() => useAudioDescriptionMode());
    expect(result.current.enabled).toBe(false);

    act(() => {
      useAudioDescriptionStore.setState({ enabled: true });
    });

    expect(result.current.enabled).toBe(true);
  });
});
