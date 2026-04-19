import type { ChatRepository } from '@modules/chat/domain/chat.repository.interface';

/** Shared mock ChatRepository factory. All methods default to jest.fn(). */
export const makeChatRepo = (
  overrides: Partial<jest.Mocked<ChatRepository>> = {},
): jest.Mocked<ChatRepository> => ({
  createSession: jest.fn(),
  getSessionById: jest.fn(),
  getMessageById: jest.fn(),
  deleteSessionIfEmpty: jest.fn(),
  persistMessage: jest.fn(),
  listSessionMessages: jest.fn(),
  listSessionHistory: jest.fn(),
  listSessions: jest.fn(),
  hasMessageReport: jest.fn(),
  persistMessageReport: jest.fn(),
  exportUserData: jest.fn(),
  upsertMessageFeedback: jest.fn(),
  deleteMessageFeedback: jest.fn(),
  getMessageFeedback: jest.fn(),
  updateMessageAudio: jest.fn(),
  clearMessageAudio: jest.fn(),
  ...overrides,
});
