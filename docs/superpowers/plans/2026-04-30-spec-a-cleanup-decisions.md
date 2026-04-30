# Spec A — Cleanup & Decisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the walk-composer "coming soon" stub with a guided-walk chat-session variant, eliminate hand-rolled DTO drift in `museum-web`, codify state-management governance and migrate `auth.tsx`, and clean up admin i18n hardcoding.

**Architecture:** Walk V1 reuses the chat session pipeline by adding an `intent` field on `ChatSession`; the orchestrator injects a tour-guide prompt section and switches to LangChain `withStructuredOutput` only when `intent === 'walk'` to surface 1–3 next-artwork suggestions. Web admin types switch to `openapi-typescript` generation with a CI drift gate. Web admin pages drop hardcoded `STAT_LABELS` and `isFr` booleans in favor of dictionaries and a small `useDateLocale`/`formatDate` helper. RN `auth.tsx` migrates from ad-hoc `useState` chains to `react-hook-form` + `useMutation` per ADR-012.

**Tech Stack:** Backend (Node.js 22 + Express 5 + TypeORM + PostgreSQL 16 + LangChain + Zod). Mobile (React Native 0.83 + Expo 55 + Expo Router + Zustand + TanStack Query + i18next). Web (Next.js 15 + React 19 + Vitest). OpenAPI tooling (`openapi-typescript@^7.13.0`).

**Spec source:** `docs/superpowers/specs/2026-04-30-spec-a-cleanup-decisions-design.md`

---

## File Structure

### Backend (`museum-backend`)
- Create: `src/data/db/migrations/<timestamp>-AddChatSessionIntent.ts` — TypeORM migration adding `intent` column to `chat_sessions`.
- Create: `src/modules/chat/useCase/llm-sections/walk-tour-guide.ts` — guided-walk system prompt section text.
- Modify: `src/modules/chat/domain/ChatSession.entity.ts` — add `intent` column.
- Modify: `src/modules/chat/domain/chat.types.ts` — add `intent` to `CreateSessionInput`, `ChatSessionIntent` union.
- Modify: `src/modules/chat/adapters/primary/http/chat.contracts.ts` — extend `CreateSessionRequest` + Zod schema with optional `intent`.
- Modify: `src/modules/chat/useCase/chat-session.service.ts` — persist `intent` on create; default `'default'`.
- Modify: `src/modules/chat/useCase/langchain.orchestrator.ts` — read intent, inject walk section, switch to structured output for walk.
- Modify: `src/modules/chat/useCase/chat-message.service.ts` (or wherever assistant response DTO is built) — pass `suggestions?: string[]` through.
- Modify: `src/modules/chat/adapters/primary/http/chat.contracts.ts` — extend response DTO type with optional `suggestions`.
- Modify: `openapi/openapi.json` — regenerated/updated to include `intent` request field and `suggestions` response field.
- Test: `tests/integration/chat/walk-intent.integration.test.ts` — POST session with intent=walk + assistant suggestions.
- Test: `tests/unit/chat/orchestrator-walk-section.test.ts` — orchestrator picks walk section + structured output only for walk.
- Test: `tests/integration/chat/migration-add-chat-session-intent.test.ts` — migration up/down round-trip (or piggyback on existing migration roundtrip suite if present).

### Mobile (`museum-frontend`)
- Delete: `app/(stack)/walk-composer.tsx`.
- Modify: `features/chat/application/useStartConversation.ts` — drop walk-route branch + push intent into createSession payload + navigate with `?intent=walk`.
- Modify: `features/chat/domain/contracts.ts` (or equivalent) — add `intent?: 'default' | 'walk'` to `CreateSessionRequestDTO`.
- Modify: `features/chat/infrastructure/chatApi.ts` — pass intent in body.
- Create: `features/chat/ui/WalkSuggestionChips.tsx` — chip strip rendering `suggestions[]`.
- Modify: `app/(stack)/chat/[id].tsx` (or current chat screen file) — read `?intent=walk`, render `WalkSuggestionChips` + walk-mode header label.
- Modify: `shared/api/generated/openapi.ts` — regenerated.
- Modify: `locales/<lang>/common.json` (or equivalent location) for all 8 locales — drop `walkComposer.*` namespace, add `chat.walk.headerLabel`.
- Create: `docs/adr/ADR-012-state-management-governance.md`.
- Modify: `app/auth.tsx` — replace `useState` chains with `useForm()` + `useMutation()`.
- Modify: `package.json` — add `react-hook-form`, `@hookform/resolvers` deps.
- Test: `__tests__/features/chat/useStartConversation.walk.test.ts`.
- Test: `__tests__/features/chat/WalkSuggestionChips.test.tsx`.
- Test: `__tests__/app/auth.test.tsx`.

### Web (`museum-web`)
- Modify: `package.json` — add `openapi-typescript` devDep + `generate:openapi-types` + `check:openapi-types` scripts.
- Create: `src/lib/api/generated/openapi.ts` (committed, generated).
- Modify: `src/lib/admin-types.ts` — re-export schemas from generated types.
- Modify: `src/dictionaries/fr.json` + `src/dictionaries/en.json` — add `admin.dashboard.stats.*`.
- Modify: `src/app/[locale]/admin/page.tsx` — drop `STAT_LABELS` + `getStatLabel`.
- Create: `src/lib/i18n-format.ts` — `useDateLocale` + `formatDate` + `formatDateTime`.
- Modify: 7 admin pages (`audit-logs`, `tickets`, `support`, `users`, `reports`, `reviews`, `page.tsx`) — adopt helpers.
- Modify: `.github/workflows/ci-cd-web.yml` — add `pnpm check:openapi-types` step.
- Test: `src/lib/__tests__/i18n-format.test.ts`.
- Modify: `src/lib/admin-types.test.ts` — update imports.

---

## Pre-flight

- [ ] **Step P.1: Verify branch + working tree clean (besides this plan and the spec)**

Run:
```bash
git status
git log --oneline -3
```
Expected: clean tree on `main` with the spec commit `85da9792` at HEAD (or latest equivalent).

- [ ] **Step P.2: Run baseline tests**

Run:
```bash
cd museum-backend && pnpm lint && pnpm test
cd ../museum-frontend && npm run lint && npm test
cd ../museum-web && pnpm lint && pnpm test
```
Expected: all green. Record the test counts for the ratchet.

- [ ] **Step P.3: Verify GitNexus index is fresh**

Run:
```bash
npx gitnexus analyze --embeddings
```
Expected: completes successfully.

---

## Section 1 — Walk V1

### Task 1.1: Add `ChatSessionIntent` type + entity column

**Files:**
- Modify: `museum-backend/src/modules/chat/domain/chat.types.ts`
- Modify: `museum-backend/src/modules/chat/domain/ChatSession.entity.ts`

- [ ] **Step 1.1.1: Run impact analysis on `ChatSession`**

Run:
```bash
# In an MCP-enabled session, call gitnexus_impact({target: "ChatSession", direction: "upstream"})
```
Expected: blast radius report. If HIGH or CRITICAL, surface to user before proceeding.

- [ ] **Step 1.1.2: Add `ChatSessionIntent` union and field to `CreateSessionInput`**

