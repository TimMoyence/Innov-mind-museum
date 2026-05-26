/**
 * C2-BE coverage (S-BE / R3-R4 / Q1 — UFR-022 green-phase coverage 2026-05-26).
 *
 * Exercises the REAL SQL of {@link ChatSessionLookupAdapter} against a live
 * Postgres testcontainer with every migration applied. The slice's existing
 * unit tests only mock the port; the actual QueryBuilder
 * (`SELECT s.museumId WHERE s.id = :sessionId AND s.userId = :userId`) had
 * never run end-to-end. This matters because the adapter relies on:
 *   - the ManyToOne `user` FK surfacing as the camelCase column `userId`
 *     (no explicit `@JoinColumn` name → TypeORM default; cf. chatSession.entity),
 *   - `s.museumId` mapping to the `museum_id` column, and
 *   - node-postgres returning an integer column as a string in raw mode, which
 *     the adapter coerces via `Number.parseInt` (lib-docs/pg LESSONS "pg returns
 *     NUMERIC, BIGINT … as strings").
 *
 * Security-sensitive cases (R3 / Q1 — no existence oracle):
 *   (a) session owned by the user                → returns its museumId
 *   (b) session owned by ANOTHER user            → null (ownership filter)
 *   (c) sessionId that does not exist            → null
 *   (d) session owned but museum_id IS NULL (city flow) → { museumId: null }
 *
 * Harness contract (CLAUDE.md gotcha `feedback_integration_test_teardown`):
 *   - `createIntegrationHarness()` + `harness.scheduleStop()` (NOT `stop()`).
 *   - `harness.reset()` per-test TRUNCATEs domain tables + seeds museums 42/99.
 *   - run via `RUN_INTEGRATION=true pnpm test -- --runInBand`.
 *
 * lib-docs/typeorm/PATTERNS.md §3.5 (QueryBuilder), §8 (testing), §9 (hexagonal
 * port); lib-docs/pg/LESSONS "pg returns … as strings". Sessions are seeded via
 * the shared `TypeOrmChatRepository.createSession` + `makeUser` factory (no
 * inline `as ChatSession` / `as User` literals — docs/TEST_FACTORIES.md).
 */
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
    jest.setTimeout(180_000);

    let harness: IntegrationHarness;
    let adapter: ChatSessionLookupAdapter;
    let chatRepo: TypeOrmChatRepository;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      adapter = new ChatSessionLookupAdapter(harness.dataSource);
      // The chat repository is the real seam that writes a chat_sessions row with
      // the `userId` FK + `museum_id` column populated — exactly the two columns
      // the adapter filters/selects on.
      chatRepo = new TypeOrmChatRepository(harness.dataSource);
    });

    beforeEach(async () => {
      await harness.reset();
    });

    /**
     * Persist a user via the shared factory and return its DB-assigned id.
     * Strips id/createdAt/updatedAt so Postgres assigns them deterministically.
     * @param overrides - partial User fields forwarded to {@link makeUser}.
     * @returns the DB-assigned numeric user id.
     */
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
      // pg surfaces integer columns as strings in raw mode; the adapter MUST
      // coerce to a real number (lib-docs/pg LESSONS).
      expect(typeof result?.museumId).toBe('number');
    });

    it('(b) returns null for a session owned by ANOTHER user (ownership filter, no oracle)', async () => {
      const owner = await seedUser({ email: 'real-owner@test.dev' });
      const attacker = await seedUser({ email: 'foreign-noter@test.dev' });
      const session = await chatRepo.createSession({ userId: owner, museumId: 42 });

      const result = await adapter.findSessionMuseum(session.id, attacker);

      // A foreign session is indistinguishable from a missing one — null, not the
      // owner's museumId, and not an error (R3 / Q1).
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
      // No museumId → out-of-museum / monument-in-city session (C2 / B2C).
      const session = await chatRepo.createSession({ userId });

      const result = await adapter.findSessionMuseum(session.id, userId);

      // Existing+owned but unattributed → the row IS found (not null) and its
      // museumId is null. The use-case treats this as "no attribution".
      expect(result).toEqual({ museumId: null });
    });

    it('(d/ownership) a foreign user cannot read a city-flow (museum_id NULL) session either', async () => {
      const owner = await seedUser({ email: 'city-owner@test.dev' });
      const attacker = await seedUser({ email: 'city-attacker@test.dev' });
      const session = await chatRepo.createSession({ userId: owner });

      const result = await adapter.findSessionMuseum(session.id, attacker);

      // Ownership filter wins over the null-museum branch — foreign read is null,
      // never a (found, museumId: null) leak.
      expect(result).toBeNull();
    });
  },
);
