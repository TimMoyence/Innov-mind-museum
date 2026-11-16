import request from 'supertest';

import { User } from '@modules/auth/domain/user/user.entity';
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { UserRole } from '@modules/auth/domain/user/user-role';
import type { Express } from 'express';

type MakeToken = (typeof import('tests/helpers/auth/token.helpers'))['makeToken'];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const MUSEUM = 42;

describeIntegration(
  'ROLE-MESSAGE · every staff role can answer a ticket [integration, real PG + HTTP]',
  () => {
    let harness: IntegrationHarness;
    let app: Express;
    let makeToken: MakeToken;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      const { createApp } = await import('@src/app');
      makeToken = (await import('tests/helpers/auth/token.helpers')).makeToken;
      app = createApp({ healthCheck: async () => ({ database: 'up' }) });
    });

    beforeEach(async () => {
      await harness.reset();
    });

    async function seedUser(email: string, role: UserRole): Promise<number> {
      const userRepo = harness.dataSource.getRepository(User);
      const fixture = makeUser({ email, role, museumId: MUSEUM });
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

    const tokenFor = (id: number, role: UserRole): string =>
      `Bearer ${makeToken({ sub: String(id), role, museumId: MUSEUM })}`;

    it.each<UserRole>(['moderator', 'museum_manager', 'super_admin', 'admin'])(
      'ROLE-MESSAGE · a %s answer is saved with its role and shown as staff',
      async (role) => {
        const authorId = await seedUser('author@test.dev', 'visitor');
        const staffId = await seedUser(`${role}@test.dev`, role);
        const created = await request(app)
          .post('/api/support/tickets')
          .set('Authorization', tokenFor(authorId, 'visitor'))
          .send({ subject: 'Audio guide', description: 'The audio guide stops after a minute.' });
        expect(created.body).toEqual({ ticket: expect.objectContaining({ status: 'open' }) });
        const ticketId = created.body.ticket.id as string;

        const answer = await request(app)
          .post(`/api/support/tickets/${ticketId}/messages`)
          .set('Authorization', tokenFor(staffId, role))
          .send({ text: 'We are on it' });

        expect(answer.status).toBe(201);
        const detail = await request(app)
          .get(`/api/support/tickets/${ticketId}`)
          .set('Authorization', tokenFor(authorId, 'visitor'));
        expect(detail.body.ticket.messages).toEqual([
          expect.objectContaining({ text: 'We are on it', senderRole: role, fromStaff: true }),
        ]);
        expect(detail.body.ticket.status).toBe('in_progress');
      },
    );
  },
);