In `museum-backend/src/modules/chat/domain/chat.types.ts`, add:
```ts
export type ChatSessionIntent = 'default' | 'walk';
```
Then extend `CreateSessionInput`:
```ts
export interface CreateSessionInput {
  // ...existing fields
  intent?: ChatSessionIntent;
}
```

- [ ] **Step 1.1.3: Add `intent` column to entity**

In `museum-backend/src/modules/chat/domain/ChatSession.entity.ts`, after the `museumMode` column:
```ts
import type { ChatSessionIntent } from './chat.types';

@Column({ type: 'varchar', length: 16, default: 'default' })
intent!: ChatSessionIntent;
```

- [ ] **Step 1.1.4: Verify TypeScript compiles**

Run:
```bash
cd museum-backend && pnpm lint
```
Expected: no TypeScript errors.

- [ ] **Step 1.1.5: Commit**

```bash
git add museum-backend/src/modules/chat/domain/chat.types.ts \
        museum-backend/src/modules/chat/domain/ChatSession.entity.ts
git commit -m "feat(chat): add ChatSessionIntent + intent column on ChatSession"
```

### Task 1.2: Generate + apply migration `AddChatSessionIntent`

**Files:**
- Create: `museum-backend/src/data/db/migrations/<timestamp>-AddChatSessionIntent.ts`

- [ ] **Step 1.2.1: Generate migration via CLI (mandatory per migration governance)**

Run:
```bash
cd museum-backend
node scripts/migration-cli.cjs generate --name=AddChatSessionIntent
```
Expected: a new file in `src/data/db/migrations/` with an `up()` adding `intent` column and `down()` dropping it.

- [ ] **Step 1.2.2: Inspect generated SQL**

Open the generated file and verify:
- `up()` runs `ADD COLUMN "intent" character varying(16) NOT NULL DEFAULT 'default'` on `chat_sessions`.
- `down()` runs `DROP COLUMN "intent"`.

- [ ] **Step 1.2.3: Run migration on a clean DB and verify drift is zero**

Run:
```bash
cd museum-backend
docker compose -f ../docker-compose.dev.yml up -d
pnpm migration:run
node scripts/migration-cli.cjs generate --name=DriftCheck
```
Expected: the second generate produces an empty migration body (no schema drift). Delete the empty `DriftCheck` file.

- [ ] **Step 1.2.4: Commit migration**

```bash
git add museum-backend/src/data/db/migrations/<timestamp>-AddChatSessionIntent.ts
git commit -m "feat(chat,db): migration AddChatSessionIntent — chat_sessions.intent default 'default'"
```

### Task 1.3: Extend HTTP contract for intent

**Files:**
- Modify: `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts`
- Test: `museum-backend/tests/unit/chat/contracts-create-session-intent.test.ts`

- [ ] **Step 1.3.1: Write failing test for intent parsing**

Create `museum-backend/tests/unit/chat/contracts-create-session-intent.test.ts`:
```ts
import { parseCreateSessionRequest } from '@modules/chat/adapters/primary/http/chat.contracts';

describe('parseCreateSessionRequest intent', () => {
  it('accepts intent="walk"', () => {
    const result = parseCreateSessionRequest({ intent: 'walk' });
    expect(result.intent).toBe('walk');
  });

  it('defaults intent to undefined when omitted', () => {
    const result = parseCreateSessionRequest({});
    expect(result.intent).toBeUndefined();
  });

  it('rejects unknown intent value', () => {
    expect(() => parseCreateSessionRequest({ intent: 'fly' })).toThrow();
  });
});
```

- [ ] **Step 1.3.2: Run test to verify it fails**

Run:
```bash
cd museum-backend && pnpm test -- --testPathPattern=contracts-create-session-intent
```
Expected: FAIL — `intent` not in schema.

- [ ] **Step 1.3.3: Add `intent` to Zod schema and `CreateSessionRequest` type**

In `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts`:
```ts
// In createSessionSchema (locate the existing object schema):
intent: z.enum(['default', 'walk']).optional(),

// In CreateSessionRequest interface:
intent?: 'default' | 'walk';
```

- [ ] **Step 1.3.4: Run test — should pass**

Run:
```bash
cd museum-backend && pnpm test -- --testPathPattern=contracts-create-session-intent
```
Expected: PASS.

- [ ] **Step 1.3.5: Commit**

```bash
git add museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts \
        museum-backend/tests/unit/chat/contracts-create-session-intent.test.ts
git commit -m "feat(chat): accept optional intent on POST /chat/sessions"
```

### Task 1.4: Persist intent in `chat-session.service.ts`

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/chat-session.service.ts`
- Test: `museum-backend/tests/unit/chat/chat-session-service-intent.test.ts`

- [ ] **Step 1.4.1: Write failing test**

Create `museum-backend/tests/unit/chat/chat-session-service-intent.test.ts`:
```ts
import { ChatSessionService } from '@modules/chat/useCase/chat-session.service';
import type { ChatRepository } from '@modules/chat/domain/chat.repository.interface';

const repoSpy = {
  createSession: jest.fn().mockImplementation(async (input) => ({
    id: 'sess-1',
    intent: input.intent ?? 'default',
    // ...minimum stub
  })),
};

describe('ChatSessionService createSession intent', () => {
  it('persists intent="walk" when supplied', async () => {
    const svc = new ChatSessionService({ repository: repoSpy as unknown as ChatRepository });
    await svc.createSession({ intent: 'walk' });
    expect(repoSpy.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'walk' }),
    );
  });

  it('defaults intent to "default" when omitted', async () => {
    const svc = new ChatSessionService({ repository: repoSpy as unknown as ChatRepository });
    await svc.createSession({});
    expect(repoSpy.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'default' }),
    );
  });
});
```

- [ ] **Step 1.4.2: Run test to verify it fails**

Run:
```bash
cd museum-backend && pnpm test -- --testPathPattern=chat-session-service-intent
```
Expected: FAIL — service does not pass `intent` through.

- [ ] **Step 1.4.3: Update `createSession` to forward intent (default `'default'`)**

In `museum-backend/src/modules/chat/useCase/chat-session.service.ts createSession()`, in the `repository.createSession({...})` call object, add:
```ts
intent: input.intent ?? 'default',
```

- [ ] **Step 1.4.4: Run test — should pass**

Run:
```bash
cd museum-backend && pnpm test -- --testPathPattern=chat-session-service-intent
```
Expected: PASS.

- [ ] **Step 1.4.5: Commit**

```bash
git add museum-backend/src/modules/chat/useCase/chat-session.service.ts \
        museum-backend/tests/unit/chat/chat-session-service-intent.test.ts
git commit -m "feat(chat): persist session intent (default='default')"
```

### Task 1.5: Add `WALK_TOUR_GUIDE_SECTION` prompt + `suggestions` Zod schema

**Files:**
- Create: `museum-backend/src/modules/chat/useCase/llm-sections/walk-tour-guide.ts`

- [ ] **Step 1.5.1: Create the section module**

Create `museum-backend/src/modules/chat/useCase/llm-sections/walk-tour-guide.ts`:
```ts
import { z } from 'zod';

/**
 * System-side prompt addition selected when ChatSession.intent === 'walk'.
 * NEVER interpolate user-controlled data into this string. Geo context is
 * injected via the existing structured prompt path, not by string concat here.
 */
