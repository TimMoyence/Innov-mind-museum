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
    expect(result.current.status).not.toBe('idle');
  });
});
