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
