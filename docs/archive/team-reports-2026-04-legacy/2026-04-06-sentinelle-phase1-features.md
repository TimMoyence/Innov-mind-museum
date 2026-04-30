# Gate Sentinelle -- Phase 1 Features (Art Keywords + Audio Description)

**Date:** 2026-04-06
**Reviewer:** Claude Opus 4.6 (Senior Code Reviewer)
**Scope:** Art Keywords classifier hint, Audio Description mode, standalone Describe endpoint

---

## 1. VERDICT SUMMARY

| Check                    | Result   | Details                                                  |
|--------------------------|----------|----------------------------------------------------------|
| Typecheck (BE)           | **PASS** | tsc --noEmit clean                                       |
| Typecheck (FE)           | **PASS** | tsc --noEmit 0 warnings                                  |
| Quality Ratchet (BE)     | **PASS** | 2317 -> 2331 (+14 tests, no regression)                  |
| Quality Ratchet (FE)     | **PASS** | 1052 -> 1052 (stable, no regression)                     |
| ESLint-disable scan      | **PASS** | Zero new eslint-disable comments                         |
| Scope check              | **WARN** | 3 museum-web files + i18n locale noise outside scope     |
| New file quality         | **PASS** | Clean architecture, proper DI, good test coverage        |
| OpenAPI spec             | **WARN** | POST /describe not in openapi.json (follow-up needed)    |
| Contract alignment (FE)  | **WARN** | describeApi.ts image shape diverges from backend schema  |

**Overall: PASS with 3 WARNs (none blocking)**

---

## 2. TYPECHECK -- PASS

Both backend and frontend typechecks confirmed passing per the baseline data provided. No new tsc errors introduced.

---

## 3. QUALITY RATCHET -- PASS

**Baseline** (from `quality-ratchet.json`):
- Backend: 2317 tests
- Frontend: 1052 tests

**Post-run:**
- Backend: 2331 (+14 tests) -- no regression
- Frontend: 1052 (stable) -- no regression

New backend tests cover:
- `describe-service.test.ts` -- 7 test cases (text, audio, both, TTS unavailable, missing input, orchestrator flags, image passthrough)
- `art-topic-guardrail.test.ts` -- +5 test cases for `preClassified` hint behavior (art bypass, off-topic bypass, insult still blocked, injection still blocked)
- `llm-prompt-builder.test.ts` -- +2 test cases for audio description mode instructions

Test quality assessment: Tests use proper fake implementations (FakeOrchestrator, FakeTts) rather than inline mocks. The guardrail tests correctly verify that hard blocks (insults, injection) still fire even with `preClassified='art'`, which is the critical safety invariant.

---

## 4. ESLINT-DISABLE SCAN -- PASS

```
git diff -U0 | grep '+.*eslint-disable' => NO_NEW_ESLINT_DISABLE
```

Zero new eslint-disable comments introduced. Excellent discipline.

---

## 5. SCOPE CHECK -- WARN (non-blocking)

### Expected scope (all present):

**Backend:**
- `src/modules/chat/` -- 8 files modified/added (types, ports, service, route, index, guardrail, prompt builder, sections)
- `src/shared/routers/api.router.ts` -- describe service wiring
- `tests/unit/chat/` -- 3 test files (describe, guardrail, prompt-builder)

**Frontend:**
- `features/art-keywords/` -- useArtKeywordsClassifier.ts (new), useArtKeywordsSync.ts (modified)
- `features/chat/` -- useChatSession, chatApi, describeApi (new), useAutoTts (new), ChatHeader
- `features/settings/` -- useAudioDescriptionMode (new), SettingsAccessibilityCard (new)
- `app/(stack)/` -- chat/[sessionId].tsx, settings.tsx
- `shared/locales/` -- all 8 locales (en, fr, ar, de, es, it, ja, zh) updated with i18n keys
- `__tests__/` -- art keywords sync test, chat-screen setup helper

### Out-of-scope changes:

| File | Concern |
|------|---------|
| `museum-web/src/components/marketing/DemoChat.tsx` (+317/-34) | Major UI redesign -- not part of art-keywords/audio-description feature |
| `museum-web/src/components/marketing/DemoMap.tsx` (+/-44) | Map component changes -- unrelated |
| `museum-web/src/app/[locale]/page.tsx` (+/-21) | Landing page tweaks -- unrelated |
| `museum-frontend/ios/*` (multiple binary files) | Hermes engine / build artifacts -- likely from pod update, not feature work |
| `museum-frontend/app/(stack)/museum-detail.tsx` | Listed in git status but not part of this feature |

