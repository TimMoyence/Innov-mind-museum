import request from 'supertest';

import { User } from '@modules/auth/domain/user/user.entity';
import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { Express } from 'express';
import type { Repository } from 'typeorm';

type MakeToken = (typeof import('tests/helpers/auth/token.helpers'))['makeToken'];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration(
  'POST /api/support/tickets — museumId plumb (TD-COR-WAVEB-02) [integration, real PG + HTTP]',
  () => {
    let harness: IntegrationHarness;
    let app: Express;
    let ticketRepo: Repository<SupportTicket>;
    let makeToken: MakeToken;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      const { createApp } = await import('@src/app');
      const tokenHelpers = await import('tests/helpers/auth/token.helpers');
      makeToken = tokenHelpers.makeToken;
      app = createApp({ healthCheck: async () => ({ database: 'up' }) });
      ticketRepo = harness.dataSource.getRepository(SupportTicket);
    });

    beforeEach(async () => {
      await harness.reset();
    });

    async function seedUser(overrides: Parameters<typeof makeUser>[0] = {}): Promise<number> {
      const userRepo = harness.dataSource.getRepository(User);
      const fixture = makeUser(overrides);
      const saved = await userRepo.save(
        userRepo.create({
          email: fixture.email,
          password: fixture.password,
          firstname: fixture.firstname,
          lastname: fixture.lastname,
          role: fixture.role,
          museumId: fixture.museumId ?? null,
          email_verified: fixture.email_verified,
          onboarding_completed: fixture.onboarding_completed,
          contentPreferences: fixture.contentPreferences,
        }),
      );
      return saved.id;
    }

    it('persists museum_id = 42 when caller JWT carries museumId = 42 (R-C7c)', async () => {
      const userId = await seedUser({
        email: 'tenant42-author@test.dev',
        museumId: 42,
      });

      const token = makeToken({
        sub: String(userId),
        role: 'visitor',
        museumId: 42,
      });

      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          subject: 'tenant 42 — needs help',
          description: 'description with at least ten chars for validator',
        });

      expect(res.status).toBe(201);
      const created = res.body.ticket as { id: string };
      expect(typeof created.id).toBe('string');

      const row = await ticketRepo.findOneByOrFail({ id: created.id });
      expect(row.museumId).toBe(42);
    });

    it('persists museum_id = NULL when caller JWT has no museumId claim (catalog-level survives)', async () => {
      const userId = await seedUser({ email: 'no-tenant-author@test.dev' });

      const token = makeToken({ sub: String(userId), role: 'visitor' });

      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          subject: 'unscoped — generic help',
          description: 'description with at least ten chars for validator',
        });

      expect(res.status).toBe(201);
      const created = res.body.ticket as { id: string };

      const row = await ticketRepo.findOneByOrFail({ id: created.id });
      expect(row.museumId).toBeNull();
    });
  },
);
