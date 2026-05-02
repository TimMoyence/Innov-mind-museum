/**
 * Spec C T1.9 — `UserMemoryService` full personalization-lifecycle integration test.
 *
 * Drives `UserMemoryService.updateAfterSession` end-to-end against a real
 * Postgres testcontainer (via {@link createE2EHarness}) and asserts that the
 * three Spec C personalization fields populate after 5 in-locale sessions
 * with discussed artworks present in `ArtworkKnowledge`:
 *
 *   - `favoritePeriods` — sourced from `mergePeriods` looking up the
 *     `ArtworkKnowledge.period` of each discussed artwork.
 *   - `languagePreference` — modal locale across the recent sessions
 *     aggregate (`mergeLanguagePreference`).
 *   - `sessionDurationP90Minutes` — 90th-percentile session duration in
 *     minutes (`mergeSessionDurationP90`). Each seeded session has a 30-min
 *     duration → p90 = 30.
 *
 * Mirrors the seed-helper pattern from sibling T1.4 file
 * (`user-memory-recent-sessions.integration.test.ts`): inline `seedUser` /
 * `seedChatSession` / `seedChatMessage` using `harness.dataSource.getRepository`
 * + raw UPDATE for `@CreateDateColumn` overrides. Gated on `RUN_E2E=true`
 * (matching the existing convention).
 *
 *   RUN_E2E=true pnpm test:integration -- --testPathPattern=user-memory-personalization
 */
import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge.entity';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { TypeOrmArtworkKnowledgeRepo } from '@modules/knowledge-extraction/adapters/secondary/typeorm-artwork-knowledge.repo';
import { TypeOrmUserMemoryRepository } from '@modules/chat/adapters/secondary/userMemory.repository.typeorm';
import { User } from '@modules/auth/domain/user.entity';
import { UserMemory } from '@modules/chat/domain/userMemory.entity';
import { UserMemoryService } from '@modules/chat/useCase/user-memory.service';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('UserMemoryService personalization full lifecycle (Spec C T1.9)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;
  let userMemoryService: UserMemoryService;

  beforeAll(async () => {
    harness = await createE2EHarness();
    const memoryRepo = new TypeOrmUserMemoryRepository(harness.dataSource);
    const artworkRepo = new TypeOrmArtworkKnowledgeRepo(
      harness.dataSource.getRepository(ArtworkKnowledge),
    );
    // Constructed exactly the way `chat-module.ts:buildUserMemory` wires it:
    // PG repo + optional artworkRepo port, no cache (we don't exercise caching here).
    userMemoryService = new UserMemoryService(memoryRepo, undefined, { artworkRepo });
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
   * `@CreateDateColumn` overrides explicit values on insert in some TypeORM
   * versions — force the timestamp via raw UPDATE when ordering matters.
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

  it('after 5 sessions in fr with discussed artworks, populates all 3 personalization fields', async () => {
    // ARRANGE — seed two artworks in ArtworkKnowledge so `mergePeriods` finds
    // the `Renaissance` and `Impressionism` periods on lookup. Locale must
    // match the session locale used in updateAfterSession (4th arg).
    const artworkRepo = harness.dataSource.getRepository(ArtworkKnowledge);
    await artworkRepo.save(
      artworkRepo.create({
        title: 'Mona Lisa',
        artist: 'Leonardo',
        period: 'Renaissance',
        technique: 'Oil',
        description: 'x',
        dimensions: null,
        currentLocation: null,
        sourceUrls: [],
        confidence: 1,
        needsReview: false,
        locale: 'fr',
        historicalContext: null,
      }),
    );
    await artworkRepo.save(
      artworkRepo.create({
        title: 'Impression, soleil levant',
        artist: 'Monet',
        period: 'Impressionism',
        technique: 'Oil',
        description: 'x',
        dimensions: null,
        currentLocation: null,
        sourceUrls: [],
        confidence: 1,
        needsReview: false,
        locale: 'fr',
        historicalContext: null,
      }),
    );

    // ACT — seed 5 sessions in `fr`, each with a 30-min duration via
    // (createdAt, lastMessageAt) seeded values. Drive updateAfterSession
    // once per session so `mergeLanguagePreference` and
    // `mergeSessionDurationP90` see the cumulative aggregate.
    const userId = await seedUser(`spec-c-t1.9-${Date.now()}@test.dev`);
    for (let i = 0; i < 5; i += 1) {
      // Month index 3 = April 2026. Distinct day per session for
      // ordering determinism in `getRecentSessionsForUser`.
      const dayStart = new Date(2026, 3, i + 1, 10, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 30 * 60_000);
      const sessionId = await seedChatSession({ userId, locale: 'fr', createdAt: dayStart });
      await seedChatMessage({ sessionId, createdAt: dayEnd });

      // Session 0 discusses 'Mona Lisa' (Renaissance), sessions 1..4 all
      // discuss 'Impression, soleil levant' (Impressionism). Both periods
      // should land in `favoritePeriods` after the loop.
      await userMemoryService.updateAfterSession(
        userId,
        {
          museumName: 'Louvre',
          museumConfidence: 0.95,
          artworksDiscussed: [
            {
              title: i === 0 ? 'Mona Lisa' : 'Impression, soleil levant',
              messageId: 'm1',
              discussedAt: dayStart.toISOString(),
            },
          ],
          roomsVisited: [],
          detectedExpertise: 'beginner',
          expertiseSignals: 0,
          lastUpdated: dayStart.toISOString(),
        },
        sessionId,
        'fr',
      );
    }

    // ASSERT
    const memory = await harness.dataSource
      .getRepository(UserMemory)
      .findOne({ where: { userId } });
    expect(memory).not.toBeNull();
    expect(memory?.favoritePeriods).toEqual(
      expect.arrayContaining(['Renaissance', 'Impressionism']),
    );
    expect(memory?.languagePreference).toBe('fr');
    expect(memory?.sessionDurationP90Minutes).toBe(30);
  });
});
