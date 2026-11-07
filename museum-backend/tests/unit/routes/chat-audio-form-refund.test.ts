import request from 'supertest';

import { createApp } from '@src/app';
import { makeToken } from 'tests/helpers/auth/token.helpers';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

const mockChatService: Partial<ChatService> = {
  createSession: jest.fn(),
  listSessions: jest.fn(),
  getSession: jest.fn(),
  deleteSessionIfEmpty: jest.fn(),
  postMessage: jest.fn(),
  postAudioMessage: jest.fn(),
  reportMessage: jest.fn(),
  getMessageImageRef: jest.fn(),
  setMessageFeedback: jest.fn(),
};

const app = createApp({
  chatService: mockChatService as ChatService,
  healthCheck: async () => ({ database: 'up' }),
});

const SESSION = '3f1c2a7e-9b4d-4c1e-8a2f-5d6e7f8a9b0c';
const DAILY_CHAT_LIMIT = 100;

describe('quota quotidien du chat — un audio envoyé sans fichier ne le consomme pas', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('QUOTA · au-delà du quota quotidien, chaque audio sans fichier reste refusé en 400, jamais en 429', async () => {
    const token = makeToken();
    const statuses = new Set<number>();
    for (let attempt = 0; attempt <= DAILY_CHAT_LIMIT; attempt += 1) {
      const res = await request(app)
        .post(`/api/chat/sessions/${SESSION}/audio`)
        .set('Authorization', `Bearer ${token}`)
        .field('context', '{}');
      statuses.add(res.status);
    }

    expect([...statuses]).toEqual([400]);
  });
});
