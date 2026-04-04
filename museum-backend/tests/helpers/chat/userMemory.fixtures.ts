import { UserMemory } from '@modules/chat/domain/userMemory.entity';

/**
 * Creates a UserMemory entity with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export function makeMemory(overrides: Partial<UserMemory> = {}): UserMemory {
  return Object.assign(new UserMemory(), {
    id: 'mem-uuid',
    userId: 42,
    preferredExpertise: 'beginner',
    favoritePeriods: [],
    favoriteArtists: ['Monet'],
    museumsVisited: ['Louvre'],
    totalArtworksDiscussed: 3,
    notableArtworks: [],
    interests: [],
    summary: null,
    sessionCount: 2,
    lastSessionId: 'sess-prev',
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}
