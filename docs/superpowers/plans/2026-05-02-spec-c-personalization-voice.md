# Spec C — Personalization Signals + Voice Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire latent session signals (favoritePeriods population, languagePreference, sessionDurationP90Minutes) into UserMemory and the LLM prompt block; persist per-user TTS voice on `User.ttsVoice` and let the user pick from a 6-voice catalog through a settings dropdown with cross-device continuity.

**Architecture:** UserMemoryService gains an `artworkRepo` dep (cross-module port already available) plus a new `getRecentSessionsForUser` repository method. Three new private merge helpers run after the existing four in `updateAfterSession`. Voice continuity follows the existing `/auth/content-preferences` PATCH pattern: a dedicated route + use case + a `User.ttsVoice` column. Chat-media TTS reads `session.user.ttsVoice ?? env.tts.voice`; `getSessionById` already eager-loads `user`.

**Tech Stack:** Node.js 22 + Express 5 + TypeORM + PostgreSQL 16 + Zod (BE). React Native 0.83 + Expo 55 + TanStack Query (FE).

**Spec source:** `docs/superpowers/specs/2026-05-02-spec-c-personalization-voice-design.md`

---

## File Structure

### Backend (`museum-backend`)
- Create: `src/data/db/migrations/<timestamp>-AddUserMemoryPersonalizationFields.ts`
- Create: `src/data/db/migrations/<timestamp>-AddUserTtsVoice.ts`
- Modify: `src/modules/chat/domain/userMemory.entity.ts` — add 2 columns.
- Modify: `src/modules/chat/domain/userMemory.repository.interface.ts` — extend `UserMemoryUpdates` union; add `getRecentSessionsForUser` + `RecentSessionAggregate` type.
- Modify: `src/modules/chat/adapters/secondary/userMemory.repository.typeorm.ts` — implement `getRecentSessionsForUser`.
- Modify: `src/modules/chat/useCase/user-memory.service.ts` — add `artworkRepo` constructor param; add `mergePeriods`, `mergeLanguagePreference`, `mergeSessionDurationP90`; call them from `updateAfterSession`.
- Modify: `src/modules/chat/useCase/user-memory.prompt.ts` — render two new lines in the block.
- Modify: `src/modules/chat/chat-module.ts` line 198 — wire `artworkRepo` and chat repo into `UserMemoryService` ctor.
- Create: `src/modules/chat/voice-catalog.ts` — `TTS_VOICES`, `TtsVoice`, `isTtsVoice`.
- Modify: `src/modules/auth/domain/user.entity.ts` — add `ttsVoice` column.
- Create: `src/modules/auth/useCase/updateTtsVoice.useCase.ts` — validate voice + persist.
- Modify: `src/modules/auth/domain/user.repository.interface.ts` — add `updateTtsVoice` method.
- Modify: `src/modules/auth/adapters/secondary/user.repository.typeorm.ts` — implement `updateTtsVoice`.
- Modify: `src/modules/auth/useCase/index.ts` — instantiate the new use case.
- Modify: `src/modules/auth/useCase/getProfile.useCase.ts` — return `ttsVoice` on the profile DTO.
- Modify: `src/modules/auth/adapters/primary/http/auth.route.ts` — `GET /auth/me` returns `ttsVoice`; new `PATCH /auth/tts-voice` route.
- Modify: `src/modules/chat/useCase/chat-media.service.ts` — read `session.user?.ttsVoice ?? env.tts.voice` at line 288.
- Modify: `openapi/openapi.json` — User schema gains `ttsVoice`; new PATCH route schema.
- Test: `tests/unit/chat/user-memory-merge-periods.test.ts`
- Test: `tests/unit/chat/user-memory-merge-language.test.ts`
- Test: `tests/unit/chat/user-memory-merge-p90.test.ts`
- Test: `tests/unit/chat/user-memory-prompt.test.ts` (extend existing)
- Test: `tests/unit/chat/voice-catalog.test.ts`
- Test: `tests/unit/auth/updateTtsVoice-usecase.test.ts`
- Test: `tests/unit/chat/chat-media-tts-voice.test.ts`
- Test: `tests/integration/chat/user-memory-personalization.integration.test.ts`
- Test: `tests/integration/auth/me-tts-voice.integration.test.ts`

### Mobile (`museum-frontend`)
- Modify: `shared/api/generated/openapi.ts` — regenerated.
- Create: `features/settings/voice-catalog.ts` — mirror of BE catalog.
- Create: `features/settings/application/useUpdateTtsVoice.ts` — TanStack `useMutation` calling PATCH /auth/tts-voice.
- Create: `features/settings/ui/VoicePreferenceSection.tsx` — section with row picker (Modal + FlatList).
- Modify: existing settings screen (path verified during impl) to mount `VoicePreferenceSection`.
- Modify: 8 locale dictionaries — add `settings.voice.*` keys.
- Test: `__tests__/features/settings/VoicePreferenceSection.test.tsx`
- Test: `__tests__/features/settings/voice-catalog.test.ts` (parity sentinel)

---

## Pre-flight

- [ ] **Step P.1: Verify branch + tree state**

Run:
```bash
git status
git log --oneline -3
```
Expected: working tree dirty only with the spec doc commit (`c21051be`) at HEAD; no other staged or unstaged changes that you don't expect.

- [ ] **Step P.2: Baseline tests**

Run:
```bash
cd museum-backend && pnpm lint && pnpm test
cd ../museum-frontend && npm run lint && npm test
cd ../museum-web && pnpm lint && pnpm test
```
Expected: all green. Record counts: BE tests should be ≥3700, FE ≥1665, Web ≥226.

- [ ] **Step P.3: Verify Postgres dev container running**

Run:
```bash
docker ps | grep dev-postgres
```
Expected: container running on port 5433. If not, start with `docker compose -f docker-compose.dev.yml up -d`.

- [ ] **Step P.4: Refresh GitNexus index if it warns stale**

Already refreshed at session start (18,112 nodes / 30,560 edges). Skip unless an MCP call complains.

---

## Section 1 — UserMemory Personalization

### Task 1.1: Migration `AddUserMemoryPersonalizationFields`

**Files:**
- Create: `museum-backend/src/data/db/migrations/<timestamp>-AddUserMemoryPersonalizationFields.ts`

- [ ] **Step 1.1.1: Generate migration via CLI**

Run:
```bash
cd museum-backend
node scripts/migration-cli.cjs generate --name=AddUserMemoryPersonalizationFields
```
Expected: a new file in `src/data/db/migrations/` with `up()` adding `language_preference VARCHAR(10) NULL` and `session_duration_p90_minutes INTEGER NULL` to `user_memories`. The CLI runs `tsc` first; the entity columns added in Task 1.2 must come BEFORE this step, but since we want migration to land first, manually edit the generated migration if generator can't infer the columns yet. **Reorder note:** swap order — first add the entity columns (Task 1.2) THEN generate the migration; this task assumes Task 1.2 was already applied to the entity file.

> **Reorder applied:** Run Task 1.2 BEFORE 1.1.1. Task 1.1 below assumes the entity columns exist.

- [ ] **Step 1.1.2: Inspect generated SQL**

Open the generated file. Verify:
- `up()` runs `ALTER TABLE "user_memories" ADD "language_preference" character varying(10)` and `ADD "session_duration_p90_minutes" integer`.
- `down()` runs the inverse drops in reverse order.
- No drift: nothing else in `up()` or `down()`.

- [ ] **Step 1.1.3: Run migration on a clean DB and verify drift is zero**

Run:
```bash
cd museum-backend
pnpm migration:run
node scripts/migration-cli.cjs generate --name=DriftCheck
```
Expected: the second generate produces an empty migration body. Delete the empty `DriftCheck` file.

- [ ] **Step 1.1.4: Commit migration**

```bash
git commit -m "feat(chat,db): migration AddUserMemoryPersonalizationFields

Adds language_preference (varchar 10 NULL) and session_duration_p90_minutes
(integer NULL) to user_memories. Signals are populated by user-memory.service
mergers added in subsequent tasks; nullable so existing rows are valid.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/data/db/migrations/
```

### Task 1.2: Add columns to `UserMemory` entity (precedes migration generation)

**Files:**
- Modify: `museum-backend/src/modules/chat/domain/userMemory.entity.ts`

- [ ] **Step 1.2.1: Write failing test that asserts new columns exist on the entity**