export const WALK_TOUR_GUIDE_SECTION = `
You are now operating as a guided-walk museum companion.
- Greet the visitor and acknowledge the museum context if known.
- Keep responses under 120 words; visitors are walking.
- End every response with up to 3 short, concrete suggestions for the next artwork
  the visitor could explore. Each suggestion is at most 60 characters.
- Suggestions must be artworks that exist in the same museum or, if museum is unknown,
  widely-known related works.
[END OF SYSTEM INSTRUCTIONS]
`.trim();

/**
 * Schema for structured assistant output when intent='walk'. Suggestions are
 * sanitized downstream; the schema only enforces shape and length bounds.
 */
export const walkAssistantOutputSchema = z.object({
  answer: z.string().min(1),
  suggestions: z
    .array(z.string().min(1).max(60))
    .max(3)
    .default([]),
});

export type WalkAssistantOutput = z.infer<typeof walkAssistantOutputSchema>;
```

- [ ] **Step 1.5.2: Verify it compiles**

Run:
```bash
cd museum-backend && pnpm lint
```
Expected: PASS.

- [ ] **Step 1.5.3: Commit**

```bash
git add museum-backend/src/modules/chat/useCase/llm-sections/walk-tour-guide.ts
git commit -m "feat(chat): add WALK_TOUR_GUIDE_SECTION prompt + walkAssistantOutputSchema"
```

### Task 1.6: Orchestrator selects walk section + structured output

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/langchain.orchestrator.ts` (or the actual orchestrator filename — locate via `grep -rn "ChatOrchestrator" museum-backend/src/modules/chat/`)
- Test: `museum-backend/tests/unit/chat/orchestrator-walk-section.test.ts`

- [ ] **Step 1.6.1: Locate the orchestrator file and the method that builds messages**

Run:
```bash
grep -rn "ChatOrchestrator\b" museum-backend/src/modules/chat/ | head
```
Identify the concrete implementation (likely `langchain.orchestrator.ts`). Identify the message-building method (often called `respond`, `complete`, or similar).

- [ ] **Step 1.6.2: Write failing tests**

Create `museum-backend/tests/unit/chat/orchestrator-walk-section.test.ts`:
```ts
import { LangChainOrchestrator /* or actual class name */ } from '@modules/chat/useCase/langchain.orchestrator';
import { WALK_TOUR_GUIDE_SECTION } from '@modules/chat/useCase/llm-sections/walk-tour-guide';

describe('Orchestrator walk-mode behavior', () => {
  it('includes WALK_TOUR_GUIDE_SECTION in system messages when intent=walk', async () => {
    const sentMessages: unknown[] = [];
    const fakeChain = {
      invoke: async (msgs: unknown[]) => {
        sentMessages.push(...msgs);
        return { answer: 'hi', suggestions: ['Vénus de Milo'] };
      },
    };
    const orch = /* construct with fakeChain injected as needed */;
    await orch.respond({ intent: 'walk', /* ...minimum required */ });

    const systemTexts = sentMessages
      .filter((m: any) => m.role === 'system' || m._getType?.() === 'system')
      .map((m: any) => m.content);
    expect(systemTexts.some((t) => String(t).includes(WALK_TOUR_GUIDE_SECTION))).toBe(true);
  });

  it('returns suggestions array when intent=walk', async () => {
    const orch = /* set up with stub returning { answer, suggestions } */;
    const result = await orch.respond({ intent: 'walk', /* ... */ });
    expect(result.suggestions).toEqual(['Vénus de Milo']);
  });

  it('omits suggestions and walk section when intent=default', async () => {
    const sentMessages: unknown[] = [];
    const fakeChain = { invoke: async (msgs: any[]) => (sentMessages.push(...msgs), 'plain text') };
    const orch = /* construct with fakeChain */;
    const result = await orch.respond({ intent: 'default', /* ... */ });
    expect(result.suggestions).toBeUndefined();
    const systemTexts = sentMessages.filter((m: any) => m._getType?.() === 'system').map((m: any) => m.content);
    expect(systemTexts.some((t: any) => String(t).includes(WALK_TOUR_GUIDE_SECTION))).toBe(false);
  });
});
```

> Note: the exact construction depends on the orchestrator's DI shape. Adapt the constructor call to match what the codebase expects (look at any existing orchestrator unit test for the established pattern, e.g. `museum-backend/tests/unit/chat/langchain-orchestrator.fail-soft.test.ts`).

- [ ] **Step 1.6.3: Run tests to verify failure**

Run:
```bash
cd museum-backend && pnpm test -- --testPathPattern=orchestrator-walk-section
```
Expected: FAIL.

- [ ] **Step 1.6.4: Update orchestrator**

In `langchain.orchestrator.ts`:
1. Import the section + schema:
   ```ts
   import { WALK_TOUR_GUIDE_SECTION, walkAssistantOutputSchema } from './llm-sections/walk-tour-guide';
   ```
2. In the message-building method, after the existing system instructions and BEFORE the user content, when `input.intent === 'walk'` push an additional `SystemMessage(WALK_TOUR_GUIDE_SECTION)`.
3. When `intent === 'walk'`, switch the chain to `chain.withStructuredOutput(walkAssistantOutputSchema, { method: 'json_schema' })` (or the equivalent helper used in the codebase).
4. Return shape: `{ answer: string; suggestions?: string[] }`. For non-walk intents, do not call `withStructuredOutput`; return plain text and leave `suggestions` undefined.

- [ ] **Step 1.6.5: Run tests — should pass**

Run:
```bash
cd museum-backend && pnpm test -- --testPathPattern=orchestrator-walk-section
```
Expected: PASS.

- [ ] **Step 1.6.6: Commit**

```bash
git add museum-backend/src/modules/chat/useCase/langchain.orchestrator.ts \
        museum-backend/tests/unit/chat/orchestrator-walk-section.test.ts
git commit -m "feat(chat): orchestrator emits walk section + structured suggestions for intent=walk"
```

### Task 1.7: Plumb `suggestions` through message service + response DTO

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/chat-message.service.ts`
- Modify: `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` — extend response DTO type with `suggestions?: string[]`.
- Modify: `museum-backend/openapi/openapi.json` — add `suggestions` to assistant message response schema (regenerate via existing tooling if there is one).

- [ ] **Step 1.7.1: Locate the response builder for assistant messages**

Run:
```bash
grep -rn "assistantMessage\|assistant.*message.*response\|ChatMessageResponse" museum-backend/src/modules/chat/ | head
```

- [ ] **Step 1.7.2: Add `suggestions?: string[]` to the response DTO type and Zod schema (if any)**

In `chat.contracts.ts`, add an optional field on whichever interface represents the assistant message response (e.g., `AssistantMessageDTO`):
```ts
suggestions?: string[];
```

- [ ] **Step 1.7.3: Forward orchestrator output through `chat-message.service.ts`**

In the place where the assistant message is built (after orchestrator call), pass `suggestions` from the orchestrator result onto the response DTO. Sanitize each suggestion via the existing `sanitizePromptInput()` helper before serialization (trim + control-char strip + length cap):
```ts
suggestions: orchestratorResult.suggestions?.map((s) => sanitizePromptInput(s, { maxLength: 60 })),
```

- [ ] **Step 1.7.4: Update `openapi.json`**

Regenerate the OpenAPI spec via the project's existing mechanism (manual edit if generated by hand, or rerun the generator). Add `suggestions: { type: array, items: { type: string }, maxItems: 3 }` on the assistant message response schema.

- [ ] **Step 1.7.5: Validate OpenAPI**

Run:
```bash
cd museum-backend && pnpm openapi:validate
```
Expected: PASS.

- [ ] **Step 1.7.6: Commit**

```bash
git add museum-backend/src/modules/chat/useCase/chat-message.service.ts \
        museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts \
        museum-backend/openapi/openapi.json
