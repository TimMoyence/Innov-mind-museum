---
runId: 2026-05-15-td2-bootstrap-profile-cross-device
mode: feature
pipeline: enterprise
completedAt: 2026-05-15T19:00:00Z
durationMs: 3600000
correctiveLoops: 0
costUSD: 5.01
tags:
  - feature
  - enterprise
  - phase
  - findings
  - stores
---

# Lesson — 2026-05-15-td2-bootstrap-profile-cross-device

## Trigger

### Phase A findings

**4 stores located + shape verified** :

| # | Store | Path | Persist | Public setters today | mergeFromServer? |
|---|---|---|---|---|---|
| 1 | `useUserProfileStore` | `features/settings/infrastructure/userProfileStore.ts` | Zustand persist (`musaium.userProfile`) | `setContentPreferences`, `toggleContentPreference`, `clearContentPreferences`, `setHasSeenOnboarding` | ❌ NO |
| 2 | `useRuntimeSettingsStore` | `features/settings/infrastructure/runtimeSettingsStore.ts` | Zustand persist (`musaium.runtimeSettings`) | `setAll`, `setDefaultLocale`, `setDefaultMuseumMode`, `setGuideLevel` | ❌ NO |
| 3 | `useDataModePreferenceStore` | `features/settings/dataModeStore.ts` | Zustand persist (`musaium.dataMode.preference`) | `setPreference` | ❌ NO |
| 4 | Audio description | `features/settings/application/useAudioDescriptionMode.ts` | **NOT Zustand** — `useState` + `storage.getItem('settings.audio_description_mode')` direct | `toggle` (writes via async storage) | ❌ N/A (hook, not store) |

**`/auth/me` shape verified** (`museum-backend/.../auth-profile.route.ts:33-52`):
```ts
res.json({ user: { id, email, firstname, lastname, role, onboardingCompleted, contentPreferences, ttsVoice } })
```

