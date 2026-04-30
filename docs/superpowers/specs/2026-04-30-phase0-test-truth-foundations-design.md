# Phase 0 — Test Truth & Foundations (Design Spec)

- **Status**: Proposed (2026-04-30)
- **Owner**: QA/SDET
- **Scope**: museum-backend, museum-frontend, museum-web
- **Pre-req for**: Phases 1–8 of the banking-grade test transformation
- **Estimated effort**: 1 working week, mostly mechanical

## 1. Problem Statement

The 2026-04-30 audit kicked off with this prompt:

> "30/32 fichiers tests/integration/ utilisent in-memory repos … FE factory adoption ~5% (9/177) … sentinel `expect(true).toBe(true)` … 8 RN snapshots + 1 web snapshot … 1 it.skip in AuthContext.test.tsx:257"

Cross-verification against the actual repo (2026-04-30) reduced or relocated several of these claims:

| Audit claim | Verified reality |
|---|---|
| 30/32 BE integration tests use in-memory repos | **9/32** use in-memory; **2/32** hit real PG; **21/32** are pure-function tests (no persistence layer touched at all) |
| FE factory adoption 5% (9/177) | **2/177** files (`__tests__/**/*.test.{ts,tsx}`) import shared factories |
| Inline `as User` / `as ChatMessage` casts in FE | **0** matches with `)` suffix — cast-pattern is not the dominant anti-pattern; the dominant pattern is direct object construction without any cast |
| `it.skip` in `__tests__/context/AuthContext.test.tsx:257` | Not present at line 257; no `skip` markers in this file at all |
| Maestro flows directory location | `museum-frontend/.maestro/` (not repo root) — 11 flows confirmed |
| BE coverage 87/77/81/87 | Confirmed (`museum-backend/jest.config.ts:65–68`) |
| `describe.skip` in BE tests | 2 occurrences — `tests/unit/security/prompt-injection.test.ts:83` and `tests/unit/chat/chat-message-route.test.ts:89`. Both have explanatory comments justifying the skip. |
| Snapshot files | 2 files — `museum-frontend/__tests__/snapshots/__snapshots__/component-snapshots.test.tsx.snap` and `museum-web/src/__tests__/snapshots/__snapshots__/component-snapshots.test.tsx.snap`. The "8 RN snapshots" count refers to snapshot test cases inside one file, not 8 files. |

The discrepancies matter: every later phase is built on the assumption that "integration test" means a specific thing. Today, 21 tests are misclassified — they live in `tests/integration/` but exercise zero infrastructure. If we charge into Phase 1 (real-PG migration) without first establishing taxonomy, we will either (a) waste effort upgrading pure-function tests to use containers they don't need, or (b) leave them ambiguously categorised and re-audit them in a future phase.

**Phase 0 fixes the foundation before scaling. Nothing more.**

## 2. Goals

1. Adopt an unambiguous test pyramid taxonomy for this repo (ADR-012) so reviewers can answer "is this an integration test?" deterministically.
2. Reclassify the 21 pure-function tests: 8 MOVE to `tests/unit/`, 1 KEEP under `tests/integration/` with rename, 12 stay-in-place but UPGRADE to real PG in Phase 1 (no Phase 0 movement for those — avoids touching them twice).
3. Replace cosmetic tests with real assertions.
4. Add a guardrail (lint or test-time) that prevents new tests from inlining entity creation, forcing factory adoption from now on.
5. Land Phase 0 across **4 commits** so each unit is reviewable and revertible (commit boundary chosen to keep `git mv` history clean and isolate enforcement introduction):
   - Commit A — ADR-012 only (taxonomy decision, doc-only).
   - Commit B — reclassification (8 `git mv` + 1 rename + import-path fixes; mechanical, no assertion change).
   - Commit C — cosmetic purge (ssrf-matrix sentinel → import-graph guard, snapshot review, SSE skip deletion, prompt-injection skip annotation).
   - Commit D — factory adoption guard (custom ESLint rule + CLAUDE.md update; introduces enforcement only after grandfathering current state).

## 3. Non-Goals

