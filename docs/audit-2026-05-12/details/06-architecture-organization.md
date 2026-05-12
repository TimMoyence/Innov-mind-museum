# 06 — Architecture organization & pattern respect
**Date:** 2026-05-12  **Agent:** AGENT-06

## Verdict
- **BE pattern respect: 82/100** — Hexagonal cleanly enforced at the boundary (domain has zero adapter imports; useCase imports adapters only in composition-root `index.ts` / `chat-module.ts`); 4-level relative imports completely eradicated; alias usage uniform. Sins are localized: one cross-module adapter-to-adapter+useCase break in `chat/musaium-catalogue.client`, one useCase-to-static-data shortcut in `daily-art`, and the orphan `src/helpers/` top-level competing with `src/shared/`.
- **FE pattern respect: 58/100** — Feature directory exists and looks tidy, BUT the explicit barrel rule documented in every feature `index.ts` ("Cross-feature consumers MUST import through this barrel") is violated **203 times vs 8 conforming imports** (25:1 ratio). Internal feature shapes diverge wildly (`features/diagnostics/` has 3 top-level files, `features/auth/` has 6 sub-layers, `features/legal/` ships content `.ts` files alongside a `ui/`). The shape is feature-driven in name only.
- **Web pattern respect: 88/100** — App Router structure correct (`src/app/[locale]/...`), admin under `[locale]/admin/`, public marketing components separated, zero deep-relative imports, no admin→marketing leak observed. Only nit: `src/lib/api.ts` (file) collides namespace-wise with `src/lib/api/` (dir holding the OpenAPI generated client).
- **Overall organization: 76/100**

**Honest read.** The backend is genuinely hexagonal — not cosplay. Domain stays pure, ports are typed in `domain/ports/`, composition happens in one file per module (and the 716-line `chat-module.ts` is justified by a load-bearing eslint-disable docblock referencing the C.10 audit). What's strange is the *meta-organisation*: `src/helpers/` exists in parallel to `src/shared/` and both export HTTP middleware (`app.ts` imports CORS, dataMode, metrics, swagger from helpers and observability/cache from shared). That's organisational double-vision, not a structural bug, but it's the kind of thing that bites onboarding. The web app is the most disciplined codebase of the three. The frontend declares barrel discipline and then ignores it everywhere — that's a documentation lie. If the user grep'd one of those `index.ts` docblocks before reaching deep into `@/features/chat/application/useChatSession`, they'd be misled. UFR-013 demands either enforcing or deleting the claim.

## Method

Queries run:
- `grep -rn "from '@modules/*/adapters" src/modules/*/domain/` — domain→adapter violations (0 found).
- `grep -rn "from '@modules/*/adapters" src/modules/*/useCase/` excluding `index.ts` (1 found: `daily-art`).
- Cross-module coupling matrix (8x8) via grep over `from '@modules/<tgt>/'` per source module.
- `grep -rn -E "from ['\"](\.\./){3,}"` across BE, FE, Web for 3+ level relatives.
- Alias vs deep-relative count for FE (`@/shared` = 305 hits, `../../shared` = 0 hits; `@/features/X/(application|domain|infrastructure|ui)/` = 203 hits, `@/features/X'` barrel = 8 hits).
- Module size: `find -type f -name '*.ts' | wc -l` per `src/modules/*` and per `features/*`.
- Single-file directory hunt via `ls $dir | wc -l == 1`.
- `find src -type d -empty` (BE: 0; FE: 0; Web: 0).
- File naming regex `^[a-z0-9-]+(\.[a-z]+)*\.tsx?$` vs the rest.

Modules inspected: every BE module (`admin`, `auth`, `chat`, `daily-art`, `knowledge-extraction`, `museum`, `review`, `support`); every FE feature (13); web `src/app/[locale]/`, `src/components/`, `src/lib/`; `design-system/tokens/`.

---

## BE — hexagonal compliance

### Folder layout

Every module follows the same 4-element template:

```
modules/<name>/
  ├── adapters/{primary,secondary}/
  ├── domain/
  ├── useCase/
  └── index.ts          # barrel (minimal)
```