git commit -m "feat(chat): expose suggestions[] on assistant message response (walk mode)"
```

### Task 1.8: Backend integration test for walk intent

**Files:**
- Test: `museum-backend/tests/integration/chat/walk-intent.integration.test.ts`

- [ ] **Step 1.8.1: Write integration test**

Create `museum-backend/tests/integration/chat/walk-intent.integration.test.ts`:
```ts
import { createE2EHarness } from '../../helpers/e2e/e2e-app-harness';
import { visitorToken } from '../../helpers/auth/token.helpers';

describe('POST /chat/sessions intent=walk', () => {
  let harness: Awaited<ReturnType<typeof createE2EHarness>>;
  beforeAll(async () => { harness = await createE2EHarness(); });
  afterAll(async () => { await harness.teardown(); });

  it('persists intent=walk and assistant response includes suggestions', async () => {
    const token = visitorToken();
    const sessionResp = await harness.request('POST', '/api/chat/sessions', {
      auth: token,
      body: { intent: 'walk', coordinates: { lat: 48.8606, lng: 2.3376 } },
    });
    expect(sessionResp.status).toBe(201);
    expect(sessionResp.body.intent).toBe('walk');

    const sessionId = sessionResp.body.id;
    const msgResp = await harness.request('POST', `/api/chat/sessions/${sessionId}/messages`, {
      auth: token,
      body: { text: 'guide me' },
    });
    expect(msgResp.status).toBe(200);
    expect(msgResp.body.assistantMessage.suggestions).toBeDefined();
    expect(Array.isArray(msgResp.body.assistantMessage.suggestions)).toBe(true);
    expect(msgResp.body.assistantMessage.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('defaults to intent=default when omitted and omits suggestions', async () => {
    const token = visitorToken();
    const sessionResp = await harness.request('POST', '/api/chat/sessions', {
      auth: token, body: {},
    });
    expect(sessionResp.body.intent).toBe('default');
    const msg = await harness.request('POST', `/api/chat/sessions/${sessionResp.body.id}/messages`, {
      auth: token, body: { text: 'hi' },
    });
    expect(msg.body.assistantMessage.suggestions).toBeUndefined();
  });
});
```

> Adapt to the actual `createE2EHarness` API + auth helpers in `tests/helpers/e2e/`.

- [ ] **Step 1.8.2: Run the test**

Run:
```bash
cd museum-backend && pnpm test:e2e -- --testPathPattern=walk-intent
```
Expected: PASS.

- [ ] **Step 1.8.3: Commit**

```bash
git add museum-backend/tests/integration/chat/walk-intent.integration.test.ts
git commit -m "test(chat): integration coverage for intent=walk + suggestions response"
```

### Task 1.9: Mobile — `useStartConversation` walk path

**Files:**
- Modify: `museum-frontend/features/chat/application/useStartConversation.ts`
- Modify: `museum-frontend/features/chat/domain/contracts.ts`
- Modify: `museum-frontend/features/chat/infrastructure/chatApi.ts`
- Modify: `museum-frontend/shared/api/generated/openapi.ts` (regenerate)
- Test: `museum-frontend/__tests__/features/chat/useStartConversation.walk.test.ts`

- [ ] **Step 1.9.1: Regenerate OpenAPI types**

Run:
```bash
cd museum-frontend && npm run generate:openapi-types
```
Expected: file regenerated to include the new `intent` field and `suggestions` response field.

- [ ] **Step 1.9.2: Write failing test for walk path**

Create `museum-frontend/__tests__/features/chat/useStartConversation.walk.test.ts`:
```ts
import { renderHook, act } from '@testing-library/react-native';
import { router } from 'expo-router';
import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { useStartConversation } from '@/features/chat/application/useStartConversation';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/chat/infrastructure/chatApi');

describe('useStartConversation walk intent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a chat session with intent=walk and navigates with ?intent=walk', async () => {
    (chatApi.createSession as jest.Mock).mockResolvedValue({
      session: { id: 'sess-1', intent: 'walk' },
    });
    const { result } = renderHook(() => useStartConversation());

    await act(async () => {
      await result.current.startConversation({
        intent: 'walk',
        coordinates: { lat: 48.86, lng: 2.34 },
        museumId: 12,
      });
    });

    expect(chatApi.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'walk', coordinates: { lat: 48.86, lng: 2.34 }, museumId: 12 }),
    );
    expect(router.push).toHaveBeenCalledWith(expect.stringContaining('intent=walk'));
  });
});
```

- [ ] **Step 1.9.3: Run test — should fail**

Run:
```bash
cd museum-frontend && npm test -- --testPathPattern=useStartConversation.walk
```
Expected: FAIL.

- [ ] **Step 1.9.4: Update domain contract + API call**

In `museum-frontend/features/chat/domain/contracts.ts` (locate `CreateSessionRequestDTO`), add:
```ts
intent?: 'default' | 'walk';
```
In `museum-frontend/features/chat/infrastructure/chatApi.ts createSession()`, ensure `intent` is forwarded in the request body.

- [ ] **Step 1.9.5: Drop walk-route branch and route through intent**

In `museum-frontend/features/chat/application/useStartConversation.ts`:
- Delete the `WALK_COMPOSER_ROUTE` const and the `if (intent === 'walk') { router.push(WALK_COMPOSER_ROUTE); return; }` branch.
- Pass `intent` into the createSession payload alongside `museumMode`, `museumId`, etc.
- After session creation, build the redirect URL — append `intent=walk` to the existing `query` array when intent is `'walk'` and not `'default'`.

- [ ] **Step 1.9.6: Run test — should pass**

Run:
```bash
cd museum-frontend && npm test -- --testPathPattern=useStartConversation.walk
```
Expected: PASS.

- [ ] **Step 1.9.7: Commit**

```bash
git add museum-frontend/features/chat/application/useStartConversation.ts \
        museum-frontend/features/chat/domain/contracts.ts \
        museum-frontend/features/chat/infrastructure/chatApi.ts \
        museum-frontend/shared/api/generated/openapi.ts \
        museum-frontend/__tests__/features/chat/useStartConversation.walk.test.ts
