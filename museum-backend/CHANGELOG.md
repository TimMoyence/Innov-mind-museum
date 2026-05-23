# Changelog — museum-backend

All notable changes to the Musaium backend (+ cross-app legal/mobile changes shipped in the same run) are documented in this file.

Format loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The Musaium repo is a monorepo (`museum-backend/` + `museum-frontend/` + `museum-web/`) ; this changelog captures cross-app GDPR / compliance / launch-blocking changes when they are coordinated by a single run.

## [Unreleased] — 2026-05-23 — PR-4 `validate-query.middleware.ts` aligns on `formatZodIssues`

Run `2026-05-23-pr-4-formatZodIssues` — fourth KISS/DRY refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B2.md` D1 (HIGH). Pipeline : UFR-022 fresh-context 5-phase / standard / reviewer APPROVED weightedMean **4.8/5**. Pure TypeScript refacto interne, wire-format 400 `error.message` aligné sur la canonique single-source-of-truth déjà utilisée par `validateBody` + chat contract wrappers. Public OpenAPI 400 contract préservé (`error.message: string` générique, non-contractually-fixed). Zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`.

### Changed

- **PR-4** — `validate-query.middleware.ts` utilise désormais le formatteur canonique `formatZodIssues` (`museum-backend/src/shared/validation/zod-issue.formatter.ts:13-26`, signature `(issues: readonly z.core.$ZodIssue[]) => string`) au lieu de réinventer le pattern inline `issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')`. Single call-site : `museum-backend/src/shared/middleware/validate-query.middleware.ts:17` — `throw badRequest(formatZodIssues(result.error.issues));`. Import canonique ajouté L2 : `import { formatZodIssues } from '@shared/validation/zod-issue.formatter';`. JSDoc aligné sur `validate-body.middleware.ts:10` (`@throws AppError 400 BAD_REQUEST on validation failure.`). Pragma `eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters` L12 préservé verbatim (NFR-5).

  **Wire-format 400 `error.message` change documenté NFR-3** — observable mais non-breaking sur OpenAPI contract (`error.message: string` reste un free-form string). Différences canonique (post-PR-4) vs legacy inline (pre-PR-4) :

  - **Séparateur path/message** : `<path> <message>` (espace) au lieu de `<path>: <message>` (colon-space).
  - **Dedup double-prefix** : message dont le texte commence déjà par `<path> ` ou `<path>.` n'est plus double-préfixé (ex `'q must be set'` reste `'q must be set'`, plus `'q: q must be set'`).
  - **Empty issues défensif** : fallback `'Invalid payload'` au lieu de string vide `''`.
  - **Root error (empty path)** : `<message>` brut au lieu de `: <message>` (préfixe colon vide).

  Source-of-truth réaffirmée : `zod-issue.formatter.ts` JSDoc L6 ("Single source of truth for Zod issue → flat error string. Wire-format change MUST happen here") matche désormais le code. Validate-body + validate-query sont byte-identiques sur leur branche d'erreur post-PR-4 ; seuls leur source (`req.body` vs `req.query`) et leur sink (`req.body = result.data` vs `res.locals.validatedQuery = result.data`) diffèrent (Express 5 `req.query` read-only).

  Consumer impact NFR-2 empiriquement vérifié : `rg -n "split\(': '\)" museum-frontend museum-web` → **empty** (0 call-site FE/web ne parse `error.message` via `split(': ')` sur routes query-validated). Tests pré-existants asserting le legacy colon-form : `rg -n "expect.*toContain.*': '" museum-backend/tests/` + `rg -n "toContain\(': " museum-backend/tests/contract museum-backend/tests/e2e` → **empty** (aucun snapshot legacy à updater). Logs Sentry / observability breadcrumbs basculent `field: msg` → `field msg` post-merge — non-breaking (payload reste string). `validate-body.middleware.ts` byte-identical pré/post (R4 strict, `git diff` empty). `zod-issue.formatter.ts` byte-identical (canonique inchangée).

### Added

