# 03 — DRY analysis
**Date:** 2026-05-12  **Agent:** AGENT-03 (DRY audit)

## Verdict

- **DRY-discipline score (overall, 0-100): 55**
- **Premature-DRY score (0-100, lower = healthier): 35**
- **Honest read:** Musaium has the *right instincts* — OpenAPI generated types are wired both into FE and Web (the most expensive duplication problem in monorepos is mostly solved here) and a `design-system/` package is the true source of design tokens. But the codebase carries multiple **load-bearing duplications with explicit "kept in sync" comments**: three identical `sentry-scrubber.ts` (~170 lines each, security-sensitive), three diverging `SUPPORTED_LOCALES` lists (BE: 7, FE: 8, Web: 2 — silent runtime mismatches), three `haversine` implementations, two `decodeJwtPayload`, hand-mirrored `TTS_VOICES`. The 2026-05-12 sprint (Agent C) scaffolded `packages/musaium-shared/` to consolidate exactly this — **but the package is consumed by ZERO files**. It is a phantom package: shipped, never plugged in. Worst single finding: **`UserRole` has TWO definitions inside `museum-web/src/lib/` alone**, one with 5 roles (`auth.tsx`) and one with 4 (`admin-types.ts`, missing `super_admin`), so the admin panel cannot filter or grant the super-admin role. Premature DRY is low — no over-extracted abstractions found yet, mostly because the team hasn't shared enough YET; the risk is in the *opposite* direction.

## Method