git commit -m "feat(chat,mobile): wire walk intent through createSession + nav (?intent=walk)"
```

### Task 1.10: Mobile — Delete walk-composer screen + locale keys

**Files:**
- Delete: `museum-frontend/app/(stack)/walk-composer.tsx`
- Modify: locale dictionaries (8 locales) — drop `walkComposer.*`, add `chat.walk.headerLabel`.

- [ ] **Step 1.10.1: Delete the screen file**

Run:
```bash
rm museum-frontend/app/\(stack\)/walk-composer.tsx
```

- [ ] **Step 1.10.2: Drop `walkComposer` namespace from each locale**

Run:
```bash
grep -rln "walkComposer" museum-frontend/locales/ museum-frontend/features/ museum-frontend/app/
```

For each locale dictionary file (FR, EN, ES, DE, IT, PT, NL, JA — confirm exact set in the project), remove the `walkComposer` block. Add a new key:
```json
"chat": {
  "walk": {
    "headerLabel": "Visite guidée"  // adjust per locale
  }
}
```

Localization values per locale:
- FR: "Visite guidée"
- EN: "Guided walk"
- ES: "Visita guiada"
- DE: "Geführte Tour"
- IT: "Visita guidata"
- PT: "Visita guiada"
- NL: "Rondleiding"
- JA: "ガイドツアー"

- [ ] **Step 1.10.3: Verify no lingering `walkComposer` reference**

Run:
```bash
grep -rn "walkComposer\|walk-composer" museum-frontend/
```
Expected: only the deletion of the route file in `git status`. No code refs.

- [ ] **Step 1.10.4: Run i18n parity check (existing)**

Run:
```bash
cd museum-frontend && npm run check:i18n 2>&1 | tail -20
```
Expected: parity preserved across locales.

- [ ] **Step 1.10.5: Commit**

```bash
git add museum-frontend/app/\(stack\)/walk-composer.tsx \
        museum-frontend/locales/
git commit -m "feat(chat,mobile): drop walk-composer stub + walkComposer locale namespace"
```

### Task 1.11: Mobile — `WalkSuggestionChips` primitive

**Files:**
- Create: `museum-frontend/features/chat/ui/WalkSuggestionChips.tsx`
- Test: `museum-frontend/__tests__/features/chat/WalkSuggestionChips.test.tsx`

- [ ] **Step 1.11.1: Write failing test**

Create `museum-frontend/__tests__/features/chat/WalkSuggestionChips.test.tsx`:
```tsx
import { render, fireEvent } from '@testing-library/react-native';
import { WalkSuggestionChips } from '@/features/chat/ui/WalkSuggestionChips';

describe('WalkSuggestionChips', () => {
  it('renders one chip per suggestion', () => {
    const { getByText } = render(
      <WalkSuggestionChips suggestions={['Mona Lisa', 'Vénus de Milo']} onSelect={jest.fn()} />,
    );
    expect(getByText('Mona Lisa')).toBeTruthy();
    expect(getByText('Vénus de Milo')).toBeTruthy();
  });

  it('calls onSelect with chip text', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <WalkSuggestionChips suggestions={['Mona Lisa']} onSelect={onSelect} />,
    );
    fireEvent.press(getByText('Mona Lisa'));
    expect(onSelect).toHaveBeenCalledWith('Mona Lisa');
  });

  it('renders nothing when suggestions is empty', () => {
    const { toJSON } = render(<WalkSuggestionChips suggestions={[]} onSelect={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });
});
```

- [ ] **Step 1.11.2: Run test to verify failure**

Run:
```bash
cd museum-frontend && npm test -- --testPathPattern=WalkSuggestionChips
```
Expected: FAIL.

- [ ] **Step 1.11.3: Implement primitive**

Create `museum-frontend/features/chat/ui/WalkSuggestionChips.tsx`:
```tsx
import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { semantic, space } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/ThemeContext';

export interface WalkSuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export function WalkSuggestionChips({ suggestions, onSelect }: WalkSuggestionChipsProps): ReactElement | null {
  const { theme } = useTheme();
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="list"
      accessibilityLabel="Walk suggestions"
    >
      {suggestions.map((s) => (
        <Pressable
          key={s}
          onPress={() => onSelect(s)}
          style={[styles.chip, { backgroundColor: theme.primaryTint, borderColor: theme.primaryBorderSubtle }]}
          accessibilityRole="button"
          accessibilityHint="Sends this suggestion as your next prompt"
        >
          <Text style={[styles.chipText, { color: theme.primary }]}>{s}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space['2'], paddingHorizontal: space['3'] },
  chip: {
    paddingVertical: space['2'],
    paddingHorizontal: space['3'],
    borderRadius: semantic.badge.radiusFull,
    borderWidth: semantic.input.borderWidth,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
});
```

- [ ] **Step 1.11.4: Run test — should pass**

Run:
```bash
cd museum-frontend && npm test -- --testPathPattern=WalkSuggestionChips
```
Expected: PASS.

- [ ] **Step 1.11.5: Commit**

```bash
git add museum-frontend/features/chat/ui/WalkSuggestionChips.tsx \
        museum-frontend/__tests__/features/chat/WalkSuggestionChips.test.tsx
git commit -m "feat(chat,mobile): WalkSuggestionChips primitive"
```

### Task 1.12: Mobile — Chat screen walk-mode integration

**Files:**
- Modify: chat screen file (locate via `ls museum-frontend/app/\(stack\)/chat/`)

- [ ] **Step 1.12.1: Identify chat screen file**

Run:
```bash
ls museum-frontend/app/\(stack\)/chat/
```
Expected: typically `[id].tsx` or similar.

- [ ] **Step 1.12.2: Add walk-mode wiring**

In the chat screen file:
1. Read the route param `intent` via `useLocalSearchParams<{ intent?: string }>()`.
2. Track latest assistant message's `suggestions` (the message DTO already carries it after Task 1.7).
3. Render `<WalkSuggestionChips suggestions={lastSuggestions} onSelect={(text) => sendMessage(text)} />` below the input, only when `intent === 'walk'`.
4. When `intent === 'walk'`, render a header label using `t('chat.walk.headerLabel')` near the existing chat header.

- [ ] **Step 1.12.3: Manual smoke**

Run:
```bash
cd museum-backend && pnpm dev   # in one terminal
cd museum-frontend && npm run dev   # in another terminal
```
Open the app, tap the "walk" chip on Home, send a message, verify chips appear, tap a chip and confirm it sends as the next prompt.

- [ ] **Step 1.12.4: Run lint + tests**

Run:
```bash
cd museum-frontend && npm run lint && npm test
```
Expected: green.

- [ ] **Step 1.12.5: Commit**

```bash
git add museum-frontend/app/\(stack\)/chat/
git commit -m "feat(chat,mobile): walk-mode header + suggestion chips wired in chat screen"
```

---

## Section 2 — Web i18n Cleanup

### Task 2.1: `STAT_LABELS` → dictionary

**Files:**
- Modify: `museum-web/src/dictionaries/fr.json`
- Modify: `museum-web/src/dictionaries/en.json`
- Modify: `museum-web/src/app/[locale]/admin/page.tsx`
- Modify: dictionary type (likely `museum-web/src/lib/admin-dictionary.tsx`)

- [ ] **Step 2.1.1: Write failing test**

Add to (or create) `museum-web/src/app/[locale]/admin/__tests__/page.test.tsx` (Vitest):
```ts
import { render, screen } from '@testing-library/react';
import AdminDashboardPage from '../page';

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn().mockResolvedValue({
    totalUsers: 12, activeUsers: 5, totalConversations: 7, totalMessages: 42,
    newUsersToday: 1, messagesThisWeek: 9,
  }),
}));