- **Migrating the 9 in-memory integration tests to real PG** → Phase 1.
- **Migrating 175 FE files to factories** → Phase 7 (Phase 0 only adds the guard for *new* code).
- **Touching any CI workflow file** → Phase 1 (real-PG hookup) and Phase 4 (mutation testing) handle CI.
- **Coverage threshold uplift** → Phase 8 (sequenced last; gates against bad baselines are worse than no gates).
- **Adding any new feature test** → Phases 2–6 cover the missing flows.

## 4. Test Pyramid Taxonomy (ADR-012 content)

### 4.1 Definitions

| Tier | Lives in | Definition (this repo) | Allowed dependencies |
|---|---|---|---|
| **Unit** | `tests/unit/` (BE), `__tests__/` (FE), `src/__tests__/` (web) | Tests a single function, class, or pure module in isolation. No I/O. No real time, file system, network, or DB. | Pure functions, fakes/stubs of collaborators, in-memory repos *iff the test exercises orchestration logic that needs a repo shape but not real persistence* |
| **Integration** | `tests/integration/` (BE only) | Tests a slice of the system that crosses **at least one infrastructure boundary** — real DB (Postgres testcontainer), real Redis, real S3 (LocalStack), or real LangChain orchestrator with stub LLM client. | Real DB via `tests/helpers/e2e/postgres-testcontainer.ts`, real Redis via container, real BullMQ queues, mock external HTTP only |
| **E2E** | `tests/e2e/` (BE), `museum-frontend/.maestro/` (mobile), `museum-web/e2e/` (web — to be added in Phase 3) | Tests a full user-visible flow across the full stack. HTTP request → DB → response. Mobile: real RN screen + mock backend or staging. Web: real Next.js + real backend or staging. | Full app harness; only the LLM provider is mocked (cost) |
| **Contract** | `tests/contract/` (BE) | Tests OpenAPI spec ↔ runtime traffic agreement. Either Pact-style consumer-driven, or runtime-recorded fixtures replayed against the live spec. | Spec file + recorded request/response fixtures |

### 4.2 Decision rule

> A file lives in `tests/integration/` **iff** it imports either (a) a TypeORM `DataSource` / `getRepository(...)` against a real testcontainer, or (b) `tests/helpers/e2e/postgres-testcontainer.ts` (or its sibling Redis/S3 helpers). If neither is true, the file belongs in `tests/unit/`.

This rule is mechanically checkable. Phase 0 adds a CI guard that fails when a file under `tests/integration/` does not match this signature.

### 4.3 Migration policy for in-memory repos

In-memory repos (`createInMemoryUserRepo`, etc.) remain **legal in `tests/unit/`** because they're a fake/stub for orchestration testing. They become **illegal in `tests/integration/`** because by definition, integration tests cross infra boundaries.

### 4.4 Naming convention

- `*.test.ts` — default; tier inferred from path.
- `*.smoke.test.ts` — opt-in marker for fast-feedback smoke subset (allowed in all tiers; CI may run smoke first).
- `*.e2e.test.ts` — must live in `tests/e2e/`. The current `tests/integration/auth/mfa-flow.e2e.test.ts` and `tests/integration/chat/voice-pipeline.e2e-shape.test.ts` violate this and will be either renamed or moved per the reclassification table.

## 5. Reclassification Table (21 PURE tests)

The 21 files below currently live in `tests/integration/` but use neither real PG nor in-memory repos. Each is classified as either **MOVE** (to `tests/unit/<area>/`), **UPGRADE** (to real PG, defer to Phase 1), or **KEEP** (already justifiably integration despite no DB — typically because they hit an Express app harness that exercises middleware chain).

