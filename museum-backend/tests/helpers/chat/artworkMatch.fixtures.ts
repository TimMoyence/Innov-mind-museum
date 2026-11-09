import { ArtworkMatch } from '@modules/chat/domain/art-keyword/artworkMatch.entity';

export function makeArtworkMatch(overrides: Partial<ArtworkMatch> = {}): ArtworkMatch {
  return Object.assign(new ArtworkMatch(), {
    id: 'match-uuid-1',
    artworkId: 'A1',
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
    confidence: 0.92,
    source: 'test-source',
    room: 'Salle des États',
    createdAt: new Date('2026-01-02T12:00:00.000Z'),
    ...overrides,
  });
}
