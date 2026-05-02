# Spec C — Personalization Signals + Voice Continuity

**Date:** 2026-05-02
**Status:** Approved (brainstorm)
**Owner:** BE primary, FE settings surface
**Related prompt:** Frontend UX Wahoo + AI Caching + Personnalisation (Prompt 6, 2026-04-30)
**Predecessors:** Spec A (`docs/superpowers/specs/2026-04-30-spec-a-cleanup-decisions-design.md`), Spec B (`docs/superpowers/specs/2026-05-01-spec-b-ux-wahoo-design.md`)

## Context

Spec A wired walk V1, web admin i18n, ADR-025 state-management governance, and OpenAPI generation parity. Spec B shipped shared FE primitives, onboarding redesign, daily-art polish, chat skeleton/typing, review haptics + confetti, the museum offline-pack prompt, the web landing story section, and closed the auth dismiss-UX gap. Backend G-phase (commit `9af59bf7`) landed the LLM response cache; H-phase (commit `9c886605`) added Prometheus counters.

Spec C focuses on the personalization side of Prompt 6 — surfacing latent session-derived signals into the LLM prompt so the assistant adapts tone, language, and pacing per user, plus persisting the user's TTS voice choice across devices. Spec C deliberately drops the "cache-hit FE consume" candidate from the brainstorm because exposing cached replies conflicts with the personalization promise (cached responses by definition do not reflect updated personalization). End-of-session recommendations and multi-modal recall are deferred to Spec D since they share a unified recommendation engine.

## Goals

1. Wire `UserMemory.favoritePeriods` (existing column, never written) via session-end aggregation against `ArtworkKnowledge.period`; cap at 10.
2. Add `UserMemory.languagePreference` (mode of recent session locales, last 20 sessions; ties → most recent).
3. Add `UserMemory.sessionDurationP90Minutes` (p90 of `(lastMessageAt - createdAt)` over last 20 sessions; needs ≥5 sessions to compute, else null).
4. Surface all three signals in the LLM prompt block via `buildUserMemoryPromptBlock`.
5. Persist user-selected TTS voice on `User.ttsVoice` (varchar 32, nullable, env fallback when null).
6. Expose `PATCH /api/me { ttsVoice }` to set/clear the voice; validate against the 6-voice catalog.
7. Wire FE settings dropdown (text-only, 6 voices + default reset) with cross-device continuity via the DB-backed value.

## Non-Goals

- LLM cache FE consume (`fromCache` boolean on response). Dropped — conflicts with personalization output drift.
- End-of-session recommendations (3 next-museum/artwork suggestions on session close). Deferred to Spec D.
- Multi-modal artwork recall, cross-session linger affinity. Spec D scope.
- TTS voice preview audio (Spec C ships text-only dropdown).
- Onboarding self-declared style picker. Rely on session-derived `favoritePeriods` only.
- New mobile or web locales. Existing 8 mobile + 2 web stay.
- Web work. Spec C is BE + mobile only.

## Section 1 — `UserMemory` Personalization Fields

### Migration `AddUserMemoryPersonalizationFields`

Generated via:
```bash
node scripts/migration-cli.cjs generate --name=AddUserMemoryPersonalizationFields
```

Schema delta on `user_memories`:
- `language_preference VARCHAR(10) NULL`
- `session_duration_p90_minutes INTEGER NULL`

`favorite_periods` already exists; no schema change.

`up()` adds both columns with `NULL` default. `down()` drops them.

### Entity (`museum-backend/src/modules/chat/domain/userMemory.entity.ts`)

After `notableArtworks` and before `interests`:
```ts
@Column({ type: 'varchar', length: 10, nullable: true, name: 'language_preference' })
languagePreference!: string | null;

@Column({ type: 'integer', nullable: true, name: 'session_duration_p90_minutes' })
sessionDurationP90Minutes!: number | null;
```

### Repository interface (`userMemory.repository.interface.ts`)

`UserMemoryUpdates` union extended:
```ts
| 'languagePreference'
| 'sessionDurationP90Minutes'
```

New repository method:
```ts
getRecentSessionsForUser(
  userId: number,
  limit: number,
): Promise<RecentSessionAggregate[]>;

interface RecentSessionAggregate {
  sessionId: string;
  locale: string;
  createdAt: Date;
  lastMessageAt: Date | null; // null if session has no messages
}
```

