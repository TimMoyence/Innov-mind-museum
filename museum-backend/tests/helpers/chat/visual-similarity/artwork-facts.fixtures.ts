/**
 * Shared factory for {@link ArtworkFacts} payloads used by the
 * visual-similarity test suite.
 *
 * Per CLAUDE.md test discipline (UFR-002), no test file may construct an
 * `ArtworkFacts` object inline — go through {@link makeArtworkFacts} so the
 * default Mona-Lisa shape stays consistent across the unit + integration
 * tiers (Wikidata enricher tests, scoring tests, rationale tests).
 */
import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

/**
 * Build a deterministic {@link ArtworkFacts} payload with sensible defaults.
 *
 * The default shape is the Mona Lisa (Q12418) — it has every optional
 * field populated so callers can selectively set fields to `undefined`
 * to exercise sparse-fact branches.
 *
 * @param overrides - Partial overrides; missing keys fall back to the defaults.
 */
export const makeArtworkFacts = (overrides: Partial<ArtworkFacts> = {}): ArtworkFacts => ({
  qid: 'Q12418',
  title: 'Mona Lisa',
  artist: 'Leonardo da Vinci',
  date: 'c. 1503',
  technique: 'Oil on poplar panel',
  collection: 'Louvre',
  movement: 'High Renaissance',
  genre: 'portrait',
  imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Mona_Lisa.jpg',
  aliases: ['La Gioconda', 'La Joconde'],
  ...overrides,
});