**Assessment:** The museum-web and iOS changes are cosmetic/infrastructure and do not interfere with the feature. They should ideally be in a separate commit for clean history but are non-blocking.

---

## 6. NEW FILE QUALITY REVIEW

### 6.1 `describe.service.ts` -- PASS

Well-structured service class following hexagonal patterns:
- Constructor injection via `DescribeServiceDeps` interface (proper port/adapter pattern)
- Input validation with early `badRequest` throw
- Clean separation: orchestrator handles AI, TTS is optional
- Proper type exports for `DescribeInput`/`DescribeOutput`
- JSDoc on class, constructor, and method

No issues found.

### 6.2 `chat-describe.route.ts` -- PASS

Clean HTTP adapter:
- Zod schema validation with sensible defaults
- Rate limiting (30 req/min per user) -- appropriate for an AI endpoint
- `isAuthenticated` middleware applied
- Dual response modes (binary audio vs JSON) handled correctly
- Proper error propagation via `throw badRequest`

Minor note: The `!input.text && !input.image` check on line 50-52 duplicates the same check inside `DescribeService.describe()`. This is defense-in-depth (route validates before service), which is acceptable at a trust boundary but could be documented as intentional.

### 6.3 `useArtKeywordsClassifier.ts` -- PASS

Simple, focused hook:
- Unicode normalization (NFD + diacritic strip) for locale-safe matching
- Token splitting on common punctuation
- `Set`-based lookup for O(1) keyword matching
- Properly memoized with `useCallback` and correct dependency array
- Returns a clear discriminated union ('art' | 'unknown')

No issues found.

### 6.4 `useAutoTts.ts` -- PASS

Good reactive hook design:
- Uses refs for mutable state that should not trigger re-renders (`prevCountRef`, `autoPlayingRef`, `enabledRef`)
- Correctly detects new messages via count comparison
- Skips streaming placeholders (`id.endsWith('-streaming')`)
- Cleanup on unmount (`stopPlayback`)
- Stops playback when mode toggled off

One observation: The `enabledRef` pattern (lines 19-21) syncs the `enabled` prop into a ref to avoid stale closure in the message effect. This is a valid pattern for avoiding re-running the effect on every `enabled` toggle.

### 6.5 `SettingsAccessibilityCard.tsx` -- PASS

Clean UI component:
- Loading state handled with ActivityIndicator
- Proper theming via `useTheme()`
- i18n via `useTranslation()` with correct key paths
- StyleSheet.create for static styles, dynamic colors via style array
- Good component composition with GlassCard

No issues found.

### 6.6 `useAudioDescriptionMode.ts` -- PASS

AsyncStorage persistence hook:
- Cleanup via `cancelled` flag to avoid state updates after unmount
- Error handling on storage read (catches and still clears loading)
- Simple boolean toggle with optimistic UI update

One observation: The `toggle` callback depends on `enabled` in its closure. If called rapidly, there is a theoretical race where two toggles read the same `enabled` value. For a settings toggle this is negligible, but a functional updater (`setEnabled(prev => !prev)`) would be more robust. This is a **Suggestion**, not a bug.

---

## 7. OPENAPI SPEC CHECK -- WARN

`POST /api/chat/describe` is **not** present in `museum-backend/openapi/openapi.json`. The grep returned zero matches.

**Impact:**
- Contract tests (`pnpm test:contract:openapi`) will not cover this endpoint
- Frontend type generation (`npm run generate:openapi-types`) will not produce types for it
- CI OpenAPI validation will not catch schema drift

**Recommendation:** Add the endpoint to the OpenAPI spec as a follow-up task. This is not blocking for the current gate since the endpoint is new and the frontend `describeApi.ts` uses manually typed interfaces.

---

## 8. CONTRACT ALIGNMENT CHECK -- WARN

The frontend `describeApi.ts` defines the image field as:
```typescript
image?: { base64: string; mimeType: string };
```

The backend `describeInputSchema` (Zod) expects:
```typescript
image?: { source: 'base64' | 'url'; value: string; mimeType?: string };
```

