import { ArtworkMatch } from '@modules/chat/domain/art-keyword/artworkMatch.entity';

/**
 * Cycle 4 (DSAR Art.15/20 — B-03) — factory for `ArtworkMatch` rows. An
 * `ArtworkMatch` is an artwork recognised by the AI from a user photo, attached
 * 1-N to a `ChatMessage`. It is personal data: the erasure path already deletes
 * it (CASCADE) but the export omits it — the defect this cycle proves.
 *
 * Used by the chat-repository integration test (`exportUserData` describe) to
 * seed recognised artworks on messages, so the export can be asserted to
 * include them.
 *
 * Note: the export DTO MUST expose only the business columns
 * `{ artworkId, title, artist, confidence, source, room, createdAt }` (design
 * D-2) — NEVER the uuid PK `id` nor the FK `message`. The factory still seeds
 * `id`/`message` so tests can assert their ABSENCE in the exported payload.
 * @param overrides - Partial entity override merged on top of the defaults.
 */
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