vi.mock('@/lib/admin-dictionary', () => ({
  useAdminDict: () => ({
    dashboard: {
      stats: {
        totalUsers: 'Utilisateurs totaux',
        activeUsers: 'Utilisateurs actifs',
        conversations: 'Conversations',
        messages: 'Messages',
        newToday: "Nouveaux aujourd'hui",
        messagesThisWeek: 'Messages cette semaine',
      },
    },
  }),
  useAdminLocale: () => 'fr',
}));

it('renders stat labels from dictionary', async () => {
  render(<AdminDashboardPage />);
  expect(await screen.findByText('Utilisateurs totaux')).toBeInTheDocument();
});
```

- [ ] **Step 2.1.2: Run test — should fail**

Run:
```bash
cd museum-web && pnpm test -- page.test
```
Expected: FAIL — labels still come from `STAT_LABELS`.

- [ ] **Step 2.1.3: Add stat keys to dictionaries**

In `museum-web/src/dictionaries/fr.json`, under `admin.dashboard`, add:
```json
"stats": {
  "totalUsers": "Utilisateurs totaux",
  "activeUsers": "Utilisateurs actifs",
  "conversations": "Conversations",
  "messages": "Messages",
  "newToday": "Nouveaux aujourd'hui",
  "messagesThisWeek": "Messages cette semaine"
}
```

In `museum-web/src/dictionaries/en.json`, under `admin.dashboard`:
```json
"stats": {
  "totalUsers": "Total Users",
  "activeUsers": "Active Users",
  "conversations": "Conversations",
  "messages": "Messages",
  "newToday": "New Today",
  "messagesThisWeek": "Messages This Week"
}
```

- [ ] **Step 2.1.4: Drop `STAT_LABELS` + `getStatLabel` and use `adminDict.dashboard.stats`**

In `museum-web/src/app/[locale]/admin/page.tsx`:
- Remove lines 22–37 (the `STAT_LABELS` const, the leading comment, and the `getStatLabel` function).
- Remove the `useAdminLocale` import if no longer used by this file (keep if any other date logic remains; otherwise drop).
- In the rendering loop, replace `getStatLabel(card.labelKey, locale)` with `adminDict.dashboard.stats[card.labelKey as keyof typeof adminDict.dashboard.stats]`.

- [ ] **Step 2.1.5: Run test — should pass**

Run:
```bash
cd museum-web && pnpm test -- page.test
```
Expected: PASS.

- [ ] **Step 2.1.6: Commit**

```bash
git add museum-web/src/app/\[locale\]/admin/page.tsx \
        museum-web/src/dictionaries/fr.json \
        museum-web/src/dictionaries/en.json \
        museum-web/src/app/\[locale\]/admin/__tests__/page.test.tsx
git commit -m "refactor(web,admin): move STAT_LABELS to dictionaries; type-safe lookup"
```

### Task 2.2: `useDateLocale` + `formatDate` helpers

**Files:**
- Create: `museum-web/src/lib/i18n-format.ts`
- Test: `museum-web/src/lib/__tests__/i18n-format.test.ts`

- [ ] **Step 2.2.1: Write failing test**

Create `museum-web/src/lib/__tests__/i18n-format.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { formatDate, useDateLocale } from '../i18n-format';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/admin-dictionary', () => ({
  useAdminLocale: vi.fn().mockReturnValue('fr'),
}));

describe('useDateLocale', () => {
  it('returns fr-FR for fr locale', () => {
    const { result } = renderHook(() => useDateLocale());
    expect(result.current).toBe('fr-FR');
  });
});

