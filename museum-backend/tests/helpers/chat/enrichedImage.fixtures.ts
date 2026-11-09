import type { EnrichedImage, SuggestedImage } from '@modules/chat/domain/chat.types';

export function makeEnrichedImage(overrides: Partial<EnrichedImage> = {}): EnrichedImage {
  return {
    url: 'https://example.com/image.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    caption: 'Test artwork caption',
    rationale: 'Illustrates the discussed artwork.',
    source: 'wikidata',
    score: 0.5,
    ...overrides,
  };
}

export function makeSuggestedImage(overrides: Partial<SuggestedImage> = {}): SuggestedImage {
  return {
    query: 'Test artwork',
    description: 'A test artwork to enrich the response.',
    rationale: 'Adds visual context to the answer.',
    caption: 'Test artwork',
    ...overrides,
  };
}
