import {
  makeDeleteAccountUseCase,
  type LeadErasureLike,
} from 'tests/helpers/auth/erasure-chain.accessor';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

const shouldRun = process.env.RUN_E2E === 'true' || process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRun ? describe : describe.skip;

describeIntegration('DeleteAccountUseCase — real cascade + audit retention + leads erasure', () => {
  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const ACCOUNT_EMAIL = 'subject@example.com';

  async function seedAccount(): Promise<number> {
    const ds = harness.dataSource;

    const { User } = await import('@modules/auth/domain/user/user.entity');
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(
      userRepo.create({
        email: ACCOUNT_EMAIL,
        password: '$2b$12$hashedhashedhashedhashedhashedhashedhashedha',
        role: 'visitor',
        email_verified: true,
      }),
    );
    const userId = user.id;

    const { UserMemory } = await import('@modules/chat/domain/memory/userMemory.entity');
    await ds.getRepository(UserMemory).save(
      ds.getRepository(UserMemory).create({
        userId,
        preferredExpertise: 'beginner',
        favoritePeriods: [],
        favoriteArtists: [],
        museumsVisited: [],
        totalArtworksDiscussed: 0,
        notableArtworks: [],
        interests: [],
        summary: null,
        disabledByUser: false,
        sessionCount: 0,
      }),
    );

    const { UserConsent } = await import('@modules/auth/domain/consent/userConsent.entity');
    await ds.getRepository(UserConsent).save(
      ds.getRepository(UserConsent).create({
        userId,
        scope: 'tos_privacy',
        version: '2026-04-24',
        grantedAt: new Date(),
        revokedAt: null,
        source: 'registration',
      }),
    );

    const { AuthRefreshToken } =
      await import('@modules/auth/domain/refresh-token/authRefreshToken.entity');
    await ds.getRepository(AuthRefreshToken).save(
      ds.getRepository(AuthRefreshToken).create({
        user: { id: userId },
        jti: '11111111-1111-4111-8111-111111111111',
        familyId: '22222222-2222-4222-8222-222222222222',
        tokenHash: 'a'.repeat(64),
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    );

    const { SocialAccount } =
      await import('@modules/auth/domain/social-account/socialAccount.entity');
    await ds.getRepository(SocialAccount).save(
      ds.getRepository(SocialAccount).create({
        userId,
        provider: 'apple',
        providerUserId: `apple-${String(userId)}`,
        email: ACCOUNT_EMAIL,
      }),
    );

    await ds.query(`INSERT INTO "chat_sessions" ("userId") VALUES ($1)`, [userId]);

    const { AuditRepositoryPg } = await import('@shared/audit/audit.repository.pg');
    const auditRepo = new AuditRepositoryPg(ds);
    await auditRepo.insert({
      action: 'ACCOUNT_DELETION_REQUESTED',
      actorType: 'user',
      actorId: userId,
      targetType: 'user',
      targetId: String(userId),
    });
    await auditRepo.insert({
      action: 'ACCOUNT_DELETED',
      actorType: 'user',
      actorId: userId,
      targetType: 'user',
      targetId: String(userId),
    });

    const { Lead } = await import('@modules/leads/domain/lead/lead.entity');
    await ds.getRepository(Lead).save(
      ds.getRepository(Lead).create({
        type: 'beta',
        status: 'pending',
        payload: { email: ACCOUNT_EMAIL, consent: true },
        dedupKey: null,
        attempts: 0,
      }),
    );

    return userId;
  }

  async function buildUseCase() {
    const { UserRepositoryPg } =
      await import('@modules/auth/adapters/secondary/pg/user.repository.pg');
    const { PgLeadRepositoryHarness } =
      await import('tests/helpers/leads/pgLeadRepository.harness');
    const userRepository = new UserRepositoryPg(harness.dataSource);
    const leadErasure: LeadErasureLike = new PgLeadRepositoryHarness(harness.dataSource);
    return makeDeleteAccountUseCase({ userRepository, leadErasure });
  }

  async function countWhere(sql: string, params: unknown[] = []): Promise<number> {
    const rows = await harness.dataSource.query(sql, params);
    return Number(rows[0]?.count ?? 0);
  }

  it('cascades all child tables to zero (R9)', async () => {
    const userId = await seedAccount();
    const useCase = await buildUseCase();

    await useCase.execute(userId);

    const childTables: { table: string; col: string }[] = [
      { table: 'user_memories', col: 'user_id' },
      { table: 'user_consents', col: 'user_id' },
      { table: 'auth_refresh_tokens', col: 'userId' },
      { table: 'social_accounts', col: 'userId' },
      { table: 'chat_sessions', col: 'userId' },
    ];

    for (const { table, col } of childTables) {
      const count = await countWhere(
        `SELECT COUNT(*)::int AS count FROM "${table}" WHERE "${col}" = $1`,
        [userId],
      );
      expect({ table, count }).toEqual({ table, count: 0 });
    }
  });

  it('RETAINS the user audit_logs after deletion (R8 — legal obligation)', async () => {
    const userId = await seedAccount();
    const useCase = await buildUseCase();

    await useCase.execute(userId);

    const auditCount = await countWhere(
      `SELECT COUNT(*)::int AS count FROM "audit_logs" WHERE "actor_id" = $1`,
      [userId],
    );
    expect(auditCount).toBeGreaterThanOrEqual(2);
  });

  it('PURGES every lead matching the account email (R6)', async () => {
    const userId = await seedAccount();
    const useCase = await buildUseCase();

    await useCase.execute(userId);

    const leadCount = await countWhere(
      `SELECT COUNT(*)::int AS count FROM "leads" WHERE LOWER(payload->>'email') = LOWER($1)`,
      [ACCOUNT_EMAIL],
    );
    expect(leadCount).toBe(0);
  });
});