PG implementation: SQL with subquery `MAX(chat_messages.createdAt)` per session, ordered by `chat_sessions.createdAt DESC`, limit 20.

### Service merge logic (`user-memory.service.ts`)

Three new private helpers, called after the existing four (expertise, museums, artworks, artists), all guarded by the existing `try/catch` around `repository.upsert`. The `updateAfterSession` signature gains an optional `dbLookup: DbLookupService` dependency injected at construction time (already a chat module dep).

#### Helper 1 — `mergePeriods`

```ts
private async mergePeriods(
  updates: UserMemoryUpdates,
  existing: UserMemory | null,
  visitContext: VisitContext,
  locale: string,
): Promise<void>;
```

For each `visitContext.artworksDiscussed`:
1. Lookup `ArtworkKnowledge` by `(title, artist, locale)` via `dbLookup.findArtworkKnowledge` (verify exact method name during impl).
2. Collect `period` strings, filter null/empty.
3. Dedupe case-insensitive against `existing.favoritePeriods`.
4. New union = `[...existing, ...newDeduped]`, slice to last `MAX_PERIODS = 10`.
5. Write to `updates.favoritePeriods` only when at least one new period was added.

If `dbLookup` is undefined (test contexts may inject null), method returns silently.

#### Helper 2 — `mergeLanguagePreference`

```ts
private mergeLanguagePreference(
  updates: UserMemoryUpdates,
  recentSessions: RecentSessionAggregate[],
  existing: UserMemory | null,
): void;
```

1. Tally `session.locale` across recentSessions.
2. Pick mode; tie → locale of the most recent session in `recentSessions[0]`.
3. Write to `updates.languagePreference` only when value differs from `existing.languagePreference`.

#### Helper 3 — `mergeSessionDurationP90`

```ts
private mergeSessionDurationP90(
  updates: UserMemoryUpdates,
  recentSessions: RecentSessionAggregate[],
  existing: UserMemory | null,
): void;
```

1. For each session with non-null `lastMessageAt`, compute `(lastMessageAt - createdAt) / 60_000` minutes; clamp negative or zero to 1.
2. Need at least `MIN_SESSIONS_FOR_P90 = 5` sessions; otherwise return without writing.
3. Sort ascending; pick `sorted[Math.ceil(0.9 * n) - 1]`.
4. Round to integer; cap at `MAX_DURATION_MINUTES = 240` (4h sanity cap).
5. Write to `updates.sessionDurationP90Minutes` only when value differs from `existing.sessionDurationP90Minutes`.

### Prompt block extension (`user-memory.prompt.ts`)

`buildUserMemoryPromptBlock(memory)` adds two conditional lines to the existing block:

- When `memory.languagePreference != null`:
  - English template: `"User typically converses in: <sanitizedLocale>."`
- When `memory.sessionDurationP90Minutes != null`:
  - English template: `"Typical session length: ~<n> minutes. Pace responses accordingly."`

`favoritePeriods` block already rendered by the existing helper; no change there.

All new line content sanitized through `sanitizePromptInput(value, { maxLength: 64 })` to defeat memory-as-injection-vector.

### Tests

- `tests/unit/chat/user-memory-merge-periods.test.ts` — happy path with mock `DbLookupService` returning fixed periods; cap overflow trims oldest; case-insensitive dedupe; empty input returns without write.
- `tests/unit/chat/user-memory-merge-language.test.ts` — mode resolution; tie → most recent; no-op when unchanged.
- `tests/unit/chat/user-memory-merge-p90.test.ts` — needs ≥5 sessions; computes p90 correctly for fixed input; clamps negative; caps at 240.
- `tests/unit/chat/user-memory-prompt.test.ts` — extend with new line cases for each field combination; assert sanitization strips zero-width chars.
- `tests/integration/chat/user-memory-personalization.integration.test.ts` — full session lifecycle: seed `ArtworkKnowledge` rows, run multiple chat sessions, assert UserMemory row contains all three populated fields after the 5th session.

## Section 2 — Voice Continuity

### Migration `AddUserTtsVoice`

Generated via CLI. Schema delta on `users`:
- `tts_voice VARCHAR(32) NULL`

