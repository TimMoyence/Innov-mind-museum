import { faker } from '@faker-js/faker';

import type { CitationSource } from '@/features/chat/application/chatSessionLogic.pure';

/**
 * Creates a `CitationSource` view-model with sensible defaults (C4
 * anti-hallucination citations v2). Mirrors the BE Zod schema
 * `CitationSourceSchema` shape: url, type, title, verbatim quote (10..500
 * chars), optional judge confidence.
 *
 * Override individual fields to drive specific test paths — e.g. empty
 * `quote` to exercise the graceful-render branch when validation drops a
 * source post-LLM but the field still trickles through pre-v1.1 caches.
 */
export const makeCitationSource = (overrides?: Partial<CitationSource>): CitationSource => ({
  url: faker.internet.url(),
  type: 'wikidata',
  title: faker.lorem.words(4),
  quote: faker.lorem.sentence({ min: 8, max: 18 }),
  confidence: faker.number.float({ min: 0.7, max: 1, fractionDigits: 2 }),
  ...overrides,
});