→ Of the 4 stores, ONLY `contentPreferences` (#1) round-trips with the backend today. `runtimeSettings`/`dataMode`/`audioDescription` have NO backend column in `users` entity (verified entity.ts:17-153). **BLOCKER for full TD-2 closure — split into TD-2 (FE) + TD-2-BE.**

**`app/_layout.tsx` boot flow analysed** (lines 91-202) :
- `AuthProvider` wraps everything, `AuthenticationGuard` invokes `useProtectedRoute` + `useArtKeywordsSync`.
- `AuthContext.tsx` exposes 2 auth transitions where bootstrap MUST fire :
  1. `loginWithSession` (line 124, called from `useEmailPasswordAuth` + `useSocialLogin` + MFA flow).
  2. Session-resume IIFE (line 137-193) when refresh token found → sets `isAuthenticated(true)`.
- Refresh handler (line 215) MUST NOT bootstrap (R3 risk).

**Existing test pattern** (`__tests__/features/auth/useMe.test.ts`) : `jest.mock('@/features/auth/infrastructure/authApi', () => ({ authService: { me: ... } }))` — same pattern reused for bootstrapProfile integration tests.

### Open Q resolved by architect (architect's verdict)

- **Q-1** : `/auth/me` returns only 2/4 prefs. → **Option A** (frontend-only, schema-tolerant). Ship now, BE follow-up TD-2-BE.
- **Q-2** : Audio description is NOT a Zustand store. → **Option A'** (leave hook as-is, no preventive refactor).

### Memory cross-check applied

- `feedback_no_feature_flags_prelaunch` : ✅ no flag introduced.
- `feedback_bury_dead_code` : ✅ no replaced logic, only additive.
- `feedback_check_configs_before_assuming` : ✅ verified `/auth/me` shape + User entity columns before writing the spec.

---

## What worked

### DoD vs spec.md EARS (12 reqs)
- R1 boot post-login trigger — SAT (AuthContext wired loginWithSession + session-resume IIFE)
- R2 idempotence — SAT (`hasBootstrappedThisSession` + `inFlight` dedup in bootstrapProfile.ts:23-24,62)
- R3 server-wins-first per session — SAT (mergeFromServer overwrites only defined fields once per session)
- R4 graceful failure — SAT (try/catch + Sentry breadcrumb `auth.bootstrap_profile.failed` + console.warn, no throw)
- R5 schema tolerance — SAT (mergeFromServer skips undefined fields per store)
- R6 logout reset — SAT (`resetBootstrapProfileGuard()` exported)
- R7 first-deploy migration safety — SAT (server defaults match FE defaults : `'en-US'/true/'beginner'/'auto'/false`)
- R8 column additivity — SAT (5 NOT NULL DEFAULT columns, reversible `down()`)
- R9 `/auth/me` shape extension — SAT (getProfile.useCase.ts:53-57 returns 5 new fields flat)
- R10 batch PATCH endpoint — SAT (`/api/auth/me/preferences` PATCH with partial body + Zod refine empty-body→400)
- R11 OpenAPI parity — SAT (`pnpm openapi:validate` PASS 74 paths/83 ops)
- R12 FE type generation — SAT (openapi.ts regenerated, 5 fields + PATCH path present)

### Scope-boundary
- 52 files staged exactly — PASS
- Stryker WIP files (admin-analytics-queries.mutants.test.ts, searchMuseums.mutants.test.ts) NOT in cached diff — PASS
- Note unstaged but orthogonal : `docs/TECH_DEBT.md` (TD-5/TD-10 status notes), `museum-backend/reports/stryker-incremental.json` (incremental cache rotation) — not TD-2 scope, no impact on verify.

### Anti-hallucination
- BE auth tests : 703 passed / 713 total (10 skipped, 2 suites skipped, 57 of 59 suites). Matches editor claim verbatim.
- Migration drift (post `migration:run` clean) : drift-check generated `VerifyDriftCheck1778871930677.ts` containing ONLY pre-existing dev-DB drift documented in migration JSDoc lines 14-17 (totp_secrets UNIQUE constraint, artwork_embeddings halfvec→text dev-side, audit_logs index reorder, art_keywords UNIQUE, FK rename). **Zero TD-2 columns present** → TD-2 schema in sync with entity. Drift file removed.
- OpenAPI validate : `[openapi:validate] OK (74 paths, 83 operations) - Musaium API v1.1.1` — matches editor claim.
- FE settings + bootstrapProfile : 13 suites / 98 tests PASS (specific slice). Full FE run 224 suites / 2227 tests PASS. Editor's "50/50 + 156/156" sub-slice numbers not directly verifiable as labeled but supersetted by 98 PASS in scope + 2227 PASS overall.
- FE tsc : clean (no output, exit 0).

### Cross-stack drift
- BE openapi.json : `defaultLocale`, `defaultMuseumMode`, `guideLevel`, `dataMode`, `audioDescriptionMode` declared as scalar properties on AuthUser + `/api/auth/me/preferences` PATCH path — PASS.
- FE openapi.ts (generated) : all 5 typed fields + PATCH path present, including guideLevel/dataMode enum unions — PASS.

### Migration safety
- `down()` present (lines 55-61), drops 5 columns in reverse declaration order — PASS.
- Each column NOT NULL + literal DEFAULT (`'en-US'`, `true`, `'beginner'`, `'auto'`, `false`) — backfill atomic, no NOT NULL ALTER failure risk on populated tables — PASS.

### pre-complete-verify hook
- Output : `pre-complete-verify: PASS` (BE 703, FE 2227, Web 256/256, exit 0).

### Verdict final
**VERIFY-PASS**

All 12 EARS SAT, scope-boundary clean (52 files, no Stryker touch), test claims verified verbatim, cross-stack OpenAPI drift consistent, migration reversible + backfill-safe, hook PASS. No git stash invoked. No commit performed.

## What failed

_no data captured_

## Surprises

_no data captured_

## Action items

_no data captured_
