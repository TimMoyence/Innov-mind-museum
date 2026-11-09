import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { TypeOrmArtworkKnowledgeRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo';
import { TypeOrmUserMemoryRepository } from '@modules/chat/adapters/secondary/persistence/userMemory.repository.typeorm';
import { User } from '@modules/auth/domain/user/user.entity';
import { UserMemory } from '@modules/chat/domain/memory/userMemory.entity';
import { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';

const shouldRunE2E = process.env.RUN_E2E === 'true' || process.env.RUN_INTEGRATION === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('UserMemoryService personalization full lifecycle (Spec C T1.9)', () => {
  let harness: E2EHarness;
  let userMemoryService: UserMemoryService;

  beforeAll(async () => {
    harness = await createE2EHarness();
    const memoryRepo = new TypeOrmUserMemoryRepository(harness.dataSource);
    const artworkRepo = new TypeOrmArtworkKnowledgeRepo(
      harness.dataSource.getRepository(ArtworkKnowledge),
    );
    userMemoryService = new UserMemoryService(memoryRepo, undefined, { artworkRepo });
  });

  afterAll(async () => {
    await harness?.stop();
  });

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

    const userId = await seedUser(`spec-c-t1.9-${Date.now()}@test.dev`);
    for (let i = 0; i < 5; i += 1) {
      const dayStart = new Date(2026, 3, i + 1, 10, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 30 * 60_000);
      const sessionId = await seedChatSession({ userId, locale: 'fr', createdAt: dayStart });
      await seedChatMessage({ sessionId, createdAt: dayEnd });

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
