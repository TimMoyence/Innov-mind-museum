import { faker } from '@faker-js/faker';

import type {
  ChatUiMessage,
  ChatUiMessageMetadata,
  ChatUiEnrichedImage,
  ApiMessage,
} from '@/features/chat/application/chatSessionLogic.pure';
import type { DashboardSessionCard } from '@/features/chat/domain/dashboard-session';

/** Creates a ChatUiMessage with sensible defaults. */
export const makeChatUiMessage = (overrides?: Partial<ChatUiMessage>): ChatUiMessage => ({
  id: faker.string.uuid(),
  role: 'user',
  text: faker.lorem.sentence(),
  createdAt: faker.date.recent().toISOString(),
  image: null,
  ...overrides,
});

/** Creates a backend API message shape with sensible defaults. */
export const makeApiMessage = (overrides?: Partial<ApiMessage>): ApiMessage => ({
  id: faker.string.uuid(),
  role: 'user',
  text: faker.lorem.sentence(),
  createdAt: faker.date.recent().toISOString(),
  ...overrides,
});

/** Creates an assistant message with metadata (detectedArtwork, recommendations, followUpQuestions). */
export const makeAssistantMessage = (
  overrides?: Partial<ChatUiMessage>,
  metadataOverrides?: Partial<ChatUiMessageMetadata>,
): ChatUiMessage => {
  const metadata: ChatUiMessageMetadata = {
    detectedArtwork: {
      title: faker.lorem.words(3),
      artist: faker.person.fullName(),
      museum: faker.company.name(),
      room: `Room ${faker.number.int({ min: 1, max: 50 })}`,
      confidence: faker.number.float({ min: 0.5, max: 1, fractionDigits: 2 }),
    },
    recommendations: [faker.lorem.sentence(), faker.lorem.sentence()],
    followUpQuestions: [`${faker.lorem.sentence()}?`, `${faker.lorem.sentence()}?`],
    expertiseSignal: faker.helpers.arrayElement(['beginner', 'intermediate', 'expert']),
    ...metadataOverrides,
  };

  return {
    id: faker.string.uuid(),
    role: 'assistant',
    text: faker.lorem.paragraph(),
    createdAt: faker.date.recent().toISOString(),
    image: null,
    metadata,
    ...overrides,
  };
};

/** Creates a ChatUiEnrichedImage with sensible defaults. */
export const makeEnrichedImage = (
  overrides?: Partial<ChatUiEnrichedImage>,
): ChatUiEnrichedImage => ({
  url: 'https://example.com/full.jpg',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  caption: 'A painting',
  source: 'wikidata',
  score: 0.9,
  ...overrides,
});

/** Creates a DashboardSessionCard view-model with sensible defaults. */
export const makeDashboardSessionCard = (
  overrides?: Partial<DashboardSessionCard>,
): DashboardSessionCard => ({
  id: faker.string.uuid(),
  title: faker.lorem.words(4),
  subtitle: `${faker.helpers.arrayElement(['Guided mode', 'Standard mode'])} \u2022 ${faker.company.name()}`,
  timeLabel: faker.date.recent().toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }),
  messageCount: faker.number.int({ min: 0, max: 50 }),
  ...overrides,
});