`up()` adds the column, default `NULL`. `down()` drops it. No data backfill (null = use env default).

### Voice catalog (`museum-backend/src/modules/chat/voice-catalog.ts`)

```ts
export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export function isTtsVoice(value: unknown): value is TtsVoice {
  return typeof value === 'string' && (TTS_VOICES as readonly string[]).includes(value);
}
```

A sentinel unit test pins the list — additions/removals require explicit test update plus changelog note.

### User entity (`user.entity.ts`)

Add column after `contentPreferences`:
```ts
@Column({ type: 'varchar', length: 32, nullable: true, name: 'tts_voice' })
ttsVoice!: string | null;
```

### Backend TTS read path (`chat-media.service.ts`)

Two changes:
1. Line 288 (`targetVoice = env.tts.voice`): replace with `session.user?.ttsVoice ?? env.tts.voice`. Repository session fetch must eager-load `user` relation, OR `ChatRepository.getSessionById` returns a shape that includes `user.ttsVoice` already — verify during impl, prefer eager-load on the existing query so other paths benefit.
2. Line 363 (replay path): unchanged — already reads `row.message.audioVoice`.

### `PATCH /api/me` extension

Locate the existing me-route handler (likely `museum-backend/src/modules/auth/adapters/primary/http/me.controller.ts` or similar — confirm during impl). Extend the request Zod schema:
```ts
ttsVoice: z.union([z.literal(null), z.enum(TTS_VOICES)]).optional()
```

Handler:
- `null` → set `user.ttsVoice = null` (reset to env default).
- Valid voice → set `user.ttsVoice = value`.
- Omitted → leave unchanged.
- Unknown string → 400 via Zod.

Response includes the updated `ttsVoice` field on the returned user DTO.

### OpenAPI

Update `openapi/openapi.json`:
- `User` schema gains `ttsVoice: { type: string, enum: [...TTS_VOICES, null], nullable: true }`.
- `PatchMeRequest` schema (or its equivalent) gains the same optional field.
- Validate via `pnpm openapi:validate`.

### FE settings UI

#### Voice catalog mirror (`museum-frontend/features/settings/voice-catalog.ts`)

```ts
export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];
```

Sentinel jest test in `__tests__/features/settings/voice-catalog.test.ts` asserts the FE list matches the BE schema enum (read from `shared/api/generated/openapi.ts` after regeneration).

#### Component (`features/settings/ui/VoicePreferenceSection.tsx`)

- Mounted in the existing settings screen (verify path `app/(stack)/settings.tsx` or `features/settings/ui/SettingsScreen.tsx`).
- Renders section title + description + a single picker.
- Picker: native `Picker` from `@react-native-picker/picker` if installed, else fallback to a `Modal` + 7-row `FlatList` (6 voices + 1 "Default" reset).
- Selecting a row calls `useUpdateTtsVoice` (a thin wrapper around React Query `useMutation` posting to PATCH /api/me).
- On success: `Haptics.selectionAsync()` and an updated highlight on the selected row.
- On error: existing toast / `ErrorState` inline banner from Spec B.
- Selecting "Default" posts `{ ttsVoice: null }`.

i18n keys (8 locales):
- `settings.voice.sectionTitle`
- `settings.voice.description`
- `settings.voice.useDefault`

Voice display names (`alloy`, `echo`, etc.) stay un-translated as proper-noun voice ids.

### Tests

- `tests/unit/chat/voice-catalog.test.ts` — sentinel: `TTS_VOICES.length === 6` and exact list match.
- `tests/unit/auth/me-controller-tts-voice.test.ts` — accepts valid voice, accepts `null`, rejects unknown string with 400, returns updated user DTO.
- `tests/integration/auth/me-tts-voice.integration.test.ts` — `PATCH /api/me { ttsVoice: 'echo' }` → 200; subsequent TTS synth call observed via stub records `voice === 'echo'`. Reset to `null` → synth uses `env.tts.voice`.
- `tests/unit/chat/chat-media-tts-voice.test.ts` — falls back to env when `user.ttsVoice` is null; reads from user when set.
- `__tests__/features/settings/VoicePreferenceSection.test.tsx` — renders 7 rows (6 voices + default); pressing a row fires mutation with correct payload; sentinel checks list parity with backend.
- `__tests__/features/settings/voice-catalog.test.ts` — parity sentinel against generated OpenAPI types.