- 5 nouveaux cas de test (`C1`-`C5`) appendés à `museum-backend/tests/unit/middleware/validate-query.test.ts` dans un nouveau `describe('validateQuery — wire-format parity with validateBody', …)` (+109 lignes, append-only) — sentinel codemod permanent empêchant la régression du colon-form `<field>: <message>` à l'avenir :
  - **C1** (R2/R3) : single-field, `z.object({ q: z.string().min(1) })` rejette `{ q: '' }` via `validateQuery` ET `validateBody` → `expect(queryMessage).toBe(bodyMessage)` + `not.toContain(': ')` + `toMatch(/^q /)`.
  - **C2** (AC2.3) : root error empty path, `z.object({ q: z.string() })` reçoit `'not-an-object'` → branche `formatZodIssue` empty-path → `'Invalid input: expected object, received string'` (PAS `': Invalid input: …'`).
  - **C3** (AC2.4) : dedup, `.refine((v) => v.length > 0, { message: 'q must be set' })` → canonique dedup branch → `'q must be set'` (PAS `'q: q must be set'` double-prefix).
  - **C4** (AC2 défensif) : empty issues — `fakeSchema` mock retourne `{success:false, error:{issues:[]}}` → branche défensive `formatZodIssues` → `'Invalid payload'` (PAS `''`).
  - **C5** (R3 negative sentinel) : `expect(msg).not.toMatch(/^\w+: /)` — regex `/^\w+: /` (préfixe colon-form en début de string seulement). Deviation honnêtement disclosée red-report.json notes[0] : architect proposait `/.*:.*$/` over-matchant (messages zod légitimes contiennent `:`, ex `'Too small: expected string to have >=1 characters'`), editor a appliqué la version stricte qui catche le legacy colon-form en début sans faux positif. Intent architect anti-colon-form préservé.

  Tests RED verbatim (5/5 FAIL pre-fix) : evidence Jest output dans `red-report.json` cases[].evidence (ex C1 : `Expected: "q Too small: …" Received: "q: Too small: …"`). Tests GREEN (5/5 PASS post-fix) : `pnpm jest --testPathPattern=validate-query.test.ts` → 14/14 PASS (9 legacy + 5 nouveaux). Scope élargi `tests/unit/(middleware|shared)` : 77 suites / 1155 tests all PASS, 0 régression. `pnpm lint` exit 0.

  Frozen-test contract : `red-test-manifest.json` sha256 (`aef671177a3e39fea690fdf3a87b05e6500e37a28064327a3535b4a293f60838`) **UNCHANGED** entre phases red et green — éditeur green n'a pas self-modifié le test manifesté (vérifié `shasum -a 256` ≡ manifest). Anti-bypass UFR-022 honoré.

## [Unreleased] — 2026-05-23 — PR-3 codemod `notFound()` sur 4 sites auth/useCase

Run `2026-05-23-pr-3-notFound-codemod` — third KISS/DRY refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH (volet `notFound`). Pipeline : UFR-022 fresh-context 5-phase / reviewer APPROVED weightedMean **4.5/5**. Pure TypeScript refacto, wire-format 404 **byte-for-byte identique** (statusCode + `code:'NOT_FOUND'` + `message:'User not found'` + `details:undefined` + instance class `AppError` tous préservés). Zéro changement de comportement runtime observable côté consommateurs, zéro migration DB, zéro lib bump.

### Changed

