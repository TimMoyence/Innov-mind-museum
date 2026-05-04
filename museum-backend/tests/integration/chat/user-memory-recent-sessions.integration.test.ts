/**
 * Spec C T1.4 — `UserMemoryRepository.getRecentSessionsForUser` integration test.
 *
 * Validates the SQL aggregate against a real Postgres instance (testcontainer)
 * via {@link createE2EHarness}. Exercises the LEFT JOIN + MAX(createdAt) GROUP BY
 * shape that powers the locale-mode and session-duration p90 mergers.
 *
 * Gated on `RUN_E2E=true` (matches the convention used by sibling integration
 * suites that boot a real Postgres testcontainer — see
 * `tests/integration/security/idor-matrix.test.ts`). Run with:
 *
 *   RUN_E2E=true pnpm test:integration -- --testPathPattern=user-memory-recent-sessions
 */
import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { TypeOrmUserMemoryRepository } from '@modules/chat/adapters/secondary/userMemory.repository.typeorm';
import { User } from '@modules/auth/domain/user/user.entity';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('UserMemoryRepository.getRecentSessionsForUser (real PG)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;
  let repo: TypeOrmUserMemoryRepository;

  beforeAll(async () => {
    harness = await createE2EHarness();
    repo = new TypeOrmUserMemoryRepository(harness.dataSource);
  });

  afterAll(async () => {
    await harness?.stop();
  });

  /**
   * Seeds a user with a unique email and returns its numeric id.
   * @param email
   */
  async function seedUser(email: string): Promise<number> {
    const userRepo = harness.dataSource.getRepository(User);
    const saved = await userRepo.save(
      userRepo.create({
        email,
        password: '$2b$12$hashedpassword',
        role: 'visitor',
        email_verified: true,
        onboarding_completed: true,
        contentPreferences: [],
      }),
    );
    return saved.id;
  }

  /**
   * Seeds a chat session for a user with optional explicit createdAt override.
   * @param args
   * @param args.userId
   * @param args.locale
   * @param args.createdAt
   */
  async function seedChatSession(args: {
    userId: number;
    locale: string;
    createdAt?: Date;
  }): Promise<string> {
    const sessionRepo = harness.dataSource.getRepository(ChatSession);
    const session = sessionRepo.create({
      user: { id: args.userId } as User,
      locale: args.locale,
      museumMode: false,
      intent: 'default',
      ...(args.createdAt ? { createdAt: args.createdAt } : {}),
    });
    const saved = await sessionRepo.save(session);
    // `@CreateDateColumn` overrides explicit values on insert in some TypeORM
    // versions — force the timestamp via raw UPDATE when the test cares about
    // ordering by createdAt.
    if (args.createdAt) {
      await harness.dataSource
        .createQueryBuilder()
        .update(ChatSession)
        .set({ createdAt: args.createdAt })
        .where('id = :id', { id: saved.id })
        .execute();
    }
    return saved.id;
  }

  /**
   * Seeds a chat message for a session with optional explicit createdAt override.
   * @param args
   * @param args.sessionId
   * @param args.createdAt
   * @param args.text
   */
  async function seedChatMessage(args: {
    sessionId: string;
    createdAt?: Date;
    text?: string;
  }): Promise<void> {
    const messageRepo = harness.dataSource.getRepository(ChatMessage);
    const saved = await messageRepo.save(
      messageRepo.create({
        sessionId: args.sessionId,
        role: 'user',
        text: args.text ?? 'integration-test message',
      }),
    );
    if (args.createdAt) {
      await harness.dataSource
        .createQueryBuilder()
        .update(ChatMessage)
        .set({ createdAt: args.createdAt })
        .where('id = :id', { id: saved.id })
        .execute();
    }
  }

  it('returns last N sessions with lastMessageAt aggregated, ordered desc by session.createdAt', async () => {
    const userId = await seedUser(`recent-${Date.now()}@test.dev`);
    const session1 = await seedChatSession({
      userId,
      locale: 'fr',
      createdAt: new Date('2026-04-01T10:00:00Z'),
    });
    const session2 = await seedChatSession({
      userId,
      locale: 'fr',
      createdAt: new Date('2026-04-02T10:00:00Z'),
    });
    await seedChatMessage({
      sessionId: session1,
      createdAt: new Date('2026-04-01T10:30:00Z'),
    });
    await seedChatMessage({
      sessionId: session2,
      createdAt: new Date('2026-04-02T11:00:00Z'),
    });

    const result = await repo.getRecentSessionsForUser(userId, 20);
    expect(result).toHaveLength(2);
    // Most recent first
    expect(result[0].sessionId).toBe(session2);
    expect(result[0].locale).toBe('fr');
    expect(result[0].lastMessageAt?.toISOString()).toBe('2026-04-02T11:00:00.000Z');
    expect(result[1].sessionId).toBe(session1);
    expect(result[1].lastMessageAt?.toISOString()).toBe('2026-04-01T10:30:00.000Z');
  });

  it('returns lastMessageAt=null for sessions without messages', async () => {
    const userId = await seedUser(`empty-${Date.now()}@test.dev`);
    const sessionId = await seedChatSession({ userId, locale: 'en' });

    const result = await repo.getRecentSessionsForUser(userId, 20);

    const found = result.find((r) => r.sessionId === sessionId);
    expect(found).toBeDefined();
    expect(found?.locale).toBe('en');
    expect(found?.lastMessageAt).toBeNull();
  });

  it('limits to N rows', async () => {
    const userId = await seedUser(`many-${Date.now()}@test.dev`);
    const baseTimestamp = Date.now();
    for (let i = 0; i < 25; i += 1) {
      await seedChatSession({
        userId,
        locale: 'fr',
        createdAt: new Date(baseTimestamp + i * 1000),
      });
    }

    const result = await repo.getRecentSessionsForUser(userId, 20);
    expect(result).toHaveLength(20);
  });
});
