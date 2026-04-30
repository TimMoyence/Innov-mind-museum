# Spec A — Cleanup & Decisions (Walk V1, Web Tech Debt, State Mgmt ADR, OpenAPI Types)

**Date:** 2026-04-30
**Status:** Approved (brainstorm)
**Owner:** FE/BE shared
**Related prompt:** Frontend UX Wahoo + AI Caching + Personnalisation (Prompt 6, 2026-04-30)

## Context

This spec is the first of two batched cleanup/UX initiatives derived from the 2026-04-30 staff frontend audit. Spec A covers low-risk decisions and tech-debt cleanup that unblock subsequent UX polish work (Spec B). MFA RN screens are explicitly **out of scope**: a parallel agent is shipping the F6 MFA all-roles enforcement initiative.

## Goals

1. Replace the `walk-composer` "coming soon" stub with a real, minimum-viable "guided walk" experience that reuses the existing chat infrastructure.
2. Eliminate hard-coded i18n strings and locale boolean drift in `museum-web/src/app/[locale]/admin/*`.
3. Codify state-management governance for the React Native app and migrate `auth.tsx` away from ad-hoc `useState` chains.
4. Bring the `museum-web` admin DTO layer onto the same `openapi-typescript` generation pattern as `museum-frontend`, with a CI drift gate.

## Non-Goals

- Mobile MFA enrollment / challenge wiring (handled by parallel F6 agent).
- Walk mode AR overlay, parallax artwork hero, offline pack pre-cache (V1.1+).
- Refactor of any module not directly listed above. No drive-by.
- New UX primitives (`LiquidButton`, `EmptyState`, `ErrorState`) — Spec B.
- Semantic LLM cache, multi-modal recall, voice continuity — Spec C/D (depends on backend semantic cache from Prompt 4).

## Section 1 — Walk V1

### Decision

The fullscreen `walk-composer` stub is removed. The Home tab "walk" intent chip creates a chat session with `intent: 'walk'`, which the backend uses to inject a guided-tour system prompt. The chat screen renders a walk-mode variant with `WalkSuggestionChips` below the assistant message.

### Backend changes (`museum-backend`)

- `CreateSessionRequestDTO`: add optional `intent: 'default' | 'walk'`.
- `ChatSession` entity: add `intent` column (`varchar`, default `'default'`). Migration: `Add_chat_session_intent`.
- `chat.service.ts createSession`: persist `session.intent`. Pass intent into orchestrator context.
- `langchain.orchestrator.ts`: when `intent === 'walk'`, prepend `WALK_TOUR_GUIDE_SECTION` after the base system prompt and before user content. The walk section instructs the LLM to act as a museum guide, weave geo context (museum name, current room if known), and end each response with 3 short artwork suggestions formatted as a structured field.
- New `llm-sections/walk-tour-guide.ts` exporting `WALK_TOUR_GUIDE_SECTION` (plain text, no user input interpolation — system-side only).
- Use LangChain `withStructuredOutput` (Zod schema `{ answer: string, suggestions: string[] }`) only when `intent === 'walk'`. For other intents, keep current free-form output path. Suggestions array is capped at 3, each ≤ 60 chars (Zod refinement).
- Response DTO `ChatMessageResponse`: add optional `suggestions?: string[]`. Existing default-intent messages return `undefined` (omitted).
- Guardrails (input + output) keep applying to the assistant `answer` string. The structured `suggestions` array is sanitized (trim, length cap, allow-list of characters via `sanitizePromptInput`) before persistence and serialization.

### Frontend changes (`museum-frontend`)

- Delete `app/(stack)/walk-composer.tsx`.
- Delete `WALK_COMPOSER_ROUTE` const and the `if (intent === 'walk') { router.push(...) }` branch in `features/chat/application/useStartConversation.ts`.
- `useStartConversation` always calls `chatApi.createSession`. When `intent === 'walk'`, pass `intent: 'walk'` in the payload alongside `coordinates`, `museumId`, `museumMode`. Push to `/(stack)/chat/[id]?intent=walk`.
- Drop the entire `walkComposer.*` namespace (`title`, `subtitle`, `coming_soon`) from all 8 mobile locales. The walk-mode chat header gets a new key `chat.walk.headerLabel` (e.g. "Visite guidée" / "Guided walk") added to all 8 locales.
- New `features/chat/ui/WalkSuggestionChips.tsx` primitive: renders `suggestions[]` from the most recent assistant message. Tap → autosend chip text as the next user prompt via existing `sendMessage` hook. Empty array → no render.
- Chat screen reads `?intent=walk` query param and conditionally renders `WalkSuggestionChips` below the input bar (or above, depending on existing chat layout — implementer chooses).
- No new `LiquidButton` here; chips reuse the existing chip pattern from `HomeIntentChips` (extraction to shared primitive is Spec B work).

### Tests

