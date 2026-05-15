import type { ArtKeyword } from '@modules/chat/domain/art-keyword/artKeyword.entity';

/**
 * Creates an ArtKeyword entity with sensible defaults. Override any field via `overrides`.
 *
 * Used by integration tests under `tests/integration/retention/` and any unit
 * test that needs a typed `ArtKeyword` literal. Mirrors the pattern of
 * `tests/helpers/review/review.fixtures.ts` (object literal + cast).
 * @param overrides Partial ArtKeyword fields to override on top of the defaults.
 * @returns A fully-shaped ArtKeyword entity (cast — no validation).
 */
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
