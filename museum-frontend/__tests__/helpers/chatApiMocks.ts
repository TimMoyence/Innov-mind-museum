/**
 * Shared chatApi mock handles.
 *
 * Usage:
 *   import { chatApiMocks } from '@/__tests__/helpers/chatApiMocks';
 *   jest.mock('@/features/chat/infrastructure/chatApi', () => ({ chatApi: chatApiMocks }));
 *
 * The variable name starts with 'mock' so babel-jest allows it in jest.mock() factories.
 * Each test suite gets its own instance (Jest module isolation).
 */
export const chatApiMocks = {
  createSession: jest.fn(),
  deleteSessionIfEmpty: jest.fn(),
  reportMessage: jest.fn(),
  listSessions: jest.fn(),
  setMessageFeedback: jest.fn(),
  getSession: jest.fn(),
  postMessage: jest.fn(),
  synthesizeSpeech: jest.fn(),
  sendMessageSmart: jest.fn(),
  getMessageImageUrl: jest.fn(),
  postFeedback: jest.fn(),
};
