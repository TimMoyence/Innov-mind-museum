import { ChatSessionLookupAdapter } from '@modules/review/adapters/secondary/pg/chat-session-lookup.adapter';
import { TypeOrmChatRepository } from '@modules/chat/adapters/secondary/persistence/chat.repository.typeorm';
import { User } from '@modules/auth/domain/user/user.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { makeUser } from 'tests/helpers/auth/user.fixtures';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration(
  'ChatSessionLookupAdapter.findSessionMuseum — real SQL [integration, real PG]',
  () => {
    let harness: IntegrationHarness;
    let adapter: ChatSessionLookupAdapter;
    let chatRepo: TypeOrmChatRepository;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      adapter = new ChatSessionLookupAdapter(harness.dataSource);
      chatRepo = new TypeOrmChatRepository(harness.dataSource);
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

    it('(a) returns the museumId for a session owned by the requesting user', async () => {
      const userId = await seedUser({ email: 'owner-attributed@test.dev' });
      const session = await chatRepo.createSession({ userId, museumId: 42 });

      const result = await adapter.findSessionMuseum(session.id, userId);

      expect(result).toEqual({ museumId: 42 });
      expect(typeof result?.museumId).toBe('number');
    });

    it('(b) returns null for a session owned by ANOTHER user (ownership filter, no oracle)', async () => {
      const owner = await seedUser({ email: 'real-owner@test.dev' });
      const attacker = await seedUser({ email: 'foreign-noter@test.dev' });
      const session = await chatRepo.createSession({ userId: owner, museumId: 42 });

      const result = await adapter.findSessionMuseum(session.id, attacker);

      expect(result).toBeNull();
    });

    it('(c) returns null for a sessionId that does not exist', async () => {
      const userId = await seedUser({ email: 'no-such-session@test.dev' });

      const result = await adapter.findSessionMuseum(
        '00000000-0000-0000-0000-000000000000',
        userId,
      );

      expect(result).toBeNull();
    });

    it('(d) returns { museumId: null } for an owned session with museum_id NULL (city flow)', async () => {
      const userId = await seedUser({ email: 'city-flow@test.dev' });
      const session = await chatRepo.createSession({ userId });

      const result = await adapter.findSessionMuseum(session.id, userId);

      expect(result).toEqual({ museumId: null });
    });

    it('(d/ownership) a foreign user cannot read a city-flow (museum_id NULL) session either', async () => {
      const owner = await seedUser({ email: 'city-owner@test.dev' });
      const attacker = await seedUser({ email: 'city-attacker@test.dev' });
      const session = await chatRepo.createSession({ userId: owner });

      const result = await adapter.findSessionMuseum(session.id, attacker);

      expect(result).toBeNull();
    });
  },
);