| File | Decision | Rationale | Target path (if MOVE) |
|---|---|---|---|
| `chat/chat-service-orchestrator-errors.test.ts` | UPGRADE→Phase 1 | exercises ChatService with stubs; should hit real DAL once Phase 1 lands real-PG harness | — |
| `chat/image-exif.test.ts` | MOVE | pure EXIF parsing test, no orchestration | `tests/unit/chat/` |
| `chat/chat-service-pagination.test.ts` | UPGRADE→Phase 1 | exercises pagination through service; needs real DB to be meaningful | — |
| `chat/chat-api.smoke.test.ts` | KEEP | smoke test against running API harness — legitimate integration without DB-touching path | rename: `chat-api.smoke.integration.test.ts` |
| `chat/voice-pipeline.e2e-shape.test.ts` | MOVE | shape-only unit test on voice contract; misnamed `e2e` | `tests/unit/chat/voice-pipeline-shape.test.ts` |
| `chat/chat-service-validation.test.ts` | MOVE | pure input validation logic | `tests/unit/chat/` |
| `chat/langchain-orchestrator.fail-soft.test.ts` | MOVE | LangChain stub-based fail-soft logic; pure orchestration | `tests/unit/chat/` |
| `chat/chat-service-ownership.test.ts` | UPGRADE→Phase 1 | ownership/RBAC requires real persisted state | — |
| `chat/chat-service-ocr-guard.test.ts` | MOVE | pure guard logic on OCR response | `tests/unit/chat/` |
| `chat/feedback-cache-invalidation.test.ts` | UPGRADE→Phase 1 | cache + DB consistency = real Redis + real PG | — |
| `chat/chat-service-audio.test.ts` | MOVE | pure audio handling logic | `tests/unit/chat/` |
| `security/ssrf-matrix.test.ts` | KEEP | exercises real fetch URL guard against matrix of attack vectors. Already integration-like in spirit. Rename for clarity. Sentinel test at line 218 fixed in cosmetic purge. | rename: `tests/integration/security/ssrf-matrix.integration.test.ts` (kept under `integration/` once cosmetic fix lands) |
| `auth/password-reset-flow.test.ts` | UPGRADE→Phase 1 | real flow needs real token persistence | — |
| `admin/audit-breach.test.ts` | UPGRADE→Phase 1 | audit log verification needs real DB | — |
| `routes/cors.test.ts` | MOVE | pure middleware test on Express app harness | `tests/unit/routes/` |
| `routes/museum-enrichment.route.test.ts` | UPGRADE→Phase 1 | route exercises museum repo | — |
| `routes/support.route.test.ts` | UPGRADE→Phase 1 | support tickets need DB | — |
| `routes/daily-art.route.test.ts` | MOVE | static data, no DB | `tests/unit/routes/` |
| `routes/auth.route.test.ts` | UPGRADE→Phase 1 | auth flows need real user repo | — |
| `routes/review.route.test.ts` | UPGRADE→Phase 1 | reviews are persisted | — |
| `routes/museum.route.test.ts` | UPGRADE→Phase 1 | museum directory needs DB | — |

**Net Phase 0 movement: 8 files MOVE to `tests/unit/`, 1 KEEP-with-rename, 12 UPGRADE-deferred-to-Phase-1 (no movement in Phase 0).**

The 12 UPGRADE-deferred files stay where they are during Phase 0; Phase 1 picks them up alongside the 9 already-existing in-memory violators. This avoids touching them twice.

## 6. Cosmetic Test Purge

### 6.1 ssrf-matrix sentinel (line 218)

Current code:

```ts
expect(true).toBe(true);
```

Replace with a real **import-graph guard** that fails if any module under `museum-backend/src/modules/chat/` introduces a direct `fetch(wikidataImageUrl)` without going through `isSafeImageUrl()`:

```ts
it('image enrichment must not fetch Wikidata image URL without SSRF guard', async () => {
  const { promises: fs } = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(__dirname, '../../../src/modules/chat');
  const files = await collectTsFilesRec(root);
  const offenders: string[] = [];
  for (const file of files) {
    const src = await fs.readFile(file, 'utf-8');
    if (
      /\bfetch\s*\(\s*\w*[Ii]mage[Uu]rl/.test(src) &&
      !/isSafeImageUrl|assertSafeImageUrl/.test(src)
    ) {
      offenders.push(path.relative(root, file));
    }
  }
  expect(offenders).toEqual([]);
});
```

This converts a sentinel into a real guard that breaks if a future commit introduces the regression the comment warned about.

### 6.2 Snapshot files

The 2 snapshot files cover decorative React Native and web components. Decision per file:

