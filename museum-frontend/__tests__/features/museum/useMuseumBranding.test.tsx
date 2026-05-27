/**
 * RED-4 — `useMuseumBranding(museumId)` fetch hook (C4 co-branding,
 * run 2026-05-26-kr-product).
 *
 * Phase: RED (UFR-022). MUST FAIL — the hook
 * `features/museum/application/useMuseumBranding` does not exist yet.
 *
 * Asserts (spec-c4 R2/R10/R11):
 *   - active branded museumId>0 → returns the parsed branding;
 *     `museumApi.getMuseum` called EXACTLY ONCE across re-renders/re-mounts
 *     within the same QueryClient (R10 dedup);
 *   - museumId null / <= 0 → `getMuseum` NEVER called, branding `{}`,
 *     status idle (R2 — synthetic/OSM entries don't fetch);
 *   - `getMuseum` rejects → branding `{}`, hook does NOT throw and exposes no
 *     blocking error UI (R11 fail-open).
 *
 * lib-docs consulted: @tanstack/react-query/PATTERNS.md:69,83,101 (queryKey
 * includes every var, `enabled` gating, staleTime), react-native/PATTERNS.md
 * (renderHook). Uses `renderHookWithQueryClient` (retry:false test client).
 */

import { waitFor } from '@testing-library/react-native';

import {
  createTestQueryClient,
  renderHookWithQueryClient,
} from '../../helpers/data/renderWithQueryClient';
import { makeMuseumBranding, makeMuseumDetail } from '../../helpers/factories';

import type { MuseumBranding } from '@/features/museum/domain/museum-branding';

const mockGetMuseum = jest.fn<Promise<unknown>, [string]>();
jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: {
    getMuseum: (idOrSlug: string) => mockGetMuseum(idOrSlug),
  },
}));

interface UseMuseumBrandingResult {
  branding: MuseumBranding;
  status: string;
}

// Lazy require so the missing-hook failure surfaces inside each test (RED)
// rather than crashing the whole suite at import time.
const useMuseumBranding = (museumId: number | null): UseMuseumBrandingResult => {
  const mod = require('@/features/museum/application/useMuseumBranding') as {
    useMuseumBranding: (museumId: number | null) => UseMuseumBrandingResult;
  };
  return mod.useMuseumBranding(museumId);
};

describe('useMuseumBranding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches once for a branded active museum and returns the parsed branding', async () => {
    mockGetMuseum.mockResolvedValue(
      makeMuseumDetail({ config: { branding: makeMuseumBranding() } }),
    );

    const { result } = renderHookWithQueryClient(() => useMuseumBranding(42));

    await waitFor(() => {
      expect(result.current.branding.primaryColor).toBe('#6B46C1');
    });
    expect(result.current.branding.logoUrl).toBe('https://cdn.example.org/logo.png');
    expect(mockGetMuseum).toHaveBeenCalledTimes(1);
    expect(mockGetMuseum).toHaveBeenCalledWith('42');
  });

  it('de-duplicates the fetch across re-renders within the same QueryClient (R10)', async () => {
    mockGetMuseum.mockResolvedValue(
      makeMuseumDetail({ config: { branding: makeMuseumBranding() } }),
    );

    const client = createTestQueryClient();
    const { result, rerender } = renderHookWithQueryClient(() => useMuseumBranding(42), {
      queryClient: client,
    });

    await waitFor(() => {
      expect(result.current.branding.primaryColor).toBe('#6B46C1');
    });

    rerender(undefined);
    rerender(undefined);

    expect(mockGetMuseum).toHaveBeenCalledTimes(1);
  });

  it('does NOT fetch when museumId is null and returns empty branding (R2)', async () => {
    const { result } = renderHookWithQueryClient(() => useMuseumBranding(null));

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
    expect(result.current.branding).toEqual({});
    expect(mockGetMuseum).not.toHaveBeenCalled();
  });

  it('does NOT fetch when museumId is <= 0 (synthetic / OSM entry) (R2)', async () => {
    const { result } = renderHookWithQueryClient(() => useMuseumBranding(0));

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
    expect(mockGetMuseum).not.toHaveBeenCalled();
  });

  it('fails open: getMuseum rejection → empty branding, no throw, no blocking error (R11)', async () => {
    mockGetMuseum.mockRejectedValue(new Error('Network down'));

    const { result } = renderHookWithQueryClient(() => useMuseumBranding(42));

    await waitFor(() => {
      expect(mockGetMuseum).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.branding).toEqual({});
    });
    // Fail-open: the visitor never sees a branding error.
    expect(result.current.status).not.toBe('idle');
  });
});
