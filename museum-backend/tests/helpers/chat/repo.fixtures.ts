import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';

/**
 * Shared mock ChatRepository factory. All methods default to jest.fn().
 * @param overrides
 */
export const makeChatRepo = (
  overrides: Partial<jest.Mocked<ChatRepository>> = {},
): jest.Mocked<ChatRepository> => ({
  createSession: jest.fn(),
  getSessionById: jest.fn(),
  getMessageById: jest.fn(),
  deleteSessionIfEmpty: jest.fn(),
  persistMessage: jest.fn(),
  persistBlockedExchange: jest.fn(),
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
  findLegacyImageRefsByUserId: jest.fn().mockResolvedValue([]),
  ...overrides,
});
