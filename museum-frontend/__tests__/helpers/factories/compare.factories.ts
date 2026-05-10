import { faker } from '@faker-js/faker';

import type { components } from '@/shared/api/generated/openapi';

type CompareMatch = components['schemas']['CompareMatch'];
type CompareResult = components['schemas']['CompareResult'];
type ArtworkFacts = components['schemas']['ArtworkFacts'];
type FallbackReason = components['schemas']['FallbackReason'];

/** Creates an `ArtworkFacts` view-model with sensible defaults for compare tests. */
export const makeArtworkFacts = (overrides?: Partial<ArtworkFacts>): ArtworkFacts => ({
  qid: `Q${faker.number.int({ min: 1000, max: 9_999_999 })}`,
  title: faker.lorem.words(3),
  artist: faker.person.fullName(),
  ...overrides,
});

/** Creates a {@link CompareMatch} with sensible defaults (PD license, no attribution). */
export const makeCompareMatch = (overrides?: Partial<CompareMatch>): CompareMatch => {
  const facts = overrides?.facts ?? makeArtworkFacts();
  return {
    qid: facts.qid,
    title: facts.title ?? faker.lorem.words(3),
    imageUrl: 'https://example.com/full.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    visualScore: 0.84,
    metadataScore: 0.62,
    finalScore: 0.78,
    rationale: 'Composition voisine et palette froide comparable.',
    facts,
    // attribution intentionally omitted — only set for cc-by-sa matches
    ...overrides,
  };
};

/** Creates a CC-BY-SA flavoured CompareMatch (attribution present). */
export const makeCompareMatchCcBySa = (overrides?: Partial<CompareMatch>): CompareMatch =>
  makeCompareMatch({
    attribution: 'Photo by Wikimedia user, CC-BY-SA 4.0',
    ...overrides,
  });

/** Creates a {@link CompareResult} with N matches. */
export const makeCompareResult = (
  matches: CompareMatch[] = [makeCompareMatch()],
  overrides?: Partial<CompareResult>,
): CompareResult => ({
  matches,
  durationMs: 320,
  modelVersion: 'siglip-base-patch16-224@onnx-fp16',
  ...overrides,
});

/** Creates an empty CompareResult with the given fallback reason. */
export const makeCompareFallbackResult = (
  fallbackReason: FallbackReason = 'no_visual_neighbor',
  overrides?: Partial<CompareResult>,
): CompareResult => ({
  matches: [],
  durationMs: 280,
  modelVersion: 'siglip-base-patch16-224@onnx-fp16',
  fallbackReason,
  ...overrides,
});
