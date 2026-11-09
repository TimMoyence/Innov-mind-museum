import { faker } from '@faker-js/faker';

import type { CitationSource } from '@/features/chat/application/chatSessionLogic.pure';

export const makeCitationSource = (overrides?: Partial<CitationSource>): CitationSource => ({
  url: faker.internet.url(),
  type: 'wikidata',
  title: faker.lorem.words(4),
  quote: faker.lorem.sentence({ min: 8, max: 18 }),
  confidence: faker.number.float({ min: 0.7, max: 1, fractionDigits: 2 }),
  ...overrides,
});
