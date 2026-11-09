import type { ArtKeyword } from '@modules/chat/domain/art-keyword/artKeyword.entity';

export const makeArtKeyword = (overrides: Partial<ArtKeyword> = {}): ArtKeyword =>
  ({
    id: 'kw-001',
    keyword: 'baroque',
    locale: 'en',
    category: 'movement',
    hitCount: 1,
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  }) as ArtKeyword;