**Policy adopted (user decision, option B): review each snapshot, convert to role-query / a11y-tree assertion when component has stable semantics, delete when purely decorative.**

- **`museum-frontend/__tests__/snapshots/__snapshots__/component-snapshots.test.tsx.snap`** — open the companion `component-snapshots.test.tsx` test file. For each `it(...)` block: (a) if the component has interactive logic (button, focusable element, role-bearing region), replace `toMatchSnapshot()` with explicit `getByRole` / `getByLabelText` / a11y-tree assertions that pin the structural contract; (b) if the component is purely decorative (icon-only, presentation-only `View`), delete the test case. Once all `it()` blocks are converted or deleted, regenerate the `.snap` file (it will either be empty → delete it, or shrunk → keep with comment header explaining each surviving snapshot's purpose).
- **`museum-web/src/__tests__/snapshots/__snapshots__/component-snapshots.test.tsx.snap`** — same policy. Web counterpart uses Vitest + Testing Library — same role-query approach.

Each surviving snapshot must carry a one-line comment in the test file explaining what specifically would break if the snapshot changed (e.g., `// pins SVG path data — used by a11y screen reader landmarks`). Snapshots without such justification are deleted on sight.

Rationale: snapshot tests on aesthetic UI fail every Tailwind/Framer tweak, train reviewers to `--update-snapshot` reflexively, and then no longer catch real regressions. They are the canonical example of a cosmetic test.

### 6.3 BE security skips

Two `describe.skip` blocks exist:

1. `tests/unit/security/prompt-injection.test.ts:83` — `KNOWN BYPASSES — TODO variant analysis`. Comment explicitly states it's an auditable gap. **Keep skip, but** add a `// @TODO Phase 5: variant analysis` marker and ensure the gap is tracked in the Phase 5 spec.
2. `tests/unit/chat/chat-message-route.test.ts:89` — `POST /api/chat/sessions/:id/messages/stream — SSE streaming (deprecated, see ADR-001)`. SSE deprecated. **Delete the entire `describe.skip` block** — dead code per ADR-001.

## 7. Factory Adoption Guard

Phase 0 does not migrate existing 175 files. It adds an enforcement guard so new tests cannot introduce new violations.

### 7.1 Mechanism — custom ESLint rule (enterprise-grade, no fallback)

User decision (2026-04-30): build the proper ESLint rule. No test-time fallback. Banking-grade enforcement requires AST-aware static analysis, not regex heuristics.

**Package layout:**

Create a workspace-shared rule package `tools/eslint-plugin-musaium-tests/`:

```
tools/eslint-plugin-musaium-tests/
├── package.json              # name: "@musaium/eslint-plugin-tests", private: true
├── lib/
│   ├── index.js              # plugin entry: { rules: { "no-inline-test-entities": ... } }
│   └── rules/
│       └── no-inline-test-entities.js   # the rule implementation
├── tests/
│   └── no-inline-test-entities.test.js  # rule self-tests (RuleTester with valid + invalid cases)
└── README.md
```

The plugin is consumed by all three apps (`museum-backend`, `museum-frontend`, `museum-web`) via local-path workspace install.

**Rule semantics — `@musaium/tests/no-inline-test-entities`:**

Rule fires only when:
1. File path matches a configured test glob (`tests/**/*.test.ts` for BE; `__tests__/**/*.test.{ts,tsx}` for FE/web — configured via rule options).
2. AST detects one of the following patterns for a configured entity name (default list: `User`, `ChatMessage`, `ChatSession`, `Review`, `SupportTicket`, `MuseumTenant`, `Conversation`):
   - **TSAsExpression** with target type matching entity (`{ ... } as User`).
   - **VariableDeclaration** where the declared type annotation matches an entity AND the initializer is an `ObjectExpression` with ≥3 properties.
   - **TSTypeAssertion** (`<User>{ ... }`) targeting an entity.

Detection is type-name based (not full type-checker resolution) — fast, no `parserOptions.project` required, and equivalent for the entities we care about. Rule does NOT fire on factory call sites (`makeUser({...})` overrides remain legal — that's the whole point).

**Rule options (configurable per-app):**

```js
{
  "@musaium/tests/no-inline-test-entities": [
    "error",
    {
      "entities": ["User", "ChatMessage", "ChatSession", "Review", "SupportTicket", "MuseumTenant", "Conversation"],
      "factoryHints": {
        "User": "makeUser() from tests/helpers/auth/user.fixtures.ts",
        "ChatMessage": "makeMessage() from tests/helpers/chat/message.fixtures.ts",
        "ChatSession": "makeSession() from tests/helpers/chat/message.fixtures.ts"
      },
      "testFilePatterns": ["**/*.test.ts", "**/*.test.tsx"]
    }
  ]
}
```

Rule message includes the matching factory hint when available:

> `"Use makeUser() from tests/helpers/auth/user.fixtures.ts instead of inlining a User. See CLAUDE.md → Test Discipline."`

**Self-test coverage:**

`RuleTester` cases must include:
- Valid: `const u = makeUser()` → no fire.
- Valid: `const u = makeUser({ email: 'x@y.z' })` → no fire.
- Valid: `const dto = { id: 1, name: 'x' } as MuseumDirectoryDto` → no fire (not in entity list).
- Invalid: `const u = { id: 1, email: 'x', passwordHash: 'h' } as User` → fires with `"Use makeUser()..."`.
- Invalid: `const u: User = { id: 1, email: 'x', passwordHash: 'h', ... }` → fires.
- Invalid: `<User>{ id: 1, email: 'x', ... }` → fires.

**Grandfathering existing files:**

Existing 175 FE files + N BE files with violations are not auto-fixed by Phase 0. Two options for grandfathering:
- **Option α**: per-file `// eslint-disable-next-line @musaium/tests/no-inline-test-entities -- grandfathered, see Phase 7` markers added by a one-shot codemod. Honest about debt; visible to reviewers.
- **Option β**: `.eslintrc` `overrides[].rules` block with a baseline glob list naming each file. Centralised; doesn't pollute individual files but obscures debt.

User policy is: **no eslint-disable without justification and user validation.** Therefore:
- Option α is **rejected** — adding 175 disable comments contradicts the user policy even with a `--` justification suffix, since the justification is mechanical ("grandfathered") not a real exception case.
- Option β adopted: a single dedicated `.eslintrc.grandfather.json` (committed, referenced from `extends`) lists the baselined files and downgrades the rule to `warn` for them. New files inherit `error`. Phase 7 reduces this list as files are migrated.

When the baseline list shrinks to zero (Phase 7 done), `.eslintrc.grandfather.json` is deleted.

### 7.2 Forbidden in scope

No `eslint-disable` of `@musaium/tests/no-inline-test-entities` is allowed inline anywhere. Per user policy ("no add eslint-disable without justification and validation"), the only legitimate exemption mechanism is the centralised grandfather config. New violations must use a factory.

### 7.3 ESLint disable policy reinforcement

While we're touching ESLint enforcement, codify the user's stated policy in CLAUDE.md as a hard rule:

> **`eslint-disable` requires PR-level user validation.** Any new `eslint-disable` (line, block, or file-level) added to a PR must include a `-- reason: <why>` justification AND must be explicitly called out in the PR description for reviewer approval. Reviewers reject PRs that introduce a disable without justification or without prior agreement on the exception. The justified-disable categories listed in CLAUDE.md remain the only pre-approved exceptions; anything outside those categories needs case-by-case approval.

This is a process change, not a tooling change. The ratchet enforcement (PR description check) lives in the human review loop; if we want machine enforcement later, a `danger.js` rule can flag new disable comments — out of scope for Phase 0.

## 8. CLAUDE.md Update

Add the following section to `CLAUDE.md` under "Test Discipline":

> **Tier classification rule:** A test file lives in `tests/integration/` **iff** it imports `tests/helpers/e2e/postgres-testcontainer.ts` (or sibling Redis/S3 helpers) or instantiates a TypeORM `DataSource` against a real testcontainer. Anything else belongs in `tests/unit/`. See ADR-012.
>
> **Factory enforcement:** A CI guard rejects new test files that inline-construct `User`, `ChatMessage`, `ChatSession`, `Review`, or `SupportTicket` objects. Use the factories in `tests/helpers/<module>/<entity>.fixtures.ts` (BE) or `__tests__/helpers/factories/` (FE).

## 9. Phase 0 Acceptance Criteria

Phase 0 is **done** when ALL of the following hold:

- [ ] `docs/adr/ADR-012-test-pyramid-taxonomy.md` exists, references this spec, lists the tier definitions verbatim from §4.
- [ ] 8 files moved from `tests/integration/` → `tests/unit/` per §5 reclassification table.
- [ ] 1 file kept under `tests/integration/security/` and renamed to `*.integration.test.ts`.
- [ ] `tests/integration/security/ssrf-matrix.integration.test.ts` line 218 sentinel replaced with the real import-graph guard from §6.1, and the new test is **green** on the current codebase (verifies no offenders exist today).
- [ ] 2 snapshot files reviewed: each surviving snapshot is a converted role-query / behaviour assertion with a one-line `// pins X regression` comment; the rest deleted along with their `.snap` companions.
- [ ] `tests/unit/chat/chat-message-route.test.ts:89` `describe.skip` block removed entirely.
- [ ] `tests/unit/security/prompt-injection.test.ts:83` skip annotated with `// @TODO Phase 5: variant analysis`.
- [ ] `tools/eslint-plugin-musaium-tests/` package built per §7.1, exports two rules (`no-inline-test-entities` + grandfather-handling logic) with `RuleTester` self-test cases per §7.1 (≥6 valid + ≥3 invalid).
- [ ] `museum-backend/eslint.config.{js,mjs}` + `museum-frontend/eslint.config.{js,mjs}` register the plugin; `pnpm lint` (or app equivalent) green across all three apps.
- [ ] `.eslintrc.grandfather.json` (or equivalent overrides block) committed listing currently-violating files; rule fires `error` on a synthetic non-grandfathered file added under fixtures and **does not** fire on grandfathered files.
- [ ] CLAUDE.md updated with §8 content (tier classification + factory enforcement) and §7.3 hard rule on ESLint-disable PR validation.
- [ ] Full test suites green: `museum-backend pnpm test`, `museum-frontend npm test`, `museum-web pnpm test`. Test count ≥ session baseline (3406 BE) — moves do not lose tests.
- [ ] `as-any` ratchet remains 0.
- [ ] Phase 0 lands as **4 commits** matching §2.5 (ADR / reclass-mv / cosmetic-purge / eslint-plugin).

## 10. Risks & Open Questions

### Risks

- **Moves break import paths** — Files moved from `tests/integration/chat/` to `tests/unit/chat/` may have `../../helpers/` imports that go stale. Mitigation: run `pnpm test` after each move; fix imports before commit. Parallel agents must `pnpm lint` per file as part of their done-criteria.
- **Snapshot deletion regret** — Deleting a snapshot test that was the only assertion against a regression-prone component. Mitigation: review each snapshot and add a role-query test if the component has any logic worth pinning before deleting.
- **Custom ESLint rule rabbit-hole** — TypeScript-aware AST rules are non-trivial. Mitigation: bound the scope to type-name detection (no full type-checker resolution), reuse `@typescript-eslint/utils` `RuleCreator` + `ESLintUtils.RuleTester` patterns, and timebox the build to one working day. If detection accuracy is insufficient on the first pass, ship the rule with a narrower entity list (start with `User` only) and expand the list in subsequent commits — ratchet outward, never widen the failure surface in one shot.
- **Grandfather list drift** — The `.eslintrc.grandfather.json` could grow if Phase 7 stalls. Mitigation: include a count-and-cap test in CI that fails if the grandfather list grows beyond the Phase-0-baseline length. Phase 7 is allowed to shrink it; nothing else can grow it.

### Resolved decisions (user, 2026-04-30)

- **Q-A → SPLIT**: 4 commits (ADR / reclass / cosmetic / guard). See §2.5.
- **Q-B → option (b)**: review-and-keep-good. See §6.2.
- **Q-C → custom ESLint rule, enterprise-grade**: see §7. No test-time fallback. ESLint disable hard-policy reinforced (§7.3).

No remaining open questions. Plan generation proceeds.
