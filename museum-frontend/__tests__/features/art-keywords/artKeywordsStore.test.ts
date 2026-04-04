import '@/__tests__/helpers/test-utils';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

import { useArtKeywordsStore } from '@/features/art-keywords/infrastructure/artKeywordsStore';
import type { ArtKeywordDTO } from '@/features/art-keywords/domain/contracts';

const makeKeyword = (overrides: Partial<ArtKeywordDTO> = {}): ArtKeywordDTO => ({
  id: 'kw-1',
  keyword: 'impressionism',
  locale: 'en',
  category: 'movement',
  updatedAt: '2026-04-04T10:00:00Z',
  ...overrides,
});

describe('artKeywordsStore', () => {
  beforeEach(() => {
    useArtKeywordsStore.setState({ keywordsByLocale: {}, lastSyncedAt: {} });
  });

  it('starts with empty state', () => {
    expect(useArtKeywordsStore.getState().getKeywords('fr')).toEqual([]);
    expect(useArtKeywordsStore.getState().getLastSyncedAt('fr')).toBeUndefined();
  });

  it('merges keywords for a locale', () => {
    const kw1 = makeKeyword({ id: 'kw-1', keyword: 'baroque' });
    const syncedAt = '2026-04-04T12:00:00Z';

    useArtKeywordsStore.getState().mergeKeywords('fr', [kw1], syncedAt);

    expect(useArtKeywordsStore.getState().getKeywords('fr')).toEqual([kw1]);
    expect(useArtKeywordsStore.getState().getLastSyncedAt('fr')).toBe(syncedAt);
  });

  it('merges without duplicates (updates existing by id)', () => {
    const kw1 = makeKeyword({ id: 'kw-1', keyword: 'baroque', locale: 'fr' });
    const kw1Updated = makeKeyword({ id: 'kw-1', keyword: 'baroque updated', locale: 'fr' });
    const kw2 = makeKeyword({ id: 'kw-2', keyword: 'cubism', locale: 'fr' });

    useArtKeywordsStore.getState().mergeKeywords('fr', [kw1], '2026-04-04T10:00:00Z');
    useArtKeywordsStore.getState().mergeKeywords('fr', [kw1Updated, kw2], '2026-04-04T12:00:00Z');

    const stored = useArtKeywordsStore.getState().getKeywords('fr');
    expect(stored).toHaveLength(2);
    expect(stored.find((k) => k.id === 'kw-1')?.keyword).toBe('baroque updated');
  });

  it('keeps locales independent', () => {
    const kwFr = makeKeyword({ id: 'kw-fr', locale: 'fr' });
    const kwEn = makeKeyword({ id: 'kw-en', locale: 'en' });

    useArtKeywordsStore.getState().mergeKeywords('fr', [kwFr], '2026-04-04T10:00:00Z');
    useArtKeywordsStore.getState().mergeKeywords('en', [kwEn], '2026-04-04T11:00:00Z');

    expect(useArtKeywordsStore.getState().getKeywords('fr')).toHaveLength(1);
    expect(useArtKeywordsStore.getState().getKeywords('en')).toHaveLength(1);
  });
});