- BE integration: `tests/integration/chat/walk-intent.test.ts` — POST `/chat/sessions` with `intent: 'walk'` returns session with `intent === 'walk'`; first assistant response includes `suggestions` array length 1–3.
- BE unit: orchestrator selects `WALK_TOUR_GUIDE_SECTION` when `intent === 'walk'` and skips structured output for default intent.
- BE migration: `Add_chat_session_intent` up/down round-trip on a clean DB.
- FE unit: `__tests__/features/chat/useStartConversation.walk.test.ts` — walk intent posts session with `intent: 'walk'` and coordinates; navigates to `/(stack)/chat/[id]?intent=walk`.
- FE component: `__tests__/features/chat/WalkSuggestionChips.test.tsx` — renders 3 chips; tap calls send handler with chip text; empty array renders nothing.

### Migration safety

- `gitnexus_impact` on `useStartConversation` and `chat.service.ts createSession` before edits. Both are HIGH-traffic; expect blast radius warning.
- Backfill: existing rows in `chat_session` get `intent = 'default'` via column default. No data migration needed.

## Section 2 — Web i18n cleanup (`STAT_LABELS` + `isFr`)

### `STAT_LABELS` → dictionary

- Remove the `STAT_LABELS` map and `getStatLabel()` helper from `museum-web/src/app/[locale]/admin/page.tsx` (lines 23–37).
- Add to both `museum-web/src/dictionaries/fr.json` and `museum-web/src/dictionaries/en.json`, nested under existing `admin.dashboard`:
  ```json
  "stats": {
    "totalUsers": "...",
    "activeUsers": "...",
    "conversations": "...",
    "messages": "...",
    "newToday": "...",
    "messagesThisWeek": "..."
  }
  ```
- Replace `getStatLabel(card.labelKey, locale)` call sites with `adminDict.dashboard.stats[card.labelKey]`.
- Update the dictionary type definition (or `typeof dict` inference path) so the new keys are typed.

### `isFr` → `useDateLocale` + `formatDate`

- New `museum-web/src/lib/i18n-format.ts`:
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
- Migrate the 7 admin pages currently using `isFr` for `toLocaleDateString`:
  - `audit-logs/page.tsx`
  - `tickets/page.tsx`
  - `support/page.tsx` (also drop the local `formatDate(date, isFr)` helper, replace with shared util)
  - `users/page.tsx`
  - `reports/page.tsx`
  - `reviews/page.tsx`
  - `admin/page.tsx` (after STAT_LABELS migration also gets `useDateLocale` if any date is rendered)
- Drop the local `isFr` const and `dateLocale` const in each file.
- Keep `LanguageSwitcher.tsx` as-is (semantic = toggle target locale, not a date formatter).
- Keep `seo.ts` as-is (semantic = OpenGraph locale tag like `fr_FR` / `en_US`, distinct value space).

### Tests

- `museum-web/src/lib/__tests__/i18n-format.test.ts` (Vitest):
  - `useDateLocale` returns `'fr-FR'` for FR, `'en-US'` for EN (mocking `useAdminLocale`).
  - `formatDate` produces deterministic output for fixed Date input under each locale (use a fixed timezone in test setup).
- Smoke: each migrated admin page test (if it exists) keeps green; if no test exists, add a minimal render assertion.

## Section 3 — State Management ADR-012 + `auth.tsx` migration

### ADR-012

- Path: `museum-frontend/docs/adr/ADR-012-state-management-governance.md` (new file; create `museum-frontend/docs/adr/` dir if absent).
- Format mirrors backend ADRs (see `museum-backend/docs/adr/ADR-001-*.md` for template).
- Content:

| Class | Tool | Examples |
|---|---|---|
| Persistent client state | Zustand + `persist` | settings, runtime prefs, art keywords, chat local cache, user profile, conversations local cache |
| Server state (remote) | React Query (TanStack) | museum directory, museum detail, conversations remote, daily-art catalog, reviews list |
| Ephemeral UI state | `useState` / `useReducer` | form draft fields, modal open/close, focus ring, hover |
| Form state | `react-hook-form` (forms ≥ 3 fields) | auth login/register, support ticket, review submission |

  Decision rules:
  - Persists across app restart? → Zustand persist.
  - Comes from API and can be invalidated? → React Query.
  - Lives only inside one screen? → `useState`.
  - Multi-field with validation? → React Hook Form.

  Rationale: We currently fork between Zustand (8 stores), React Query (introduced 3d8658a8f), and ad-hoc `useState`. Codifying the rule prevents further drift and reduces decision overhead during PR review.

### `auth.tsx` migration

- Audit current `auth.tsx`: identify each `useState` and classify (form draft, ephemeral UI, server-state-fetch).
- Replace form drafts with a single `useForm()` from `react-hook-form` (`zodResolver` against an existing or new Zod schema covering email, password, displayName, locale, terms, mode toggle).
- Replace login/register submit handlers with `useMutation()` calls wrapping `authApi.login` and `authApi.register`. Use `mutation.error` for the error banner and `mutation.isPending` for the submit-disabled state.
- Keep `useState` only for genuinely ephemeral UI (e.g., password visibility toggle).
- Verify `react-hook-form` is in `museum-frontend/package.json`. If not, add it (and `@hookform/resolvers` for Zod).

### Tests

