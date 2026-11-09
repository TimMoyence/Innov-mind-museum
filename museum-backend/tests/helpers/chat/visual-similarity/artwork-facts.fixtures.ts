import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

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