describe('formatDate', () => {
  it('formats with fr-FR', () => {
    const out = formatDate(new Date('2026-04-30T10:00:00Z'), 'fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    expect(out).toMatch(/avril/);
  });

  it('formats with en-US', () => {
    const out = formatDate(new Date('2026-04-30T10:00:00Z'), 'en-US', { day: '2-digit', month: 'long', year: 'numeric' });
    expect(out).toMatch(/April/);
  });
});
```

- [ ] **Step 2.2.2: Run test — should fail**

Run:
```bash
cd museum-web && pnpm test -- i18n-format
```
Expected: FAIL — module missing.

- [ ] **Step 2.2.3: Implement helpers**

Create `museum-web/src/lib/i18n-format.ts`:
```ts
import { useAdminLocale } from './admin-dictionary';

export type DateLocaleTag = 'fr-FR' | 'en-US';

export function useDateLocale(): DateLocaleTag {
  return useAdminLocale() === 'fr' ? 'fr-FR' : 'en-US';
}

export function formatDate(d: Date | string, locale: DateLocaleTag, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleDateString(locale, opts);
}

export function formatDateTime(d: Date | string, locale: DateLocaleTag): string {
  return new Date(d).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}
```

- [ ] **Step 2.2.4: Run test — should pass**

Run:
```bash
cd museum-web && pnpm test -- i18n-format
```
Expected: PASS.

- [ ] **Step 2.2.5: Commit**

```bash
git add museum-web/src/lib/i18n-format.ts \
        museum-web/src/lib/__tests__/i18n-format.test.ts
git commit -m "feat(web,admin): useDateLocale + formatDate / formatDateTime helpers"
```

### Task 2.3: Migrate 7 admin pages to helpers

**Files:**
- Modify: `museum-web/src/app/[locale]/admin/audit-logs/page.tsx`
- Modify: `museum-web/src/app/[locale]/admin/tickets/page.tsx`
- Modify: `museum-web/src/app/[locale]/admin/support/page.tsx`
- Modify: `museum-web/src/app/[locale]/admin/users/page.tsx`
- Modify: `museum-web/src/app/[locale]/admin/reports/page.tsx`
- Modify: `museum-web/src/app/[locale]/admin/reviews/page.tsx`

For each file, perform the following pattern:

- [ ] **Step 2.3.1: Replace `isFr` and `dateLocale` consts**

Remove:
```ts
const isFr = locale === 'fr';   // or const isFr = useAdminLocale() === 'fr';
const dateLocale = isFr ? 'fr-FR' : 'en-US';   // if present
```

Add:
```ts
import { useDateLocale, formatDate, formatDateTime } from '@/lib/i18n-format';
const dateLocale = useDateLocale();
```

- [ ] **Step 2.3.2: Replace `toLocaleDateString` calls**

Replace each:
```ts
new Date(x).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', opts)
```
with:
```ts
formatDate(x, dateLocale, opts)
```

For `support/page.tsx`, also delete the local `formatDate(date, isFr)` helper at the top of the file and use the shared util.

- [ ] **Step 2.3.3: After all 7 files, verify no lingering `isFr` for date use**

Run:
```bash
grep -n "isFr" museum-web/src/app/\[locale\]/admin/
```
Expected: zero results outside `LanguageSwitcher.tsx` and `seo.ts`.

- [ ] **Step 2.3.4: Lint + test**

Run:
```bash
cd museum-web && pnpm lint && pnpm test
```
Expected: green.

- [ ] **Step 2.3.5: Commit**

```bash
git add museum-web/src/app/\[locale\]/admin/
git commit -m "refactor(web,admin): consolidate date formatting on useDateLocale + formatDate"
```

---

## Section 3 — ADR-012 + `auth.tsx` Migration

### Task 3.1: Write ADR-012

**Files:**
- Create: `museum-frontend/docs/adr/ADR-012-state-management-governance.md`

- [ ] **Step 3.1.1: Create the ADR**

Create `museum-frontend/docs/adr/ADR-012-state-management-governance.md`:
```markdown
# ADR-012 — State Management Governance (museum-frontend)

**Date:** 2026-04-30
**Status:** Accepted
**Context:** Spec A — Cleanup & Decisions (`docs/superpowers/specs/2026-04-30-spec-a-cleanup-decisions-design.md`)

## Context

The mobile app currently mixes Zustand (8 persisted stores), TanStack React Query (introduced 3d8658a8f), and ad-hoc `useState` chains for state of all kinds. Without a rule, the team forks tools at every feature, increasing review overhead and producing duplicated cache layers (e.g. local message cache + remote conversation list).

## Decision

Each piece of state is classified into one of four buckets and the corresponding tool is mandatory:

| Class | Tool | Examples |
|---|---|---|
| Persistent client state | Zustand + `persist` middleware | `runtimeSettingsStore`, `userProfileStore`, `chatLocalCache`, `artKeywordsStore`, `conversationsStore`, `chatSessionStore`, `dataModeStore` |
| Server state (remote) | TanStack React Query | museum directory, museum detail, conversations remote pagination, daily-art catalog |
| Ephemeral UI state | `useState` / `useReducer` | modal open/close, focus ring, password-visibility toggle |
| Form state (≥3 fields or with validation) | `react-hook-form` (+ `@hookform/resolvers/zod`) | `auth.tsx`, support ticket form, review submission |

### Decision rules
- Persists across app restart? → Zustand persist.
- Comes from API and can be invalidated? → React Query.
- Lives only inside one screen? → `useState` / `useReducer`.
- Multi-field with validation? → React Hook Form.

## Consequences
- New PRs introducing fresh `useState` chains for forms or fresh local caches for server data should be rejected in review.
- Existing offenders are migrated incrementally, starting with `auth.tsx` (this spec). Other migrations follow as the surrounding feature is touched.
- TanStack Query Devtools stay opt-in via dev build only.

## Alternatives Considered
- **Redux Toolkit** — heavier than the project needs, no current adopters.
- **Jotai** — atomic state would compete with Zustand without clear win; no migration story for `persist`.
- **Continue ad-hoc** — rejected; produces drift.
```

- [ ] **Step 3.1.2: Commit**

```bash
git add museum-frontend/docs/adr/ADR-012-state-management-governance.md
git commit -m "docs(adr): ADR-012 state management governance for museum-frontend"
```

### Task 3.2: Add `react-hook-form` deps

**Files:**
- Modify: `museum-frontend/package.json`

- [ ] **Step 3.2.1: Verify deps**

Run:
```bash
cd museum-frontend && grep -E "react-hook-form|@hookform" package.json
```
Expected: empty.

- [ ] **Step 3.2.2: Add deps**

Run:
```bash
cd museum-frontend && npm install react-hook-form @hookform/resolvers zod
```
Expected: `package.json` updated; `package-lock.json` regenerated.

- [ ] **Step 3.2.3: Lint**

Run:
```bash
cd museum-frontend && npm run lint
```
Expected: PASS.

- [ ] **Step 3.2.4: Commit**

```bash
git add museum-frontend/package.json museum-frontend/package-lock.json
git commit -m "chore(mobile): add react-hook-form + zod resolvers (ADR-012)"
```

### Task 3.3: Migrate `auth.tsx` to RHF + React Query

**Files:**
- Modify: `museum-frontend/app/auth.tsx`
- Test: `museum-frontend/__tests__/app/auth.test.tsx`

- [ ] **Step 3.3.1: Read current `auth.tsx`**

Run:
```bash
cat museum-frontend/app/auth.tsx
```
Identify each `useState`. Classify (form draft / mutation state / ephemeral UI).

- [ ] **Step 3.3.2: Write failing tests**

Create or extend `museum-frontend/__tests__/app/auth.test.tsx`:
```tsx
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import AuthScreen from '@/app/auth';
import { authApi } from '@/features/auth/infrastructure/authApi';

jest.mock('@/features/auth/infrastructure/authApi');

describe('AuthScreen RHF + mutation', () => {
  it('shows inline error for invalid email', async () => {
    render(<AuthScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), 'not-an-email');
    fireEvent.press(screen.getByText(/sign in|connexion/i));
    await waitFor(() => expect(screen.getByText(/invalid email|invalide/i)).toBeTruthy());
  });

  it('calls login mutation on valid submit', async () => {
    (authApi.login as jest.Mock).mockResolvedValue({ accessToken: 'jwt', user: { id: 1 } });
    render(<AuthScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), 'a@b.co');
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), 'P@ssword12');
    fireEvent.press(screen.getByText(/sign in|connexion/i));
    await waitFor(() => expect(authApi.login).toHaveBeenCalled());
  });

  it('renders error banner on mutation failure', async () => {
    (authApi.login as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));
    render(<AuthScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), 'a@b.co');
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), 'P@ssword12');
    fireEvent.press(screen.getByText(/sign in|connexion/i));
    await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeTruthy());
  });
});
```

- [ ] **Step 3.3.3: Run test — should fail**

Run:
```bash
cd museum-frontend && npm test -- --testPathPattern=app/auth
```
Expected: FAIL.

- [ ] **Step 3.3.4: Refactor `auth.tsx`**

Replace local form `useState` chains with:
```tsx
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // mode toggle handled outside the form schema (ephemeral UI state)
});
type FormValues = z.infer<typeof schema>;

// Inside component:
const { control, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });
const loginMutation = useMutation({ mutationFn: authApi.login });
const onSubmit = handleSubmit((values) => loginMutation.mutate(values));
```

Keep `useState` only for: password-visibility toggle and login/register mode toggle. Drop the rest.

For each form field, wrap the existing `<TextInput />` in `<Controller>` and surface `errors.email?.message` / `errors.password?.message` inline. Surface `loginMutation.error?.message` in the existing error banner. Use `loginMutation.isPending` for the submit-disabled state.

- [ ] **Step 3.3.5: Run test — should pass**

Run:
```bash
cd museum-frontend && npm test -- --testPathPattern=app/auth
```
Expected: PASS.

- [ ] **Step 3.3.6: Manual smoke**

Run the app and verify the login flow works end-to-end against a running backend (Expo dev + backend dev).

- [ ] **Step 3.3.7: Commit**

```bash
git add museum-frontend/app/auth.tsx \
        museum-frontend/__tests__/app/auth.test.tsx
