# Changelog — museum-backend

All notable changes to the Musaium backend (+ cross-app legal/mobile changes shipped in the same run) are documented in this file.

Format loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The Musaium repo is a monorepo (`museum-backend/` + `museum-frontend/` + `museum-web/`) ; this changelog captures cross-app GDPR / compliance / launch-blocking changes when they are coordinated by a single run.

## [Unreleased] — 2026-05-23 — PR-8 `paginate(qb, params, mapper?)` helper + sweep 4 repos

Run `2026-05-23-pr-8-paginate` — huitième incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH (volet offset-pagination). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **7.8/5** (loop-3 terminal, trajectory 6.5 → 7.4 → 7.8). Pure TypeScript helper extraction + sweep mécanique, `PaginatedResult<T>` field order `{data, total, page, limit, totalPages}` **byte-for-byte préservé**. Zéro changement de comportement runtime observable côté consommateurs (OpenAPI 200 contract identique, FE/web typed shape inchangée), zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass. Helper coverage 100% (statements/branches/functions/lines). `pnpm jest tests/unit/shared/pagination + tests/unit/architecture/pr8-paginate-sentinel.test.ts + tests/unit/review/review-repository.test.ts` → **38/38 PASS**. Reversibility : `git revert <sha>` restaure les 4 sweep sites + helper + marker support + mock fixtures.

### Added

