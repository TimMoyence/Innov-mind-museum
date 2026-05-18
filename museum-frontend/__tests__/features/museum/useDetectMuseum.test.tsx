/**
 * Tests — `useDetectMuseum(lat, lng)` hook (W3 cluster B).
 *
 * Asserts:
 *   - GPS gate: null coords → no fetch, `{ result: null, isLoading: false }`.
 *   - Calls `museumApi.detectMuseum({ lat, lng })` exactly once per ~111 m tile.
 *   - Returns the BE detection payload verbatim through `result`.
 *   - Tolerates API rejection silently — `result` stays null, `error` set.
 *
 * Spec : team-state W3 R11.
 */

import { renderHook, waitFor } from '@testing-library/react-native';

import '../../helpers/test-utils';

const mockDetectMuseum = jest.fn<Promise<unknown>, [unknown]>();
jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: {
    detectMuseum: (params: unknown) => mockDetectMuseum(params),
  },
}));

import { useDetectMuseum } from '@/features/museum/application/useDetectMuseum';

describe('useDetectMuseum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips the fetch when coords are null and resolves to a null result', async () => {
    const { result } = renderHook(() => useDetectMuseum(null, null));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockDetectMuseum).not.toHaveBeenCalled();
  });

  it('fetches detect-museum with provided lat/lng and exposes the result', async () => {
    mockDetectMuseum.mockResolvedValue({
      museumId: 7,
      confidence: 1,
      distance: 0,
      name: 'Louvre',
    });

    const { result } = renderHook(() => useDetectMuseum(48.8606, 2.3376));
    await waitFor(() => {
      expect(result.current.result).not.toBeNull();
    });

    expect(mockDetectMuseum).toHaveBeenCalledTimes(1);
    expect(mockDetectMuseum).toHaveBeenCalledWith({ lat: 48.8606, lng: 2.3376 });
    expect(result.current.result).toEqual({
      museumId: 7,
      confidence: 1,
      distance: 0,
      name: 'Louvre',
    });
    expect(result.current.error).toBeNull();
  });

  it('exposes the confidence bucket (0, 1) used by the bottom-sheet branch', async () => {
    mockDetectMuseum.mockResolvedValue({
      museumId: 42,
      confidence: 0.6,
      distance: 200,
      name: "Musée d'Orsay",
    });

    const { result } = renderHook(() => useDetectMuseum(48.86, 2.326));
    await waitFor(() => {
      expect(result.current.result).not.toBeNull();
    });

    expect(result.current.result?.confidence).toBe(0.6);
    expect(result.current.result?.museumId).toBe(42);
  });

  it('exposes the null-museum response when nothing is within range', async () => {
    mockDetectMuseum.mockResolvedValue({
      museumId: null,
      confidence: 0,
      distance: null,
      name: null,
    });

    const { result } = renderHook(() => useDetectMuseum(0, 0));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.result?.museumId).toBeNull();
    expect(result.current.result?.confidence).toBe(0);
  });

  it('does NOT throw when detectMuseum rejects — surfaces error message instead', async () => {
    mockDetectMuseum.mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useDetectMuseum(48.8606, 2.3376));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('Network down');
  });

  it('de-duplicates fetches across re-renders with identical 3-dec tile coords', async () => {
    mockDetectMuseum.mockResolvedValue({
      museumId: 7,
      confidence: 1,
      distance: 0,
      name: 'Louvre',
    });
    const { rerender, result } = renderHook(
      ({ lat, lng }: { lat: number | null; lng: number | null }) => useDetectMuseum(lat, lng),
      { initialProps: { lat: 48.8606 as number | null, lng: 2.3376 as number | null } },
    );

    await waitFor(() => {
      expect(result.current.result).not.toBeNull();
    });

    // Tiny GPS jitter inside the same 3-dec tile (~111 m). Same key → no refetch.
    rerender({ lat: 48.86061, lng: 2.33759 });
    rerender({ lat: 48.86058, lng: 2.33762 });

    expect(mockDetectMuseum).toHaveBeenCalledTimes(1);
  });
});