- **PR-3** — 4 use cases du module `auth/` utilisent désormais le helper canonique `notFound(message, details?)` (`museum-backend/src/shared/errors/app.error.ts:45-52`, signature `(message: string, details?: unknown) => AppError`, force `statusCode=404` + `code='NOT_FOUND'`) au lieu de réinventer le pattern inline `throw new AppError({ message: 'User not found', statusCode: 404, code: 'NOT_FOUND' });`. Sites codemodés :
  - `museum-backend/src/modules/auth/useCase/email/changeEmail.useCase.ts:30` — `ChangeEmailUseCase.execute` (user-not-found pré-bcrypt reauth).
  - `museum-backend/src/modules/auth/useCase/password/changePassword.useCase.ts:24` — `ChangePasswordUseCase.execute` (idem).
  - `museum-backend/src/modules/auth/useCase/totp/disableMfa.useCase.ts:22` — `DisableMfaUseCase.execute` (idem, pré-vérif `INVALID_CREDENTIALS`).
  - `museum-backend/src/modules/auth/useCase/totp/enrollMfa.useCase.ts:34` — `EnrollMfaUseCase.execute` (idem, pré-vérif `MFA_ALREADY_ENROLLED`).

  Imports `AppError` retirés de 2 fichiers (`changeEmail.useCase.ts`, `changePassword.useCase.ts` — plus aucun usage résiduel), conservés sur 2 fichiers (`disableMfa.useCase.ts` L32 `INVALID_CREDENTIALS` 401 ; `enrollMfa.useCase.ts` L39 `MFA_ALREADY_ENROLLED` 409). Helpers nommés `badRequest`/`notFound` ajoutés en ordre alphabétique dans la named-import body. Diff `+8 / -8` lignes sur 4 fichiers source, exactement au budget NFR-5 annoncé.

  Wire-format 404 mathématiquement et empiriquement préservé : helper single-arg `notFound('User not found')` construit `new AppError({ message:'User not found', details:undefined, statusCode:404, code:'NOT_FOUND' })` — byte-for-byte équivalent à l'inline (où `details` était également `undefined`). Tests existants `change-password.test.ts`, `changeEmail.useCase.test.ts`, `mfa-flow.e2e.test.ts` PASS unmodifiés (NFR-1 vérifié empiriquement). Auth unit suite `tests/unit/auth` : **72 suites, 735 tests, all PASS** post-codemod. `pnpm lint` exit 0.

### Added