- **Helper `paginate<TEntity, TDTO>(qb, params, mapper?): Promise<PaginatedResult<TDTO>>`** — `museum-backend/src/shared/pagination/offset-paginate.ts:23-34` (34 LOC total, body ≤30 LOC, JSDoc inclus). Signature :
  - Generic `<TEntity extends ObjectLiteral, TDTO = TEntity>` — default `TDTO = TEntity` rend l'identity branch sûre.
  - `params: PaginationParams` — type partagé `import type { PaginatedResult, PaginationParams } from '@shared/types/pagination'` (canonique single-source-of-truth, partagé avec PR-5 `assertPagination`). Future extensions (sortBy/sortDir) flow structurellement sans helper churn (NFR-9 honored).
  - `mapper?: (entity: TEntity) => TDTO` — optionnel ; quand omis, identity branch `entities as unknown as TDTO[]` (single isolated `as unknown` cast §12-allowed, no per-element allocation).
  - Comportement : `await qb.skip((page-1)*limit).take(limit).getManyAndCount()` single round-trip TypeORM, `totalPages = total === 0 ? 0 : Math.ceil(total/limit)` (ternary explicite vs design listing bare `Math.ceil(total/limit)` — équivalence comportementale, ternary documente l'edge case).
  - Caller responsable de `qb.orderBy(...)` AVANT l'appel (R1.4) — helper applique uniquement `skip`/`take`.
  - JSDoc référence PR-5 companion `assertPagination` (DL-4 English-only honored).
  - Pas de barrel `src/shared/pagination/index.ts` — single named export `paginate` (NFR-4 minimal-barrel honored).

- **Unit test `museum-backend/tests/unit/shared/pagination/offset-paginate.test.ts`** (19 cases, sha256 `571b43f6cf...`, FROZEN) — exercise helper contract end-to-end :
  1. `getManyAndCount` invoked exactly once with correct skip/take math.
  2. `data = entities.map(mapper)` quand mapper fourni.
  3. Identity branch quand mapper omis (cast `entities as unknown as TDTO[]`).
  4. Field order `{data, total, page, limit, totalPages}` canonical (locked).
  5. `totalPages = 0` quand `total = 0` (C4 edge case, ternary branch).
  6. `totalPages = Math.ceil(total/limit)` quand `total > 0` (avec multiples cases : exact division, partial, single overflow page).
  7. Skip math `(page-1)*limit` validated page=1/2/N.
  + helper coverage 100% (statements/branches/functions/lines).

- **Architecture sentinel `museum-backend/tests/unit/architecture/pr8-paginate-sentinel.test.ts`** (6 cases, sha256 `371c96c970...`, FROZEN) — **permanent regression guard**. Tourne dans le `pnpm test` gate existant. Assertions filesystem-based (grep + regex, aucun import runtime des sites swept) :
  1. Absence `.getManyAndCount(` direct dans `admin.repository.pg.ts` + `review.repository.pg.ts` (helper devient le seul caller sur les sweep sites).
  2. Absence du 2-round-trip chain `.skip(...).take(...).getMany()` sur les 4 swept sites.
  3. Présence `import { paginate } from '@shared/pagination/offset-paginate'` (ou équivalent path-aliased) sur chacun des 4 swept files.

  **Frozen-test contract** : `red-test-manifest.json` FLAT `{path: sha256}` shape (per `feedback_team_frozen_manifest_flat.md`). sha256 des 2 red files byte-identical pre/post-green via `shasum -a 256` :
  - `museum-backend/tests/unit/shared/pagination/offset-paginate.test.ts` → `571b43f6cf...`
  - `museum-backend/tests/unit/architecture/pr8-paginate-sentinel.test.ts` → `371c96c970...`

  Reviewer O-1 -1 minor noté : sentinel placé `tests/unit/architecture/` (au lieu du design §4.2 `tests/unit/shared/pagination/offset-paginate-sentinel.test.ts`) pour cohérence avec `pr6-dead-code-burial.test.ts` et `pr7-logActorAction-sentinel.test.ts` (architecture sentinels colocalisés). Manifest red↔green aligned, directory-grep readers searching `shared/pagination` will miss it.

### Changed

**Sweep 4 repo sites — `.skip(...).take(...).getMany() + .getCount()` (2 round-trips) OU `.skip(...).take(...).getManyAndCount()` inline → `return await paginate(qb, filters.pagination, mapper)`** :

| # | Site                                                                                                  | Mapper                                  | Convergence                            |
|---|-------------------------------------------------------------------------------------------------------|-----------------------------------------|----------------------------------------|
| 1 | `museum-backend/src/modules/admin/adapters/secondary/pg/admin.repository.pg.ts:118` (`listUsers`)     | `mapUser`                               | inline → helper                        |
| 2 | `museum-backend/src/modules/admin/adapters/secondary/pg/admin.repository.pg.ts:210` (`listAuditLogs`) | `mapAuditLog`                           | inline → helper                        |
| 3 | `museum-backend/src/modules/admin/adapters/secondary/pg/admin.repository.pg.ts:283` (`listReports`)   | inline `(r) => mapReport(r, r.message)` | inline → helper                        |
| 4 | `museum-backend/src/modules/review/adapters/secondary/pg/review.repository.pg.ts:63` (`listReviews`)  | `toDTO`                                 | 2 round-trips (getCount+getMany) → 1 round-trip (getManyAndCount) |

**Pattern `return await paginate(...)` × 4 sites est PROJECT-DOCTRINAL** — `museum-backend/eslint.config.mjs:350` enforce `'@typescript-eslint/return-await': ['error', 'always']`. `return await` preserve les async stack traces V8 dans les error paths (sans `await`, le stack trace ne capture pas le frame de la fonction caller). Cf. § Process ci-dessous (CR-5 withdrawn).

**1 opt-out documented marker** :
- `museum-backend/src/modules/support/adapters/secondary/pg/support.repository.pg.ts:71` — ajout marker `// paginate-skip: subquery-required (COUNT(m.id) + getRawAndEntities)` au-dessus du `getRawAndEntities()` call. S5 (`listTickets`) utilise `COUNT(m.id) + getRawAndEntities()` pour les message-count aggregates → incompatible avec la signature helper (`getManyAndCount` ≠ `getRawAndEntities`). Discoverable signal per UFR-016 anti-magic doctrine + spec T7 + DL-1 + §A3. Tout futur lecteur qui se demande "pourquoi pas `paginate` ici ?" trouve la réponse inline.

**1 mock-fixture-only test refresh (CR-2 user-deferred, behavior-preserving)** :
- `museum-backend/tests/unit/review/review-repository.test.ts` — 11 lignes modifiées, 3 mock-pair swaps (`getMany`+`getCount` → `getManyAndCount`). Cascade quand SUT bascule sur `getManyAndCount` — mocks pré-existants doivent matcher la nouvelle shape. Spec §R4 enumère ce fichier comme MUST-NOT-modify, **violation en lettre, behavior-preserving en réalité**. Cf. § Process ci-dessous (CR-2 user-deferred follow-up).

### Process — 3 reviewer loops + CR-5 withdrawn (UFR-018 case study) + CR-2/CR-4 user-deferred

**Reviewer rejection loop UFR-022 = ILLIMITÉ**, cap-free, fresh re-spawn à la phase pointée. Cap 2 corrective loops applicable UNIQUEMENT aux fails de hooks intra-phase (lint/tsc/test dans la même phase éditeur), JAMAIS aux verdicts reviewer.

**Trajectory 3 loops** :
- **Loop-1 (CHANGES_REQUESTED, weightedMean 6.5/5)** — 5 CRs émis : CR-1 (paginate-skip marker absent), CR-2 (review-repository.test.ts modifié violant spec §R4), CR-3 (helper signature inline literal vs `PaginationParams` shared), CR-4 (lib-docs/typeorm/PATTERNS.md `getManyAndCount` content-stale), CR-5 (`return await paginate(...)` flagged comme divergence de design §2.2).
- **Loop-2 (CHANGES_REQUESTED, weightedMean 7.4/5)** — CR-1 + CR-3 RESOLVED ; CR-5 PERSISTENT (reviewer maintien malgré green BLOCK signal). -0.2 honesty penalty appliquée brief↔reality drift.
- **Loop-3 (APPROVED terminal, weightedMean 7.8/5)** — **CR-5 retroactively WITHDRAWN** comme reviewer-error après vérification `museum-backend/eslint.config.mjs:350`.

**CR-5 withdrawn detail (UFR-018 case study)** :
- Reviewer first+second pass flaggé `return await paginate(...)` × 4 sites comme divergence du design §2.2 caller listing (qui montrait `return paginate(...)` sans `await`).
- **Green re-spawn loop-2 + loop-3 ont REFUSÉ d'appliquer le patch CR-5** — discipline signal explicite :
  - UFR-013 (honesty) : refus de mentir sur la posture ESLint projet vérifiable.
  - UFR-020 (zero bypass) : refus d'introduire du code que le linter projet rejette.
  - UFR-018 (check configs before assuming) : grep `eslint.config.mjs` AVANT de modifier toward un état que le project linter rejette.
- **Loop-3 reviewer a vérifié `museum-backend/eslint.config.mjs:350`** : `'@typescript-eslint/return-await': ['error', 'always']`. `return await` EST le pattern project-doctrinal (preserves V8 async stack traces in error paths).
- **Conclusion** : design §2.2 listing diverged from project rule ; le code under review est project-correct. CR-5 withdrawn pour les 4 call sites (`admin.repository.pg.ts:118, 210, 283 + review.repository.pg.ts:63`).
- **Lesson UFR-018** : quand `design.md` et project ESLint config conflict sur un stylistic pattern, le project config est la source de truth. Reviewer should grep `eslint.config.mjs` for any rule governing the cited pattern AVANT de flagger comme CR. Cas d'école pour `feedback_check_configs_before_assuming.md`.

**CR-2 + CR-4 user-deferred (HIGH severity, non-blocking by explicit user authority)** :
- **CR-2 (mock-fixture leak)** : `review-repository.test.ts` 11 lignes modifiées violent spec §R4 en lettre. User defer "review-repository.test.ts est mock fixture non-frozen" — operationally pragmatic (freeze hook protège uniquement les manifest-listed files, pas les mock fixtures pré-existants). Cf. MEMORY `feedback_bundled_red_green_frozen_test_gap.md` qui documente exactement ce gap : bundled red+green mini-cycles défont le frozen-test contract quand un SUT-internal change cascade dans une mock-layer pré-existante. **Reco follow-up** : filer TD-PR8-MOCK-LEAK entry dans `docs/TECH_DEBT.md` pointant à cette MEMORY. Next architect cycle décide si spec §R4 doit drop mock-fixture files de l'enumeration OR si red-test-manifest schema doit grow un `cascading-mock` annex.
- **CR-4 (lib-docs/typeorm content-stale)** : `grep -c 'getManyAndCount' lib-docs/typeorm/PATTERNS.md` retourne 0. mtime 2026-05-20 19:36 — 3 days fresh par UFR-022 staleness window (14j cap), **mais content-stale** pour le pattern S4 convergence (getCount+getMany → getManyAndCount headline behavioral change de cette PR). User defer "lib-docs current par mtime" — mtime-freshness ≠ content-freshness. **Reco follow-up** : bundle 3-entry backfill (`getManyAndCount` semantics + `getCount`+`getMany` 2-round-trip pattern + `skip-vs-offset` clarification) au PR-16 `confidenceUpsert<T>` (next TypeORM-touching PR ; doc-fetcher + doc-curator naturally scheduled).

### Doctrine adherence

- **UFR-013** (honesty, verify-before-claim) ✅ — green re-spawn refused to lie about project ESLint posture (CR-5 BLOCK), reviewer loop-3 honest reclassification "reviewer-error" plutôt que silently rubber-stamp.
- **UFR-016** (clean replace, anti-magic) ✅ — helper REPLACE inline pagination chain, ne wrappe pas. `paginate-skip` marker sur support.repository.pg.ts:71 = discoverable signal (UFR-016 anti-magic doctrine).
- **UFR-018** (check configs before assuming) ✅ — case study majeur de cette PR. Reviewer grep `eslint.config.mjs:350` AVANT de finaliser verdict, withdrew CR-5. Lesson ajoutée pour futurs reviewers.
- **UFR-020** (zero bypass) ✅ — green re-spawn refused d'introduire code que project linter rejette. Pas de `eslint-disable` ajouté, pas de `--no-verify`, pas de hook bypass.
- **UFR-022** (fresh-context 5-phase + frozen-test) ✅ — sha256 des 2 red files match manifest byte-for-byte (`571b43f6cf...` + `371c96c970...`) verified `shasum -a 256`, fresh-context end-to-end (each phase = new Agent invocation, zero memory leak across loops), reviewer rejection loop cap-free déclenché 3× sans pression artificielle de cap.

### Canonical preservation (verified post-sweep)

`grep` `.getManyAndCount(` post-green sur `museum-backend/src/modules/{admin,review}/adapters/secondary/pg/` :
- 0 hits sur les 4 swept sites (sentinel inv 1).
- Support `getRawAndEntities` untouched (S5 documented opt-out).

`PaginatedResult<T>` consumers (OpenAPI 200 contract + FE/web typed shape) : zero diff — helper retourne exactement le même shape `{data, total, page, limit, totalPages}` field-by-field.

Wire-format `total === 0 ? 0 : Math.ceil(total/limit)` ternary : équivalent comportemental à `Math.ceil(total/limit)` pour `limit ≥ 1` (contract), ternary documente l'edge case explicitement.

### Out-of-scope (deferred follow-ups)

- **CR-2 follow-up** : filer TD-PR8-MOCK-LEAK dans `docs/TECH_DEBT.md` pointant `feedback_bundled_red_green_frozen_test_gap.md`. Next architect cycle décide schema evolution spec §R4 ou red-test-manifest.
- **CR-4 follow-up** : bundle 3-entry backfill `lib-docs/typeorm/PATTERNS.md` (`getManyAndCount`/`getCount`+`getMany`/`skip-vs-offset`) au PR-16 `confidenceUpsert<T>` next TypeORM-touching PR.
- **No `paginate` variant for raw-SQL/aggregate queries** (spec §9). Subquery cases (`COUNT(m.id) + getRawAndEntities`) restent inline avec opt-out marker. Helper variant déduplication = refactor distinct, deferred.
- **No barrel `src/shared/pagination/index.ts`** (NFR-4). `cursor-codec.ts` et `offset-paginate.ts` exportent directement leurs symbols ; consommateurs importent via path `@shared/pagination/<file>`. Minimal-barrel policy respectée.



## [Unreleased] — 2026-05-23 — PR-7 `logActorAction` helper + sweep 12 useCases

Run `2026-05-23-pr-7-logActorAction` — seventh incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B9.md` HIGH #2 (12 sites dupliquant inline `actorType:'user'` + `ip ?? null` + `requestId ?? null` autour de `auditService.log(...)`). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **4.71/5** (raw 4.78, -0.07 process haircut pour mechanical first-pass lapse F-1). Pure TypeScript helper extraction + sweep mécanique, wire-format **byte-for-byte identique** (R3 proven structurally par `computeRowHash` payload exclusion). Zéro changement de comportement runtime observable, zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass. Net diff `+152 / -103` (helper +45 LOC + 8 unit + 60 sentinel + 11 test refresh − 12 sweep targets en net negative). Reversibility : `git revert <sha>` restaure les 12 sites + helper (pure code refacto, no migration, no consumer-visible API surface change).

### Added

- **Helper `AuditService.logActorAction(input: LogActorActionInput): Promise<void>`** — `museum-backend/src/shared/audit/audit.service.ts:157-168` (18 LOC code, cap NFR-2 respected). Signature : `LogActorActionInput` (lignes 31-39) **omits `actorType`** au TYPE level → compile-time TS2353 si caller tente `{actorType:'system'}` (AC4 locked par `@ts-expect-error` dans `logActorAction.test.ts:209`). Comportement :
  - Force `actorType` au littéral `'user'` (jamais dérivé de l'input — value proposition du helper).
  - Null-coerce `ip` (`input.ip ?? null`) et `requestId` (`input.requestId ?? null`) au boundary du helper.
  - Pass-through verbatim `action`, `actorId` (required, jamais optionnel — actor-action par définition), `targetType?`, `targetId?`, `metadata?`.
  - Délègue à `this.log(...)` — donc hérite du `BREACH_EVENT_SET` guard (`audit.service.ts:81-88` : si `action.startsWith('breach_')`, redirige vers `auditCriticalSecurityEvent`, ne `repository.insert` PAS).
  - Hérite du repo-error swallow pattern (`logger.error('audit_log_failed', …)` — ne throw jamais).
  - JSDoc concise + référence `{@link AuditService.log}`.

- **Type-only barrel export `LogActorActionInput`** — `museum-backend/src/shared/audit/index.ts:21`. Aucun runtime export nouveau (NFR-7 minimal-barrel respected) — `AuditService` classe déjà exportée, méthode dispo via instance.

- **Unit test `museum-backend/tests/unit/shared/audit/logActorAction.test.ts`** (8 cases, sha256 `0a70685011a6ea3244d3c0be44b0e9566ad87fd9303aeaeb1637142667024cf9`, FROZEN) — exercise helper contract end-to-end :
  1. Forces `actorType:'user'` regardless of caller hint.
  2. Null-coerce `ip` si `undefined`.
  3. Null-coerce `requestId` si `undefined`.
  4. Pass-through `ip` string verbatim.
  5. Pass-through `requestId` string verbatim.
  6. Pass-through `targetType`/`targetId`/`metadata` verbatim.
  7. BREACH guard inherited (`action:'breach_unauthorized_access'` → `repository.insert` NOT called, logger warn fires).
  8. Repo error swallowed (`logActorAction` resolves, ne reject pas).
  + ligne 209 : `@ts-expect-error` + `audit.logActorAction({ ...base, actorType: 'system' } as never)` — locked compile-time exclusion (AC4).

- **Architecture sentinel `museum-backend/tests/unit/architecture/pr7-logActorAction-sentinel.test.ts`** (60 cases via `it.each` × 5 invariants × 12 sites, sha256 `d3f38c6129d63bc845e616adfcd8385cd11b7f22630741ef41e51a5b6c296d89`, FROZEN) — **permanent regression guard**. Tourne dans le `pnpm test` gate existant. Assertions filesystem-based (grep + regex, aucun import runtime des sites swept) :
  1. Absence `actorType:\s*'user'` inline sur chacun des 12 sites.
  2. Absence `ip:\s*input\.ip\s*\?\?\s*null` inline sur chacun des 12 sites.
  3. Absence `requestId:\s*input\.requestId\s*\?\?\s*null` inline sur chacun des 12 sites.
  4. Absence `\b(auditService|this\.audit)\.log\(` audit-call literal sur chacun des 12 sites (regex écarte délibérément les interface declarations).
  5. Présence `.logActorAction(` appel sur chacun des 12 sites.

  **Frozen-test contract** : `red-test-manifest.json` FLAT `{path: sha256}` shape (per `feedback_team_frozen_manifest_flat.md`). sha256 des 2 red files byte-identical pre/post-green via `shasum -a 256`.

### Changed

**Sweep 12 useCases — `auditService.log({actorType:'user', ..., ip: input.ip ?? null, requestId: input.requestId ?? null})` → `auditService.logActorAction({...})`** :

| # | Site                                                                                                  | Variant                                                       |
|---|-------------------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| 1 | `museum-backend/src/modules/admin/useCase/users/suspendUser.useCase.ts`                               | direct `auditService.log`                                     |
| 2 | `museum-backend/src/modules/admin/useCase/users/unsuspendUser.useCase.ts`                             | direct `auditService.log`                                     |
| 3 | `museum-backend/src/modules/admin/useCase/users/changeUserRole.useCase.ts`                            | direct `auditService.log`                                     |
| 4 | `museum-backend/src/modules/admin/useCase/users/changeUserTier.useCase.ts`                            | direct `auditService.log`                                     |
| 5 | `museum-backend/src/modules/admin/useCase/users/deleteUser.useCase.ts`                                | direct `auditService.log`                                     |
| 6 | `museum-backend/src/modules/admin/useCase/reports/resolveReport.useCase.ts`                           | direct `auditService.log`                                     |
| 7 | `museum-backend/src/modules/admin/useCase/export/exportReviews.useCase.ts`                            | DI `ExportAuditService` (widening `logActorAction`)            |
| 8 | `museum-backend/src/modules/admin/useCase/export/exportSupportTickets.useCase.ts`                     | DI `ExportAuditService` (widening `logActorAction`)            |
| 9 | `museum-backend/src/modules/admin/useCase/export/exportChatSessions.useCase.ts`                       | DI `ExportAuditService` (widening `logActorAction`)            |
| 10| `museum-backend/src/modules/support/useCase/ticket-user/createTicket.useCase.ts`                      | direct `auditService.log`                                     |
| 11| `museum-backend/src/modules/support/useCase/ticket-admin/updateTicketStatus.useCase.ts`               | direct `auditService.log`                                     |
| 12| `museum-backend/src/modules/review/useCase/moderation/moderateReview.useCase.ts`                      | DI `Pick<AuditService,'log'>` → `Pick<AuditService,'log'\|'logActorAction'>` widening |

**DI narrowed interfaces widened en lockstep** :
- `ExportAuditService` interface (3 export use cases) : kept `log()` AND added `logActorAction(input: LogActorActionInput): Promise<void>` (design §2.6.1).
- `moderateReview.useCase.ts:32` : `Pick<AuditService, 'log'>` → `Pick<AuditService, 'log' | 'logActorAction'>` (design §2.6.2).

**11 fichiers test refresh** — DI fakes `{ log: jest.fn() }` → `{ log: jest.fn(), logActorAction: jest.fn() }` + assertions retargetées `audit.log` → `audit.logActorAction` (sites swept) :
- `museum-backend/tests/unit/admin/changeUserRole.useCase.test.ts`
- `museum-backend/tests/unit/admin/changeUserTier.useCase.test.ts`
- `museum-backend/tests/unit/admin/user-lifecycle.useCase.test.ts` (suspend/unsuspend/delete)
- `museum-backend/tests/unit/admin/resolveReport.useCase.test.ts`
- `museum-backend/tests/unit/admin/export/exportReviewsTickets.useCase.test.ts`
- `museum-backend/tests/unit/admin/export/exportSessions.useCase.test.ts`
- `museum-backend/tests/unit/support/createTicket.useCase.test.ts`
- `museum-backend/tests/unit/support/updateTicketStatus.useCase.test.ts`
- `museum-backend/tests/unit/support/updateTicketStatus.useCase.mutation.test.ts`
- `museum-backend/tests/unit/review/review.useCase.test.ts` (6/6 sites retargeted including le F-1 patch ligne 348)
- `museum-backend/tests/unit/review/moderateReview.mutants.test.ts`

### Process — BLOCK-TEST-WRONG re-spawn + reviewer rejection loop (UFR-022 textbook)

Le **first green pass** a missed l'assertion `review.useCase.test.ts:348` (`expect(audit.log).toHaveBeenCalledTimes(1)` non-retargeted — 5/6 sites du fichier corrects, ligne 348 oubliée). Mécanique lapse, pas structural defect.

Le **reviewer first-pass** a flaggé **F-1 BLOCKING** (verdict CHANGES_REQUESTED) — l'assertion compile et passe (`audit.log` est toujours `jest.fn()` dans le fake), mais elle teste un appel-fantôme inexistant (la prod call est devenue `auditService.logActorAction(...)`).

**Nuance UFR-022 BLOCK-TEST-WRONG** : le test n'était PAS buggé par construction, il était devenu **stale** après le sweep. Le reviewer a correctement classé F-1 comme BLOCKING et déclenché **fresh green re-spawn** (pas red — car `review.useCase.test.ts` n'est PAS dans `red-test-manifest.json`, c'est un existing test refresh hors scope frozen).

Le **fresh green re-spawn** a appliqué un **patch byte-minimal d'1 ligne** :
- ligne 348 avant : `expect(audit.log).toHaveBeenCalledTimes(1);`
- ligne 348 après : `expect(audit.logActorAction).toHaveBeenCalledTimes(1);`

Net diff F-1 patch : -1 ligne / +1 ligne. Aucun scope drift, aucun collateral edit. Frozen-test contract intact (les 2 red files sha256 byte-identical au manifest).

**Reviewer second pass : APPROVED weightedMean 4.71/5** (raw 4.78, -0.07 process haircut pour le first-pass F-1 lapse).

**Reviewer rejection loop UFR-022 = ILLIMITÉ**, cap-free, fresh re-spawn à la phase pointée — fonctionnement-as-designed. Cap 2 corrective loops applicable UNIQUEMENT aux fails de hooks intra-phase (lint/tsc/test dans la même phase éditeur), JAMAIS aux verdicts reviewer.

### Wire-format proof (SOC2/GDPR audit trail)

R3 (chain hash identity) trivially holds par **inspection structurelle** :
- `museum-backend/src/shared/audit/audit-chain.ts:48-57` `computeRowHash()` payload tuple = `[id, actorId, action, targetType, targetId, metadataJson, createdAt, prevHash]`.
- **NE contient PAS** `actorType`, `ip`, ni `requestId`.
- Forcing `actorType:'user'` literal + null-coercing `undefined → null` sur `ip`/`requestId` au boundary helper sont **provably hash-invariant by construction**.
- `museum-backend/src/data/db/postgres/audit.repository.pg.ts:99,104-105` null-normalise déjà au DB-row boundary (defense-in-depth confirmed — helper-level coercion est redondant mais self-documenting).

`tests/unit/audit/audit-chain.test.ts` green post-sweep → zéro régression chain integrity. Pas de migration DB. Pas d'altération du wire format. Tous les `audit_logs` post-PR-7 ont byte-identical `actorType='user'`/`ip`/`request_id` columns vs pré-PR-7.

### Doctrine adherence

- **UFR-013** (honesty, verify-before-claim) ✅ — wire-format proof structurel cité ligne par ligne (`computeRowHash` payload tuple inspection), AC11 sentinel exhaustif sur 12 sites × 5 invariants = 60 cases, F-1 first-pass lapse documenté ouvertement (pas silent skip), 27 autres `actorType:'user'` literals scope-out documentés en `design.md §3` au lieu d'être enterrés silencieusement.
- **UFR-016** (helper extraction propre, pas `@deprecated` wrapper) ✅ — le helper REPLACE `log()` au site swept, ne wrappe pas. `log()` reste seul point d'entrée pour `system`/`anonymous` actors (R6).
- **UFR-022** (fresh-context 5-phase + frozen-test) ✅ — sha256 des 2 red files match manifest byte-for-byte (`0a706850…` + `d3f38c61…`), fresh-context end-to-end (each phase = new Agent invocation, zero memory leak), libDocsConsulted vide explicitement justifié design §4 (pas de nouvelle dep, pas de surface lib étrangère consultée), reviewer rejection loop cap-free déclenché F-1 → green re-spawn → APPROVED 4.71/5.

### Canonical preservation (verified post-sweep)

`grep` `auditService.log\|this.audit.log` post-green sur `museum-backend/src/modules/{admin,support,review}/useCase/` :
- 0 hits sur les 12 swept sites (AC2 verified).
- Tous les autres callers de `log()` (`audit-ip-anonymizer.job.ts`, breach-event callers, `system`/`anonymous` paths R6) untouched.

`grep` `verifyAuditChain` post-green :
- `museum-backend/src/shared/audit/audit-chain.ts:75` (canonical `verifyAuditChain` returning `AuditChainVerifyResult`) — **untouched**.
- `museum-backend/src/shared/audit/index.ts:24` (barrel re-export canonique) — **untouched**.

API publique `AuditService` post-PR-7 : `log()` (untouched, R6), `logBatch()` (untouched), `auditCriticalSecurityEvent()` (untouched, R6), `+logActorAction()` (new).

### Out-of-scope (deferred follow-ups)

- **27 autres `actorType:'user'` literals repo-wide** (`auth/**`, `museum/**`, `admin-routes/**`) hors des 12 swept sites. Design §3 explicitly defers. Reco reviewer O-3 : filer TECH_DEBT entry ou PR-7b ticket avant closing du run. Sentinel actuel ne couvre QUE les 12 sites enumerated — extension future requise pour catch repo-wide.
- **No `logActorActionBatch` helper** (spec §9). Audit-batch flows restent sur `logBatch()` — pas d'overlap avec les 12 actor-action sites.
- **No `auditCriticalSecurityEvent` refactor** (spec §11 Q3). Breach events ont leur own dual-path Sentry tagging, scope séparé.
- **No `ExportAuditService` dedup across 3 export files** (spec §11 Q4). 3 sites need only one new method on the narrowed interface — dedup est un refactor distinct, deferred.
- **Integration smoke e2e `pnpm test:e2e -- admin/suspendUser`** (spec §8.3) pas exécuté. Wire-format identity structurellement prouvée (R3 via `computeRowHash` payload exclusion) + `audit-chain.test.ts` green → low risk. Reviewer O-2 : reco optionnelle pour belt-and-braces pré-merge.



## [Unreleased] — 2026-05-23 — PR-6 dead code burial (UFR-016)

Run `2026-05-23-pr-6-dead-code-burial` — sixth incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend` (volet burial). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **4.65/5**. Pure deletion PR (UFR-016 "il est mort on l'enterre" — pas de `@deprecated`, pas de comment-out). Net diff `-276 LOC` (4 fichiers supprimés) + `+130 LOC` sentinel architecture test = `-146 LOC net`. Zéro changement de comportement runtime observable, zéro modification du canonique préservé, zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass. Reversibility : `git revert <sha>` restaure les 4 fichiers exactement.

### Removed

- **`museum-backend/src/shared/http/http-cache-headers.ts`** (31 LOC) — middleware `httpCacheHeaders(asset: AssetCacheClass): RequestHandler` jamais wired sur le router prod (audit finding B5, confirmed orphan via `grep -rn 'httpCacheHeaders|http-cache-headers'` zero hits hors du fichier + son test). Le middleware setait `Cache-Control` selon 4 asset classes (`static-immutable` / `index-html` / `openapi-json` / `landing`) — design prématuré pré-Cloudflare. **ADR-024 (HTTP cache headers via Cloudflare) reste ACCEPTED decision-only** ; statut inchangé. Si Cloudflare provisionné post-V1, ré-implémenter `httpCacheHeaders` selon setup réel — la décision architecturale tient toujours, seule l'impl prématurée est enterrée.

- **`museum-backend/tests/unit/helpers/http-cache-headers.test.ts`** (61 LOC) — n'était importateur que du middleware supprimé ci-dessus, plus de raison d'exister.

- **`museum-backend/src/shared/audit/audit-chain-verifier.ts`** (88 LOC) — **shadow duplicate** du canonique `museum-backend/src/shared/audit/audit-chain.ts:75` `verifyAuditChain` (audit finding B8). Le shadow exposait `verifyAuditChain` + `AuditChainVerificationResult` (shape distincte du canonique `AuditChainVerifyResult`) — name-collision risk sur une surface security-critical (audit tamper-evidence). Barrel `museum-backend/src/shared/audit/index.ts:24` re-exporte **uniquement** le canonique (`export { AUDIT_CHAIN_GENESIS_HASH, computeRowHash, verifyAuditChain } from './audit-chain';`) — le shadow n'a jamais été consommé en prod. Tous les 8 consommateurs canoniques (`audit-chain-cli-core.ts:1,22` + barrel + 4 fichiers de test canoniques) sont préservés byte-for-byte. Si besoin futur d'une break-shape enrichie, étendre `AuditChainVerifyResult` proprement, **JAMAIS via fichier shadow**.

- **`museum-backend/tests/unit/shared/audit/audit-chain-verifier.test.ts`** (96 LOC) — n'était importateur que du shadow supprimé ci-dessus.

### Added

- **Architecture sentinel `museum-backend/tests/unit/architecture/pr6-dead-code-burial.test.ts`** (130 LOC, 6 it cases via `describe.each` × 4 `DEAD_FILES` + 2 `FORBIDDEN_IMPORT_SLUGS`) — **permanent regression guard**. Pivot délibéré du bash sentinel proposé au design phase 2 (`tools/sentinels/pr6-dead-code-burial.sh`) vers un Jest architecture test : tourne dans le `pnpm test` gate existant (pas d'invocation séparée), devient guard permanent pour toute future re-introduction des 2 slugs sous `src/`, pas d'étape cleanup post-green. Assertions (toutes grep-based / fs-based, **aucun import runtime des modules morts** — un import recréerait un consommateur) :
  1. `src/shared/http/http-cache-headers.ts` absent (`existsSync` false).
  2. `src/shared/audit/audit-chain-verifier.ts` absent.
  3. `tests/unit/helpers/http-cache-headers.test.ts` absent.
  4. `tests/unit/shared/audit/audit-chain-verifier.test.ts` absent.
  5. `grep -rn` sous `src/` retourne 0 match pour les 2 slugs `http-cache-headers` ET `audit-chain-verifier`.

  **Frozen-test contract** : `red-test-manifest.json` FLAT `{path: sha256}` shape (per `feedback_team_frozen_manifest_flat.md`). sha256 verified byte-identical pre/post-green via `shasum -a 256` :
  - `museum-backend/tests/unit/architecture/pr6-dead-code-burial.test.ts` → `588f3341aff1ae4e7d0d21fc332624dfe7548fd355d2e72540d888ce83974960`

### Scope-out — `isSentryEnabled` (audit finding B7 grep-incomplete)

**Note d'honnêteté UFR-013 pour les futurs cycles d'audit** : l'audit B7 originel listait `isSentryEnabled` (`museum-backend/src/shared/observability/sentry.ts:30`) comme dead code "0 consommateur dans `src/`". L'affirmation est **factuellement correcte pour `src/`** mais **grep-incomplète** — re-grep `tests/**` révèle 6+ consommateurs test légitimes :

- `museum-backend/tests/unit/shared/sentry.test.ts:28,38,54,66,81` — import + assert direct (`expect(isSentryEnabled()).toBe(false)`).
- `museum-backend/tests/unit/shared/sentry-wrapper.test.ts:107,114` — assert post-`initSentry()` (`expect(isSentryEnabled()).toBe(true)`).
- `museum-backend/tests/unit/observability/sentry-capture-exception-with-context.test.ts:63,77` — assert état initialisé.
- `museum-backend/tests/unit/middleware/rate-limit-fail-closed.test.ts:20` — mock du module (`jest.mock('@shared/observability/sentry', () => ({ ..., isSentryEnabled: () => true }))`).
- `museum-backend/tests/unit/auth/password-breach-check.test.ts:29` — idem mock.

`isSentryEnabled()` est un **test-only public observable** légitime : permet d'asserter l'état d'initialisation Sentry post-`initSentry()` sans tester `initialized` (private du module). Pattern bien établi ; supprimer l'export régresserait les 6+ tests sans bénéfice. Le SUT lui-même utilise `initialized` directement (lignes 73, 85, 93, 122, 127) — il N'appelle PAS `isSentryEnabled()`, donc l'export EST purement un accessor externe pour observabilité de tests.

**T1 scope-out** documenté `spec.md §4.1 + §5 + §6 R1` + sentinel header (lignes 26-27) + ce CHANGELOG. **Règle pour les prochains audits** : avant de classer un export "dead", grep `tests/**` ET `src/**` (et idéalement `scripts/**`/`tools/**`). Cas d'école UFR-013 verify-before-claim — toute future re-listing de B7 doit re-grep d'abord et lire ce scope-out.

### Doctrine adherence

- **UFR-016** (burial net, "il est mort on l'enterre") ✅ — 4 deletions clean, pas de `@deprecated` wrapper, pas de commented-out code.
- **UFR-013** (honesty, verify-before-claim) ✅ — T1 scope-out documenté end-to-end après honest re-grep, pas de silent skip. L'audit B7 a été reclassé "grep-incomplete" publiquement plutôt que d'enterrer un export consommé par 6+ tests.
- **UFR-022** (fresh-context 5-phase + frozen-test) ✅ — sha256 sentinel `588f3341…` match manifest byte-for-byte, fresh-context end-to-end, lib-docs consultés (express + node:crypto stdlib).

### Canonical preservation (verified post-burial)

`grep -rn 'verifyAuditChain' museum-backend/src/` post-green :

- `museum-backend/src/shared/audit/audit-chain.ts:75` — canonical `verifyAuditChain` returning `AuditChainVerifyResult` — **untouched**.
- `museum-backend/src/shared/audit/index.ts:24` — barrel re-export du canonique uniquement — **untouched**.
- `museum-backend/src/shared/audit/audit-chain-cli-core.ts:1,22` — consumer via barrel — **untouched**.
- `museum-backend/src/data/db/migrations/1777100000000-AddAuditLogHashChain.ts:33` — doc-comment référençant le canonique — **untouched**.

Tests canoniques (83/83 PASS post-burial) : `tests/unit/audit/audit-chain.test.ts` (~57 specs) + `tests/unit/audit/audit-chain-migration-parity.test.ts` + `tests/unit/shared/audit/audit-chain-cli-core.test.ts` + `tests/unit/admin/audit-breach.test.ts:23,232,288,308`. Sentry regression (T1 scope-out validation runtime) : PASS sur `sentry.test.ts` + `sentry-wrapper.test.ts` + `sentry-capture-exception-with-context.test.ts` — `isSentryEnabled` toujours exporté et fonctionnel.



## [Unreleased] — 2026-05-23 — PR-5 `assertPagination` helper + sweep 7 useCases

Run `2026-05-23-pr-5-assertPagination` — fifth KISS/DRY refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH (volet pagination guard inline). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **5.00/5**. Pure TypeScript refacto interne, wire-format 400 `error.message` **byte-for-byte identique** (`'page must be a positive integer'` + `'limit must be between 1 and 100'` préservés string-pour-string vs legacy inline). Zéro changement de comportement runtime observable côté consommateurs, zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`. Net diff `+59 / -56` sur 8 fichiers source + 2 nouveaux tests red.

### Added

- **Helper `assertPagination(params, opts?)`** — `museum-backend/src/shared/types/pagination.ts:38-53` (+41 LOC append-only au fichier canonique des types pagination déjà colocalisé avec `PaginationParams` + `PaginatedResult<T>` — NFR-3 single-source-of-truth, no new file proliferation). Signature `(params: PaginationParams, opts?: { maxLimit?: number }) => PaginationParams`. Comportement :
  - Throw `badRequest('page must be a positive integer')` si `!Number.isInteger(page) || page < 1` (page-first check ordering — R5).
  - Throw `badRequest(`limit must be between 1 and ${maxLimit}`)` si `!Number.isInteger(limit) || limit < 1 || limit > maxLimit` (default `maxLimit = 100`, template-collapse byte-identique au legacy `'limit must be between 1 and 100'`).
  - Returns fresh literal `{ page, limit }` (pas la ref d'entrée — purity R7, locked par test `'returns a new object'`).
  - Opts-object signature `{ maxLimit?: number }` choisie pour extensibilité future (`minLimit`/`minPage` non-breaking ; R6).
  - Pure function : no I/O, no mutation, no logging. Safe en hot path.
  - JSDoc concise + 3 exemples couvrant les 3 caller flavors (destructure `filters.pagination`, expression-statement, opts override).
  - Defensive `${String(maxLimit)}` (L49) contre `@typescript-eslint/restrict-template-expressions` (NFR-5).
  - Imports `badRequest` from `@shared/errors/app.error` — `app.error.ts` n'importe PAS depuis `@shared/types/*` (cycle risk vérifié zero).

- **Test sentinel `museum-backend/tests/unit/shared/types/assertPagination-sentinel.test.ts`** (121 lignes, 4 it.each cases × 7 site rows = 32 case-rows + 2 global greps) — empêche la régression du pattern inline pagination guard à l'avenir. Couvre par site (7 useCases) : (a) `assertPagination` est référencé dans le fichier, (b) import depuis le module canonique `@shared/types/pagination` (alias ou relatif), (c) absence du pattern inline regex `Number.isInteger(...) || ... < 1`, (d) absence des strings wire-format `'page must be a positive integer'` / `'limit must be between 1 and 100'`. Sentinel global : grep récursif `readdirSync` depuis `src/` racine (exclut `node_modules/dist` par construction, wall ~200ms) → **les 2 wire-format strings DOIVENT apparaître exactement 1 fois, dans le fichier helper UNIQUEMENT** (`.toEqual([HELPER_FILE])` — pas juste `length === 1`, pin la file location exacte). Tout nouveau useCase qui copy-paste l'inline pattern avec wire-format strings → fail CI immédiat sur PR.

- **Test unitaire `museum-backend/tests/unit/shared/types/assertPagination.test.ts`** (195 lignes, 20 it cases groupés en describe) — valide le helper : page invalide x5 (zero, negative, fractional, NaN, Infinity, undefined), limit invalide x6 (zero, negative, fractional, overflow default 100, NaN, undefined), happy path x3 ({1,1}, {1,100}, {999,50} → unchanged), ordering R5 x2 (page-first throw locked), opts.maxLimit override x4 ({1,200,{200}} happy, {1,201,{200}} throws with overridden bound, undefined opts → default 100, opts.maxLimit undefined → default 100 via nullish coalescing), purity x2 ('returns a new object' — fresh literal, pas la ref d'entrée).

  **Frozen-test contract** : `red-test-manifest.json` FLAT `{path: sha256}` shape (per `feedback_team_frozen_manifest_flat.md`). sha256 verified byte-identical pre/post-green via `shasum -a 256` :
  - `museum-backend/tests/unit/shared/types/assertPagination.test.ts` → `4adeddd059b73e5b30803ff45318ee66eddd74a187582ac0a346c31df4589fe7`
  - `museum-backend/tests/unit/shared/types/assertPagination-sentinel.test.ts` → `f6a66aa94fe96f402d23fafe5ffd19f9c095fe5ee586229fc0314015d0862eff`

  Anti-bypass UFR-022 honoré : éditeur green n'a pas self-modifié les tests manifestés (hook `post-edit-green-test-freeze.sh` exit 0). Total tests : 38 (20 helper + 18 sentinel — comptage inclut le `describe` group multiplication). Tests RED (helper absent au HEAD pre-codemod) → 38/38 FAIL ; Tests GREEN (post-codemod) → 38/38 PASS.

### Changed

- **7 useCases migrés sur `assertPagination`** — pattern inline `if (!Number.isInteger(page) || page < 1) { throw badRequest('page must be a positive integer'); } if (!Number.isInteger(limit) || limit < 1 || limit > 100) { throw badRequest('limit must be between 1 and 100'); }` (7 lignes par site) remplacé par 1 ligne d'appel au helper canonique. Deux flavors documentés (cf. `design.md` §2) :

  **Flavor-A — `filters.pagination` whole passed to repo (3 sites admin)** :
  - `museum-backend/src/modules/admin/useCase/users/listUsers.useCase.ts:11` — `ListUsersUseCase.execute` : `const { page, limit } = assertPagination(filters.pagination);` (destructure pour bypass d'un downstream qui n'a pas besoin de réécrire `filters.pagination`).
  - `museum-backend/src/modules/admin/useCase/reports/listReports.useCase.ts:11` — `ListReportsUseCase.execute` : `assertPagination(filters.pagination);` (expression-statement, pas de re-destructure car `filters` passé whole au repo).
  - `museum-backend/src/modules/admin/useCase/audit/listAuditLogs.useCase.ts:14` — `ListAuditLogsUseCase.execute` : `assertPagination(filters.pagination);` (idem).

  **Flavor-B — fresh `filters` object built from `input.page`/`input.limit` (4 sites support+review)** :
  - `museum-backend/src/modules/review/useCase/admin/listAllReviews.useCase.ts:24` — `ListAllReviewsUseCase.execute` : `const { page, limit } = assertPagination({ page: input.page, limit: input.limit });`, puis `pagination: { page, limit }` réutilisé dans `filters`.
  - `museum-backend/src/modules/review/useCase/public/listApprovedReviews.useCase.ts:17` — `ListApprovedReviewsUseCase.execute` : idem.
  - `museum-backend/src/modules/support/useCase/ticket-admin/listAllTickets.useCase.ts:26` — `ListAllTicketsUseCase.execute` : idem.
  - `museum-backend/src/modules/support/useCase/ticket-user/listUserTickets.useCase.ts:26` — `ListUserTicketsUseCase.execute` : idem.

  **Imports `badRequest` audit** : retirés des 4 sites où aucun autre usage résiduel (`listUsers`, `listReports`, `listAuditLogs`, `listApprovedReviews`) ; conservés sur 3 sites où encore utilisés pour des validations non-pagination (`listAllReviews` L24 → `status` enum check via `REVIEW_STATUSES.includes(...)` ; `listAllTickets` L28-32 → `status`+`priority` enum checks via `TICKET_STATUSES`/`TICKET_PRIORITIES.includes(...)` ; `listUserTickets` L28-32 → idem). Imports `assertPagination` ajoutés en tête de chaque fichier en ordre alphabétique (alias `@shared/types/pagination`). Verifier diff par site → useCase signatures unchanged (R12), non-pagination validations préservées byte-for-byte (R13).

  **Wire-format 400 `error.message` byte-for-byte preserved** : helper émet exactement les mêmes 2 strings que le legacy inline (`'page must be a positive integer'` + `'limit must be between 1 and 100'` pour `maxLimit=100` default). Tests existants régression : `pnpm test --testPathPattern='admin/useCase/users/listUsers|admin/useCase/reports/listReports|admin/useCase/audit/listAuditLogs|support/listUserTickets|support/listAllTickets|review/useCase/listAllReviews|review/useCase/listApprovedReviews'` → **50/50 PASS** (5 suites incluant mutation-testing variants) ; `pnpm test --testPathPattern='modules/admin/listUsers|modules/admin/listReports|modules/admin/listAuditLogs'` → **20/20 PASS** (3 suites). Wire-format consumer impact : zéro test snapshot à updater (les tests existants asserting le wire-format passaient déjà ; le helper produit le même string). FE/web consumers : non-breaking (OpenAPI 400 `error.message: string` reste free-form, contract inchangé). Sentry/observability breadcrumbs : aucun changement de payload.

  Net diff par fichier source (post-codemod) : `+8 / -10` (flavor-A destructure), `+5 / -10` (flavor-A expression-statement, 2x), `+3 / -6` (flavor-B destructure, 4x — keep `badRequest` import pour enum checks). Helper file `pagination.ts` : `+41 / 0` (append-only). Total source net `+18 / -56` ; tests +316 lignes (2 nouveaux fichiers).



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
