# Test Discipline — DRY Factories

> Shared factory rules + tier classification + ESLint enforcement. Originally inline in `CLAUDE.md`, extracted 2026-05-07.

**Tests MUST use shared factories. Inline object creation forbidden.**

## Principle

Every test entity (User, ChatMessage, ChatSession, etc.) MUST be created via shared factory function in `tests/helpers/`. No test file should define own `makeUser()`, `makeMessage()`, or `makeSession()` inline.

## Existing factories (use them)

| Factory | Location | Creates |
|---------|----------|---------|
| `makeUser(overrides?)` | `tests/helpers/auth/user.fixtures.ts` | `User` entity with defaults |
| `makeToken(overrides?)` | `tests/helpers/auth/token.helpers.ts` | JWT access token |
| `adminToken()` / `visitorToken()` | `tests/helpers/auth/token.helpers.ts` | Role-specific tokens |
| `makeMessage(overrides?)` | `tests/helpers/chat/message.fixtures.ts` | `ChatMessage` entity |
| `makeSession(overrides?)` | `tests/helpers/chat/message.fixtures.ts` | `ChatSession` entity |
| `buildChatTestService()` | `tests/helpers/chat/chatTestApp.ts` | Full ChatService with in-memory deps |
| `createRouteTestApp()` | `tests/helpers/http/route-test-setup.ts` | Express test app |
| `createE2EHarness()` | `tests/helpers/e2e/e2e-app-harness.ts` | Full E2E environment |

## Rules

1. **New entity?** → Create factory in `tests/helpers/<module>/<entity>.fixtures.ts` FIRST
2. **Need mock repo?** → Check if in-memory repo exists in `tests/helpers/`. If not, create one.
3. **Override pattern**: `makeEntity({ field: value })` — factory provides sensible defaults, test overrides only what matters
4. **Frontend**: Use `test-utils.tsx` for shared mocks. Create factories in `__tests__/helpers/` for data objects.
5. **Never** duplicate `jest.mock()` calls already exist in `test-utils.tsx`

## Anti-patterns to avoid

| Don't do this | Do this instead |
|---|---|
| `const user = { id: 1, email: '...', ... } as User` inline | `const user = makeUser()` or `makeUser({ email: 'custom@test.com' })` |
| `const msg = { id: 'x', role: 'user', text: '...' } as ChatMessage` inline | `const msg = makeMessage({ text: 'my text' })` |
| Local `makeUser()` in each test file | Import from `tests/helpers/auth/user.fixtures.ts` |
| Copy-paste mock repo in each test | Create shared in-memory repo in `tests/helpers/` |
| `jest.mock('@sentry/react-native')` in each test | Import `test-utils.tsx` which already mocks it |

## Tier classification rule (ADR-012)

A test file lives in `tests/integration/` **iff** it imports `tests/helpers/e2e/postgres-testcontainer.ts` (or a sibling Redis/S3 helper) or instantiates a TypeORM `DataSource` against a real testcontainer. Anything else belongs in `tests/unit/`. See `docs/adr/ADR-012-test-pyramid-taxonomy.md`.

## Factory enforcement (ESLint)

The workspace plugin `eslint-plugin-musaium-test-discipline` rejects new test files that inline-construct `User`, `ChatMessage`, `ChatSession`, `Review`, or `SupportTicket` objects. Use the factories in `tests/helpers/<module>/<entity>.fixtures.ts` (BE) or `__tests__/helpers/factories/` (FE). The grandfather baseline at `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json` lists files exempted at Phase 0; Phase 7 reduces this list as files are migrated. **The baseline length cannot grow** — a CI test enforces the cap.
