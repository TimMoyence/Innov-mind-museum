import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isCreateSessionResponseDTO,
  isGetSessionResponseDTO,
  isListSessionsResponseDTO,
  isPostMessageResponseDTO,
} from '../features/chat/domain/contracts';

test('chat contract validators accept valid payloads', () => {
  const now = new Date().toISOString();

  assert.equal(
    isCreateSessionResponseDTO({
      session: {
        id: 'session-1',
        museumMode: true,
        createdAt: now,
        updatedAt: now,
      },
    }),
    true,
  );

  assert.equal(
    isPostMessageResponseDTO({
      sessionId: 'session-1',
      message: {
        id: 'msg-1',
        role: 'assistant',
        text: 'hello',
        createdAt: now,
      },
      metadata: {},
    }),
    true,
  );

  assert.equal(
    isGetSessionResponseDTO({
      session: {
        id: 'session-1',
        museumMode: true,
        createdAt: now,
        updatedAt: now,
      },
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          text: 'hello',
          createdAt: now,
        },
      ],
      page: {
        nextCursor: null,
        hasMore: false,
        limit: 20,
      },
    }),
    true,
  );

  assert.equal(
    isListSessionsResponseDTO({
      sessions: [
        {
          id: 'session-1',
          museumMode: true,
          createdAt: now,
          updatedAt: now,
          messageCount: 2,
          preview: {
            text: 'hello',
            createdAt: now,
            role: 'assistant',
          },
        },
      ],
      page: {
        nextCursor: null,
        hasMore: false,
        limit: 20,
      },
    }),
    true,
  );
});

test('chat contract validators reject invalid payloads', () => {
  assert.equal(isCreateSessionResponseDTO({}), false);
  assert.equal(isPostMessageResponseDTO({ metadata: {} }), false);
  assert.equal(isGetSessionResponseDTO({ session: {}, messages: [], page: {} }), false);
  assert.equal(isListSessionsResponseDTO({ sessions: [], page: {} }), false);
});