Append to `museum-backend/tests/unit/chat/user-memory-entity.test.ts` (create the file if it doesn't exist):

```ts
import { getMetadataArgsStorage } from 'typeorm';
import { UserMemory } from '@modules/chat/domain/userMemory.entity';

describe('UserMemory entity columns', () => {
  it('declares languagePreference column', () => {
    const cols = getMetadataArgsStorage().columns.filter((c) => c.target === UserMemory);
    const col = cols.find((c) => c.propertyName === 'languagePreference');
    expect(col).toBeDefined();
    expect(col?.options.name).toBe('language_preference');
    expect(col?.options.type).toBe('varchar');
    expect(col?.options.nullable).toBe(true);
  });

  it('declares sessionDurationP90Minutes column', () => {
    const cols = getMetadataArgsStorage().columns.filter((c) => c.target === UserMemory);
    const col = cols.find((c) => c.propertyName === 'sessionDurationP90Minutes');
    expect(col).toBeDefined();
    expect(col?.options.name).toBe('session_duration_p90_minutes');
    expect(col?.options.type).toBe('integer');
    expect(col?.options.nullable).toBe(true);
  });
});
```

- [ ] **Step 1.2.2: Run test → expect FAIL**

Run:
```bash
cd museum-backend && pnpm test -- --testPathPattern=user-memory-entity
```
Expected: FAIL — properties not declared.

- [ ] **Step 1.2.3: Add columns to entity**

In `userMemory.entity.ts`, after the `lastSessionId` column (around line 67) and before `@VersionColumn`:

```ts
@Column({ type: 'varchar', length: 10, nullable: true, name: 'language_preference' })
languagePreference!: string | null;

@Column({ type: 'integer', nullable: true, name: 'session_duration_p90_minutes' })
sessionDurationP90Minutes!: number | null;
```

- [ ] **Step 1.2.4: Run test → expect PASS**

Run:
```bash
cd museum-backend && pnpm test -- --testPathPattern=user-memory-entity
```
Expected: PASS.

- [ ] **Step 1.2.5: Commit**

```bash
git commit -m "feat(chat): add languagePreference + sessionDurationP90Minutes to UserMemory entity

Both nullable; populated by service mergers landing in next tasks. Migration
generated separately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/chat/domain/userMemory.entity.ts \
     museum-backend/tests/unit/chat/user-memory-entity.test.ts
```

> **Now run Task 1.1** above to generate the migration with the columns present.

### Task 1.3: Extend `UserMemoryUpdates` union + repository interface

**Files:**
- Modify: `museum-backend/src/modules/chat/domain/userMemory.repository.interface.ts`

- [ ] **Step 1.3.1: Inspect current shape**

Run:
```bash
sed -n '1,40p' museum-backend/src/modules/chat/domain/userMemory.repository.interface.ts
```
Identify the `UserMemoryUpdates` union and the existing methods (`getByUserId`, `upsert`, `deleteByUserId`).

- [ ] **Step 1.3.2: Write failing test**

Append to `museum-backend/tests/unit/chat/user-memory-repo.test.ts` (extend the existing file):

```ts
it('upserts languagePreference + sessionDurationP90Minutes through UserMemoryUpdates', async () => {
  const repo = makeInMemoryUserMemoryRepository(); // existing test helper
  await repo.upsert(42, { languagePreference: 'fr', sessionDurationP90Minutes: 25 });
  const m = await repo.getByUserId(42);
  expect(m?.languagePreference).toBe('fr');
  expect(m?.sessionDurationP90Minutes).toBe(25);
});

it('exposes getRecentSessionsForUser returning RecentSessionAggregate[]', async () => {
  const repo = makeInMemoryUserMemoryRepository();
  expect(typeof repo.getRecentSessionsForUser).toBe('function');
});
```

> If `makeInMemoryUserMemoryRepository` doesn't exist as a helper, the existing test file must already contain its own in-memory mock — extend that one with the new method too.

- [ ] **Step 1.3.3: Run test → expect FAIL**

Run:
```bash
pnpm test -- --testPathPattern=user-memory-repo
```
Expected: FAIL — union doesn't allow these keys; method missing.

- [ ] **Step 1.3.4: Extend interface**

In `userMemory.repository.interface.ts`, locate the `UserMemoryUpdates` union and add `'languagePreference' | 'sessionDurationP90Minutes'` to it.

Then add a new exported type and a new method on the interface:

```ts
export interface RecentSessionAggregate {
  sessionId: string;
  locale: string;
  createdAt: Date;
  /** null when the session has no messages yet. */
  lastMessageAt: Date | null;
}
```

```ts
// Inside UserMemoryRepository interface:
getRecentSessionsForUser(userId: number, limit: number): Promise<RecentSessionAggregate[]>;
```

Update the in-memory mock used by tests so it satisfies the new shape (return `[]` by default; tests that need data inject it).

- [ ] **Step 1.3.5: Run test → expect PASS**

Run:
```bash
pnpm test -- --testPathPattern=user-memory-repo
```
Expected: PASS.

- [ ] **Step 1.3.6: Commit**

```bash
git commit -m "feat(chat): extend UserMemoryUpdates + add getRecentSessionsForUser port

UserMemoryUpdates accepts languagePreference + sessionDurationP90Minutes.
New port method returns last N sessions with locale + lastMessageAt for the
mode/p90 mergers; pg impl in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/chat/domain/userMemory.repository.interface.ts \
     museum-backend/tests/unit/chat/user-memory-repo.test.ts
```

### Task 1.4: Implement `getRecentSessionsForUser` in PG adapter

**Files:**
- Modify: `museum-backend/src/modules/chat/adapters/secondary/userMemory.repository.typeorm.ts`
- Test: `museum-backend/tests/integration/chat/user-memory-recent-sessions.integration.test.ts`

- [ ] **Step 1.4.1: Write failing integration test**

Create `museum-backend/tests/integration/chat/user-memory-recent-sessions.integration.test.ts`. Pattern follows existing testcontainer integration tests in `tests/integration/chat/` — mirror an existing one for the bootstrap:

```ts
import { createE2EHarness } from '../../helpers/e2e/e2e-app-harness';

describe('UserMemoryRepository.getRecentSessionsForUser', () => {
  let harness: Awaited<ReturnType<typeof createE2EHarness>>;
  beforeAll(async () => { harness = await createE2EHarness(); });
  afterAll(async () => { await harness.teardown(); });

  it('returns last N sessions with lastMessageAt aggregated, ordered desc by session.createdAt', async () => {
    const userId = await harness.seedUser({ email: 'recent@test.dev' });
    const session1 = await harness.seedChatSession({ userId, locale: 'fr', createdAt: new Date('2026-04-01T10:00:00Z') });
    const session2 = await harness.seedChatSession({ userId, locale: 'fr', createdAt: new Date('2026-04-02T10:00:00Z') });
    await harness.seedChatMessage({ sessionId: session1, createdAt: new Date('2026-04-01T10:30:00Z') });
    await harness.seedChatMessage({ sessionId: session2, createdAt: new Date('2026-04-02T11:00:00Z') });

    const repo = harness.getUserMemoryRepository();
    const result = await repo.getRecentSessionsForUser(userId, 20);
    expect(result).toHaveLength(2);
    expect(result[0].sessionId).toBe(session2);  // most recent first
    expect(result[0].locale).toBe('fr');
    expect(result[0].lastMessageAt?.toISOString()).toBe('2026-04-02T11:00:00.000Z');
  });

  it('returns lastMessageAt=null for sessions without messages', async () => {
    const userId = await harness.seedUser({ email: 'empty@test.dev' });
    const session = await harness.seedChatSession({ userId, locale: 'en' });
    const repo = harness.getUserMemoryRepository();
    const result = await repo.getRecentSessionsForUser(userId, 20);
    expect(result.find((r) => r.sessionId === session)?.lastMessageAt).toBeNull();
  });

  it('limits to N rows', async () => {
    const userId = await harness.seedUser({ email: 'many@test.dev' });
    for (let i = 0; i < 25; i += 1) {
      await harness.seedChatSession({ userId, locale: 'fr', createdAt: new Date(Date.now() + i * 1000) });
    }
    const repo = harness.getUserMemoryRepository();
    const result = await repo.getRecentSessionsForUser(userId, 20);
    expect(result).toHaveLength(20);
  });
});
```

> If `harness.seedChatSession`, `seedChatMessage`, `seedUser`, `getUserMemoryRepository` helpers don't exist, add minimal versions in `tests/helpers/e2e/e2e-app-harness.ts` as part of this task. They mirror the patterns already used by other integration tests in this folder.

- [ ] **Step 1.4.2: Run test → expect FAIL**

Run:
```bash
pnpm test:e2e -- --testPathPattern=user-memory-recent-sessions
```
Expected: FAIL — method not implemented (compilation error or 'function not defined').

- [ ] **Step 1.4.3: Implement the method on the PG adapter**

In `userMemory.repository.typeorm.ts`, add:

```ts
async getRecentSessionsForUser(userId: number, limit: number): Promise<RecentSessionAggregate[]> {
  const rows = await this.dataSource
    .createQueryBuilder()
    .select('s.id', 'sessionId')
    .addSelect('s.locale', 'locale')
    .addSelect('s.createdAt', 'createdAt')
    .addSelect('MAX(m.createdAt)', 'lastMessageAt')
    .from(ChatSession, 's')
    .leftJoin(ChatMessage, 'm', 'm.session_id = s.id')
    .where('s.userId = :userId', { userId })
    .groupBy('s.id')
    .orderBy('s.createdAt', 'DESC')
    .limit(limit)
    .getRawMany<{ sessionId: string; locale: string; createdAt: Date; lastMessageAt: Date | null }>();

  return rows.map((r) => ({
    sessionId: r.sessionId,
    locale: r.locale,
    createdAt: new Date(r.createdAt),
    lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt) : null,
  }));
}
```

Add the imports for `ChatSession`, `ChatMessage` from their domain entities. The repository constructor must already have access to a `DataSource` — if not, add `private readonly dataSource: DataSource` and update the wiring in `chat-module.ts`.

- [ ] **Step 1.4.4: Run test → expect PASS**

Run:
```bash
pnpm test:e2e -- --testPathPattern=user-memory-recent-sessions
```
Expected: PASS.

- [ ] **Step 1.4.5: Commit**

```bash
git commit -m "feat(chat,pg): UserMemoryRepository.getRecentSessionsForUser

Aggregates the user's last N sessions with MAX(messages.createdAt) per session.
Powers the mode/p90 mergers in user-memory.service.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/chat/adapters/secondary/userMemory.repository.typeorm.ts \
     museum-backend/tests/integration/chat/user-memory-recent-sessions.integration.test.ts \
     museum-backend/tests/helpers/e2e/e2e-app-harness.ts
```

### Task 1.5: `mergePeriods` helper + `artworkRepo` injection

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/user-memory.service.ts`
- Modify: `museum-backend/src/modules/chat/chat-module.ts` (line 198)
- Test: `museum-backend/tests/unit/chat/user-memory-merge-periods.test.ts`

- [ ] **Step 1.5.1: Write failing test**

Create `museum-backend/tests/unit/chat/user-memory-merge-periods.test.ts`:

```ts
import { UserMemoryService } from '@modules/chat/useCase/user-memory.service';
import { makeUserMemoryRepoStub } from '../../helpers/chat/userMemory.fixtures';

import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge.entity';

const makeArtworkRepoStub = (
  byTitle: Record<string, Partial<ArtworkKnowledge>>,
): ArtworkKnowledgeRepoPort => ({
  findByTitleAndLocale: async (title) => (byTitle[title] as ArtworkKnowledge) ?? null,
  searchByTitle: async () => [],
  upsertFromClassification: async (data) => data as ArtworkKnowledge,
  findNeedsReview: async () => [],
  approve: async () => null,
});

describe('UserMemoryService.mergePeriods (Spec C)', () => {
  it('writes new periods from discussed artworks, deduped case-insensitively', async () => {
    const repo = makeUserMemoryRepoStub({ favoritePeriods: ['Renaissance'] });
    const artworkRepo = makeArtworkRepoStub({
      'Mona Lisa': { period: 'Renaissance' },
      'Impression, soleil levant': { period: 'Impressionism' },
    });
    const svc = new UserMemoryService(repo, undefined, { artworkRepo });

    await svc.updateAfterSession(1, {
      museumName: 'Louvre',
      museumConfidence: 0.9,
      artworksDiscussed: [
        { title: 'Mona Lisa', messageId: 'm1', discussedAt: '2026-05-02T10:00:00Z' },
        { title: 'Impression, soleil levant', messageId: 'm2', discussedAt: '2026-05-02T10:01:00Z' },
      ],
      roomsVisited: [],
      detectedExpertise: 'beginner',
      expertiseSignals: 0,
      lastUpdated: '2026-05-02T10:01:00Z',
    }, 'sess-1');

    expect(repo.upsertCalls[0][1].favoritePeriods).toEqual(['Renaissance', 'Impressionism']);
  });

  it('caps at MAX_PERIODS=10 keeping the most recent', async () => {
    const existing = Array.from({ length: 10 }, (_, i) => `Period${i}`);
    const repo = makeUserMemoryRepoStub({ favoritePeriods: existing });
    const artworkRepo = makeArtworkRepoStub({ NewArt: { period: 'Brand New' } });
    const svc = new UserMemoryService(repo, undefined, { artworkRepo });

    await svc.updateAfterSession(1, {
      museumName: 'X', museumConfidence: 1, roomsVisited: [],
      detectedExpertise: 'beginner', expertiseSignals: 0,
      lastUpdated: '2026-05-02T10:00:00Z',
      artworksDiscussed: [{ title: 'NewArt', messageId: 'm1', discussedAt: '2026-05-02T10:00:00Z' }],
    }, 'sess-1');

    expect(repo.upsertCalls[0][1].favoritePeriods).toHaveLength(10);
    expect(repo.upsertCalls[0][1].favoritePeriods?.[9]).toBe('Brand New');
    expect(repo.upsertCalls[0][1].favoritePeriods).not.toContain('Period0');
  });

  it('skips writing when no new period is found', async () => {
    const repo = makeUserMemoryRepoStub({ favoritePeriods: ['Renaissance'] });
    const artworkRepo = makeArtworkRepoStub({}); // every lookup returns null
    const svc = new UserMemoryService(repo, undefined, { artworkRepo });

    await svc.updateAfterSession(1, {
      museumName: 'X', museumConfidence: 1, roomsVisited: [],
      detectedExpertise: 'beginner', expertiseSignals: 0,
      lastUpdated: '2026-05-02T10:00:00Z',
      artworksDiscussed: [{ title: 'Unknown', messageId: 'm1', discussedAt: '2026-05-02T10:00:00Z' }],
    }, 'sess-1');

    expect(repo.upsertCalls[0][1].favoritePeriods).toBeUndefined();
  });
});
```

`makeUserMemoryRepoStub`: extend `tests/helpers/chat/userMemory.fixtures.ts` to expose a stub that captures `upsert` calls (extending the existing helper). Add helper signature `makeUserMemoryRepoStub(initial?: Partial<UserMemory>): UserMemoryRepository & { upsertCalls: [number, UserMemoryUpdates][] }`. Return `[]` from `getRecentSessionsForUser` so the language/p90 mergers no-op for this test.

- [ ] **Step 1.5.2: Run test → expect FAIL**

Run:
```bash
pnpm test -- --testPathPattern=user-memory-merge-periods
```
Expected: FAIL — `mergePeriods` not implemented; constructor signature does not accept `{ artworkRepo }`.

- [ ] **Step 1.5.3: Extend `UserMemoryService` constructor**

In `user-memory.service.ts`, replace the constructor with:

```ts
export interface UserMemoryServiceOptionalDeps {
  artworkRepo?: ArtworkKnowledgeRepoPort;
}

export class UserMemoryService {
  private readonly repository: UserMemoryRepository;
  private readonly cache?: CacheService;
  private readonly artworkRepo?: ArtworkKnowledgeRepoPort;

  constructor(
    repository: UserMemoryRepository,
    cache?: CacheService,
    optional?: UserMemoryServiceOptionalDeps,
  ) {
    this.repository = repository;
    this.cache = cache;
    this.artworkRepo = optional?.artworkRepo;
  }
  // ... rest unchanged
}
```

Add the import:
```ts
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
```

- [ ] **Step 1.5.4: Implement `mergePeriods`**

After the existing `mergeArtists` helper (and importing `MAX_PERIODS = 10` next to other constants), add:

```ts
const MAX_PERIODS = 10;

private async mergePeriods(
  updates: UserMemoryUpdates,
  existing: UserMemory | null,
  visitContext: VisitContext,
  locale: string,
): Promise<void> {
  if (!this.artworkRepo) return;
  if (visitContext.artworksDiscussed.length === 0) return;

  const existingPeriods = existing?.favoritePeriods ?? [];
  const lowerExisting = new Set(existingPeriods.map((p) => p.toLowerCase()));
  const newPeriods: string[] = [];

  for (const a of visitContext.artworksDiscussed) {
    try {
      const knowledge = await this.artworkRepo.findByTitleAndLocale(a.title, locale);
      const period = knowledge?.period?.trim();
      if (!period) continue;
      const lower = period.toLowerCase();
      if (lowerExisting.has(lower)) continue;
      lowerExisting.add(lower);
      newPeriods.push(period);
    } catch (err) {
      logger.warn('user_memory_period_lookup_failed', {
        title: a.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (newPeriods.length === 0) return;
  updates.favoritePeriods = [...existingPeriods, ...newPeriods].slice(-MAX_PERIODS);
}
```

Then call it from `updateAfterSession`. Update the method signature to accept the locale (default `'en'`):

```ts
async updateAfterSession(
  userId: number,
  visitContext: VisitContext | null | undefined,
  sessionId: string,
  locale = 'en',
): Promise<void> {
  // ... existing repo + updates setup ...
  if (visitContext) {
    mergeExpertise(updates, visitContext);
    mergeMuseums(updates, existing, visitContext.museumName);
    mergeArtworks(updates, existing, visitContext, sessionId);
    mergeArtists(updates, existing, visitContext);
    await this.mergePeriods(updates, existing, visitContext, locale); // NEW
  }
  // ... rest unchanged
}
```

- [ ] **Step 1.5.5: Run test → expect PASS**

Run:
```bash
pnpm test -- --testPathPattern=user-memory-merge-periods
```
Expected: PASS.

- [ ] **Step 1.5.6: Update existing call sites of `updateAfterSession`**

Run:
```bash
grep -rn "updateAfterSession" src/modules/chat/ tests/
```
For each caller, pass `session.locale ?? 'en'` as the new fourth argument. Most callers live in `chat-message.service.ts` / `commitAssistantResponse` — verify which.

- [ ] **Step 1.5.7: Wire `artworkRepo` into the chat module DI**

In `museum-backend/src/modules/chat/chat-module.ts` line 198, change:
```ts
return new UserMemoryService(repo, cache);
```
to:
```ts
return new UserMemoryService(repo, cache, { artworkRepo });
```

`artworkRepo` must be available in the surrounding scope via the existing knowledge-extraction module wiring. If not yet imported, add at the top of the function building the chat module:
```ts
const artworkRepo = knowledgeExtractionModule.artworkRepo;
```
or whatever symbol the knowledge-extraction module exports. Verify the exact name with `grep "artworkRepo\|ArtworkKnowledgeRepo" museum-backend/src/modules/knowledge-extraction/**/*.ts | head`.

- [ ] **Step 1.5.8: Run BE lint**

Run:
```bash
pnpm lint
```
Expected: clean.

- [ ] **Step 1.5.9: Commit**

```bash
git commit -m "feat(chat): mergePeriods helper + ArtworkKnowledgeRepo injection

UserMemoryService gains an optional ArtworkKnowledgeRepoPort. mergePeriods
runs after the four existing mergers and writes new ArtworkKnowledge.period
values onto UserMemory.favoritePeriods, deduped + capped at 10. Existing
callers updated with locale argument.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/chat/useCase/user-memory.service.ts \
     museum-backend/src/modules/chat/chat-module.ts \
     museum-backend/tests/unit/chat/user-memory-merge-periods.test.ts \
     museum-backend/tests/helpers/chat/userMemory.fixtures.ts
```

### Task 1.6: `mergeLanguagePreference` helper

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/user-memory.service.ts`
- Test: `museum-backend/tests/unit/chat/user-memory-merge-language.test.ts`

- [ ] **Step 1.6.1: Write failing test**

Create `museum-backend/tests/unit/chat/user-memory-merge-language.test.ts`:

```ts
import { UserMemoryService } from '@modules/chat/useCase/user-memory.service';
import { makeUserMemoryRepoStub } from '../../helpers/chat/userMemory.fixtures';

describe('UserMemoryService.mergeLanguagePreference', () => {
  it('writes mode of recent locales when changed from existing', async () => {
    const repo = makeUserMemoryRepoStub({ languagePreference: null });
    repo.recentSessions = [
      { sessionId: 's3', locale: 'fr', createdAt: new Date('2026-04-03'), lastMessageAt: new Date() },
      { sessionId: 's2', locale: 'fr', createdAt: new Date('2026-04-02'), lastMessageAt: new Date() },
      { sessionId: 's1', locale: 'en', createdAt: new Date('2026-04-01'), lastMessageAt: new Date() },
    ];
    const svc = new UserMemoryService(repo);

    await svc.updateAfterSession(1, null, 'sess-1');

    expect(repo.upsertCalls[0][1].languagePreference).toBe('fr');
  });

  it('uses most recent on tie', async () => {
    const repo = makeUserMemoryRepoStub({ languagePreference: null });
    repo.recentSessions = [
      { sessionId: 's2', locale: 'en', createdAt: new Date('2026-04-02'), lastMessageAt: new Date() },
      { sessionId: 's1', locale: 'fr', createdAt: new Date('2026-04-01'), lastMessageAt: new Date() },
    ];
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-1');
    expect(repo.upsertCalls[0][1].languagePreference).toBe('en');
  });

  it('no-ops when value unchanged from existing', async () => {
    const repo = makeUserMemoryRepoStub({ languagePreference: 'fr' });
    repo.recentSessions = [
      { sessionId: 's1', locale: 'fr', createdAt: new Date(), lastMessageAt: new Date() },
    ];
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-1');
    expect(repo.upsertCalls[0][1].languagePreference).toBeUndefined();
  });
});
```

`makeUserMemoryRepoStub` (already extended in Task 1.5) gains a `recentSessions` field returned by `getRecentSessionsForUser`.

- [ ] **Step 1.6.2: Run test → expect FAIL**

Run:
```bash
pnpm test -- --testPathPattern=user-memory-merge-language
```
Expected: FAIL — helper not implemented.

- [ ] **Step 1.6.3: Implement `mergeLanguagePreference`**

In `user-memory.service.ts`, add:

```ts
private mergeLanguagePreference(
  updates: UserMemoryUpdates,
  recentSessions: RecentSessionAggregate[],
  existing: UserMemory | null,
): void {
  if (recentSessions.length === 0) return;

  const tally = new Map<string, number>();
  for (const s of recentSessions) {
    tally.set(s.locale, (tally.get(s.locale) ?? 0) + 1);
  }

  let mode = recentSessions[0].locale;
  let modeCount = tally.get(mode) ?? 0;
  for (const [locale, count] of tally) {
    if (count > modeCount) {
      mode = locale;
      modeCount = count;
    }
  }
  // Tie-breaker: when the running mode shares its count with another locale,
  // the iteration above keeps the first one seen — initialised to recentSessions[0].locale,
  // i.e. the most recent session. That matches the spec.

  if (existing?.languagePreference === mode) return;
  updates.languagePreference = mode;
}
```

Then call it inside `updateAfterSession`:
```ts
const recentSessions = await this.repository.getRecentSessionsForUser(userId, RECENT_SESSIONS_LIMIT);
this.mergeLanguagePreference(updates, recentSessions, existing);
```

Add `const RECENT_SESSIONS_LIMIT = 20;` constant at module top.

Add the import: `import type { RecentSessionAggregate } from '../domain/userMemory.repository.interface';`

- [ ] **Step 1.6.4: Run test → expect PASS**

Run:
```bash
pnpm test -- --testPathPattern=user-memory-merge-language
```
Expected: PASS.

- [ ] **Step 1.6.5: Commit**

```bash
git commit -m "feat(chat): mergeLanguagePreference (mode of last 20 session locales)

Tie-breaker: most recent session wins. No-op when value unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/chat/useCase/user-memory.service.ts \
     museum-backend/tests/unit/chat/user-memory-merge-language.test.ts \
     museum-backend/tests/helpers/chat/userMemory.fixtures.ts
```

### Task 1.7: `mergeSessionDurationP90` helper

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/user-memory.service.ts`
- Test: `museum-backend/tests/unit/chat/user-memory-merge-p90.test.ts`

- [ ] **Step 1.7.1: Write failing test**

Create `museum-backend/tests/unit/chat/user-memory-merge-p90.test.ts`:

```ts
import { UserMemoryService } from '@modules/chat/useCase/user-memory.service';
import { makeUserMemoryRepoStub } from '../../helpers/chat/userMemory.fixtures';

const minutes = (n: number) => n * 60_000;
const session = (i: number, durationMin: number) => ({
  sessionId: `s${String(i)}`,
  locale: 'fr',
  createdAt: new Date(2026, 3, i, 10, 0, 0),
  lastMessageAt: new Date(new Date(2026, 3, i, 10, 0, 0).getTime() + minutes(durationMin)),
});

describe('UserMemoryService.mergeSessionDurationP90', () => {
  it('skips when fewer than 5 sessions', async () => {
    const repo = makeUserMemoryRepoStub({ sessionDurationP90Minutes: null });
    repo.recentSessions = [session(1, 10), session(2, 12), session(3, 15), session(4, 20)];
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-x');
    expect(repo.upsertCalls[0][1].sessionDurationP90Minutes).toBeUndefined();
  });

  it('computes p90 over 10 sessions', async () => {
    const repo = makeUserMemoryRepoStub({ sessionDurationP90Minutes: null });
    // durations 5..50 minutes (10 values, p90 index = ceil(0.9*10)-1 = 8 -> 45)
    repo.recentSessions = Array.from({ length: 10 }, (_, i) => session(i + 1, (i + 1) * 5));
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-x');
    expect(repo.upsertCalls[0][1].sessionDurationP90Minutes).toBe(45);
  });

  it('clamps non-positive durations to 1', async () => {
    const repo = makeUserMemoryRepoStub({ sessionDurationP90Minutes: null });
    repo.recentSessions = [
      session(1, -5), session(2, 0), session(3, 5), session(4, 7), session(5, 10),
    ];
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-x');
    // Sorted clamped durations: [1, 1, 5, 7, 10]; p90 index = ceil(4.5)-1 = 4 -> 10
    expect(repo.upsertCalls[0][1].sessionDurationP90Minutes).toBe(10);
  });

  it('caps at 240 minutes', async () => {
    const repo = makeUserMemoryRepoStub({ sessionDurationP90Minutes: null });
    repo.recentSessions = Array.from({ length: 5 }, (_, i) => session(i + 1, 600)); // 10h each
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-x');
    expect(repo.upsertCalls[0][1].sessionDurationP90Minutes).toBe(240);
  });

  it('no-ops when value unchanged', async () => {
    const repo = makeUserMemoryRepoStub({ sessionDurationP90Minutes: 45 });
    repo.recentSessions = Array.from({ length: 10 }, (_, i) => session(i + 1, (i + 1) * 5));
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-x');
    expect(repo.upsertCalls[0][1].sessionDurationP90Minutes).toBeUndefined();
  });
});
```

- [ ] **Step 1.7.2: Run test → expect FAIL**

Run:
```bash
pnpm test -- --testPathPattern=user-memory-merge-p90
```
Expected: FAIL.

- [ ] **Step 1.7.3: Implement helper**

In `user-memory.service.ts`:

```ts
const MIN_SESSIONS_FOR_P90 = 5;
const MAX_DURATION_MINUTES = 240;

private mergeSessionDurationP90(
  updates: UserMemoryUpdates,
  recentSessions: RecentSessionAggregate[],
  existing: UserMemory | null,
): void {
  const durations: number[] = [];
  for (const s of recentSessions) {
    if (!s.lastMessageAt) continue;
    const ms = s.lastMessageAt.getTime() - s.createdAt.getTime();
    durations.push(Math.max(1, Math.round(ms / 60_000)));
  }

  if (durations.length < MIN_SESSIONS_FOR_P90) return;

  durations.sort((a, b) => a - b);
  const idx = Math.ceil(0.9 * durations.length) - 1;
  const p90 = Math.min(MAX_DURATION_MINUTES, durations[idx]);

  if (existing?.sessionDurationP90Minutes === p90) return;
  updates.sessionDurationP90Minutes = p90;
}
```

Call from `updateAfterSession` after `mergeLanguagePreference`, reusing the `recentSessions` already fetched in Task 1.6.

- [ ] **Step 1.7.4: Run test → expect PASS**

Run:
```bash
pnpm test -- --testPathPattern=user-memory-merge-p90
```
Expected: PASS.

- [ ] **Step 1.7.5: Commit**

```bash
git commit -m "feat(chat): mergeSessionDurationP90 over recent 20 sessions

Min 5 sessions to compute. Clamp negative/zero durations to 1 minute, cap p90
at 240 minutes (4h). No-op when value unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/chat/useCase/user-memory.service.ts \
     museum-backend/tests/unit/chat/user-memory-merge-p90.test.ts
```

### Task 1.8: Prompt block extension

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/user-memory.prompt.ts`
- Test: `museum-backend/tests/unit/chat/user-memory-prompt.test.ts` (extend)

- [ ] **Step 1.8.1: Write failing tests**

Append to `museum-backend/tests/unit/chat/user-memory-prompt.test.ts`:

```ts
it('renders languagePreference when set', () => {
  const block = buildUserMemoryPromptBlock({
    ...baseMemory,
    languagePreference: 'fr',
  });
  expect(block).toContain('User typically converses in: fr');
});

it('renders sessionDurationP90Minutes when set', () => {
  const block = buildUserMemoryPromptBlock({
    ...baseMemory,
    sessionDurationP90Minutes: 35,
  });
  expect(block).toContain('Typical session length: ~35 minutes');
});

it('omits both lines when null', () => {
  const block = buildUserMemoryPromptBlock({
    ...baseMemory,
    languagePreference: null,
    sessionDurationP90Minutes: null,
  });
  expect(block).not.toContain('typically converses');
  expect(block).not.toContain('Typical session length');
});

it('sanitizes injected content (zero-width strip)', () => {
  const block = buildUserMemoryPromptBlock({
    ...baseMemory,
    languagePreference: 'fr​',
  });
  expect(block).toContain('User typically converses in: fr');
  expect(block).not.toContain('​');
});
```

`baseMemory` is the existing fixture used by the test file's other cases — extend it with `languagePreference: null, sessionDurationP90Minutes: null` defaults.

- [ ] **Step 1.8.2: Run test → expect FAIL**

Run:
```bash
pnpm test -- --testPathPattern=user-memory-prompt
```
Expected: FAIL — new lines not rendered.

- [ ] **Step 1.8.3: Extend `buildUserMemoryPromptBlock`**

In `user-memory.prompt.ts`, after the existing block-building lines (and before the join into a string), add:

```ts
if (memory.languagePreference) {
  const sanitized = sanitizePromptInput(memory.languagePreference, { maxLength: 16 });
  if (sanitized) lines.push(`User typically converses in: ${sanitized}.`);
}
if (memory.sessionDurationP90Minutes != null) {
  const n = Math.max(1, Math.min(240, memory.sessionDurationP90Minutes));
  lines.push(`Typical session length: ~${String(n)} minutes. Pace responses accordingly.`);
}
```

Add the import:
```ts
import { sanitizePromptInput } from '@modules/chat/useCase/sanitizePromptInput';
```
(verify exact path with `grep -rn "sanitizePromptInput" src/modules/chat/`).

If `sanitizePromptInput` does not accept `{ maxLength }`, drop the option and pass only the input string; truncate manually with `.slice(0, 16)` afterwards. Verify the helper signature first.

- [ ] **Step 1.8.4: Run test → expect PASS**

Run:
```bash
pnpm test -- --testPathPattern=user-memory-prompt
```
Expected: PASS.

- [ ] **Step 1.8.5: Commit**

```bash
git commit -m "feat(chat): prompt block surfaces languagePreference + sessionDurationP90Minutes

Both lines run through sanitizePromptInput to defeat memory-as-injection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/chat/useCase/user-memory.prompt.ts \
     museum-backend/tests/unit/chat/user-memory-prompt.test.ts
```

### Task 1.9: Integration test — full personalization lifecycle

**Files:**
- Test: `museum-backend/tests/integration/chat/user-memory-personalization.integration.test.ts`

- [ ] **Step 1.9.1: Write integration test**

Create `museum-backend/tests/integration/chat/user-memory-personalization.integration.test.ts`:

```ts
import { createE2EHarness } from '../../helpers/e2e/e2e-app-harness';

describe('UserMemory personalization (Spec C)', () => {
  let harness: Awaited<ReturnType<typeof createE2EHarness>>;
  beforeAll(async () => { harness = await createE2EHarness(); });
  afterAll(async () => { await harness.teardown(); });

  it('after 5 sessions with discussed artworks (in fr), populates favoritePeriods, languagePreference, p90', async () => {
    const userId = await harness.seedUser({ email: 'spec-c@test.dev' });
    await harness.seedArtworkKnowledge({ title: 'Mona Lisa', locale: 'fr', period: 'Renaissance' });
    await harness.seedArtworkKnowledge({ title: 'Impression, soleil levant', locale: 'fr', period: 'Impressionism' });

    for (let i = 0; i < 5; i += 1) {
      const sessionId = await harness.seedChatSession({ userId, locale: 'fr', createdAt: new Date(2026, 3, i + 1, 10, 0) });
      await harness.seedChatMessage({ sessionId, createdAt: new Date(2026, 3, i + 1, 10, 30) }); // 30 min duration
      await harness.runUpdateAfterSession({
        userId,
        sessionId,
        visitContext: {
          museumName: 'Louvre',
          museumConfidence: 0.95,
          artworksDiscussed: [
            { title: i === 0 ? 'Mona Lisa' : 'Impression, soleil levant', messageId: 'm1', discussedAt: '2026-04-01T10:00:00Z' },
          ],
          roomsVisited: [],
          detectedExpertise: 'beginner',
          expertiseSignals: 0,
          lastUpdated: '2026-04-01T10:00:00Z',
        },
        locale: 'fr',
      });
    }

    const memory = await harness.getUserMemory(userId);
    expect(memory?.favoritePeriods).toEqual(expect.arrayContaining(['Renaissance', 'Impressionism']));
    expect(memory?.languagePreference).toBe('fr');
    expect(memory?.sessionDurationP90Minutes).toBe(30);
  });
});
```

`harness.seedArtworkKnowledge`, `harness.runUpdateAfterSession`, `harness.getUserMemory` may need to be added to `tests/helpers/e2e/e2e-app-harness.ts` if absent. Pattern follows existing helpers.

- [ ] **Step 1.9.2: Run integration test → expect PASS**

Run:
```bash
pnpm test:e2e -- --testPathPattern=user-memory-personalization
```
Expected: PASS.

- [ ] **Step 1.9.3: Commit**

```bash
git commit -m "test(chat): integration coverage for Spec C UserMemory personalization

Asserts favoritePeriods + languagePreference + sessionDurationP90Minutes
populate end-to-end after 5 sessions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/tests/integration/chat/user-memory-personalization.integration.test.ts \
     museum-backend/tests/helpers/e2e/e2e-app-harness.ts
```

---

## Section 2 — Voice Continuity

### Task 2.1: Voice catalog module + sentinel test

**Files:**
- Create: `museum-backend/src/modules/chat/voice-catalog.ts`
- Test: `museum-backend/tests/unit/chat/voice-catalog.test.ts`

- [ ] **Step 2.1.1: Write failing test**

Create `museum-backend/tests/unit/chat/voice-catalog.test.ts`:

```ts
import { TTS_VOICES, isTtsVoice } from '@modules/chat/voice-catalog';

describe('TTS voice catalog (Spec C sentinel)', () => {
  it('exports exactly 6 voices in a canonical order', () => {
    expect([...TTS_VOICES]).toEqual(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
  });

  it('isTtsVoice accepts known voices', () => {
    for (const v of TTS_VOICES) {
      expect(isTtsVoice(v)).toBe(true);
    }
  });

  it('isTtsVoice rejects unknown values', () => {
    expect(isTtsVoice('sage')).toBe(false);
    expect(isTtsVoice('')).toBe(false);
    expect(isTtsVoice(null)).toBe(false);
    expect(isTtsVoice(123)).toBe(false);
  });
});
```

- [ ] **Step 2.1.2: Run test → expect FAIL**

Run:
```bash
pnpm test -- --testPathPattern=voice-catalog
```
Expected: FAIL — module missing.

- [ ] **Step 2.1.3: Create voice-catalog module**

Create `museum-backend/src/modules/chat/voice-catalog.ts`:

```ts
/**
 * Curated list of OpenAI gpt-4o-mini-tts voice ids supported by Musaium.
 * Adding/removing a voice requires updating the FE mirror at
 * museum-frontend/features/settings/voice-catalog.ts and the OpenAPI enum.
 */
export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export function isTtsVoice(value: unknown): value is TtsVoice {
  return typeof value === 'string' && (TTS_VOICES as readonly string[]).includes(value);
}
```

- [ ] **Step 2.1.4: Run test → expect PASS**

Run:
```bash
pnpm test -- --testPathPattern=voice-catalog
```
Expected: PASS.

- [ ] **Step 2.1.5: Commit**

```bash
git commit -m "feat(chat): voice catalog module (6 OpenAI tts voices + isTtsVoice)

Sentinel test pins the order — additions/removals must update both the FE
mirror and the OpenAPI enum.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/chat/voice-catalog.ts \
     museum-backend/tests/unit/chat/voice-catalog.test.ts
```

### Task 2.2: Migration `AddUserTtsVoice` + entity column

**Files:**
- Create: `museum-backend/src/data/db/migrations/<timestamp>-AddUserTtsVoice.ts`
- Modify: `museum-backend/src/modules/auth/domain/user.entity.ts`

- [ ] **Step 2.2.1: Write failing test that asserts entity column**

Create `museum-backend/tests/unit/auth/user-entity-tts-voice.test.ts`:

```ts
import { getMetadataArgsStorage } from 'typeorm';
import { User } from '@modules/auth/domain/user.entity';

it('declares ttsVoice column (varchar 32, nullable, name=tts_voice)', () => {
  const cols = getMetadataArgsStorage().columns.filter((c) => c.target === User);
  const col = cols.find((c) => c.propertyName === 'ttsVoice');
  expect(col).toBeDefined();
  expect(col?.options.name).toBe('tts_voice');
  expect(col?.options.type).toBe('varchar');
  expect(col?.options.length).toBe('32');
  expect(col?.options.nullable).toBe(true);
});
```

- [ ] **Step 2.2.2: Run test → expect FAIL**

Run:
```bash
pnpm test -- --testPathPattern=user-entity-tts-voice
```
Expected: FAIL.

- [ ] **Step 2.2.3: Add column to User entity**

In `user.entity.ts`, after `contentPreferences` (around the line where `notifyOnReviewModeration` lives — pick the next free spot):

```ts
@Column({ type: 'varchar', length: 32, nullable: true, name: 'tts_voice' })
ttsVoice!: string | null;
```

- [ ] **Step 2.2.4: Run test → expect PASS**

Run:
```bash
pnpm test -- --testPathPattern=user-entity-tts-voice
```
Expected: PASS.

- [ ] **Step 2.2.5: Generate migration via CLI**

Run:
```bash
node scripts/migration-cli.cjs generate --name=AddUserTtsVoice
```
Expected: a new migration file with `up()` adding `ALTER TABLE "users" ADD "tts_voice" character varying(32)` and `down()` dropping it.

- [ ] **Step 2.2.6: Verify migration drift-clean**

Run:
```bash
pnpm migration:run
node scripts/migration-cli.cjs generate --name=DriftCheck
```
Expected: empty migration; delete the empty file.

- [ ] **Step 2.2.7: Commit**

```bash
git commit -m "feat(auth,db): User.ttsVoice column + AddUserTtsVoice migration

Nullable varchar(32). Null = use env.tts.voice fallback. Reads added in
chat-media in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/auth/domain/user.entity.ts \
     museum-backend/tests/unit/auth/user-entity-tts-voice.test.ts \
     museum-backend/src/data/db/migrations/
```

### Task 2.3: `UpdateTtsVoiceUseCase` + repository method

**Files:**
- Create: `museum-backend/src/modules/auth/useCase/updateTtsVoice.useCase.ts`
- Modify: `museum-backend/src/modules/auth/domain/user.repository.interface.ts`
- Modify: `museum-backend/src/modules/auth/adapters/secondary/user.repository.typeorm.ts`
- Test: `museum-backend/tests/unit/auth/updateTtsVoice-usecase.test.ts`

- [ ] **Step 2.3.1: Write failing test**

Create `museum-backend/tests/unit/auth/updateTtsVoice-usecase.test.ts`:

```ts
import { UpdateTtsVoiceUseCase } from '@modules/auth/useCase/updateTtsVoice.useCase';

const makeRepoStub = (existingUser?: { id: number }) => ({
  getUserById: jest.fn().mockResolvedValue(existingUser ?? { id: 1 }),
  updateTtsVoice: jest.fn().mockResolvedValue(undefined),
}) as any;

describe('UpdateTtsVoiceUseCase', () => {
  it('persists a known voice', async () => {
    const repo = makeRepoStub();
    const uc = new UpdateTtsVoiceUseCase(repo);
    const result = await uc.execute(1, 'echo');
    expect(repo.updateTtsVoice).toHaveBeenCalledWith(1, 'echo');
    expect(result.ttsVoice).toBe('echo');
  });

  it('persists null to reset', async () => {
    const repo = makeRepoStub();
    const uc = new UpdateTtsVoiceUseCase(repo);
    const result = await uc.execute(1, null);
    expect(repo.updateTtsVoice).toHaveBeenCalledWith(1, null);
    expect(result.ttsVoice).toBeNull();
  });

  it('rejects unknown voice with 400', async () => {
    const repo = makeRepoStub();
    const uc = new UpdateTtsVoiceUseCase(repo);
    await expect(uc.execute(1, 'sage' as any)).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.updateTtsVoice).not.toHaveBeenCalled();
  });

  it('rejects when user not found with 404', async () => {
    const repo = { getUserById: jest.fn().mockResolvedValue(null), updateTtsVoice: jest.fn() } as any;
    const uc = new UpdateTtsVoiceUseCase(repo);
    await expect(uc.execute(99, 'echo')).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 2.3.2: Run test → expect FAIL**

Run:
```bash
pnpm test -- --testPathPattern=updateTtsVoice-usecase
```
Expected: FAIL — module missing.

- [ ] **Step 2.3.3: Create the use case**

Create `museum-backend/src/modules/auth/useCase/updateTtsVoice.useCase.ts`:

```ts
import { badRequest, notFound } from '@shared/errors/app.error';
import { isTtsVoice, type TtsVoice } from '@modules/chat/voice-catalog';

import type { IUserRepository } from '../domain/user.repository.interface';

export class UpdateTtsVoiceUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: number, voice: TtsVoice | null): Promise<{ ttsVoice: TtsVoice | null }> {
    if (voice !== null && !isTtsVoice(voice)) {
      throw badRequest(`invalid voice "${String(voice)}"`);
    }
    const user = await this.userRepository.getUserById(userId);
    if (!user) throw notFound('User not found');
    await this.userRepository.updateTtsVoice(userId, voice);
    return { ttsVoice: voice };
  }
}
```

- [ ] **Step 2.3.4: Add `updateTtsVoice` to repository interface and PG impl**

In `user.repository.interface.ts`:
```ts
updateTtsVoice(userId: number, voice: string | null): Promise<void>;
```

In `user.repository.typeorm.ts`:
```ts
async updateTtsVoice(userId: number, voice: string | null): Promise<void> {
  await this.userRepo.update(userId, { ttsVoice: voice });
}
```

- [ ] **Step 2.3.5: Wire singleton in `useCase/index.ts`**

```ts
import { UpdateTtsVoiceUseCase } from './updateTtsVoice.useCase';
const updateTtsVoiceUseCase = new UpdateTtsVoiceUseCase(userRepository);
// add to the export bundle alongside updateContentPreferencesUseCase
```

- [ ] **Step 2.3.6: Run test → expect PASS**

Run:
```bash
pnpm test -- --testPathPattern=updateTtsVoice-usecase
```
Expected: PASS.

- [ ] **Step 2.3.7: Commit**

```bash
git commit -m "feat(auth): UpdateTtsVoiceUseCase + IUserRepository.updateTtsVoice

Validates against the chat voice-catalog. Null resets to env default.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/auth/useCase/updateTtsVoice.useCase.ts \
     museum-backend/src/modules/auth/useCase/index.ts \
     museum-backend/src/modules/auth/domain/user.repository.interface.ts \
     museum-backend/src/modules/auth/adapters/secondary/user.repository.typeorm.ts \
     museum-backend/tests/unit/auth/updateTtsVoice-usecase.test.ts
```

### Task 2.4: Route `PATCH /auth/tts-voice` + `GET /auth/me` returns ttsVoice

**Files:**
- Modify: `museum-backend/src/modules/auth/adapters/primary/http/auth.route.ts`
- Modify: `museum-backend/src/modules/auth/useCase/getProfile.useCase.ts`
- Test: `museum-backend/tests/integration/auth/me-tts-voice.integration.test.ts`

- [ ] **Step 2.4.1: Write failing integration test**

Create `museum-backend/tests/integration/auth/me-tts-voice.integration.test.ts`:

```ts
import { createE2EHarness } from '../../helpers/e2e/e2e-app-harness';

describe('PATCH /auth/tts-voice (Spec C)', () => {
  let harness: Awaited<ReturnType<typeof createE2EHarness>>;
  beforeAll(async () => { harness = await createE2EHarness(); });
  afterAll(async () => { await harness.teardown(); });

  it('persists a known voice and returns it', async () => {
    const { token, userId } = await harness.registerAndLogin();
    const resp = await harness.request('PATCH', '/api/auth/tts-voice', {
      auth: token, body: { voice: 'echo' },
    });
    expect(resp.status).toBe(200);
    expect(resp.body.ttsVoice).toBe('echo');

    const meResp = await harness.request('GET', '/api/auth/me', { auth: token });
    expect(meResp.body.user.ttsVoice).toBe('echo');
  });

  it('null resets to default', async () => {
    const { token } = await harness.registerAndLogin();
    await harness.request('PATCH', '/api/auth/tts-voice', { auth: token, body: { voice: 'echo' } });
    const resp = await harness.request('PATCH', '/api/auth/tts-voice', { auth: token, body: { voice: null } });
    expect(resp.status).toBe(200);
    expect(resp.body.ttsVoice).toBeNull();
  });

  it('rejects unknown voice with 400', async () => {
    const { token } = await harness.registerAndLogin();
    const resp = await harness.request('PATCH', '/api/auth/tts-voice', { auth: token, body: { voice: 'sage' } });
    expect(resp.status).toBe(400);
  });

  it('requires auth', async () => {
    const resp = await harness.request('PATCH', '/api/auth/tts-voice', { body: { voice: 'echo' } });
    expect(resp.status).toBe(401);
  });
});
```

- [ ] **Step 2.4.2: Run test → expect FAIL**

Run:
```bash
pnpm test:e2e -- --testPathPattern=me-tts-voice
```
Expected: FAIL — route missing, GET /me does not return ttsVoice.

- [ ] **Step 2.4.3: Add route handler**

In `auth.route.ts`, after the existing `/content-preferences` PATCH, add:

```ts
const updateTtsVoiceSchema = z.object({
  voice: z.union([z.null(), z.enum(TTS_VOICES)]),
});

authRouter.patch(
  '/tts-voice',
  isAuthenticated,
  validateBody(updateTtsVoiceSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { voice } = req.body as { voice: TtsVoice | null };
    const result = await updateTtsVoiceUseCase.execute(jwtUser.id, voice);
    await auditService.log({
      action: 'auth.tts_voice_updated',
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'user',
      targetId: String(jwtUser.id),
      metadata: { voice: result.ttsVoice },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({ ttsVoice: result.ttsVoice });
  },
);
```

Imports:
```ts
import { TTS_VOICES, type TtsVoice } from '@modules/chat/voice-catalog';
import { updateTtsVoiceUseCase } from '../../../useCase';
```

If `auditService` already in scope (used by other routes), reuse it. Otherwise import and define `AUDIT_AUTH_TTS_VOICE_UPDATED` next to the existing audit action constants.

- [ ] **Step 2.4.4: Extend `getProfile.useCase.ts` to return `ttsVoice`**

In `getProfile.useCase.ts`, add `ttsVoice: string | null` to the `UserProfile` interface, and inside `execute()`:
```ts
ttsVoice: user.ttsVoice ?? null,
```

In `auth.route.ts` `GET /me` response, include:
```ts
ttsVoice: profile.ttsVoice,
```

- [ ] **Step 2.4.5: Run test → expect PASS**

Run:
```bash
pnpm test:e2e -- --testPathPattern=me-tts-voice
```
Expected: PASS.

- [ ] **Step 2.4.6: Commit**

```bash
git commit -m "feat(auth): PATCH /auth/tts-voice + GET /auth/me returns ttsVoice

Pattern follows /auth/content-preferences. Audit logged on update.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/auth/adapters/primary/http/auth.route.ts \
     museum-backend/src/modules/auth/useCase/getProfile.useCase.ts \
     museum-backend/tests/integration/auth/me-tts-voice.integration.test.ts
```

### Task 2.5: Chat-media TTS reads `user.ttsVoice`

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/chat-media.service.ts` (line 288)
- Test: `museum-backend/tests/unit/chat/chat-media-tts-voice.test.ts`

- [ ] **Step 2.5.1: Write failing test**

Create `museum-backend/tests/unit/chat/chat-media-tts-voice.test.ts`:

```ts
// Test pattern: instantiate ChatMediaService with stub deps, call the method that
// triggers TTS synthesis, assert tts.synthesize is called with the expected voice.
// Use existing chat-media test scaffolding (search for an existing test file to
// borrow the harness construction; if none exists use a thin DI bundle).

import { ChatMediaService } from '@modules/chat/useCase/chat-media.service';

const makeTtsStub = () => {
  const calls: { text: string; voice?: string }[] = [];
  return {
    calls,
    synthesize: async (input: { text: string; voice?: string }) => {
      calls.push(input);
      return { audioBuffer: Buffer.from('x'), mimeType: 'audio/mp3' };
    },
  };
};

describe('chat-media TTS voice resolution (Spec C)', () => {
  it('uses user.ttsVoice when set on the session.user relation', async () => {
    const tts = makeTtsStub();
    const repo = {
      getMessageById: async () => ({
        message: { id: 'm1', text: 'hi', audioUrl: null },
        session: { id: 's1', user: { ttsVoice: 'echo' } },
      }),
      updateMessageAudio: async () => {},
    } as any;
    const svc = new ChatMediaService({ repository: repo, tts /* + other required stubs */ });
    await svc.synthesizeAudio('m1', /* ... */);
    expect(tts.calls[0].voice).toBe('echo');
  });

  it('falls back to env.tts.voice when user.ttsVoice is null', async () => {
    const tts = makeTtsStub();
    const repo = {
      getMessageById: async () => ({
        message: { id: 'm1', text: 'hi', audioUrl: null },
        session: { id: 's1', user: { ttsVoice: null } },
      }),
      updateMessageAudio: async () => {},
    } as any;
    const svc = new ChatMediaService({ repository: repo, tts });
    await svc.synthesizeAudio('m1', /* ... */);
    expect(tts.calls[0].voice).toBe('alloy'); // env default in test
  });
});
```

> Adapt to the real `ChatMediaService` constructor signature; this is the API skeleton. Look at any existing chat-media test to mirror the dependency bundle. If `getMessageById` is not the right method, locate the actual call path that synthesises audio (`grep -n "tts.synthesize\|synthesize(" src/modules/chat/useCase/chat-media.service.ts`).

- [ ] **Step 2.5.2: Run test → expect FAIL**

Run:
```bash
pnpm test -- --testPathPattern=chat-media-tts-voice
```
Expected: FAIL — current code reads `env.tts.voice` directly.

- [ ] **Step 2.5.3: Update `chat-media.service.ts` line 288**

Change:
```ts
const targetVoice = env.tts.voice;
```
to:
```ts
const targetVoice = session.user?.ttsVoice ?? env.tts.voice;
```

`session` here = the chat session row already loaded by `getMessageById` / `getSessionById`. The user relation is already eager-loaded (verified at `chat.repository.typeorm.ts` lines 96-98).

- [ ] **Step 2.5.4: Run test → expect PASS**

Run:
```bash
pnpm test -- --testPathPattern=chat-media-tts-voice
```
Expected: PASS.

- [ ] **Step 2.5.5: Commit**

```bash
git commit -m "feat(chat): TTS uses session.user.ttsVoice with env fallback

session.user is already eager-loaded by ChatRepository.getSessionById and
getMessageById, so no repo change needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/src/modules/chat/useCase/chat-media.service.ts \
     museum-backend/tests/unit/chat/chat-media-tts-voice.test.ts
```

### Task 2.6: OpenAPI updates

**Files:**
- Modify: `museum-backend/openapi/openapi.json`

- [ ] **Step 2.6.1: Edit OpenAPI**

In `openapi/openapi.json`:

1. `components.schemas.User`: add property
   ```json
   "ttsVoice": {
     "type": "string",
     "enum": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
     "nullable": true
   }
   ```
2. Add new path `/auth/tts-voice` with PATCH method:
   - Request body schema: `{ "type": "object", "required": ["voice"], "properties": { "voice": { "oneOf": [{ "type": "string", "enum": [...]}, { "type": "null" }] } } }`.
   - 200 response: `{ "type": "object", "properties": { "ttsVoice": { ...same shape... } } }`.
   - 400/401 references the existing error schema.
3. `GET /auth/me` 200 response: add `ttsVoice` to the user object schema.

- [ ] **Step 2.6.2: Validate OpenAPI**

Run:
```bash
pnpm openapi:validate
```
Expected: PASS.

- [ ] **Step 2.6.3: Run contract tests**

Run:
```bash
pnpm test:contract:openapi
```
Expected: PASS.

- [ ] **Step 2.6.4: Commit**

```bash
git commit -m "feat(openapi): add User.ttsVoice + PATCH /auth/tts-voice

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-backend/openapi/openapi.json
```

### Task 2.7: FE OpenAPI types regen + voice-catalog mirror

**Files:**
- Modify: `museum-frontend/shared/api/generated/openapi.ts` (regenerated)
- Create: `museum-frontend/features/settings/voice-catalog.ts`
- Test: `museum-frontend/__tests__/features/settings/voice-catalog.test.ts`

- [ ] **Step 2.7.1: Regenerate types**

Run:
```bash
cd museum-frontend && npm run generate:openapi-types
```
Expected: `shared/api/generated/openapi.ts` updated; running `npm run check:openapi-types` after returns clean.

- [ ] **Step 2.7.2: Write failing parity test**

Create `museum-frontend/__tests__/features/settings/voice-catalog.test.ts`:

```ts
import { TTS_VOICES } from '@/features/settings/voice-catalog';

describe('FE voice catalog parity (Spec C sentinel)', () => {
  it('matches the canonical 6-voice list', () => {
    expect([...TTS_VOICES]).toEqual(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
  });
});
```

- [ ] **Step 2.7.3: Run test → expect FAIL**

Run:
```bash
npm test -- --testPathPattern=voice-catalog
```
Expected: FAIL — module missing.

- [ ] **Step 2.7.4: Create FE catalog**

Create `museum-frontend/features/settings/voice-catalog.ts`:

```ts
export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];
```

- [ ] **Step 2.7.5: Run test → expect PASS**

Run:
```bash
npm test -- --testPathPattern=voice-catalog
```
Expected: PASS.

- [ ] **Step 2.7.6: Commit**

```bash
git commit -m "feat(settings,mobile): regen openapi types + voice-catalog mirror

Sentinel test pins the order against the BE catalog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-frontend/shared/api/generated/openapi.ts \
     museum-frontend/features/settings/voice-catalog.ts \
     museum-frontend/__tests__/features/settings/voice-catalog.test.ts
```

### Task 2.8: `useUpdateTtsVoice` mutation hook

**Files:**
- Create: `museum-frontend/features/settings/application/useUpdateTtsVoice.ts`
- Test: `museum-frontend/__tests__/features/settings/useUpdateTtsVoice.test.ts`

- [ ] **Step 2.8.1: Write failing test**

Create the test file:

```tsx
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateTtsVoice } from '@/features/settings/application/useUpdateTtsVoice';
import { authApi } from '@/features/auth/infrastructure/authApi';

jest.mock('@/features/auth/infrastructure/authApi');

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

it('posts the chosen voice and returns the new value', async () => {
  (authApi.updateTtsVoice as jest.Mock).mockResolvedValue({ ttsVoice: 'echo' });
  const { result } = renderHook(() => useUpdateTtsVoice(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync('echo');
  });
  expect(authApi.updateTtsVoice).toHaveBeenCalledWith('echo');
});

it('passes null to reset', async () => {
  (authApi.updateTtsVoice as jest.Mock).mockResolvedValue({ ttsVoice: null });
  const { result } = renderHook(() => useUpdateTtsVoice(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync(null);
  });
  expect(authApi.updateTtsVoice).toHaveBeenCalledWith(null);
});
```

- [ ] **Step 2.8.2: Run test → expect FAIL**

Run:
```bash
npm test -- --testPathPattern=useUpdateTtsVoice
```
Expected: FAIL.

- [ ] **Step 2.8.3: Create the hook**

Create `museum-frontend/features/settings/application/useUpdateTtsVoice.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/features/auth/infrastructure/authApi';
import type { TtsVoice } from '@/features/settings/voice-catalog';

export function useUpdateTtsVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (voice: TtsVoice | null) => authApi.updateTtsVoice(voice),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
```

Add `updateTtsVoice` to `authApi`:
```ts
async updateTtsVoice(voice: TtsVoice | null): Promise<{ ttsVoice: TtsVoice | null }> {
  const resp = await this.client.patch('/auth/tts-voice', { voice });
  return resp.data;
}
```

(Verify exact `authApi` shape — it may use Axios methods directly. Mirror the existing `updateContentPreferences` if present.)

- [ ] **Step 2.8.4: Run test → expect PASS**

Run:
```bash
npm test -- --testPathPattern=useUpdateTtsVoice
```
Expected: PASS.

- [ ] **Step 2.8.5: Commit**

```bash
git commit -m "feat(settings,mobile): useUpdateTtsVoice mutation + authApi.updateTtsVoice

TanStack mutation; invalidates the 'me' query on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-frontend/features/settings/application/useUpdateTtsVoice.ts \
     museum-frontend/features/auth/infrastructure/authApi.ts \
     museum-frontend/__tests__/features/settings/useUpdateTtsVoice.test.ts
```

### Task 2.9: `VoicePreferenceSection` component

**Files:**
- Create: `museum-frontend/features/settings/ui/VoicePreferenceSection.tsx`
- Test: `museum-frontend/__tests__/features/settings/VoicePreferenceSection.test.tsx`
- Modify: 8 locale dictionaries (`museum-frontend/shared/locales/<lang>/common.json` — verify exact path with `ls museum-frontend/shared/locales/` or wherever locales live).

- [ ] **Step 2.9.1: Write failing component test**

Create the test:

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { VoicePreferenceSection } from '@/features/settings/ui/VoicePreferenceSection';
import { authApi } from '@/features/auth/infrastructure/authApi';

jest.mock('@/features/auth/infrastructure/authApi');
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

it('renders 7 rows (6 voices + default)', () => {
  const { getAllByRole } = render(<VoicePreferenceSection currentVoice={null} />);
  const rows = getAllByRole('button');
  expect(rows).toHaveLength(7);
});

it('shows the current voice as selected', () => {
  const { getByText } = render(<VoicePreferenceSection currentVoice="echo" />);
  expect(getByText(/echo/i)).toBeTruthy();
  // assert checkmark / selected styling on the row corresponding to echo
});

it('selecting a voice fires the mutation with that voice', async () => {
  (authApi.updateTtsVoice as jest.Mock).mockResolvedValue({ ttsVoice: 'echo' });
  const { getByText } = render(<VoicePreferenceSection currentVoice={null} />);
  fireEvent.press(getByText(/echo/i));
  await waitFor(() => expect(authApi.updateTtsVoice).toHaveBeenCalledWith('echo'));
});

it('selecting Default fires the mutation with null', async () => {
  (authApi.updateTtsVoice as jest.Mock).mockResolvedValue({ ttsVoice: null });
  const { getByText } = render(<VoicePreferenceSection currentVoice="echo" />);
  fireEvent.press(getByText(/default/i));
  await waitFor(() => expect(authApi.updateTtsVoice).toHaveBeenCalledWith(null));
});
```

- [ ] **Step 2.9.2: Run test → expect FAIL**

Run:
```bash
npm test -- --testPathPattern=VoicePreferenceSection
```
Expected: FAIL.

- [ ] **Step 2.9.3: Implement component**

Create `museum-frontend/features/settings/ui/VoicePreferenceSection.tsx`:

```tsx
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { TTS_VOICES, type TtsVoice } from '@/features/settings/voice-catalog';
import { useUpdateTtsVoice } from '@/features/settings/application/useUpdateTtsVoice';
import { useTheme } from '@/shared/ui/ThemeContext';

interface Row {
  id: 'default' | TtsVoice;
  label: string;
}

export interface VoicePreferenceSectionProps {
  currentVoice: TtsVoice | null;
}

export function VoicePreferenceSection({ currentVoice }: VoicePreferenceSectionProps): ReactElement {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const mutation = useUpdateTtsVoice();

  const rows: Row[] = [
    { id: 'default', label: t('settings.voice.useDefault') },
    ...TTS_VOICES.map((v) => ({ id: v, label: v.charAt(0).toUpperCase() + v.slice(1) })),
  ];

  const onPress = (row: Row) => {
    Haptics.selectionAsync();
    mutation.mutate(row.id === 'default' ? null : row.id);
  };

  const isSelected = (row: Row) =>
    (row.id === 'default' && currentVoice == null) || row.id === currentVoice;

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
        {t('settings.voice.sectionTitle')}
      </Text>
      <Text style={[styles.description, { color: theme.muted }]}>
        {t('settings.voice.description')}
      </Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected(item), busy: mutation.isPending }}
            onPress={() => onPress(item)}
            style={[
              styles.row,
              { borderColor: theme.border },
              isSelected(item) && { backgroundColor: theme.primaryTint },
            ]}
          >
            <Text style={{ color: theme.text }}>{item.label}</Text>
            {isSelected(item) ? <Text style={{ color: theme.primary }}>✓</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, padding: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  description: { fontSize: 14 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
});
```

- [ ] **Step 2.9.4: Run test → expect PASS**

Run:
```bash
npm test -- --testPathPattern=VoicePreferenceSection
```
Expected: PASS.

- [ ] **Step 2.9.5: Add i18n keys**

Locate the locale dictionaries:
```bash
ls museum-frontend/shared/locales/ 2>/dev/null || ls museum-frontend/locales/
```
For each of the 8 locales, add under `settings.voice`:
- `sectionTitle` — e.g. FR: `"Voix"`, EN: `"Voice"`, DE: `"Stimme"`, ES: `"Voz"`, IT: `"Voce"`, JA: `"音声"`, AR: `"الصوت"`, ZH: `"语音"`.
- `description` — FR: `"Choisis la voix de Musaium pour les réponses parlées."`, EN: `"Choose Musaium's voice for spoken replies."`, etc. (Localize for each language.)
- `useDefault` — FR: `"Par défaut (Alloy)"`, EN: `"Default (Alloy)"`, etc.

- [ ] **Step 2.9.6: Verify i18n parity**

Run:
```bash
cd museum-frontend && npm run check:i18n
```
Expected: PASS.

- [ ] **Step 2.9.7: Commit**

```bash
git commit -m "feat(settings,mobile): VoicePreferenceSection + i18n keys (8 locales)

7-row dropdown (6 voices + default reset). Selection fires useUpdateTtsVoice
with selection-haptic feedback. Names un-translated as proper-noun voice ids.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-frontend/features/settings/ui/VoicePreferenceSection.tsx \
     museum-frontend/__tests__/features/settings/VoicePreferenceSection.test.tsx \
     museum-frontend/shared/locales/
```

### Task 2.10: Mount section in settings screen

**Files:**
- Modify: settings screen (verify exact path; likely `app/(stack)/settings.tsx` or `features/settings/ui/SettingsScreen.tsx`)

- [ ] **Step 2.10.1: Locate settings screen**

Run:
```bash
grep -rn "SettingsScreen\|settings/" museum-frontend/app/ museum-frontend/features/settings/ui/ 2>/dev/null | head
```
Identify the parent screen that hosts other preference sections.

- [ ] **Step 2.10.2: Mount the section**

Import and render `<VoicePreferenceSection currentVoice={profile?.ttsVoice ?? null} />` near other preference sections. Pass the current value from whatever React Query hook fetches the user profile (likely `useMe()` or equivalent). If the query doesn't yet include `ttsVoice`, refresh its return-type to pick up the regenerated OpenAPI types.

- [ ] **Step 2.10.3: Smoke run lint + tests**

Run:
```bash
npm run lint && npm test
```
Expected: green; FE test count up by ~5 (catalog parity + mutation + component cases).

- [ ] **Step 2.10.4: Commit**

```bash
git commit -m "feat(settings,mobile): mount VoicePreferenceSection in settings screen

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-frontend/app/ museum-frontend/features/settings/
```

---

## Post-flight

- [ ] **Step Q.1: Repo-wide lint + tests**

Run:
```bash
cd museum-backend && pnpm lint && pnpm test
cd ../museum-frontend && npm run lint && npm test
cd ../museum-web && pnpm lint && pnpm test
```
Expected: BE green w/ ~10 new tests above baseline; FE green w/ ~5 new tests above 1665; Web unchanged at 226.

- [ ] **Step Q.2: GitNexus impact + detect_changes**

Run impact analysis on the symbols touched (`UserMemoryService`, `User`, `chat-media.service`) and confirm the blast radius matches Spec C scope. Run `gitnexus_detect_changes()` and assert no surprise files outside scope.

- [ ] **Step Q.3: Manual smoke (optional, deferred to user)**

Walk-through (user-driven):
1. Boot dev stack: `cd museum-backend && pnpm dev` + `cd museum-frontend && npm run dev`.
2. Log in on iOS sim → settings → voice → pick "Echo" → close app, reopen → voice still "Echo".
3. Send a chat message that triggers TTS → audio uses Echo voice.
4. Switch to "Default" → chat TTS now uses env default.
5. Run a session in `fr` locale, discuss artworks present in `ArtworkKnowledge` → check user_memories row in Adminer (port 8082) shows `favoritePeriods` populated and `language_preference = 'fr'` after the 5th session.

- [ ] **Step Q.4: Open PR**

Branch: `spec-c/personalization-voice`. PR title: `feat(spec-c): UserMemory personalization signals + TTS voice continuity`.

PR body must include:
- Summary of Section 1 + Section 2.
- Migration apply/revert verification output.
- BE + FE + Web test count deltas vs baseline.
- gitnexus impact + detect_changes output.
- Manual smoke result (or "deferred").

---

## Self-Review

1. **Spec coverage**:
   - Section 1 of the spec → Tasks 1.1–1.9 (entity, migration, repo, 3 mergers, prompt, integration).
   - Section 2 of the spec → Tasks 2.1–2.10 (catalog, migration, use case, route, chat-media read, OpenAPI, FE types, hook, component, mount).
   - Acceptance criteria all map to a task.
2. **Placeholder scan**:
   - "Verify exact path" / "verify with `grep`" appear in ~3 spots — these are concrete commands, not placeholders. The plan tells the worker exactly what to run.
   - No "TODO", "TBD", "implement later", "similar to task N" patterns.
3. **Type consistency**:
   - `RecentSessionAggregate` declared in Task 1.3 used by 1.4 (PG impl), 1.6 (mergeLanguagePreference), 1.7 (mergeSessionDurationP90).
   - `TtsVoice` / `isTtsVoice` declared in Task 2.1, used by 2.3 (use case), 2.4 (route schema), 2.7 (FE catalog), 2.8 (mutation).
   - `UserMemoryUpdates` extension in 1.3 used in 1.5/1.6/1.7.
   - `mergePeriods` / `mergeLanguagePreference` / `mergeSessionDurationP90` names stable across tasks.
   - PATCH route path `/auth/tts-voice` consistent across BE (Task 2.4) and FE `authApi.updateTtsVoice` (Task 2.8).

---

## Out of Scope (reminder)

- LLM cache FE consume.
- End-of-session recommendations (Spec D).
- Multi-modal recall (Spec D).
- Linger affinity (Spec D).
- TTS voice preview audio.
- Onboarding self-declared style picker.
- Web changes.
- New locales.
- Lighthouse uplift, bundle-size monitoring.