git commit -m "refactor(auth,mobile): migrate auth.tsx to react-hook-form + react-query (ADR-012)"
```

---

## Section 4 — `museum-web` `openapi-typescript` + CI Gate

### Task 4.1: Add tooling + scripts

**Files:**
- Modify: `museum-web/package.json`

- [ ] **Step 4.1.1: Add devDep + scripts**

Run:
```bash
cd museum-web && pnpm add -D openapi-typescript@^7.13.0
```

In `museum-web/package.json`, add to `scripts`:
```json
"generate:openapi-types": "openapi-typescript ../museum-backend/openapi/openapi.json -o src/lib/api/generated/openapi.ts && prettier --write src/lib/api/generated/openapi.ts",
"check:openapi-types": "pnpm generate:openapi-types && git diff --exit-code -- src/lib/api/generated/openapi.ts"
```

- [ ] **Step 4.1.2: Verify pnpm runs the script**

Run:
```bash
cd museum-web && pnpm run generate:openapi-types
```
Expected: file `src/lib/api/generated/openapi.ts` is created.

- [ ] **Step 4.1.3: Commit tooling**

```bash
git add museum-web/package.json museum-web/pnpm-lock.yaml
git commit -m "chore(web): add openapi-typescript tooling + scripts"
```

### Task 4.2: Generate + commit `openapi.ts`

- [ ] **Step 4.2.1: Generate**

Run:
```bash
cd museum-web && pnpm run generate:openapi-types
```

- [ ] **Step 4.2.2: Verify generated file**

Run:
```bash
head -5 museum-web/src/lib/api/generated/openapi.ts
```
Expected: looks like a typical `openapi-typescript` output (`paths`, `components` etc.).

- [ ] **Step 4.2.3: Commit generated file**

```bash
git add museum-web/src/lib/api/generated/openapi.ts
git commit -m "feat(web): generate src/lib/api/generated/openapi.ts from backend spec"
```

### Task 4.3: Migrate `admin-types.ts`

**Files:**
- Modify: `museum-web/src/lib/admin-types.ts`
- Modify: `museum-web/src/lib/admin-types.test.ts`

- [ ] **Step 4.3.1: Identify which DTOs in `admin-types.ts` have a matching schema**

Run:
```bash
grep -E "^export (type|interface) " museum-web/src/lib/admin-types.ts | head -40
grep -E "schemas\['" museum-web/src/lib/api/generated/openapi.ts | head -40
```
Build a mapping `OldName -> Schemas['NewName']`. For any DTO without a match, mark as a documentation gap.

- [ ] **Step 4.3.2: Re-export generated types**

At the top of `museum-web/src/lib/admin-types.ts`, add:
```ts
import type { components } from './api/generated/openapi';
type Schemas = components['schemas'];
```
Replace each hand-rolled DTO with:
```ts
export type DashboardStats = Schemas['DashboardStats'];
// ...repeat for each
```

For DTOs without an OpenAPI counterpart, keep them but annotate:
```ts
// TODO(openapi): backend route not yet documented — Spec A acceptance criterion
export interface SomeUndocumentedDTO { ... }
```

Track every such gap in the PR description.

- [ ] **Step 4.3.3: Backfill OpenAPI annotations on the most-used undocumented routes (best-effort)**

For each gap that the PR description lists, decide:
- Trivial annotation work (≤ 30 min) → add it now in the same PR; record the file paths added in `museum-backend/src/modules/admin/`.
- Larger work → leave the `TODO(openapi)` comment and link to a tracking ticket.

- [ ] **Step 4.3.4: Update `admin-types.test.ts`**

Adjust the file's structural assertions to import from generated types where applicable. Keep any tests that pin specific field names; they should still pass since the names match.

- [ ] **Step 4.3.5: Run lint + tests**

Run:
```bash
cd museum-web && pnpm lint && pnpm test
```
Expected: green.

- [ ] **Step 4.3.6: Commit**

```bash
git add museum-web/src/lib/admin-types.ts \
        museum-web/src/lib/admin-types.test.ts \
        museum-backend/src/modules/admin/   # only if backfill annotations were added
        museum-web/src/lib/api/generated/openapi.ts   # if regenerated after backfill
git commit -m "refactor(web): admin-types re-exports generated OpenAPI schemas; backfill spec gaps"
```

### Task 4.4: CI gate in `ci-cd-web.yml`

**Files:**
- Modify: `.github/workflows/ci-cd-web.yml`

- [ ] **Step 4.4.1: Inspect existing workflow**

Run:
```bash
cat .github/workflows/ci-cd-web.yml | head -120
```
Locate the existing `quality-gate` job and the step that runs `pnpm lint`.

- [ ] **Step 4.4.2: Insert OpenAPI drift gate before `pnpm lint`**

In the quality-gate job, before the `pnpm lint` step:
```yaml
- name: Verify OpenAPI types up to date
  working-directory: museum-web
  run: pnpm check:openapi-types
```

- [ ] **Step 4.4.3: Local dry-run by mutating the spec**

Run:
```bash
# Temporarily make a benign edit to museum-backend/openapi/openapi.json
# (e.g. add a description), then:
cd museum-web && pnpm check:openapi-types || echo "EXPECTED FAIL"
# Revert the edit
git checkout museum-backend/openapi/openapi.json
```
Expected: the dry-run failed with the EXPECTED FAIL message.

- [ ] **Step 4.4.4: Commit**

```bash
git add .github/workflows/ci-cd-web.yml
git commit -m "ci(web): gate quality check on OpenAPI types drift"
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
Expected: all green; test counts equal or above the baseline taken in P.2.

- [ ] **Step Q.2: GitNexus detect changes**

Run:
```bash
# Call gitnexus_detect_changes() in MCP context; report symbols/processes affected.
```
Expected: only the symbols and processes within the spec's scope appear.

- [ ] **Step Q.3: Manual UX walk-through**

Run the dev stack and walk through:
1. Tap "walk" on Home → enter chat with intent=walk → message exchange shows suggestion chips.
2. Open admin dashboard in FR and EN → stat labels are localized, dates are localized.
3. Auth screen: invalid email blocked; valid login navigates; error banner on bad credentials.

- [ ] **Step Q.4: Open PR**

Branch name: `spec-a/cleanup-decisions`. PR title: `feat(spec-a): walk V1 + admin i18n cleanup + ADR-012 + web OpenAPI gate`.

PR body must include:
- Summary of each section.
- The `TODO(openapi)` gap list (if any).
- Lighthouse / bundle-size deltas if changed (none expected for Spec A).
- `gitnexus_detect_changes()` output.
- Migration apply/revert verification (Section 1 migration).

---

## Self-Review (auto-applied during writing)

1. **Spec coverage:** Each spec section maps to tasks 1.x, 2.x, 3.x, 4.x.
2. **Placeholder scan:** No "TBD" / "implement later" / unspecified-test patterns. The orchestrator test stub references existing-pattern test files because the codebase already has the established DI shape; the reference is explicit, not a placeholder.
3. **Type consistency:** `ChatSessionIntent` union, `intent` field, and `suggestions?: string[]` shape are reused identically across backend tasks (1.1, 1.3, 1.5, 1.6, 1.7) and mobile tasks (1.9, 1.11, 1.12). `useDateLocale` returns `DateLocaleTag` which `formatDate` accepts (Tasks 2.2, 2.3). `WalkSuggestionChips` props (`suggestions`, `onSelect`) are stable between Task 1.11 and 1.12.

---

## Out of Scope (reminder)

- MFA mobile (parallel F6 agent).
- LiquidButton / EmptyState / ErrorState extraction (Spec B).
- Onboarding redesign, daily-art parallax, chat skeleton, reviews haptics (Spec B).
- Semantic LLM cache, UserMemory extension, multi-modal recall, voice continuity (Spec C/D).
