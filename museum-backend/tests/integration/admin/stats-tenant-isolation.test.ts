import request from 'supertest';

import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { makeMessage, makeSession } from 'tests/helpers/chat/message.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { Express } from 'express';
import type { Repository } from 'typeorm';

type MakeToken = (typeof import('tests/helpers/auth/token.helpers'))['makeToken'];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const MUSEUM_A = 42;
const MUSEUM_B = 99;
const A_SESSIONS = 2;
const A_MESSAGES = 3;
const B_SESSIONS = 5;
const B_MESSAGES = 7;
const GLOBAL_SESSIONS = A_SESSIONS + B_SESSIONS;
const GLOBAL_MESSAGES = A_MESSAGES + B_MESSAGES;

describeIntegration(
  'GET /api/admin/stats — museum_manager tenant isolation (C1A / OWASP API3 BOLA) [integration, real PG + HTTP]',
  () => {
    let harness: IntegrationHarness;
    let app: Express;
    let sessionRepo: Repository<ChatSession>;
    let messageRepo: Repository<ChatMessage>;
    let makeToken: MakeToken;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      const { createApp } = await import('@src/app');
      const tokenHelpers = await import('tests/helpers/auth/token.helpers');
      makeToken = tokenHelpers.makeToken;
      app = createApp({ healthCheck: async () => ({ database: 'up' }) });
      sessionRepo = harness.dataSource.getRepository(ChatSession);
      messageRepo = harness.dataSource.getRepository(ChatMessage);
    });

    beforeEach(async () => {
      await harness.reset();
      await seedTenant(MUSEUM_A, A_SESSIONS, A_MESSAGES);
      await seedTenant(MUSEUM_B, B_SESSIONS, B_MESSAGES);
    });

    async function seedTenant(
      museumId: number,
      sessionCount: number,
      messageCount: number,
    ): Promise<void> {
      const sessions: ChatSession[] = [];
      for (let i = 0; i < sessionCount; i += 1) {
        const session = await sessionRepo.save(
          makeSession({
            id: undefined,
            museumId,
            museumMode: true,
            intent: 'default',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        );
        sessions.push(session);
      }
      const anchor = sessions[0];
      for (let i = 0; i < messageCount; i += 1) {
        await messageRepo.save(
          makeMessage({
            id: undefined,
            session: anchor,
            sessionId: anchor.id,
            role: i % 2 === 0 ? 'user' : 'assistant',
            text: `tenant ${String(museumId)} message ${String(i)}`,
            createdAt: new Date(),
          }),
        );
      }
    }

    it('manager(42) GET /stats → 200 with museum-42 counts ONLY (not the A+B global sum)', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.totalSessions).toBe(A_SESSIONS);
      expect(res.body.recentSessions).toBe(A_SESSIONS);
      expect(res.body.totalMessages).toBe(A_MESSAGES);
      expect(res.body.totalSessions).not.toBe(GLOBAL_SESSIONS);
      expect(res.body.totalMessages).not.toBe(GLOBAL_MESSAGES);
    });

    it('manager(42) GET /stats?museumId=99 → 200 with museum-42 counts (JWT claim wins, museum 99 never observed)', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .get(`/api/admin/stats?museumId=${String(MUSEUM_B)}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.totalSessions).toBe(A_SESSIONS);
      expect(res.body.totalMessages).toBe(A_MESSAGES);
      expect(res.body.totalSessions).not.toBe(B_SESSIONS);
      expect(res.body.totalMessages).not.toBe(B_MESSAGES);
    });

    it('manager with NO museumId claim GET /stats → 403, no aggregate in body', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager' });

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body).not.toHaveProperty('totalSessions');
      expect(res.body).not.toHaveProperty('totalMessages');
    });

    it('manager(42) GET /stats → response OMITS usersByRole / totalUsers / recentSignups', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('usersByRole');
      expect(res.body).not.toHaveProperty('totalUsers');
      expect(res.body).not.toHaveProperty('recentSignups');
    });

    it('super_admin GET /stats → 200 with the FULL global cross-tenant shape (A+B sums, platform fields present)', async () => {
      const token = makeToken({ sub: '1', role: 'super_admin' });

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.totalSessions).toBe(GLOBAL_SESSIONS);
      expect(res.body.totalMessages).toBe(GLOBAL_MESSAGES);
      expect(res.body).toHaveProperty('usersByRole');
      expect(res.body).toHaveProperty('totalUsers');
      expect(res.body).toHaveProperty('recentSignups');
    });
  },
);
