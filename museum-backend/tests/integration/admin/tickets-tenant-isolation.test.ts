import request from 'supertest';

import { SupportRepositoryPg } from '@modules/support/adapters/secondary/pg/support.repository.pg';
import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { CreateTicketInput } from '@modules/support/domain/ticket/support.types';
import type { Express } from 'express';
import type { Repository } from 'typeorm';

type MakeToken = (typeof import('tests/helpers/auth/token.helpers'))['makeToken'];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const MUSEUM_A = 42;
const MUSEUM_B = 99;

describeIntegration(
  'admin /tickets — museum_manager tenant isolation (C1B / OWASP API3 BOLA) [integration, real PG + HTTP]',
  () => {
    let harness: IntegrationHarness;
    let app: Express;
    let supportRepo: SupportRepositoryPg;
    let ticketRepo: Repository<SupportTicket>;
    let makeToken: MakeToken;

    let ticketA1: string;
    let ticketA2: string;
    let ticketB1: string;
    let ticketNull1: string;

    const seedTicket = async (museumId: number | null, subject: string): Promise<string> => {
      const dto = await supportRepo.createTicket({
        userId: 1,
        subject,
        description: 'description ten chars min',
        museumId,
      } as CreateTicketInput);
      return dto.id;
    };

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      const { createApp } = await import('@src/app');
      const tokenHelpers = await import('tests/helpers/auth/token.helpers');
      makeToken = tokenHelpers.makeToken;
      app = createApp({ healthCheck: async () => ({ database: 'up' }) });
      supportRepo = new SupportRepositoryPg(harness.dataSource);
      ticketRepo = harness.dataSource.getRepository(SupportTicket);
    });

    beforeEach(async () => {
      await harness.reset();
      ticketA1 = await seedTicket(MUSEUM_A, 'museum 42 ticket one');
      ticketA2 = await seedTicket(MUSEUM_A, 'museum 42 ticket two');
      ticketB1 = await seedTicket(MUSEUM_B, 'museum 99 ticket one');
      ticketNull1 = await seedTicket(null, 'global NULL-museum ticket');
    });

    it('manager(42) GET /tickets → 200 with ONLY museum-42 tickets (B + NULL absent)', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .get('/api/admin/tickets')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining([ticketA1, ticketA2]));
      expect(ids).toHaveLength(2);
      expect(ids).not.toContain(ticketB1);
      expect(ids).not.toContain(ticketNull1);
      for (const row of res.body.data as { museumId: number | null }[]) {
        expect(row.museumId).toBe(MUSEUM_A);
      }
    });

    it('manager(42) PATCH /tickets/<museum-99 id> → 404 and the B row stays open', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/tickets/${ticketB1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(404);
      const after = await ticketRepo.findOneByOrFail({ id: ticketB1 });
      expect(after.status).toBe('open');
    });

    it('manager(42) PATCH /tickets/<NULL-museum id> → 404 and the NULL row stays open', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/tickets/${ticketNull1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(404);
      const after = await ticketRepo.findOneByOrFail({ id: ticketNull1 });
      expect(after.status).toBe('open');
    });

    it('manager(42) PATCH /tickets/<own museum-42 id> → 200 and the row flips to resolved', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/tickets/${ticketA1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      const after = await ticketRepo.findOneByOrFail({ id: ticketA1 });
      expect(after.status).toBe('resolved');
    });

    it('manager with NO museumId claim GET /tickets → 403, no data', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager' });

      const res = await request(app)
        .get('/api/admin/tickets')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body).not.toHaveProperty('data');
    });

    it('manager with NO museumId claim PATCH /tickets/<own-tenant id> → 403, row unchanged', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager' });

      const res = await request(app)
        .patch(`/api/admin/tickets/${ticketA1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(403);
      const after = await ticketRepo.findOneByOrFail({ id: ticketA1 });
      expect(after.status).toBe('open');
    });

    it('super_admin GET /tickets → 200 sees ALL tickets (42 + 99 + NULL)', async () => {
      const token = makeToken({ sub: '1', role: 'super_admin' });

      const res = await request(app)
        .get('/api/admin/tickets')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining([ticketA1, ticketA2, ticketB1, ticketNull1]));
      expect(ids).toHaveLength(4);
    });

    it('super_admin PATCH /tickets/<museum-99 id> → 200 (unscoped, cross-tenant write allowed)', async () => {
      const token = makeToken({ sub: '1', role: 'super_admin' });

      const res = await request(app)
        .patch(`/api/admin/tickets/${ticketB1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      const after = await ticketRepo.findOneByOrFail({ id: ticketB1 });
      expect(after.status).toBe('resolved');
    });
  },
);