## TDD Discipline

Every task in the implementation plan follows red → green → commit:

1. **Red**: write the failing test first; run the test runner; confirm the failure mode matches expectations (compilation error, assertion failure, etc.).
2. **Green**: write the minimum production code to make the test pass; run the runner again; confirm pass.
3. **Commit**: path-restricted `git commit ... -- <paths>` per project rule for parallel-agent safety; commit message focuses on intent.

Refactor steps go in their own task with no behavioral change and no additional tests.

The implementation plan must include explicit `Step n.x.1: write failing test`, `Step n.x.2: run test → expect FAIL`, `Step n.x.3: implement`, `Step n.x.4: run test → expect PASS`, `Step n.x.5: commit` for every behavioral change.

## Acceptance Criteria

- [ ] `AddUserMemoryPersonalizationFields` migration up/down round-trip on a clean DB; `node scripts/migration-cli.cjs generate --name=DriftCheck` produces an empty migration.
- [ ] `AddUserTtsVoice` migration up/down round-trip on a clean DB; drift-check empty.
- [ ] Integration test: after a user accumulates ≥5 sessions with discussed artworks (where the artworks have `ArtworkKnowledge` rows with non-null `period`), the `user_memories` row shows non-empty `favoritePeriods`, populated `languagePreference`, and a numeric `sessionDurationP90Minutes`.
- [ ] Integration test: the LLM orchestrator input prompt for a personalized user contains the new prompt-block lines.
- [ ] Integration test: `PATCH /api/me { ttsVoice: 'echo' }` returns 200 with the updated `ttsVoice` field; the next TTS synthesis call uses `'echo'`.
- [ ] Integration test: `PATCH /api/me { ttsVoice: null }` resets the field; TTS synthesis falls back to `env.tts.voice`.
- [ ] Integration test: `PATCH /api/me { ttsVoice: 'unknown' }` returns 400 from Zod.
- [ ] FE component test: settings screen renders the voice section with 6 voices + 1 default row; pressing a row dispatches the mutation with the correct payload.
- [ ] FE/BE voice catalog parity sentinel test passes after `npm run generate:openapi-types` and `pnpm openapi:validate`.
- [ ] `npm run check:i18n` passes across the 8 mobile locales for the 3 new keys.
- [ ] BE `pnpm lint` clean; FE `npm run lint` clean.
- [ ] BE test suite ≥ baseline + ~10 new tests; FE test suite ≥ 1665 + ~5 new tests.
- [ ] `gitnexus_detect_changes()` confirms only files within Spec C scope changed.

## Risks & Open Questions

- **`ArtworkKnowledge.period` coverage**: many discussed artworks may not yet have a knowledge row, so `favoritePeriods` will start sparse. Acceptable — knowledge-extraction backfill grows coverage organically. Spec does not block on coverage threshold.
- **`getRecentSessionsForUser` query cost**: 20-row scan with subquery JOIN. Confirm `chat_sessions.user_id` index exists (likely yes, given `IDX_chat_sessions_user_id`); consider adding `(session_id, created_at DESC)` index on `chat_messages` if the EXPLAIN shows a sort step. Add the index in the same migration only if profiling shows >50ms cost.
- **Prompt-injection-via-memory**: defended by `sanitizePromptInput`. Tests assert sanitization on each new line.
- **Voice catalog drift with OpenAI provider changes**: catalog hand-curated; sentinel pins the list; future additions = catalog edit + migration optional only if voices removed and existing user rows must be reset.
- **PATCH /api/me route discovery**: implementation plan must locate the actual route file before coding; if no PATCH handler exists, plan adds one as a sub-task and updates auth router.
- **Eager-load user on session fetch**: plan must verify whether existing `ChatRepository.getSessionById` already eager-loads user; if not, add the relation and confirm existing tests still pass.

## Out of Scope (reminder)

- LLM cache FE consume.
- End-of-session recommendations.
- Multi-modal artwork recall.
- Cross-session linger affinity.
- TTS voice preview audio.
- Onboarding style picker.
- Web changes (no `museum-web` work).
- New locales (mobile or web).
- Lighthouse uplift, bundle-size monitoring.
