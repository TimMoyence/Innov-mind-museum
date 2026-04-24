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

import {
  canRetryAfterFailure,
  computeSyncIntervalMs,
  isKeywordCacheStale,
  useArtKeywordsSync,
} from '@/features/art-keywords/application/useArtKeywordsSync';
import { useArtKeywordsStore } from '@/features/art-keywords/infrastructure/artKeywordsStore';

const MS_IN_DAY = 24 * 60 * 60 * 1000;

describe('useArtKeywordsSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected.value = true;
    useArtKeywordsStore.setState({
      keywordsByLocale: {},
      lastSyncedAt: {},
      failuresByLocale: {},
    });
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

  it('records a failure when the API call rejects', async () => {
    mockSyncKeywords.mockRejectedValue(new Error('Network error'));

    renderHook(() => {
      useArtKeywordsSync();
    });

    await waitFor(() => {
      expect(mockSyncKeywords).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(useArtKeywordsStore.getState().getSyncFailure('fr')?.attempts).toBe(1);
    });
    expect(useArtKeywordsStore.getState().getKeywords('fr')).toEqual([]);
  });

  it('resets the failure counter on a successful sync', async () => {
    useArtKeywordsStore.setState({
      failuresByLocale: {
        fr: { lastFailedAt: '2026-04-04T09:00:00Z', attempts: 2 },
      },
    });
    mockSyncKeywords.mockResolvedValue({
      keywords: [],
      syncedAt: '2026-04-04T10:00:00Z',
    });

    renderHook(() => {
      useArtKeywordsSync();
    });

    await waitFor(() => {
      expect(useArtKeywordsStore.getState().getSyncFailure('fr')).toBeUndefined();
    });
  });

  it('treats a rewound device clock as stale and forces a refresh', async () => {
    // lastSynced is IN THE FUTURE relative to the current clock — simulates
    // the device rebooting into a rewound time. Naive elapsed > 24h check
    // would silently skip forever; we must still attempt sync.
    useArtKeywordsStore.setState({
      lastSyncedAt: { fr: '2030-01-01T00:00:00Z' },
    });
    mockSyncKeywords.mockResolvedValue({
      keywords: [],
      syncedAt: '2026-04-04T10:00:00Z',
    });

    renderHook(() => {
      useArtKeywordsSync({ clock: () => new Date('2026-04-04T10:00:00Z').getTime() });
    });

    await waitFor(() => {
      expect(mockSyncKeywords).toHaveBeenCalled();
    });
  });
});

describe('isKeywordCacheStale', () => {
  const now = new Date('2026-04-24T12:00:00Z').getTime();

  it('is stale when never synced', () => {
    expect(isKeywordCacheStale(undefined, now)).toBe(true);
  });

  it('is fresh within the 24h window', () => {
    const recent = new Date(now - 60 * 60 * 1000).toISOString(); // 1h ago
    expect(isKeywordCacheStale(recent, now)).toBe(false);
  });

  it('is stale past the 24h window', () => {
    const old = new Date(now - 25 * 60 * 60 * 1000).toISOString();
    expect(isKeywordCacheStale(old, now)).toBe(true);
  });

  it('is stale when the clock has rewound (lastSynced > now)', () => {
    const future = new Date(now + 60 * 60 * 1000).toISOString();
    expect(isKeywordCacheStale(future, now)).toBe(true);
  });

  it('is stale when the stored timestamp is unparseable', () => {
    expect(isKeywordCacheStale('not-a-date', now)).toBe(true);
  });
});

describe('canRetryAfterFailure', () => {
  const now = new Date('2026-04-24T12:00:00Z').getTime();

  it('allows retry when no failure recorded', () => {
    expect(canRetryAfterFailure(undefined, undefined, now)).toBe(true);
    expect(canRetryAfterFailure(0, undefined, now)).toBe(true);
  });

  it('blocks retry once MAX_RETRY_ATTEMPTS is reached', () => {
    const lastFailed = new Date(now - 60 * 60 * 1000).toISOString();
    expect(canRetryAfterFailure(3, lastFailed, now)).toBe(false);
  });

  it('blocks retry when backoff window has not elapsed', () => {
    const lastFailed = new Date(now - 30 * 1000).toISOString(); // 30s ago
    expect(canRetryAfterFailure(1, lastFailed, now)).toBe(false);
  });

  it('allows retry once backoff window has elapsed', () => {
    const lastFailed = new Date(now - 5 * 60 * 1000).toISOString(); // 5min ago
    expect(canRetryAfterFailure(1, lastFailed, now)).toBe(true);
  });

  it('allows retry when the clock rewound past the failure time', () => {
    const lastFailed = new Date(now + 60 * 60 * 1000).toISOString();
    expect(canRetryAfterFailure(2, lastFailed, now)).toBe(true);
  });

  it('blocks after 3 consecutive failures even if a lot of time passed', () => {
    // Once we hit the cap we wait for the next natural 24h cycle
    // (which is driven by the staleness check, not this retry gate).
    const lastFailed = new Date(now - 10 * MS_IN_DAY).toISOString();
    expect(canRetryAfterFailure(3, lastFailed, now)).toBe(false);
  });
});

describe('computeSyncIntervalMs jitter bounds', () => {
  const base = 24 * 60 * 60 * 1000;
  const max = Math.round(base * 1.1);
  const min = Math.round(base * 0.9);

  it('stays within ±10% for the minimum random draw', () => {
    const result = computeSyncIntervalMs(() => 0);
    expect(result).toBeGreaterThanOrEqual(min);
    expect(result).toBeLessThanOrEqual(base);
  });

  it('stays within ±10% for the maximum random draw', () => {
    const result = computeSyncIntervalMs(() => 0.999999);
    expect(result).toBeGreaterThanOrEqual(base);
    expect(result).toBeLessThanOrEqual(max);
  });

  it('matches the base interval for a midpoint random draw', () => {
    expect(computeSyncIntervalMs(() => 0.5)).toBe(base);
  });

  it('stays within bounds across many random draws', () => {
    for (let i = 0; i < 50; i += 1) {
      const result = computeSyncIntervalMs();
      expect(result).toBeGreaterThanOrEqual(min);
      expect(result).toBeLessThanOrEqual(max);
    }
  });
});

describe('retry backoff behaviour (integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected.value = true;
    useArtKeywordsStore.setState({
      keywordsByLocale: {},
      lastSyncedAt: {},
      failuresByLocale: {},
    });
  });

  it('skips sync when already at the retry cap', async () => {
    const now = new Date('2026-04-24T12:00:00Z').getTime();
    useArtKeywordsStore.setState({
      failuresByLocale: {
        fr: { lastFailedAt: new Date(now - 60 * 60 * 1000).toISOString(), attempts: 3 },
      },
    });

    renderHook(() => {
      useArtKeywordsSync({ clock: () => now });
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockSyncKeywords).not.toHaveBeenCalled();
  });

  it('skips sync when the backoff window has not elapsed after 1 failure', async () => {
    const now = new Date('2026-04-24T12:00:00Z').getTime();
    useArtKeywordsStore.setState({
      failuresByLocale: {
        fr: { lastFailedAt: new Date(now - 10 * 1000).toISOString(), attempts: 1 },
      },
    });

    renderHook(() => {
      useArtKeywordsSync({ clock: () => now });
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockSyncKeywords).not.toHaveBeenCalled();
  });
});
