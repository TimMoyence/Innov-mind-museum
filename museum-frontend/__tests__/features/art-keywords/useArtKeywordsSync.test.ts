import '@/__tests__/helpers/test-utils';
import { renderHook, waitFor } from '@testing-library/react-native';

import type { ArtKeywordListResponse } from '@/features/art-keywords/domain/contracts';

const mockSyncKeywords = jest.fn<Promise<ArtKeywordListResponse>, [string, string?]>();

jest.mock('@/features/art-keywords/infrastructure/artKeywordsApi', () => ({
  syncKeywords: (...args: [string, string?]) => mockSyncKeywords(...args),
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  getLocale: () => 'fr',
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

const mockIsConnected = { value: true };
jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => ({ isConnected: mockIsConnected.value, isInternetReachable: true }),
}));

import { useArtKeywordsSync } from '@/features/art-keywords/application/useArtKeywordsSync';
import { useArtKeywordsStore } from '@/features/art-keywords/infrastructure/artKeywordsStore';

describe('useArtKeywordsSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected.value = true;
    useArtKeywordsStore.setState({ keywordsByLocale: {}, lastSyncedAt: {} });
  });

  it('syncs on mount when never synced', async () => {
    const response = {
      keywords: [
        {
          id: 'kw-1',
          keyword: 'baroque',
          locale: 'fr',
          category: 'movement',
          updatedAt: '2026-04-04T10:00:00Z',
        },
      ],
      syncedAt: '2026-04-04T10:00:00Z',
    };
    mockSyncKeywords.mockResolvedValue(response);

    renderHook(() => {
      useArtKeywordsSync();
    });

    await waitFor(() => {
      expect(mockSyncKeywords).toHaveBeenCalledWith('fr', undefined);
    });

    expect(useArtKeywordsStore.getState().getKeywords('fr')).toHaveLength(1);
  });

  it('skips sync when offline', async () => {
    mockIsConnected.value = false;

    renderHook(() => {
      useArtKeywordsSync();
    });

    // Give the effect time to potentially fire
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSyncKeywords).not.toHaveBeenCalled();
  });

  it('performs delta sync using lastSyncedAt', async () => {
    const oldSync = '2026-03-01T00:00:00Z';
    useArtKeywordsStore.setState({ lastSyncedAt: { fr: oldSync } });
    mockSyncKeywords.mockResolvedValue({ keywords: [], syncedAt: '2026-04-04T10:00:00Z' });

    renderHook(() => {
      useArtKeywordsSync();
    });

    await waitFor(() => {
      expect(mockSyncKeywords).toHaveBeenCalledWith('fr', oldSync);
    });
  });

  it('silently handles API errors', async () => {
    mockSyncKeywords.mockRejectedValue(new Error('Network error'));

    // Should not throw
    renderHook(() => {
      useArtKeywordsSync();
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(useArtKeywordsStore.getState().getKeywords('fr')).toEqual([]);
  });
});