- `grep -rn` across `museum-backend/src`, `museum-frontend/{features,shared,app}`, `museum-web/src`, `packages/`, `design-system/`, excluding `node_modules`, `dist`, `coverage`, `.test-dist`, `.stryker-tmp`, lockfiles, migrations, `openapi.ts` generated outputs.
- Pattern targets: constants likely to drift (locales, voices, error codes, password rules, geo radius), function names (haversine, decodeJwt, formatDate, formatBytes, retry), interface/type duplicate definitions (`UserRole`, `AppError`, `PaginatedResponse`), security-relevant logic (sentry scrubbers, JWT decode).
- For each hit cluster: `Read` of all candidate files, byte-level inspection where alignment matters (e.g. sentry-scrubber, haversine, JWT).
- Cross-app consumption verified with `grep -rn "@musaium/shared"` (returned exactly **1 hit** — the package's own package.json).
- `wc -l` on suspected duplicates and `diff -q` on generated OpenAPI mirrors.

## P0 — Critical duplications (drift risk)

### P0-1. `packages/musaium-shared` is a phantom package — consumed by NOBODY

**Paths:**
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/packages/musaium-shared/package.json` (defines `@musaium/shared`, exports geo / validation / i18n / errors / auth)
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/packages/musaium-shared/src/{geo/haversine,errors/codes,i18n/locales,validation/password,auth/jwt-decode}.ts`

**Evidence:**
```
$ grep -rn "@musaium/shared" museum-backend/src museum-frontend/{features,shared} museum-web/src
(no output)
$ grep -rn "musaium/shared\|musaium-shared" -- including json
packages/musaium-shared/package.json:2:  "name": "@musaium/shared",
```

The package was created 2026-05-12 by Agent C (commit 58b12c6b, PROGRESS_C.md C.14) with the explicit note: *"Not yet wired into apps. Pnpm-workspace.yaml + package.json updates were deferred to limit cross-agent coordination risk."* The README documents a step-by-step plan — but nothing followed it. There is no `pnpm-workspace.yaml` at the repo root (root `package.json` is bare-bones with only husky), and no consumer has a `"@musaium/shared": "workspace:*"` dependency.

**Severity:** P0 (it actively *creates* drift instead of removing it — duplicates now exist 4 times: BE, FE, Web, AND in the unused shared package, which is itself a fourth source of truth waiting to drift).

**Cost of NOT fixing:** Every fix in one of the canonical files (e.g. tightening `PASSWORD_MIN` post-NIST review, adding a locale) silently divergence. The package is also misleading documentation — readers think the cross-app concern has been solved when it has been deferred.

**Consolidation plan:**
1. Add `pnpm-workspace.yaml` at repo root with `packages: ['museum-backend', 'museum-frontend', 'museum-web', 'design-system', 'packages/*']`.
2. Add `"@musaium/shared": "workspace:*"` to dependencies of each consumer.
3. Migrate call sites file-by-file per finding below.
4. Delete the duplicate local files once consumers compile.

OR: if the team decides not to commit to it before V1, **delete `packages/musaium-shared/` entirely** — the existence of a half-done abstraction is worse than no abstraction. Pre-launch V1 doctrine ("live or revert") applies here.

---

### P0-2. `SUPPORTED_LOCALES` — three diverging lists (BE: 7, FE: 8, Web: 2)

**Paths + values:**

| File | Locales |
|---|---|
| `museum-backend/src/shared/i18n/locale.ts:1` | `['en', 'fr', 'es', 'de', 'it', 'ja', 'zh']` (7) |
| `museum-frontend/shared/config/supportedLocales.ts:1` | `['en', 'fr', 'es', 'de', 'it', 'ja', 'zh', 'ar']` (8 — **has Arabic**) |
| `museum-web/src/lib/i18n.ts:1` | `['fr', 'en']` (2 — landing/admin only) |
| `museum-backend/src/modules/auth/adapters/primary/http/schemas/auth.schemas.ts:11,65,80` | `z.enum(['fr', 'en'])` (auth-only restricts to 2!) |
| `packages/musaium-shared/src/i18n/locales.ts:2` | `['fr', 'en']` (2 — unused) |

**Cost of NOT fixing:** An Arabic-locale mobile user attempting to register or update profile language hits a 400 from `auth.schemas.ts` Zod validation (`'ar'` rejected) but their app UI lists Arabic as a supported locale. Hard contract bug, latent. Worse: the FE has `ar` translation files (`museum-frontend/shared/locales/ar/translation.json`) shipped — they get bundled, displayed, then break at the auth call.

**Severity:** P0 (active bug surface, not just future risk).

**Consolidation:** `museum-frontend/shared/locales/ar/translation.json` must be deleted OR `ar` added to BE locale enum (decide product intent first). Then `SUPPORTED_LOCALES` lives in `@musaium/shared` and is imported by both BE (incl. auth.schemas via `z.enum(SUPPORTED_LOCALES as unknown as [string, ...string[]])`) and FE. Web has a legitimate subset (`['fr', 'en']` for landing) — keep as `WEB_LOCALES` constant referencing the shared list explicitly: `export const WEB_LOCALES = SUPPORTED_LOCALES.filter(l => l === 'fr' || l === 'en')`.

---

### P0-3. `UserRole` — two definitions inside the same package (museum-web), divergent

**Paths:**
- `museum-web/src/lib/auth.tsx:64` — `'visitor' | 'moderator' | 'museum_manager' | 'admin' | 'super_admin'` (5 values, *correct*)
- `museum-web/src/lib/admin-types.ts:80` — `'visitor' | 'moderator' | 'museum_manager' | 'admin'` (4 values — **drops `super_admin`**)

Backend SoT: `museum-backend/src/modules/auth/domain/user/user-role.ts:20-26` (5 values, includes `SUPER_ADMIN`).

**Evidence:**
```typescript
// museum-web/src/lib/admin-types.ts:79-80
// Intentionally hand-rolled — UserRole is embedded in AuthUser.role, not a named schema component
export type UserRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin';

// museum-web/src/app/[locale]/admin/users/page.tsx:26
const ALL_ROLES: UserRole[] = ['visitor', 'moderator', 'museum_manager', 'admin'];  // ← missing super_admin
```

**Cost of NOT fixing:** Admin users page (`/admin/users`) cannot:
- Display "super_admin" as a role filter option (silently absent from `ALL_ROLES`).
- Grant or revoke super_admin role from the UI.
- Show super_admin users with their correct color badge (`ROLE_COLORS[u.role as UserRole]` returns `undefined`, badge has no class).

`as UserRole` casts at lines 141, 212, 241, 293, 318 of `users/page.tsx` silently accept any string at compile time. **Tim is the only super_admin today, so this is invisible — until he hires a co-founder or contracts a Musaium-side operator.**

**Severity:** P0 (security control surface — RBAC display lying to administrators).

**Consolidation:** Generate from OpenAPI. The OpenAPI spec exposes `AdminUserDTO.role` as a string union — emit it as a named schema component (`UserRole`) in `openapi.json` and consume `Schemas['UserRole']` everywhere. Until then: delete `admin-types.ts:80` and import the 5-value union from `auth.tsx`.

---

### P0-4. `sentry-scrubber.ts` — three identical files with "kept in sync" comments

**Paths + sizes:**
- `museum-backend/src/shared/observability/sentry-scrubber.ts` — **176 lines**
- `museum-frontend/shared/observability/sentry-scrubber.ts` — **176 lines**
- `museum-web/src/lib/sentry-scrubber.ts` — **169 lines**

All three carry the explicit comment:
```typescript
// SOURCE-OF-TRUTH: kept manually in sync with the 2 other scrubbers (BE/FE/Web).
// Cf docs/audit-cleanup-2026-05-12/ + ADR-045 (future extraction).
```

This is **load-bearing security code** (PII redaction before sending to Sentry). The three regexes — `SENSITIVE_HEADER_REGEX`, `SENSITIVE_FIELD_REGEX`, `SENSITIVE_QUERY_KEYS` — must stay identical or an attacker who probes one surface (e.g. a leaky breadcrumb on web) can recover credentials that the other surfaces redact.

Only intentional divergence is the email-hashing primitive: BE uses `node:crypto.createHash('sha256')`, FE/Web use a 32-bit fold (no Node crypto). That's the *only* part that has a legitimate platform reason. The rest is bit-for-bit copyable.

**Severity:** P0 (security drift = silent PII leak).

**Cost of NOT fixing:** Adding a new sensitive header (e.g. `x-musaium-session`) to one of the three scrubbers but forgetting one of the others ships credentials to Sentry from one surface. The "kept in sync" comment is wishful thinking — there is no CI check enforcing parity.

**Consolidation:**
- Extract the regex constants + `scrubEvent`/`shouldDropBreadcrumb`/`scrubUrl`/`scrubRecord`/`scrubHeaders` into `packages/musaium-shared/src/observability/sentry-scrubber.ts`. These are pure functions of `ScrubbableEvent` — no runtime dependency.
- Keep `hashEmail` host-injected (Node vs Web Crypto subtle vs the 32-bit fold). Pass it as an argument: `scrubEvent(event, { hashEmail })`.
- Add a CI sentinel (`scripts/sentinels/sentry-scrubber-parity.mjs`) that diffs the three regex constants and fails if they diverge — same pattern as the existing `cache-key-parity.mjs`. Until extraction lands, this is the cheap stopgap.

---

### P0-5. `haversine` — three implementations (one of them inlined)

**Paths:**
- `museum-backend/src/shared/utils/haversine.ts` (canonical BE) — `haversineDistanceMeters`, `EARTH_RADIUS_M = 6_371_000`
- `museum-frontend/features/museum/application/haversine.ts` (canonical FE) — `haversineDistanceMeters`, `EARTH_RADIUS_METERS = 6_371_000`
- `museum-backend/src/modules/museum/adapters/secondary/external/wikidata-museum.client.ts:94-104` — **inlined** as `distanceMetres()` with `const R = 6_371_000` and different formula (`asin(sqrt(h))` vs `atan2(sqrt(a), sqrt(1-a))` — algebraically equivalent but visually different)
- `packages/musaium-shared/src/geo/haversine.ts` (unused) — canonical, identical math

`museum-frontend/features/museum/application/haversine.ts` carries an explicit comment:
```typescript
// Returns meters to stay consistent with the backend (`haversineDistanceMeters` in
// museum-backend/src/shared/utils/haversine.ts).
```

The inlined `wikidata-museum.client.ts:96` `R = 6_371_000` is the worst case — copy-pasted radius constant inside a 300-line adapter.

**Cost of NOT fixing:** Low impact on correctness (formula is mathematically stable). Maintenance cost is moderate — 3 distinct files to update if we ever support non-spherical earth model.

**Severity:** P0 only because the unused `@musaium/shared` already has the canonical version — wiring is one import away.

**Consolidation:** Import from `@musaium/shared/geo` in both `museum-backend/src/shared/utils/haversine.ts` (re-export for backward compat) and `museum-frontend/features/museum/application/haversine.ts`. Inline the `wikidata-museum.client.ts:94-104` call directly.

---

## P1 — Notable duplications

### P1-1. `decodeJwtPayload` — three copies, two test surfaces

**Paths:**
- `museum-backend/src/shared/auth/jwt-decode.ts:14` — `Buffer.from(parts[1], 'base64url').toString('utf8')`
- `museum-frontend/shared/auth/jwt-decode.ts:10` — `JSON.parse(atob(segment))`
- `packages/musaium-shared/src/auth/jwt-decode.ts:13` — **isomorphic**, `decodeJwtPayloadWith(token, schema, decode)` taking host decoder

Created intentionally by Agent C (PROGRESS_C C.12) on the same sprint that created the isomorphic version in `@musaium/shared`. The split is documented but the unification step never ran.

**Severity:** P1 (low drift risk in practice — both are simple, both have tests — but doubles the security-review surface).

**Consolidation:** Wire `@musaium/shared`. BE wraps `decodeJwtPayloadWith(token, schema, s => Buffer.from(s, 'base64url').toString('utf8'))`. FE wraps `decodeJwtPayloadWith(token, schema, s => atob(s))`. The current isomorphic helper exists exactly for this.

---

### P1-2. `TTS_VOICES` — explicit "mirror" duplication

**Paths:**
- `museum-backend/src/modules/chat/domain/voice/voice-catalog.ts:6` — `['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']`
- `museum-frontend/features/settings/voice-catalog.ts:7` — identical array

BE file comment:
```
* Adding/removing a voice requires updating the FE mirror at
* museum-frontend/features/settings/voice-catalog.ts and the OpenAPI enum.
```

The OpenAPI enum *is* generated and consumed by FE (`openapi.ts:1119` and `:3502`) — so why does FE also keep a hand-rolled mirror? Because the generated openapi schema places the union *inline* under `paths['/api/auth/tts-voice']['patch']['responses']`, not as a named `components.schemas.TtsVoice`. Same root cause as the `UserRole` case (P0-3): inline literal unions in OpenAPI cannot be cleanly imported.

**Severity:** P1 (drift is bounded by the OpenAPI sync check; FE generation forces a refresh).

**Cost of NOT fixing:** Adding a 7th voice (`coral`, `verse`, etc.) requires touching BE constant + BE OpenAPI doc + FE constant. Three places, easy to miss one.

**Consolidation:** Promote `TtsVoice` to a named OpenAPI `components.schemas.TtsVoice` (one-line spec change) and have FE re-export from generated:
```typescript
import type { components } from '@/shared/api/generated/openapi';
export type TtsVoice = components['schemas']['TtsVoice'];
export const TTS_VOICES = ['alloy','echo','fable','onyx','nova','shimmer'] as const satisfies readonly TtsVoice[];
```

---

### P1-3. Password validation rules — three places, all hardcoded `8` / `128`

**Paths:**
- `museum-backend/src/shared/validation/password.ts:35,39` — `if (password.length < 8)`, `if (password.length > 128)`
- `museum-backend/src/modules/auth/adapters/primary/http/schemas/auth.schemas.ts:8,60,70` — `z.string().min(8).max(128)` (three Zod schemas)
- `museum-web/src/components/auth/ResetPasswordForm.tsx:65` — `if (newPassword.length < 8)`
- `museum-web/src/dictionaries/{fr,en}.json:205` — `"passwordTooShort": "Password must be at least 8 characters"` (string content hardcodes "8")

`@musaium/shared/validation/password.ts` already exports `PASSWORD_MIN=8` + `PASSWORD_MAX=128` + a Zod `passwordSchema`.

**Severity:** P1 (NIST 800-63B-4 may bump minimum to 14 in next revision — that change should flip in 1 place).

**Cost of NOT fixing:** Bumping min length from 8 to 14 requires editing 5+ files plus 8+ translation dictionaries (`passwordTooShort` exists in 7 FE i18n files: en/fr/es/de/it/ja/zh + 1 ar). The dictionaries are unavoidable, but the *number "8" embedded in the message string* should be interpolated from the constant.

**Consolidation:** Web's `ResetPasswordForm.tsx` and BE's Zod schemas import `passwordSchema` from `@musaium/shared/validation`. i18n keys take an interpolation parameter: `"passwordTooShort": "Password must be at least {{min}} characters"`. Same change BE-side for the validator's `reason` strings.

---

### P1-4. `musaium://` OAuth deeplink — hardcoded in BE and FE

**Paths:**
- `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-google-oauth.route.ts:55-56`:
  ```typescript
  const MOBILE_DEEPLINK_SUCCESS = 'musaium://auth/google/callback';
  const MOBILE_DEEPLINK_ERROR = 'musaium://auth/google/error';
  ```
- `museum-frontend/features/auth/infrastructure/socialAuthProviders.ts:40-41`:
  ```typescript
  const MOBILE_DEEPLINK_SUCCESS = 'musaium://auth/google/callback';
  const MOBILE_DEEPLINK_PREFIX = 'musaium://';
  ```

**Cost of NOT fixing:** BE 302's the in-app browser to a URL the FE must parse. If BE changes the path to `musaium://oauth/google/done` and FE doesn't, the in-app browser opens correctly but FE's `parseDeeplink` returns `null` → user sees endless spinner. No type-system warning.

**Severity:** P1 (auth flow break, recoverable by manual logout but bad UX, security-adjacent).

**Consolidation:** Define a shared constant `OAUTH_DEEPLINKS = { GOOGLE_SUCCESS: 'musaium://auth/google/callback', GOOGLE_ERROR: 'musaium://auth/google/error' }` in `@musaium/shared/auth`. BE constructs URLs from it, FE parses against it. Bonus: gives Apple Sign-In a place to land in the same shape.

---

### P1-5. Error code literals — hand-mirrored between BE and FE

**Paths (one finding example — `DAILY_LIMIT_REACHED`):**
- `museum-backend/src/helpers/middleware/daily-chat-limit.middleware.ts:65,123` — emits `code: 'DAILY_LIMIT_REACHED'`
- `museum-frontend/features/chat/infrastructure/chatApi/stream.ts:129-130` — `if (body.error?.code === 'DAILY_LIMIT_REACHED')`
- `museum-frontend/shared/lib/errors.ts:44` — `error.message.includes('DAILY_LIMIT_REACHED')`
- `museum-frontend/shared/infrastructure/httpErrorMapper.ts:185` — `if (apiErrorCode === 'DAILY_LIMIT_REACHED')`
- `museum-frontend/shared/infrastructure/httpClient.ts:257` — `getApiErrorCode(...) === 'DAILY_LIMIT_REACHED'`
- `packages/musaium-shared/src/errors/codes.ts:9` — defines `ERROR_CODES.DAILY_LIMIT_REACHED` (unused)

Same pattern repeats for `CIRCUIT_BREAKER_OPEN`, `SEMAPHORE_QUEUE_FULL`, `COMPARE_INVALID_IMAGE`, `RATE_LIMITED`, `UNAUTHORIZED`, `FORBIDDEN`.

**Severity:** P1 (string-literal contract, no compile-time enforcement).

**Cost of NOT fixing:** Renaming `DAILY_LIMIT_REACHED` to `DAILY_QUOTA_EXCEEDED` requires grep across 5+ files in FE and BE. Forgetting one means a silent UX regression (generic "Something went wrong" instead of localized "Come back tomorrow!").

**Consolidation:** Wire `@musaium/shared/errors` → `ErrorCode` union. BE imports and uses everywhere it currently writes string literals (`code: ERROR_CODES.DAILY_LIMIT_REACHED`). FE imports for comparisons. Removes string-typo class of bugs entirely.

---

## P2 — Minor duplications (often fine)

### P2-1. `formatDate` — two flavors, FE vs Web

- `museum-frontend/features/support/ui/ticketHelpers.ts:33` — `formatDate(iso: string) => d.toLocaleDateString(undefined, { month, day, year })`
- `museum-web/src/lib/i18n-format.ts:17` — `formatDate(d, locale, opts)` — explicit locale arg

Different signatures, different concerns (web admin needs explicit locale for SSR, mobile uses runtime default). **Acceptable** — extracting would force one of the call sites to pass an awkward argument. Rule of three not met yet.

### P2-2. `AppError` — different shapes, BE vs FE

- BE: `class AppError extends Error { statusCode, code, details, headers }` — wire-format owner
- FE: `interface AppError { kind, code?, message, status?, details?, requestId? }` — UX discriminated union

Different roles (server emits, client consumes), different stack constraints (FE doesn't carry status on every error — many never originate from HTTP). The `code` field is the bridge. **Acceptable.**

### P2-3. `retry` / backoff helpers

- BE: `museum-backend/src/shared/db/optimistic-lock-retry.ts` — DB-specific, version-aware
- FE: `museum-frontend/shared/lib/retry.ts` — generic FE retry
- Module-local retries: `museum-backend/src/modules/chat/adapters/secondary/embeddings/replicate.adapter.ts`, `langchain.orchestrator.ts`, FE `useMuseumEnrichment.ts`

The two `shared/` retries serve different domains; the inline ones are 5-10 lines and have provider-specific backoff logic. Mild duplication; extracting would over-generalize. **Acceptable for now.**

### P2-4. `Accept-Language` parsing — BE has two

- `museum-backend/src/shared/i18n/locale.ts:52` — `parseAcceptLanguageHeader` → returns raw tag (7-locale system)
- `museum-backend/src/shared/email/email-locale.ts:42` — `localeFromAcceptLanguage` → returns `EmailLocale` (`'fr'|'en'`)

Justified: emails only ship in fr/en. The second function is intentionally restrictive. **Acceptable.**

---

## Premature / wrong DRY (over-abstraction)

**None found that should be split today.** The codebase is healthier on the *under-DRY* side. Two near-misses worth flagging:

### NEAR-MISS-1. `Semaphore` wrapping `p-limit`

`museum-backend/src/shared/queue/semaphore.ts` is now (post C.8) a 108-line wrapper around `p-limit@^3` that preserves counters and adds queue-cap + timeout. The PROGRESS_C note says it's kept because `p-limit` doesn't expose synchronous counters. **This is defensible** — the test surface depends on `pendingCount` being readable immediately. But once tests rebase to async assertions, the wrapper should melt into 5 lines of glue.

### NEAR-MISS-2. `@musaium/shared` itself

By the rule of three, only `haversine` (3 BE/FE/inlined-BE callers) and `decodeJwtPayload` (2 BE/FE callers) meet the threshold for a shared package. `passwordSchema` has 2 BE locations + 1 Web — meets. `SUPPORTED_LOCALES` has 3 — meets. `ERROR_CODES` has many uses but each is a single string literal — extraction value is contract enforcement, not code reuse. Net: the *contents* of the package are well-scoped, **not over-eager**. But because nothing consumes it, the package is currently doing zero work while paying full coordination cost (lint, type-check, future renames).

If `@musaium/shared` stays un-wired for 4 weeks more → it should be **deleted**, per the user's stated "no dead code" doctrine (`feedback_bury_dead_code.md`).

---

## Cross-app duplication (BE↔FE↔Web)

| Concern | BE source of truth | FE copy | Web copy | Severity |
|---|---|---|---|---|
| OpenAPI types | `museum-backend/openapi/openapi.json` | `museum-frontend/shared/api/generated/openapi.ts` (4316 L) regen via `generate:openapi-types` | `museum-web/src/lib/api/generated/openapi.ts` (4094 L) regen via `generate:openapi-types` | OK (auto-gen, CI gate `check:openapi-types` exists in both) |
| `SUPPORTED_LOCALES` | `shared/i18n/locale.ts` (7) | `shared/config/supportedLocales.ts` (8 — drift) | `src/lib/i18n.ts` (2 — legitimate subset) | **P0** |
| `TTS_VOICES` | `chat/domain/voice/voice-catalog.ts` (6) | `features/settings/voice-catalog.ts` (6 — explicit mirror) | n/a | P1 |
| `sentry-scrubber` regexes | `shared/observability/sentry-scrubber.ts` (176 L) | `shared/observability/sentry-scrubber.ts` (176 L) | `lib/sentry-scrubber.ts` (169 L) | **P0** |
| `UserRole` | `auth/domain/user/user-role.ts` (5) | (uses openapi type indirectly) | **2 conflicting defs in `lib/{auth.tsx,admin-types.ts}`** | **P0** |
| `haversine` | `shared/utils/haversine.ts` | `features/museum/application/haversine.ts` | n/a | P0 (cheap fix via shared pkg) |
| `decodeJwtPayload` | `shared/auth/jwt-decode.ts` | `shared/auth/jwt-decode.ts` | n/a (web uses HttpOnly cookies, doesn't decode) | P1 |
| `passwordSchema` (min=8/max=128) | `auth.schemas.ts:8,60,70` + `shared/validation/password.ts` | n/a (mobile gates client-side via TextInput maxLength only) | `components/auth/ResetPasswordForm.tsx:65` | P1 |
| OAuth deeplink (`musaium://auth/google/callback`) | `routes/auth-google-oauth.route.ts:55` | `features/auth/infrastructure/socialAuthProviders.ts:40` | n/a | P1 |
| Error code strings (`DAILY_LIMIT_REACHED` etc.) | `helpers/middleware/daily-chat-limit.middleware.ts` + `errors/app.error.ts` | 4+ files in `shared/` and `features/chat/` | n/a (`apiPost` only swallows messages) | P1 |
| Design tokens | `design-system/tokens/` (canonical) | `shared/ui/tokens.generated.ts` (generated) | `tokens.generated.css` (generated) | OK (build pipeline owns it) |

**Verdict on cross-app shape:** the *expensive* cross-app problem (DTOs) is solved by OpenAPI generation. The *cheap* cross-app constants (locales, voices, error codes, OAuth URLs, password rules) are the ones that drift — and `@musaium/shared` was created specifically to fix them, but hasn't been wired.

---

## Test fixture duplication

**Observation: BE and FE factories are intentionally separate and shouldn't merge.**

| File | Purpose | Type universe |
|---|---|---|
| `museum-backend/tests/helpers/auth/user.fixtures.ts` — `makeUser()` | Builds a TypeORM `User` entity | `@modules/auth/domain/user/user.entity` (DB-shaped, has `password` hash, `email_verified` boolean column) |
| `museum-frontend/__tests__/helpers/factories/auth.factories.ts` — `makeAuthUser()` | Builds an `AuthUser` DTO from OpenAPI | `components['schemas']['AuthUser']` (wire-shaped, no password, has `onboardingCompleted` camelCase) |

Conceptually the same domain object, but one carries DB columns and one carries API fields. Merging would create false coupling between persistence and wire layer.

**Per-app fixture cleanliness:** BE has ~25 `.fixtures.ts` files under `tests/helpers/`, well-organized by module. FE has 9 `.factories.ts` under `__tests__/helpers/factories/`. Web has only 1 fixture (`admin-dict.fixture.ts`) — but also has fewer tests. The ESLint plugin `eslint-plugin-musaium-test-discipline` enforces no inline entity creation; that's working.

**One mild finding:** `museum-frontend/__tests__/helpers/factories/{chat,session}.factories.ts` both exist — `Read` confirms they cover different objects (`ChatMessageDTO` vs `ChatSessionDTO`), no overlap. **OK.**

**No test fixture P-grade findings.** The factory discipline is the healthiest DRY axis in this codebase.

---

## Recommendations (with concrete consolidation plan)

Ranked by ROI:

### Tier 1 — do this sprint (cost: ~half-day, fixes the bug surface)

1. **Fix `UserRole` drift in `museum-web/src/lib/admin-types.ts`** (P0-3): delete line 80, import the canonical 5-value union from `auth.tsx`. Update `ALL_ROLES` in `admin/users/page.tsx`. Add a `super_admin` translation in dictionaries. Zero new infrastructure, eliminates a live RBAC visibility bug.

2. **Decide & fix the `SUPPORTED_LOCALES` mismatch** (P0-2): either remove `ar` from FE + delete `museum-frontend/shared/locales/ar/translation.json`, or add `ar` to BE `SUPPORTED_LOCALES` AND broaden the `auth.schemas.ts` Zod enums from `['fr','en']` to `SUPPORTED_LOCALES`. Pick one; the current state is incoherent.

3. **Add a `sentry-scrubber-parity.mjs` sentinel** (P0-4 stopgap): script that hashes the three regex/Set constants in the three scrubber files and fails if they diverge. Cheap, covers the security drift until proper extraction lands. Pattern exists already (`cache-key-parity.mjs`).

### Tier 2 — do this month if `@musaium/shared` survives

4. **Wire `@musaium/shared`** OR **delete it** (P0-1): if wiring, add `pnpm-workspace.yaml`, add the dep to all three apps, migrate haversine + jwt-decode + password schema + locales + error codes one PR at a time, then delete local duplicates. If not wiring, delete `packages/musaium-shared/` entirely and add a `TECH_DEBT.md` entry. Half-done state is the worst.

5. **Extract sentry-scrubber to `@musaium/shared/observability`** (P0-4 proper fix): once wiring is done. Pass `hashEmail` as an injected dependency.

6. **Promote inline OpenAPI unions to named schemas** (P0-3, P1-2): `UserRole`, `TtsVoice`, `Locale`, `TicketStatus`, `ReviewStatus`. Adds named types to `components.schemas`, FE/Web import them, BE backend Zod schemas reuse them. Removes the entire class of "hand-rolled because OpenAPI doesn't surface it" comments.

### Tier 3 — opportunistic (cost: low, but no urgency)

7. **Replace inline haversine in `wikidata-museum.client.ts:94-104`** with import from canonical (P0-5 tail).

8. **Centralize OAuth deeplink constants** (P1-4): one line if `@musaium/shared` lands; not worth a separate package otherwise.

9. **Drop double-`formatDate`** when admin UI moves to mobile-style or vice-versa (P2-1) — not urgent, no drift risk today.

---

## Summary

DRY discipline is **mostly correct in spirit but failing in execution** because of the deferred `@musaium/shared` wiring. The most expensive cross-app concern (DTOs) is well-handled via OpenAPI generation; the cheap-but-load-bearing concerns (locales, error codes, sentry scrubbers, OAuth URLs) are not. One file in `museum-web/src/lib/` is silently shipping an incomplete `UserRole` union to the admin panel. The shared package created on 2026-05-12 is consumed by nobody — it is currently dead weight, not solving anything.

