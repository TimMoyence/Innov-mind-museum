import type { ArtworkHeroModel } from '@/features/chat/application/useArtworkHero';
import type { DailyArtwork } from '@/features/daily-art/infrastructure/dailyArtApi';

export const makeDailyArtwork = (overrides: Partial<DailyArtwork> = {}): DailyArtwork => ({
  title: 'La Grande Vague de Kanagawa',
  artist: 'Hokusai',
  year: '1831',
  imageUrl: 'https://example.test/vague.jpg',
  description: 'Une vague géante menace trois barques.',
  funFact: 'Le mont Fuji apparaît au creux de la vague.',
  museum: 'Musée Guimet',
  ...overrides,
});

export const makeArtworkHeroModel = (
  overrides: Partial<ArtworkHeroModel> = {},
): ArtworkHeroModel => ({
  imageUrl: 'https://example.test/joconde.jpg',
  messageId: 'msg-hero',
  title: 'La Joconde',
  artist: 'Léonard de Vinci',
  museum: 'Louvre',
  room: 'Salle 711',
  confidence: 0.9,
  ...overrides,
});
