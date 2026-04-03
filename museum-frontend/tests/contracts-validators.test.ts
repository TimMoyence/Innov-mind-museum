import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isCreateSessionResponseDTO,
  isPostMessageResponseDTO,
  isGetSessionResponseDTO,
  isDeleteSessionResponseDTO,
  isReportMessageResponseDTO,
  isListSessionsResponseDTO,
} from '../features/chat/domain/contracts';

const now = '2026-03-15T12:00:00Z';

describe('isCreateSessionResponseDTO', () => {
  const validPayload = {
    session: { id: 'sess-1', museumMode: true, createdAt: now, updatedAt: now },
  };

  it('accepts a valid payload', () => {
    assert.equal(isCreateSessionResponseDTO(validPayload), true);
  });

  it('accepts with optional fields', () => {
    assert.equal(
      isCreateSessionResponseDTO({
        session: {
          id: 'sess-2',
          museumMode: false,
          createdAt: now,
          updatedAt: now,
          locale: 'fr-FR',
          title: 'Test',
        },
      }),
      true,
    );
  });

  it('rejects when session is missing', () => {
    assert.equal(isCreateSessionResponseDTO({}), false);
  });

  it('rejects when session.id is not a string', () => {
    assert.equal(
      isCreateSessionResponseDTO({
        session: { id: 123, museumMode: true, createdAt: now, updatedAt: now },
      }),
      false,
    );
  });

  it('rejects when session.museumMode is not a boolean', () => {
    assert.equal(
      isCreateSessionResponseDTO({
        session: { id: 'sess-1', museumMode: 'true', createdAt: now, updatedAt: now },
      }),
      false,
    );
  });

  it('rejects when createdAt is missing', () => {
    assert.equal(
      isCreateSessionResponseDTO({
        session: { id: 'sess-1', museumMode: true, updatedAt: now },
      }),
      false,
    );
  });

  it('rejects null', () => {
    assert.equal(isCreateSessionResponseDTO(null), false);
  });

  it('rejects undefined', () => {
    assert.equal(isCreateSessionResponseDTO(undefined), false);
  });

  it('rejects an array', () => {
    assert.equal(isCreateSessionResponseDTO([]), false);
  });
});

describe('isPostMessageResponseDTO', () => {
  const validPayload = {
    sessionId: 'sess-1',
    message: { id: 'msg-1', role: 'assistant', text: 'Hello', createdAt: now },
    metadata: {},
  };

  it('accepts a valid payload', () => {
    assert.equal(isPostMessageResponseDTO(validPayload), true);
  });

  it('accepts with transcription', () => {
    assert.equal(
      isPostMessageResponseDTO({
        ...validPayload,
        transcription: { text: 'spoken text', model: 'whisper-1', provider: 'openai' },
      }),
      true,
    );
  });

  it('rejects when sessionId is not a string', () => {
    assert.equal(isPostMessageResponseDTO({ ...validPayload, sessionId: 123 }), false);
  });

  it('rejects when message is missing', () => {
    assert.equal(isPostMessageResponseDTO({ sessionId: 'sess-1', metadata: {} }), false);
  });

  it('rejects when metadata is missing', () => {
    assert.equal(
      isPostMessageResponseDTO({
        sessionId: 'sess-1',
        message: { id: 'msg-1', role: 'assistant', text: 'hi', createdAt: now },
      }),
      false,
    );
  });

  it('rejects when message.role is not assistant', () => {
    assert.equal(
      isPostMessageResponseDTO({
        sessionId: 'sess-1',
        message: { id: 'msg-1', role: 'user', text: 'hi', createdAt: now },
        metadata: {},
      }),
      false,
    );
  });

  it('rejects when message.text is not a string', () => {
    assert.equal(
      isPostMessageResponseDTO({
        sessionId: 'sess-1',
        message: { id: 'msg-1', role: 'assistant', text: 42, createdAt: now },
        metadata: {},
      }),
      false,
    );
  });

  it('rejects invalid transcription (wrong provider)', () => {
    assert.equal(
      isPostMessageResponseDTO({
        ...validPayload,
        transcription: { text: 'spoken', model: 'whisper-1', provider: 'google' },
      }),
      false,
    );
  });

  it('rejects invalid transcription (missing text)', () => {
    assert.equal(
      isPostMessageResponseDTO({
        ...validPayload,
        transcription: { model: 'whisper-1', provider: 'openai' },
      }),
      false,
    );
  });

  it('rejects null', () => {
    assert.equal(isPostMessageResponseDTO(null), false);
  });

  it('rejects undefined', () => {
    assert.equal(isPostMessageResponseDTO(undefined), false);
  });
});