- Nouveau test sentinel `museum-backend/tests/unit/auth/pr3-notFound-helper-adoption.test.ts` (86 lignes, 8 assertions structurelles) — empêche la régression du pattern inline 404 "User not found" à l'avenir. Couvre par fichier : (a) absence du pattern `new AppError({ ..., code:'NOT_FOUND', ... })` inline (regex `INLINE_NOT_FOUND_PATTERN`, tolère single/double quotes + clés réordonnées), (b) présence de l'import `notFound` from `@shared/errors/app.error` (parsing named-import body pour éviter faux-positifs commentaires). Test FAIL au HEAD pre-codemod (pattern présent), PASS post-codemod (0 inline restant). Frozen-test contract : `red-test-manifest.json` sha256 (`546c7fe6923f0d21df39c10ea38b8f3d9b5bb8ed71a1fe5f526709ebf0791caf`) UNCHANGED entre phases red et green — éditeur n'a pas self-modifié le test manifesté. Sanity-check repo-wide : `rg "new AppError\(\s*\{[^}]*code:\s*['\"]NOT_FOUND['\"]" museum-backend/src` → **0 hits** post-codemod (clean repo-wide, aucun site `NOT_FOUND` inline résiduel hors scope).

## [Unreleased] — 2026-05-23 — PR-2 codemod `requireUser(req)` sur 7 sites chat/

Run `2026-05-23-pr-2-requireUser-codemod` — second KISS/DRY refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH #3. Pipeline : UFR-022 fresh-context 5-phase / reviewer APPROVED. Pure TypeScript refacto, wire-format 401 strict equivalent (statusCode + `code:'UNAUTHORIZED'` inchangés, seul le `message` text passe `'Token required'` → `'Authentication required'` — discrimination FE/web se fait sur `code` machine-lisible). Zéro changement de comportement runtime observable côté consommateurs, zéro migration DB, zéro lib bump.

### Changed

- **PR-2** — 7 sites du module `chat/` HTTP layer utilisent désormais le helper canonique `requireUser(req)` (`museum-backend/src/shared/http/requireUser.ts:11`, signature `(req: Request) => UserJwtPayload`, throw `unauthorized('Authentication required')` si `req.user?.id` falsy) au lieu de réinventer le pattern inline `const currentUser = getRequestUser(req); if (!currentUser?.id) { throw new AppError({message:'Token required', statusCode:401, code:'UNAUTHORIZED'}) }`. Sites codemodés :
  - `museum-backend/src/modules/chat/adapters/primary/http/explanation.controller.ts:19-22` — `createExplanationHandler` (GET `/api/chat/messages/:id/explanation`).
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-session.route.ts:70-77` — `buildUpdateSessionContextHandler` (PATCH `/sessions/:id/context`).
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-session.route.ts:129-132` — inline GET `/sessions` list handler.
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:152-155` — `createReportHandler` (POST `/messages/:messageId/report`).
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:173-176` — `createFeedbackHandler` (POST `/messages/:messageId/feedback`).
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-memory.route.ts:19-22` — GET `/memory/preference`.
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-memory.route.ts:33-36` — PATCH `/memory/preference`.

  Imports `AppError` retirés des 4 fichiers (helpers nommés `badRequest`/`notFound` conservés là où encore utilisés). Imports `getRequestUser` conservés sur `chat-session.route.ts` (sites no-throw L34 GET single, L115 POST create, L142 DELETE — useCase tolère `userId=undefined`) et `chat-media.route.ts` (sites no-throw L43 audio, L189 imageUrl, L209 tts) ; retirés sur `explanation.controller.ts` et `chat-memory.route.ts` (plus aucun usage résiduel). Diff `+18 / -47` lignes sur 4 fichiers source + 1 test sentinel.

### Added

- Nouveau test sentinel `museum-backend/tests/unit/chat/route-discipline-requireUser-codemod.test.ts` (156 lignes, 13 assertions) — empêche la régression du pattern inline à l'avenir. Couvre par fichier : (a) absence du pattern `if (!\w+\?\.id) { throw new AppError({...UNAUTHORIZED...}) }`, (b) absence du literal `throw new AppError({ ... code:'UNAUTHORIZED' ... })` inline (helper-wrapped `unauthorized(...)` reste autorisé), (c) présence de l'import `requireUser` from `@shared/http/requireUser`. Sanity-check global : total inline-pattern ≤ 7 (au HEAD pre-codemod = 7, post-codemod = 0).

## [Unreleased] — 2026-05-23 — PR-1 unauthorized factory extension + 6-locale sweep

Run `2026-05-23-pr-1-unauthorized-extend` — first KISS/DRY refactor of the audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH #1. Pipeline : UFR-022 fresh-context 5-phase / reviewer APPROVED. Pure TypeScript refacto, zéro changement de comportement runtime observable, zéro migration DB, zéro lib bump.

### Changed

- **PR-1** — `unauthorized` factory canonique étendue à signature `(message: string, code?: string): AppError` (default-arg positional, `code = 'UNAUTHORIZED'`). Surface additive : les ~14 call-sites externes mono-arg continuent de compiler sans annotation. Pattern aligné avec les ex-locales L4/L5/L6 (`token-jwt.service`, `authSession.service`, `session-issuer.service`). Source : `museum-backend/src/shared/errors/app.error.ts:109-115`. Symétrie volontairement gardée mono-arg-compatible (vs options-object) pour préserver les 16 call-sites 2-arg littéraux existants et la cohérence avec `forbidden(message)` / `conflict(message)`. AC1+AC2 couverts par nouveau test unit `tests/unit/shared/app-error.test.ts` (assertion `'unauthorized accepts an optional code override'`). AC4+AC8 couverts par nouveau test `tests/unit/auth/unauthorized-codemod.test.ts` (3 paths d'erreur `verifyMfaSessionToken` + sentinel codes machine-lisibles préservés bit-à-bit).

### Removed (UFR-016 burial — 6 factories locales)

- `museum-backend/src/shared/middleware/authenticated.middleware.ts:10-11` — `const unauthorized = (message: string)` (mono-arg, default `'UNAUTHORIZED'`). 5 call-sites mono-arg conservés inchangés (default canonique ≡ default locale).
- `museum-backend/src/shared/middleware/apiKey.middleware.ts:28-29` — `const unauthorized = (message: string)` (mono-arg, default `'UNAUTHORIZED'`). 6 call-sites mono-arg conservés inchangés.
- `museum-backend/src/modules/auth/useCase/totp/mfaSessionToken.ts:41-42` — `const unauthorized = (message: string, code = 'INVALID_MFA_SESSION')` (default divergent). **3 call-sites mono-arg promus en 2-arg explicit** `(msg, 'INVALID_MFA_SESSION')` aux lignes 53, 60, 65 post-refactor pour préserver le code machine-lisible (sans cette promotion, FE MFA challenge UX cassée car code dégradait silencieusement à `'UNAUTHORIZED'`).
- `museum-backend/src/modules/auth/useCase/session/token-jwt.service.ts:30-36` — `const unauthorized = (message: string, code = 'UNAUTHORIZED')`. 6 call-sites 2-arg littéraux (`'INVALID_ACCESS_TOKEN'`, `'INVALID_REFRESH_TOKEN'`) conservés inchangés.
- `museum-backend/src/modules/auth/useCase/session/authSession.service.ts:30-36` — `const unauthorized = (message: string, code = 'UNAUTHORIZED')`. 7 call-sites 2-arg littéraux (`'INVALID_CREDENTIALS'`, `'INVALID_REFRESH_TOKEN'`, `'ACCOUNT_DELETED'`, `'ACCOUNT_SUSPENDED'`) conservés inchangés.
- `museum-backend/src/modules/auth/useCase/session/session-issuer.service.ts:39-45` — `const unauthorized = (message: string, code = 'UNAUTHORIZED')`. 4 call-sites 2-arg littéraux (`'REFRESH_TOKEN_REUSE_DETECTED'`, `'REFRESH_TOKEN_EXPIRED'`, `'SESSION_IDLE_TIMEOUT'`) conservés inchangés.

Total diff : `+46 / -44` lignes sur 8 fichiers (6 source + 2 tests). Aucune ADR (refacto réversible). Aucune entrée TECH_DEBT (zéro dette ajoutée).

## [Unreleased] — 2026-05-23 — PR-P0-1 fix feedback LLM cache invalidation

Run `2026-05-23-pr-p0-1-fix-llm-cache-feedback` — single P0 launch-blocker closed (V1 2026-06-07, J-15). Pipeline : UFR-022 fresh-context 5-phase / enterprise / reviewer APPROVED weightedMean **92.4**.

### Fixed

- **PR-P0-1** — Negative feedback on a chat answer now actually purges the cached LLM response. Previously `buildFeedbackInvalidationKeys` (in `museum-backend/src/modules/chat/useCase/audio/chat-media.service.ts`) produced a cartesian product of keys in an orphan namespace `chat:llm:*` while the real cache writer `LlmCacheServiceImpl` stores under `llm:v2:*` (ADR-036). Result : `cache.del(...)` purged non-existent keys, 0 entries invalidated, stale answer served back for the remainder of the TTL window (24 h museum-mode / 7 d generic). Fix : the exact cache key produced by `LlmCacheServiceImpl.store()` is now captured at WRITE time and persisted on the `ChatMessage` row as `cache_key` (additive nullable migration `1779536483274-AddCacheKeyToChatMessages`). Feedback path reads the row by `messageId`, retrieves `cacheKey`, and purges the exact key. Closes the I-FIX1 sweep (admin "purge museum" path fixed 2026-05-21 ; feedback path was missed in the same sweep). Fail-open semantics preserved (Redis down → HTTP 200 + WARN log). New dedicated suite `tests/unit/chat/feedback-cache-invalidation.test.ts` (8 cases, non-tautological — assertions on the actual key written, not via the function under test). Executes ADR-036 ; no new ADR.

### Removed (UFR-016 burial — ~589 LOC)

- `museum-backend/src/modules/chat/useCase/message/chat-cache-key.util.ts` (148 LOC) — produced the orphan `chat:llm:*` namespace, no writers in prod (exhaustive grep), parity contract FE↔BE was stale (FE `computeLocalCacheKey` is device-local AsyncStorage, never imported the BE helper).
- `museum-backend/tests/contract/cache-key-parity.test.ts` (66 LOC) — defended the stale parity contract.
- `museum-backend/tests/fixtures/cache-key-vectors.json` (119 LOC) — fixture for the removed parity test.
- `museum-backend/tests/helpers/chat/cache-fixtures.ts` (23 LOC) — helper for the removed parity test.
- `museum-backend/tests/unit/chat/chat-cache-key.test.ts` (233 LOC) — tested the orphan helper.

## [Unreleased] — 2026-05-21 — P0 GDPR closure lot

Run `2026-05-21-p0-gdpr` — eight P0 items shipped to verrouiller V1 launch (2026-06-01) against pre-launch GDPR + App Store + ePrivacy audit findings. Pipeline : UFR-022 fresh-context 5-phase / standard-enterprise / reviewer APPROVED weightedMean 89.45.

### Security (GDPR Art. 7 enforcement)

- **B6** — `third_party_ai_{text,image,audio}_{openai,google}` consent enforcement at the LLM dispatch site (chat pipeline) and the audio route. New `ThirdPartyAiConsentChecker` port mirroring the existing `LocationConsentChecker` pattern ; wired into `prepare-message.pipeline.ts` and `chat-media.route.ts` ; refusal returns a structured `kind: 'refused'` bubble (pipeline) or HTTP 403 + `AppError({code: 'CONSENT_REQUIRED', scope})` (audio route). Anonymous sessions = fail-CLOSED (D3 default). Multi-provider intersection-AND semantics (D2).
- **B7** — `POST /sessions/:id/audio` consent gate. Audio scope (`third_party_ai_audio_<provider>`) is now verified at route entry before any STT invocation ; previously the FE collected the toggle but the backend dispatched audio to OpenAI Whisper without checking.
- **I-SEC9** — `searchTerm` (user-typed chat text) dropped from `ExtractionJobPayload` in the BullMQ extraction queue. The field was enqueued by `enqueueForExtraction()` but ignored downstream (`processUrl(url, _searchTerm, locale)` discarded it) — dead PII retained in Redis for the BullMQ retention window. Now removed at the port boundary ; worker tolerant-destructures legacy jobs (R10 backward-compat).

### Compliance (GDPR Art. 13(1)(e) recipient disclosure)

- **B15** — Subprocessor list reconciled across the three public surfaces : 19 recipients (13 missing + DeepSeek-HTML-only added). New `/subprocessors` route on `museum-web` enumerates them with role, jurisdiction, contractual basis (DPA / SCC / adequacy).
- **B16** — Single canonical legal content source at `museum-backend/src/shared/legal/{privacy,terms}-content.canonical.json`. Three derivation pathways : `museum-web` imports directly, `museum-frontend` regenerated via `scripts/codegen-legal-content.mjs` (run by husky on canonical-touched commits), `docs/privacy-policy.html` maintained manually and verified by sentinel. New CI sentinel `museum-backend/scripts/sentinels/privacy-content-drift.mjs` with comment-stripping pre-pass blocks any PR where a surface diverges. Corrected CNIL Délibération 2021-018 minor-age value (15 years, replacing the prior incorrect "16 ans" in HTML/FE). Architecture rationale recorded in ADR-062.
- **B18** — `museum-web` `/terms` route added + `/cookies` notice page (ePrivacy notice-only, no consent banner). The cookie-audit performed in-spec confirmed `museum-web` sets only strictly-necessary first-party cookies (`admin-authz`, `csrf_token`) and that the embedded Sentry SDK is configured without `replaysSessionSampleRate` / `profilesSampleRate` — no non-essential tracking cookies, banner not required. New CI sentinel `museum-backend/scripts/sentinels/web-cookies-audit.mjs` scans `museum-web/` for forbidden tracking SDK identifiers to preserve this stance.

### App Store

- **B10** — `museum-frontend/ios/Musaium/Info.plist` : `NSLocationAlwaysAndWhenInUseUsageDescription` and `NSLocationAlwaysUsageDescription` removed (when-in-use only matches `app.config.ts` declared scope). Sentinel added to prevent regression at build time.

### Internationalisation

- **I-CMP2** — 10 `consent.*` translation keys backfilled across 6 missing locales (`de`, `es`, `it`, `ja`, `zh`, `ar`) in `museum-frontend/locales/`. Brings 60 missing keys to zero ; consent UI now renders in the full locale matrix.

### Reclassified

- **I-SEC8** — Originally framed by the audit as a cross-tenant `museum_id` scoping leak in `artwork_knowledge`. Verification (2026-05-21) proved `artwork_knowledge` is a global scraped catalogue keyed by `(title, artist, locale)` with no tenant column ; the residual risk is self-inflicted only (client surfacing an irrelevant title in their own session prompt) and `sanitizePromptInput()` already mitigates the prompt-injection vector. Reclassified LOW, no code, no migration. Rationale + future V2 trigger conditions recorded in ADR-061.

### Architectural Decision Records

- ADR-061 — I-SEC8 reclassification (`artwork_knowledge` is not multi-tenant).
- ADR-062 — Canonical legal content source + drift sentinel.