- `__tests__/app/auth.test.tsx`:
  - Invalid email shows inline form error; submit blocked.
  - Valid submit calls login mutation; success → navigate to home.
  - Mutation error renders banner.
  - Mode toggle switches between login and register.
- Reuse mocks from `test-utils.tsx`. Add new factories if needed under `__tests__/helpers/auth/`.

## Section 4 — `museum-web` `openapi-typescript` migration + CI gate

### Generation

- Source of truth: `museum-backend/openapi/openapi.json`.
- Add to `museum-web/package.json`:
  ```json
  "devDependencies": {
    "openapi-typescript": "^7.13.0"
  },
  "scripts": {
    "generate:openapi-types": "openapi-typescript ../museum-backend/openapi/openapi.json -o src/lib/api/generated/openapi.ts && prettier --write src/lib/api/generated/openapi.ts",
    "check:openapi-types": "pnpm generate:openapi-types && git diff --exit-code -- src/lib/api/generated/openapi.ts"
  }
  ```
- Generate `museum-web/src/lib/api/generated/openapi.ts` once during implementation; commit the generated file.

### `admin-types.ts` migration

- Replace each hand-rolled DTO in `museum-web/src/lib/admin-types.ts` with a re-export of the corresponding `components['schemas']['<Name>']` from the generated file:
  ```ts
  import type { components } from './api/generated/openapi';
  type Schemas = components['schemas'];
  export type DashboardStats = Schemas['DashboardStats'];
  export type AdminUser = Schemas['AdminUser'];
  // ...
  ```
- Delete duplicated raw type definitions.
- Update `museum-web/src/lib/admin-types.test.ts` assertions to import from generated types where applicable.

### Audit gap: undocumented admin endpoints

- During migration, list any DTO that has no matching schema in `openapi.json`.
- For each gap:
  - **Preferred:** add OpenAPI annotations to the backend admin route. Track in this spec's implementation plan. (Adds to spec scope but is the right fix.)
  - **Fallback:** keep the hand-rolled type with a `// TODO(openapi): backend route not yet documented` comment and open a follow-up ticket. Allowed only if the backend annotation work would more than double Spec A's effort; document each fallback in the PR description.

### CI gate

- `.github/workflows/ci-cd-web.yml` — in the existing quality-gate job, before `pnpm lint`:
  ```yaml
  - name: Verify OpenAPI types up to date
    working-directory: museum-web
    run: pnpm check:openapi-types
  ```
- The gate fails if `pnpm generate:openapi-types` produces any diff against the committed file.

### Tests

- `admin-types.test.ts`: keep green; adjust imports.
- CI gate is self-testing — drift in either backend OpenAPI or web types will turn the PR red.

## Risks & Open Questions

- **Walk V1 LLM cost:** structured output adds tokens vs free-form. Mitigation: `withStructuredOutput` only on `intent === 'walk'`; existing chat path unchanged.
- **OpenAPI undocumented admin endpoints:** unknown count until migration. Implementation plan will surface the list before code changes; if the count is large, we promote the backend annotation work to its own ticket and ship the migration with documented fallback comments (see fallback rule above).
- **`auth.tsx` regression risk:** auth is critical path. TDD strict; manual verification via Expo dev server + login flow before PR ready.
- **ADR-012 placement:** `museum-frontend/docs/adr/` is a new directory and is the chosen path. Backend ADRs already live in `museum-backend/docs/adr/`; mirroring the per-app structure keeps frontend and backend decision logs independent. No repo-root `docs/adr/` is created by this spec.

## Acceptance Criteria

- [ ] Walk chip on Home tab opens a chat session with intent=walk; assistant response includes 1–3 suggestion chips; tapping a chip autosends the chip text.
- [ ] `walk-composer.tsx` and `WALK_COMPOSER_ROUTE` deleted; no broken references.
- [ ] `STAT_LABELS` removed; admin dashboard renders localized stat labels from dictionary in both FR and EN.
- [ ] All 7 admin pages use `useDateLocale` + `formatDate` for date rendering; zero `isFr` for date-formatting purposes.
- [ ] `museum-frontend/docs/adr/ADR-012-state-management-governance.md` committed.
- [ ] `auth.tsx` uses `react-hook-form` + `useMutation`; tests cover validation, submit, error.
- [ ] `museum-web/src/lib/api/generated/openapi.ts` committed; `admin-types.ts` re-exports generated schemas; CI gate `pnpm check:openapi-types` green.
- [ ] All new and modified tests pass; `pnpm lint` (BE), `npm run lint` (FE), `pnpm lint` (web) all green.
- [ ] `gitnexus_detect_changes()` run before commit confirms expected blast radius.

## Out of Scope (explicit reminder)

- MFA mobile screens (parallel F6 agent owns).
- LiquidButton / EmptyState / ErrorState extraction (Spec B).
- Onboarding redesign, daily-art parallax, chat skeleton, reviews haptics (Spec B).
- Semantic LLM cache, UserMemory extension, multi-modal recall, voice continuity (Spec C/D).
- Lighthouse score uplift, bundle size monitoring, a11y axe tests, ES/DE web locales (later specs).