describe('isGetSessionResponseDTO', () => {
  const validPayload = {
    session: { id: 'sess-1', museumMode: true, createdAt: now, updatedAt: now },
    messages: [{ id: 'msg-1', role: 'assistant', text: 'hi', createdAt: now }],
    page: { nextCursor: null, hasMore: false, limit: 20 },
  };

  it('accepts a valid payload', () => {
    assert.equal(isGetSessionResponseDTO(validPayload), true);
  });

  it('accepts with empty messages array', () => {
    assert.equal(isGetSessionResponseDTO({ ...validPayload, messages: [] }), true);
  });

  it('accepts with nextCursor as string', () => {
    assert.equal(
      isGetSessionResponseDTO({
        ...validPayload,
        page: { nextCursor: 'cursor-abc', hasMore: true, limit: 20 },
      }),
      true,
    );
  });

  it('accepts messages with image field', () => {
    assert.equal(
      isGetSessionResponseDTO({
        ...validPayload,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            createdAt: now,
            image: { url: 'https://example.com/img.jpg', expiresAt: now },
          },
        ],
      }),
      true,
    );
  });

  it('accepts messages with null image', () => {
    assert.equal(
      isGetSessionResponseDTO({
        ...validPayload,
        messages: [{ id: 'msg-1', role: 'user', createdAt: now, image: null }],
      }),
      true,
    );
  });

  it('rejects when session is missing required fields', () => {
    assert.equal(
      isGetSessionResponseDTO({
        session: { id: 'sess-1' },
        messages: [],
        page: { nextCursor: null, hasMore: false, limit: 20 },
      }),
      false,
    );
  });

  it('rejects when messages is not an array', () => {
    assert.equal(
      isGetSessionResponseDTO({
        session: { id: 'sess-1', museumMode: true, createdAt: now, updatedAt: now },
        messages: 'not-array',
        page: { nextCursor: null, hasMore: false, limit: 20 },
      }),
      false,
    );
  });

  it('rejects when page.hasMore is not a boolean', () => {
    assert.equal(
      isGetSessionResponseDTO({
        ...validPayload,
        page: { nextCursor: null, hasMore: 'false', limit: 20 },
      }),
      false,
    );
  });

  it('rejects when page.limit is not a number', () => {
    assert.equal(
      isGetSessionResponseDTO({
        ...validPayload,
        page: { nextCursor: null, hasMore: false, limit: '20' },
      }),
      false,
    );
  });

  it('rejects when a message has invalid role', () => {
    assert.equal(
      isGetSessionResponseDTO({
        ...validPayload,
        messages: [{ id: 'msg-1', role: 'moderator', createdAt: now }],
      }),
      false,
    );
  });

  it('rejects when a message image has wrong shape', () => {
    assert.equal(
      isGetSessionResponseDTO({
        ...validPayload,
        messages: [{ id: 'msg-1', role: 'user', createdAt: now, image: { url: 123 } }],
      }),
      false,
    );
  });

  it('rejects null', () => {
    assert.equal(isGetSessionResponseDTO(null), false);
  });

  it('rejects undefined', () => {
    assert.equal(isGetSessionResponseDTO(undefined), false);
  });
});

describe('isDeleteSessionResponseDTO', () => {
  it('accepts a valid payload', () => {
    assert.equal(isDeleteSessionResponseDTO({ sessionId: 'sess-1', deleted: true }), true);
  });

  it('accepts deleted=false', () => {
    assert.equal(isDeleteSessionResponseDTO({ sessionId: 'sess-1', deleted: false }), true);
  });

  it('rejects when sessionId is not a string', () => {
    assert.equal(isDeleteSessionResponseDTO({ sessionId: 123, deleted: true }), false);
  });

  it('rejects when deleted is not a boolean', () => {
    assert.equal(isDeleteSessionResponseDTO({ sessionId: 'sess-1', deleted: 'true' }), false);
  });

  it('rejects empty object', () => {
    assert.equal(isDeleteSessionResponseDTO({}), false);
  });

  it('rejects null', () => {
    assert.equal(isDeleteSessionResponseDTO(null), false);
  });

  it('rejects undefined', () => {
    assert.equal(isDeleteSessionResponseDTO(undefined), false);
  });
});