**Divergence:**
1. Frontend uses `base64` as a field name; backend expects `source` + `value` as separate fields
2. Frontend's `mimeType` is required; backend's is optional

This means `describeApi.ts` will send a payload the backend cannot parse correctly -- the `source` and `value` fields will be missing, and Zod validation will reject it.

**Severity:** Important -- this is a functional bug in the standalone describe API client. However, the `describeApi.ts` function does not appear to be called anywhere in the current diff (the main chat flow goes through `chatApi.sendMessageSmart`, not `describeArtwork`). The describe API client is wired but not yet invoked from any UI component.

**Recommendation:** Fix the `describeApi.ts` interface to match the backend contract before any UI consumes it.

---

## 9. ARCHITECTURE REVIEW

### What was done well:

1. **Hexagonal pattern respected** -- `DescribeService` depends on ports (`ChatOrchestrator`, `TextToSpeechService`), not implementations. Wired via `ChatModule.build()` in `index.ts`.

2. **Security invariant preserved** -- The `preClassified='art'` hint only bypasses the soft off-topic classifier. Hard blocks (insults, prompt injection) always run. This is explicitly tested. The guardrail change is safe.

3. **Audio description prompt design** -- The `AUDIO DESCRIPTION MODE` instruction in `llm-prompt-builder.ts` is well-crafted: it specifies colors, textures, composition, spatial arrangement, emotional atmosphere, foreground-to-background structure, and explicitly bans bullet points for listening. The word limits are increased appropriately (150->300 museum, 250->400 regular).

4. **`buildSummaryPrompt` refactored to options object** -- The function signature was getting unwieldy (5+ positional params). The refactor to a named options object is a clean improvement that also makes the `audioDescriptionMode` addition non-breaking.

5. **Session-level audio override** -- The chat screen allows per-session override of the global audio description setting via `sessionAudioOverride` state. Good UX pattern.

6. **i18n completeness** -- All 8 locales updated with settings and chat keys. No missing translations.

7. **Test helper updates** -- `chat-screen.setup.tsx` properly mocks the new hooks to avoid test failures in existing tests.

### Minor observations:

- The `ChatHeader` audio toggle reuses `styles.closeButton` styling. If that button style is semantically named for the close button, a dedicated style name would be clearer. This is cosmetic.
- The `useArtKeywordsSync.test.ts` change replaces a "skips when recent sync" test with "skips when offline". The original test case may still be valid -- verify it is covered elsewhere or re-add it.

---

## 10. ISSUE SUMMARY

### Important (should fix before shipping)

| # | Issue | File | Action |
|---|-------|------|--------|
| I1 | `describeApi.ts` image shape mismatches backend Zod schema (`base64`/`mimeType` vs `source`/`value`/`mimeType?`) | `museum-frontend/features/chat/infrastructure/describeApi.ts` | Fix interface to match backend contract |
| I2 | `POST /describe` missing from OpenAPI spec | `museum-backend/openapi/openapi.json` | Add endpoint definition |

### Suggestions (nice to have)

| # | Issue | File | Action |
|---|-------|------|--------|
| S1 | `useAudioDescriptionMode.toggle` uses closure over `enabled` instead of functional updater | `museum-frontend/features/settings/application/useAudioDescriptionMode.ts` | Use `setEnabled(prev => !prev)` |
| S2 | Out-of-scope museum-web changes in same diff | `museum-web/src/components/marketing/` | Separate into distinct commit for clean history |
| S3 | `ChatHeader` audio button reuses `closeButton` style name | `museum-frontend/features/chat/ui/ChatHeader.tsx` | Consider dedicated style name |
| S4 | Replaced "skips when recent sync" test -- verify coverage | `museum-frontend/__tests__/features/art-keywords/useArtKeywordsSync.test.ts` | Confirm recent-sync skip is tested elsewhere |

---

## 11. QUALITY RATCHET UPDATE

The quality ratchet should be updated to reflect the new baseline:

```json
{
  "backend": { "testCount": 2331 },
  "frontend": { "testCount": 1052 }
}
```

---

## 12. FINAL GATE DECISION

**PASS** -- The implementation is architecturally sound, follows established patterns, maintains safety invariants, and improves test coverage. The two Important issues (I1, I2) are non-blocking because `describeApi.ts` is not yet invoked from any UI and the OpenAPI spec gap only affects future contract tests. Both should be resolved before the describe endpoint is wired into the frontend UI.