`chat` adds `chat-module.ts` (composition root) + `jobs/` + `util/`; `knowledge-extraction` keeps the composition logic inline in `index.ts`. Both patterns are explicitly allowed by CLAUDE.md. **The tree communicates intent immediately.**

Two odd top-level folders outside `modules/`:

| Path | Concern |
|---|---|
| `src/helpers/` (5 files + `middleware/` 15 files) | HTTP middleware (`cors.config`, `metrics-middleware`, `http-cache-headers`, `dataMode.middleware`, `swagger.ts`) **AND** a sibling `middleware/` folder housing 15 Express middlewares. Identical concern to `src/shared/http/` (10 files) and `src/shared/observability/`. `app.ts` imports from BOTH locations. |
| `src/data/db/` | Single use (TypeORM `data-source.ts` + 34 migrations). Fine — appropriately scoped. |

### Layering violations (with file:line)

**Domain → adapter:** 0 violations. ✅

**useCase → adapter (outside composition root):** 1 violation.

| File:line | Violation | Severity | Fix |
|---|---|---|---|
| `src/modules/daily-art/useCase/listing/getDailyArtwork.useCase.ts:1` | `import { artworks } from '@modules/daily-art/adapters/secondary/catalog/artworks.data'` — useCase reaches into a static-data adapter directly | P2 | Introduce an `ArtworkCatalogPort` in `domain/artwork/`, inject it via composition root |

**Cross-module deep useCase imports (port-bypassing):**

| File:line | Pulls | Severity |
|---|---|---|
| `src/modules/chat/useCase/orchestration/chat.service.ts:54` | `import type { DbLookupService } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.service'` | P1 — chat couples to a concrete class from another module's useCase layer instead of a port. Type-only `import type` softens it but a refactor still removes a load-bearing dependency. |
| `src/modules/chat/useCase/enrichment/enrichment-fetcher.ts:11` | same | P1 |
| `src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts:32` | same | P1 |
| `src/modules/chat/useCase/message/chat-message.service.ts:53` | same | P1 |
| `src/modules/admin/useCase/facades/admin-review.facade.ts:4,8` | `@modules/review/useCase/admin/listAllReviews.useCase`, `@modules/review/useCase/moderation/moderateReview.useCase` | P2 — admin module explicitly created a `facades/` folder to mediate this, so the coupling is acknowledged and contained. Cleaner if facades imported through `@modules/review` barrel. |
| `src/modules/admin/useCase/facades/admin-support.facade.ts:4,8` | `@modules/support/useCase/ticket-admin/*` | P2 — same as above |

**Adapter → adapter (cross-module):** 1 violation.