describe('isReportMessageResponseDTO', () => {
  it('accepts a valid payload', () => {
    assert.equal(isReportMessageResponseDTO({ messageId: 'msg-1', reported: true }), true);
  });

  it('accepts reported=false', () => {
    assert.equal(isReportMessageResponseDTO({ messageId: 'msg-1', reported: false }), true);
  });

  it('rejects when messageId is not a string', () => {
    assert.equal(isReportMessageResponseDTO({ messageId: 42, reported: true }), false);
  });

  it('rejects when reported is not a boolean', () => {
    assert.equal(isReportMessageResponseDTO({ messageId: 'msg-1', reported: 1 }), false);
  });

  it('rejects empty object', () => {
    assert.equal(isReportMessageResponseDTO({}), false);
  });

  it('rejects null', () => {
    assert.equal(isReportMessageResponseDTO(null), false);
  });

  it('rejects undefined', () => {
    assert.equal(isReportMessageResponseDTO(undefined), false);
  });
});

describe('isListSessionsResponseDTO', () => {
  const validSession = {
    id: 'sess-1',
    museumMode: true,
    createdAt: now,
    updatedAt: now,
    messageCount: 5,
  };

  const validPayload = {
    sessions: [validSession],
    page: { nextCursor: null, hasMore: false, limit: 20 },
  };

  it('accepts a valid payload', () => {
    assert.equal(isListSessionsResponseDTO(validPayload), true);
  });

  it('accepts empty sessions array', () => {
    assert.equal(
      isListSessionsResponseDTO({
        sessions: [],
        page: { nextCursor: null, hasMore: false, limit: 20 },
      }),
      true,
    );
  });

  it('accepts sessions with preview', () => {
    assert.equal(
      isListSessionsResponseDTO({
        sessions: [
          {
            ...validSession,
            preview: { text: 'Hello', createdAt: now, role: 'assistant' },
          },
        ],
        page: { nextCursor: null, hasMore: false, limit: 20 },
      }),
      true,
    );
  });

  it('accepts sessions without preview', () => {
    assert.equal(isListSessionsResponseDTO(validPayload), true);
  });

  it('accepts with nextCursor as string', () => {
    assert.equal(
      isListSessionsResponseDTO({
        ...validPayload,
        page: { nextCursor: 'next-page', hasMore: true, limit: 20 },
      }),
      true,
    );
  });

  it('rejects when sessions is not an array', () => {
    assert.equal(
      isListSessionsResponseDTO({
        sessions: 'not-array',
        page: { nextCursor: null, hasMore: false, limit: 20 },
      }),
      false,
    );
  });

  it('rejects when page is missing', () => {
    assert.equal(isListSessionsResponseDTO({ sessions: [] }), false);
  });

  it('rejects when page.hasMore is not a boolean', () => {
    assert.equal(
      isListSessionsResponseDTO({
        sessions: [],
        page: { nextCursor: null, hasMore: 'false', limit: 20 },
      }),
      false,
    );
  });

  it('rejects when page.limit is not a number', () => {
    assert.equal(
      isListSessionsResponseDTO({
        sessions: [],
        page: { nextCursor: null, hasMore: false, limit: '20' },
      }),
      false,
    );
  });

  it('rejects when session is missing messageCount', () => {
    assert.equal(
      isListSessionsResponseDTO({
        sessions: [{ id: 'sess-1', museumMode: true, createdAt: now, updatedAt: now }],
        page: { nextCursor: null, hasMore: false, limit: 20 },
      }),
      false,
    );
  });

  it('rejects when session.id is not a string', () => {
    assert.equal(
      isListSessionsResponseDTO({
        sessions: [{ id: 123, museumMode: true, createdAt: now, updatedAt: now, messageCount: 1 }],
        page: { nextCursor: null, hasMore: false, limit: 20 },
      }),
      false,
    );
  });

  it('rejects when preview has wrong role', () => {
    assert.equal(
      isListSessionsResponseDTO({
        sessions: [
          {
            ...validSession,
            preview: { text: 'Hi', createdAt: now, role: 'moderator' },
          },
        ],
        page: { nextCursor: null, hasMore: false, limit: 20 },
      }),
      false,
    );
  });

  it('rejects when preview.text is not a string', () => {
    assert.equal(
      isListSessionsResponseDTO({
        sessions: [
          {
            ...validSession,
            preview: { text: 42, createdAt: now, role: 'user' },
          },
        ],
        page: { nextCursor: null, hasMore: false, limit: 20 },
      }),
      false,
    );
  });

  it('rejects null', () => {
    assert.equal(isListSessionsResponseDTO(null), false);
  });

  it('rejects undefined', () => {
    assert.equal(isListSessionsResponseDTO(undefined), false);
  });
});
