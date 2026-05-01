import { faker } from '@faker-js/faker';

import type {
  CreateSessionResponseDTO,
  GetSessionResponseDTO,
  ListSessionsResponseDTO,
  PostMessageResponseDTO,
  SessionDTO,
  ChatMessageDTO,
  SessionListItemDTO,
} from '@/features/chat/domain/contracts';

/** Creates a SessionDTO with sensible defaults. */
const makeSessionDTO = (overrides?: Partial<SessionDTO>): SessionDTO => ({
  id: faker.string.uuid(),
  locale: 'en-US',
  museumMode: faker.datatype.boolean(),
  title: faker.lorem.words(3),
  museumName: faker.company.name(),
  createdAt: faker.date.recent().toISOString(),
  updatedAt: faker.date.recent().toISOString(),
  intent: 'default',
  ...overrides,
});

/** Creates a ChatMessageDTO with sensible defaults. */
const makeChatMessageDTO = (overrides?: Partial<ChatMessageDTO>): ChatMessageDTO => ({
  id: faker.string.uuid(),
  role: faker.helpers.arrayElement(['user', 'assistant', 'system'] as const),
  text: faker.lorem.sentence(),
  imageRef: null,
  image: null,
  createdAt: faker.date.recent().toISOString(),
  metadata: null,
  ...overrides,
});

/** Creates a CreateSessionResponseDTO with sensible defaults. */
export const makeCreateSessionResponse = (
  overrides?: Partial<CreateSessionResponseDTO>,
): CreateSessionResponseDTO => ({
  session: makeSessionDTO(),
  ...overrides,
});

/** Creates a GetSessionResponseDTO with sensible defaults. */
export const makeGetSessionResponse = (
  overrides?: Partial<GetSessionResponseDTO>,
): GetSessionResponseDTO => ({
  session: makeSessionDTO(),
  messages: [makeChatMessageDTO({ role: 'user' }), makeChatMessageDTO({ role: 'assistant' })],
  page: { nextCursor: null, hasMore: false, limit: 20 },
  ...overrides,
});

/** Creates a ListSessionsResponseDTO with sensible defaults. */
export const makeListSessionsResponse = (
  overrides?: Partial<ListSessionsResponseDTO>,
): ListSessionsResponseDTO => {
  const now = faker.date.recent().toISOString();
  const session: SessionListItemDTO = {
    id: faker.string.uuid(),
    locale: 'en-US',
    museumMode: true,
    title: faker.lorem.words(3),
    museumName: faker.company.name(),
    createdAt: now,
    updatedAt: now,
    intent: 'default',
    messageCount: faker.number.int({ min: 1, max: 20 }),
    preview: {
      text: faker.lorem.sentence(),
      createdAt: now,
      role: 'assistant',
    },
  };

  return {
    sessions: [session],
    page: { nextCursor: null, hasMore: false, limit: 20 },
    ...overrides,
  };
};

/** Creates a PostMessageResponseDTO with sensible defaults. */
export const makePostMessageResponse = (
  overrides?: Partial<PostMessageResponseDTO>,
): PostMessageResponseDTO => ({
  sessionId: faker.string.uuid(),
  message: {
    id: faker.string.uuid(),
    role: 'assistant',
    text: faker.lorem.paragraph(),
    createdAt: faker.date.recent().toISOString(),
  },
  metadata: {
    detectedArtwork: {
      title: faker.lorem.words(3),
      artist: faker.person.fullName(),
    },
    recommendations: [faker.lorem.sentence()],
    followUpQuestions: [`${faker.lorem.sentence()}?`],
  },
  ...overrides,
});