| File:line | Violation | Severity |
|---|---|---|
| `src/modules/chat/adapters/secondary/search/musaium-catalogue.client.ts:1-2` | imports `@modules/chat/useCase/image/image-scoring` (adapter → its own useCase, backward) AND `@modules/daily-art/adapters/secondary/catalog/artworks.data` (cross-module into another module's adapter) | P1 — biggest pure hexagonal break in the codebase. The catalogue adapter is conceptually data-bound to `daily-art` and needs scoring. Fix: turn the `Artwork` catalogue into a domain artefact (move `artworks.data` to `daily-art/domain/`) and inject `image-scoring` as a domain helper, or extract a shared catalogue port. |

**4-level relative imports:** 0 across all `src/modules/`. ✅ — the codemod 2026-05-05 stuck.

**Cross-module coupling matrix (count = number of files in source module importing from target):**

```
admin → auth:3   chat:2   knowledge-extraction:1   review:4   support:3
auth  → chat:2
chat  → auth:4   daily-art:1   knowledge-extraction:6   museum:6
knowledge-extraction → museum:1
museum → knowledge-extraction:1
review → auth:2
```

Notes:
- `auth ↔ chat` mutual: chat reads `auth/domain/consent/content-preference`; auth reads `chat/domain/voice/voice-catalog`. The voice catalog lives in chat for legacy reasons; arguably belongs in `shared/` since auth and chat both consume it as a config-shaped enum.
- `museum ↔ knowledge-extraction` mutual: each side imports a single domain port/type from the other — fine.
- Almost all crossings hit `domain/` of the target (entities/types/ports), which is correct hexagonal hygiene. Exceptions are the 5 `chat → knowledge-extraction/useCase` lines above.

### Barrel discipline

Sizes:
- admin: 14L · auth: 57L · chat: 37L · daily-art: 9L · knowledge-extraction: 108L · museum: 32L · review: 15L · support: 21L

Average 36 lines — **minimal-barrel policy respected.** `knowledge-extraction/index.ts` (108L) is heavier because it doubles as composition root (deliberate per its docblock).

### Composition-root pattern (chat / knowledge-extraction)

- `chat/chat-module.ts` is 716 lines but explicitly justified by a top-of-file eslint-disable that cites the C.10 reunification audit. **A single composition file is more honest than the previous 6-file split.** Verified the leading import block: pulls every adapter + every useCase + every port, builds the graph, exits. That's textbook.
- `knowledge-extraction/index.ts` (108L) does the same in-barrel — clean.
- No other module needs a composition root; the per-module `useCase/index.ts` wires its own subset and `app.ts` calls `buildChatService(...)` and `wireAuthMiddleware(...)`.

**Wiring leak check:** zero adapters or domain files import from `chat-module.ts` or other modules' `index.ts` (apart from intentional cross-module barrel use). ✅

### Import discipline

- Alias `@modules`, `@shared`, `@data`, `@src` used uniformly (verified via grep — zero `from '../../modules/'` patterns).
- 4-level+ relative imports across `src/modules/`: **0**.
- `src/helpers/` is imported via `@src/helpers/...` from `app.ts` — alias works, but the folder shouldn't exist there.

---

## FE — feature-driven

### Folder layout

`features/` contains 13 features. **No two features have the same internal shape.**

Reference shape (chat, auth, museum, settings, review):
```
features/<name>/
  ├── application/
  ├── domain/             (only auth + art-keywords)
  ├── infrastructure/
  ├── ui/
  └── index.ts
```

Actual variants:

| Feature | Shape | Issue |
|---|---|---|
| `auth/` (32 files) | application/domain/infrastructure/ui + `routes.ts`, `useProtectedRoute.ts`, `screens/`, `index.ts` | extra root-level files break the 4-folder rule |
| `chat/` (80 files) | application/domain/infrastructure/ui + `index.ts` | reference shape ✅ |
| `museum/` (45 files) | application/infrastructure/ui + `index.ts` | no `domain/` |
| `art-keywords/` (5 files) | application/domain/infrastructure | no `ui/`, no `index.ts` |
| `conversation/` (9 files) | application/infrastructure/ui | no `index.ts` |
| `daily-art/` (4 files) | application/infrastructure/ui | no `index.ts` |
| `diagnostics/` (3 files) | **flat top-level**: `perfStore.ts`, `useFpsMeter.ts`, `PerfOverlay.tsx` | no sub-layers |
| `home/` (2 files) | ui only | minimal |
| `legal/` (3 files) | `privacyPolicyContent.ts`, `termsOfServiceContent.ts`, `ui/` | content `.ts` at root |
| `onboarding/` (7 files) | application/ui | no infra |
| `review/` (4 files) | application/infrastructure/ui | no `index.ts` |
| `settings/` (26 files) | application/infrastructure/ui + 4 top-level `.ts` (`dataModeStore`, `runtimeSettings`, `runtimeSettings.pure`, `voice-catalog`) | random root files |
| `support/` (2 files) | infrastructure/ui | no application |

**The feature-driven claim is half-true.** Five features look right; eight take liberties.

### Feature shape consistency

Single biggest tell: `features/settings/voice-catalog.ts` is imported from `museum-backend/src/modules/chat/...` semantics (constant list of TTS voices) — should be in `shared/api/` since OpenAPI types live there. Top-level `runtimeSettings.ts` + `runtimeSettings.pure.ts` is a "pure logic split for node-test" pattern (matches the `tests/` vs `__tests__/` split below) — fine, but undocumented.

### Tests organization

FE has **two separate test runners**:

| Path | Runner | Count | Purpose |
|---|---|---|---|
| `__tests__/` | Jest (`test:rn`) | 209 `.test.ts/tsx` files, mirror tree (`__tests__/features/<f>/...`) | Component + integration |
| `tests/` | `node --test` (`test:node`) | 15 `.test.ts` files, flat | Pure logic, no RN deps |

Pattern is intentional (`package.json` declares both, `tsconfig.test.json` includes `tests/**/*.ts`), but it's **not documented anywhere a new dev would look** — no README under `tests/`, no comment in `jest.config.js`. P2 doc gap.

No colocated `*.test.ts` inside `features/` (verified: 0 results). Consistent — central tests dir is the law.

### Import discipline

Headline: **barrel discipline doctrine vs reality**

Every large feature `index.ts` opens with:

> "Cross-feature consumers MUST import through this barrel. Reaching directly into `application/` or `infrastructure/` is forbidden."

Reality grep:
- Deep cross-feature imports (`@/features/X/(application|domain|infrastructure|ui)/...`): **203**
- Through barrel (`@/features/X'`): **8**
- Ratio: 25:1 in favour of violations.

Sample offenders (the docblock would forbid every line):
```
features/conversation/application/useConversationsData.ts → @/features/chat/application/useChatSession
features/conversation/application/useConversationsActions.ts → @/features/chat/...
app/(stack)/onboarding.tsx → @/features/onboarding/application/useOnboarding
app/(stack)/settings.tsx → @/features/settings/application/useSettingsActions
features/settings/ui/SettingsPrivacyCard.tsx → @/features/auth/infrastructure/authApi
features/art-keywords/application/useArtKeywordsClassifier.ts → ...
```

**Severity: P1** — either delete the doctrine (it's lying) or add a `no-restricted-imports` ESLint rule per feature. As-is it's anti-doctrine: docblocks claiming a rule the code violates by 25:1 destroy trust per UFR-013.

Other import notes:
- Deep relative imports (`../../../`): exactly **1** (`features/auth/domain/authLogic.pure.ts:1` reaches `../../../shared/auth/jwt-decode` — should be `@/shared/auth/jwt-decode`). P3.
- `@/shared` alias usage: 305 hits, zero `../../shared` competitors. ✅

---

## Web — App Router

### Folder layout

```
src/
  app/
    [locale]/
      admin/{analytics,audit-logs,login,mfa,ops,reports,reviews,support,tickets,users}/
      privacy/  reset-password/  verify-email/  confirm-email-change/  support/
      layout.tsx  page.tsx
    global-error.tsx  layout.tsx  globals.css  sitemap.ts
  components/{admin,ai-disclosure,auth,marketing,ops,shared,ui}/
  lib/                # api + i18n + auth helpers + sentry-scrubber + seo
  dictionaries/{en,fr}.json
  __tests__/          # cross-cutting admin pages tests
  middleware.ts       # i18n routing
  tokens.*.css
```

i18n `[locale]` segment correctly wraps every public page. Admin lives **inside** the locale segment (`/[locale]/admin/...`) which is correct given the admin panel needs FR/EN too. Tests are mixed: colocated `*.test.tsx` next to components/pages (7 in `src/lib/`, 1 next to `page.tsx`) AND central `src/__tests__/admin/*.test.tsx`. Documented as: cross-page integration goes central, unit goes colocated — pattern is workable.

### Admin / public boundary

Cross-folder reach check:
- Pages under `[locale]/` (non-admin) importing from `@/components/admin/`: **0** ✅
- Pages under `[locale]/admin/` importing from `@/components/marketing/`, `@/components/ai-disclosure/`: **0** ✅
- Both consume `@/components/shared/`, `@/components/ui/`, `@/lib/*` — appropriate.

Boundary is respected cleanly. Best discipline of the three apps.

Minor: `src/lib/api.ts` (file, the HTTP client) and `src/lib/api/generated/openapi.ts` (folder, generated types) sit side by side. Causes `@/lib/api` to be ambiguous (TypeScript resolves it to the file). Suggest renaming the file to `apiClient.ts` or moving generated types to `src/lib/openapi/`.

---

## Cross-app naming conventions

| Concern | BE | FE | Web |
|---|---|---|---|
| Test file suffix | `.test.ts` (391) + `.spec.ts` (14 — promptfoo only) | `.test.ts/tsx` only | `.test.ts/tsx` only |
| Entity files | `userMemory.entity.ts`, `chatMessage.entity.ts` (camelCase) | n/a | n/a |
| Repository interfaces | `userMemory.repository.interface.ts` (camelCase) | n/a | n/a |
| useCase files | `createMuseum.useCase.ts` (camelCase verb-noun) | n/a | n/a |
| Adapter files | `langchain.orchestrator.ts`, `siglip-onnx.adapter.ts` (kebab) | n/a | n/a |
| Domain types | `chat.types.ts`, `review.types.ts` (kebab) | mostly camelCase (`runtimeSettings.pure.ts`) | mostly kebab (`admin-types.ts`) |
| React components | n/a | PascalCase (`ChatHeader.tsx`) | PascalCase (`AdminShell.tsx`) |
| Hooks | n/a | camelCase `useFoo.ts` | camelCase |
| Folder names | kebab (`art-keyword`, `knowledge-extraction`, `daily-art`) | kebab + 1 camelCase (`art-keywords`, but `daily-art`) | kebab |

**BE convention split is intentional** (camelCase for domain artefacts identifying a noun → file = noun; kebab for everything else). It's internally consistent but uncommon — a CONTRIBUTING.md note would save onboarding time.

**FE is most inconsistent**: `runtimeSettings.ts`, `dataModeStore.ts`, `voice-catalog.ts`, `useFpsMeter.ts`, `perfStore.ts` all live at the top of `features/`. No rule discernible.

---

## God modules / dead folders / orphan files

### God modules

- **`src/modules/chat/`** — 161 files, 9 secondary adapter sub-folders, 15 useCase sub-folders, `chat-module.ts` is 716 lines. Justified by domain scope (chat is the core product) and internally well-subdivided. Not a god module in the bad sense, but if it grows another 30% it will need a split (e.g., extract `visual-similarity/` and `voice/` into siblings).
- **`src/modules/auth/`** — 83 files, also well-subdivided. Not problematic.

### Dead / orphan / single-file folders

**BE single-file directories** (smell — empty namespaces or premature categorization):

| Path | Content |
|---|---|
| `src/modules/chat/util/` | only `guardrail-snippet.ts` (1 file). Why a `util/` folder for one file? Move into the closest consumer. |
| `src/modules/chat/domain/breaker/` | only `breaker-state.ts`. |
| `src/modules/chat/domain/voice/` | only `voice-catalog.ts`. |
| `src/modules/chat/domain/knowledge/` | only `wikidata-kb-dump.entity.ts`. |
| `src/modules/chat/useCase/location/` | only `location-resolver.ts`. |
| `src/modules/chat/useCase/describe/` | only `describe.service.ts`. |
| `src/modules/chat/useCase/retention/` | only `prune-stale-art-keywords.ts`. |
| `src/modules/museum/domain/enrichment/` | only `enrichment.types.ts`. |
| `src/modules/museum/adapters/secondary/parsers/` | only `opening-hours-parser.ts`. |
| `src/modules/review/useCase/admin/` | only `listAllReviews.useCase.ts`. |
| `src/modules/review/adapters/secondary/notifier/` | only `review-moderation-email.notifier.ts`. |
| `src/modules/review/adapters/secondary/pg/` | only `review.repository.pg.ts`. |
| `src/modules/support/jobs/` | only `support-retention-cron.registrar.ts`. |
| `src/shared/auth/` | only `jwt-decode.ts`. |
| `src/shared/errors/` | only `app.error.ts`. |
| `src/shared/legal/` | only `policy-version.ts`. |
| `src/shared/media/` | only `mime-extensions.ts`. |
| `src/shared/pagination/` | only `cursor-codec.ts`. |
| `src/shared/ports/` | only `image-cleanup.port.ts`. |
| `src/shared/rate-limit/` | only `in-memory-bucket-store.ts`. |
| `src/shared/routers/` | only `api.router.ts`. |
| `src/shared/security/` | only `bcrypt.ts`. |

22 single-file folders. Many are reasonable namespaces awaiting growth (e.g., `shared/errors/` will get `validation.error.ts` someday). Some are pure ceremony (`chat/util/`).

### Dead files

- `src/modules/chat/adapters/primary/http/routes/chat-message.sse-dormant.ts` — declared DORMANT post-V1 in its docblock; **not imported anywhere** (verified). Per `feedback_bury_dead_code.md` doctrine ("Dead code = deleted same commit, no DEPRECATED markers, no zombie stubs"), this file violates the doctrine. It's a zombie stub kept "for V2.1 revival". **Either delete (`git log` is the recovery path) or move to `docs/_archive/`.** P1 doctrinal.

### Empty directories

BE: 0. FE: 0. Web: 0. ✅

### Orphan top-level folders

- **`museum-backend/src/helpers/`** — competes with `src/shared/`. Imports: `cors.config`, `dataMode.middleware`, `http-cache-headers`, `metrics-middleware` (uses `@shared/observability/prometheus-metrics` internally), `swagger.ts`, and a `middleware/` subfolder with 15 Express middlewares. `app.ts` imports HTTP-class middleware from BOTH `@src/helpers/` AND `@shared/`. **This is the worst organizational decision in the repo.** P1.
  - Fix: move all of `helpers/` under `shared/http/middleware/` (or split `shared/http/` into `client/` + `middleware/`); delete `src/helpers/`.

---

## Pattern claims vs reality scorecard

| Claim (source) | Reality | Gap |
|---|---|---|
| BE hexagonal: domain → useCase → adapters (CLAUDE.md) | Domain has 0 adapter imports. useCase imports adapters only in composition-root `index.ts` / `chat-module.ts`. | **Honoured.** Exception: 1 useCase file in `daily-art`. ✅ |
| BE barrel-pattern (admin/auth/museum/review/support) (CLAUDE.md) | All 5 modules have a small `index.ts` (9-57 lines) re-exporting use-case singletons + domain types. | **Honoured.** ✅ |
| BE composition-root (chat/knowledge-extraction) (CLAUDE.md) | `chat-module.ts` (716L, 1 file) + `knowledge-extraction/index.ts` (108L). Single wiring file per module. | **Honoured** (consciously, with eslint-disable docblock explaining the choice). ✅ |
| Aliases `@modules/*`, `@shared/*`, `@data/*` (CLAUDE.md) | Used consistently. Zero `from '../../modules` violations across BE. | **Honoured.** ✅ |
| No 4-level relative imports (CLAUDE.md, codemod 2026-05-05) | 0 hits in BE `src/modules/`; 0 hits in FE `features/`; 0 hits in Web. | **Honoured.** ✅ |
| Minimal-barrel policy (CLAUDE.md) | Avg barrel size 36L. No barrel sprawl. | **Honoured.** ✅ |
| FE feature-driven structure (CLAUDE.md) | 5/13 features follow the reference 4-folder shape, 8 take liberties. | **Partially honoured** — name only. ⚠️ |
| FE "cross-feature consumers MUST import through this barrel" (every feature `index.ts` docblock) | 203 deep imports vs 8 barrel imports. | **Violated 25:1.** Doctrine lies. ❌ |
| Web App Router i18n FR/EN (CLAUDE.md) | `src/app/[locale]/...` everywhere, `middleware.ts` routes by locale. | **Honoured.** ✅ |
| Web admin panel JWT + refresh interceptor (CLAUDE.md) | `src/lib/api.ts` is the centralised client with refresh logic; admin pages use `apiGet/Patch/Post` from it. | **Honoured.** ✅ |
| Test factories required (CLAUDE.md) | Not audited end-to-end (out of scope for organisation), but BE `tests/helpers/` exists and FE `__tests__/helpers/factories/` exists. | Out of scope. |
| ESLint discipline (CLAUDE.md) | `chat-module.ts` is the only file with a long eslint-disable; it's properly justified with a `Justification` paragraph (cites the audit). | **Honoured** in the sample. ✅ |
| Dead-code burial doctrine (`feedback_bury_dead_code.md`) | `chat-message.sse-dormant.ts` is a zombie stub kept for V2.1. | **Violated** in 1 file. ❌ |

---

## Recommendations (organized by app)

### Backend (priority order)

1. **P1 — Eliminate `src/helpers/`.** Move HTTP middleware to `src/shared/http/middleware/` (or `src/shared/middleware/` if you prefer a flat namespace). Update `app.ts` imports. This is one PR and removes the most visible organisational confusion in the repo.
2. **P1 — Decide on `chat-message.sse-dormant.ts`.** Delete it (recoverable via `git log`) or move to `docs/_archive/dormant-2026-05/`. Don't keep a zombie stub claiming a V2.1 revival contract.
3. **P1 — Decouple `chat ← knowledge-extraction.DbLookupService`.** Define a `LocalKnowledgeLookupPort` in `chat/domain/ports/`; have `DbLookupService` implement it; inject the port in `chat-module.ts`. Removes 5 deep `@modules/<other>/useCase/...` imports.
4. **P2 — Fix `musaium-catalogue.client.ts`.** Either (a) move `artworks.data` to `daily-art/domain/` and read it via a port, or (b) introduce a shared `ArtworkCatalogPort` consumed by both chat and daily-art.
5. **P2 — Lift `getDailyArtwork.useCase.ts` off the static-data import.** Introduce an `ArtworkCatalogPort`.
6. **P2 — Move `voice-catalog.ts`** out of `modules/chat/domain/voice/` into `modules/auth/domain/consent/` (its primary consumer) or `shared/` (since both auth + chat read it). Eliminates the auth → chat back-edge.
7. **P3 — Adopt admin facades convention everywhere or nowhere.** `admin/useCase/facades/` is great but inconsistent: chat reaches into knowledge-extraction without going through a facade.
8. **P3 — CONTRIBUTING.md note** documenting the camelCase-for-domain-noun vs kebab-for-everything-else file naming rule, so it survives future contributors.

### Frontend (priority order)

1. **P1 — Choose: enforce or delete the feature barrel doctrine.** The current state (docblocks claim a rule violated 25:1) directly contradicts UFR-013. Two options:
   - **Enforce:** add an ESLint `no-restricted-imports` rule per feature blocking `@/features/<self>/...` from outside the feature folder, except `@/features/<self>'` and `@/features/<self>/index'`. Backfill barrel exports. Estimate: 1-2 days.
   - **Delete:** strip the misleading docblock from every `features/*/index.ts`; accept deep imports. Estimate: 30 min.
2. **P1 — Standardise feature shape.** Pick one (application/domain/infrastructure/ui) and either restructure the 8 non-conforming features or drop the claim. Suggestion: codify in `features/README.md`, allow `domain/` and `infrastructure/` to be optional, require `ui/` + `index.ts`.
3. **P2 — Document the `tests/` vs `__tests__/` split.** Either rename `tests/` to `tests-pure/` (or move under `__tests__/pure/` with its own runner config) or add a `tests/README.md` explaining `node --test` rationale.
4. **P2 — Decide fate of root-level feature files** (`features/settings/voice-catalog.ts`, `features/settings/runtimeSettings.ts`, `features/legal/privacyPolicyContent.ts`). Either each becomes a sub-folder or the convention allows root-level. Right now it's ad-hoc.
5. **P3 — Fix one relative-import outlier:** `features/auth/domain/authLogic.pure.ts:1` should use `@/shared/auth/jwt-decode`.

### Web (priority order)

1. **P2 — Resolve `src/lib/api.ts` vs `src/lib/api/` collision.** Rename file to `src/lib/apiClient.ts` (or move generated client to `src/lib/openapi/`).
2. **P3 — Document the test-location convention** (colocated for unit, central `__tests__/` for cross-page) in a brief `src/__tests__/README.md`.

### Design-system

- Already minimal and clean. No changes needed.

---

5-line summary:

BE 82/100, FE 58/100, Web 88/100. Top architectural violation: `museum-frontend` documents a cross-feature barrel rule in every `features/*/index.ts` but violates it 203 vs 8 times (25:1 ratio) — anti-doctrine that breaks UFR-013. Top organisational win: backend hexagonal layering is genuinely respected — zero domain→adapter imports, zero 4-level relatives, composition root is a single justified 716-line file, not cosplay. Worst orphan folder: `museum-backend/src/helpers/` (5 files + a 15-file `middleware/`) competing with `src/shared/` for the HTTP-middleware concern, with `app.ts` literally importing both.
