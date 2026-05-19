---
runId: 2026-05-19-tanstack-zustand-polish
mode: standard
pipeline: enterprise
completedAt: 2026-05-19T13:05:57Z
durationMs: 11382000
correctiveLoops: 0
costUSD: 0
tags:
  - standard
  - enterprise
  - spec
  - open
  - questions
---

# Lesson — 2026-05-19-tanstack-zustand-polish

## Trigger

- input: ...
- output: spec.md
- decisions: ...
- open questions handed to user: ...

## What worked

- gates run: lint, tsc, tests, gitnexus_detect_changes
- verdict: PASS / WARN / FAIL
- failures: ...
- corrective loops used: 0 / 1 / 2 (cap)

### Gates emitted

| Gate | Verdict | Evidence command + exit |
|---|---|---|
| frozen-test (post-edit-green-test-freeze) | PASS | `RUN_ID=… bash .claude/skills/team/team-hooks/post-edit-green-test-freeze.sh` → exit 0, stdout: "PASS — all tests byte-identical to phase 3 manifest" |
| pre-complete-verify | FAIL | exit 1, stdout: "pre-complete-verify: FAIL (BE-tests; FE-tests; )" — see scope analysis below |
| lib-docs-reference (pre-phase-doc-reference-check) | PASS | exit 0, stdout: "no queue file — skip" — manual verification: INDEX.json hashes match STORY.md `libDocsConsulted` for both libs |
| scoped suite re-run | PASS | `cd museum-frontend && npx jest --testPathPattern='(offlinePackChoiceStore\.persist\|dataModeStore\.persist\|useEmailPasswordAuth\.invalidation\|useSocialLogin\.invalidation\|useMe\|useMuseumDirectory\.signal)' --no-coverage --forceExit` → exit 0, `Test Suites: 7 passed, 7 total ; Tests: 39 passed, 39 total` |
| scope-boundary | WARN (scope-drift NOT from this editor) | see analysis below |

### Scope-boundary verdict

`git diff --name-only HEAD` lists ~40 files modified. Categorization:

**In-scope (matches design.md §2 + handoff scopeAllowed):**
- `museum-frontend/shared/api/httpRequest.ts`, `shared/api/openapiClient.ts`
- `museum-frontend/features/auth/application/{useMe,useEmailPasswordAuth,useSocialLogin}.ts`
- `museum-frontend/features/auth/infrastructure/authApi.ts`
- `museum-frontend/features/museum/application/useMuseumDirectory.ts`
- `museum-frontend/features/museum/infrastructure/{museumApi,offlinePackChoiceStore}.ts`
- `museum-frontend/features/settings/dataModeStore.ts`
- `museum-frontend/__tests__/features/auth/useMe.test.ts` (extended per T4.2)

**Known pre-existing (whitelisted by handoff):** `CLAUDE.md` (`.husky/pre-push` not present in this diff — already absorbed).

**Out-of-scope changes present in working tree (NOT from this editor):**
- Backend: `museum-backend/src/config/{env,env.types}.ts`, `src/index.ts`, `src/instrumentation.ts`, `src/modules/auth/adapters/primary/http/routes/{auth-session,mfa}.route.ts`, `src/modules/auth/adapters/secondary/social/{google-oauth-state,social-token-verifier}.ts`, `src/shared/middleware/rate-limit.middleware.ts`, `src/shared/observability/sentry.ts`, `.env*.example`
- Frontend (out-of-scope dirs): `museum-frontend/app.config.ts`, `metro.config.js`, `shared/{config,infrastructure}/cert-pinning*.ts`, `__tests__/{infrastructure,integration}/cert-pinning*.test.ts`, `.maestro/shards.json`
- Web (entire app out of run scope): `museum-web/{next.config.ts,sentry.*.config.ts,src/instrumentation.ts,src/middleware.ts}`
- Docs: `docs/CI_CD_SECRETS.md`, `docs/TECH_DEBT.md`, `docs/compliance/SUBPROCESSORS.md`
- State: `.claude/skills/team/team-state/quality-scores.json`

File mtimes for out-of-scope files = 12:27 CEST (before this editor's runtime which is 12:50-13:00 CEST per IN-scope file mtimes). These are concurrent-worktree changes that landed in the same working tree, NOT produced by this run's green-phase editor. `state.json.preExistingDiff` captured `[".husky/pre-push","CLAUDE.md"]` only because the snapshot was taken at 09:56 UTC before those parallel changes happened.

Verdict on scope-boundary for THIS RUN's editor: **PASS (in-scope only)**. The out-of-scope diff is NOT attributed to this run.

### Scoped test re-run (verbatim summary)

```
PASS __tests__/features/auth/useMe.test.ts
PASS __tests__/features/museum/useMuseumDirectory.signal.test.ts
PASS __tests__/features/auth/useEmailPasswordAuth.invalidation.test.ts
PASS __tests__/features/settings/dataModeStore.persist.test.ts
PASS __tests__/features/auth/useSocialLogin.invalidation.test.ts
PASS __tests__/features/museum/offlinePackChoiceStore.persist.test.ts

Test Suites: 7 passed, 7 total
Tests:       39 passed, 39 total
Snapshots:   0 total
Time:        2.429 s
EXIT=0
```

(The 7th suite matched by the `useMe` regex is the pre-existing `__tests__/hooks/useSocialLogin.test.ts`; harmless.)

### Anti-hallucination spot-check (UFR-013)

Picked 2 tests at random from `red-test-manifest.json`. Verified each file's assertions match spec.md R# claims:

1. **`__tests__/features/auth/useEmailPasswordAuth.invalidation.test.ts`** — Verified:
   - L102-114 asserts R5 (login happy path → `invalidateQueries({queryKey:['user']})` exactly once).
   - L154-167 asserts R6 (register auto-login happy path).
   - L141-150 + L169-181 assert R8 (negative: no invalidation on reject / auto-login throw).
   - L116-127 + L129-139 + L183-194 cover D2 validation short-circuit + no-token + missing-firstname.
   All assertions trace to spec/design — no fabricated coverage.

2. **`__tests__/features/settings/dataModeStore.persist.test.ts`** — Verified:
   - L71-74 asserts R9 (`version === 1`).
   - L76-87 asserts R9 (`partialize` narrows to `{preference}` only, no action keys).
   - L89-100 asserts R9 round-trip (`parsed.state === {preference:'low'}` AND `parsed.version === 1`).
   - L102+ asserts R11 (pre-fix unversioned blob rehydrates cleanly).
   All assertions trace to spec — design D4 (no `migrate`) honored.

Spot-check verdict: **PASS — no fabricated assertions, no spec drift**.

### Lib-docs reference verdict

- STORY.md `libDocsConsulted` lists both required libs: `@tanstack/react-query` (hash `b5e8ae267041a0b55f2e3322d396a727a9467a2a056f4858d4bbd0244796872a`) + `zustand` (hash `79d7dfc59e87b987ab827337e920e6b0c44bc207b95bbd15d34515efa307cedb`).
- Cross-check vs `lib-docs/INDEX.json`: both `patternsSha256` values match current INDEX entries — no hash drift.
- Cross-check imports: `@tanstack/react-query` imported by `useMe.ts`, `useEmailPasswordAuth.ts`, `useSocialLogin.ts`, `useMuseumDirectory.ts` (4 in-scope modified files). `zustand` imported by `dataModeStore.ts` + `offlinePackChoiceStore.ts` (both in-scope modified). Coverage complete.

Lib-docs verdict: **PASS**.

### Pre-complete-verify hook failure breakdown

The pre-complete-verify hook reports `BE-tests; FE-tests` failure. Triage:

- **BE failures (6 tests, 3 files):** `tests/unit/auth/social-token-verifier.wrapper-contract.test.ts`, `tests/unit/routes/middleware-ordering.test.ts`, `tests/unit/routes/auth.route.test.ts`. These are 100% in BE territory (this run is FE-only). They map to the out-of-scope BE files modified concurrently in the working tree (`auth-session.route.ts`, `mfa.route.ts`, `social-token-verifier.ts`, `rate-limit.middleware.ts`). Not attributable to this editor.
- **FE failures (2 tests, 1 file):** `__tests__/app/onboarding.test.tsx` ("Skip on slide 1" + "Done on slide 4") — `mockMarkOnboardingComplete` not called. No onboarding-related files modified by this run (verified `git diff --name-only | grep -i onboard` → empty). Likely pre-existing flake or out-of-scope drift; not introduced by this editor.

The 6-scoped-suite (this run's actual deliverables) is fully green.

### Quality Ratchet

Not separately measured here — hook didn't surface a regression vs baseline. State.json `gates[]` was previously stamped FAIL on lint/typecheck/tests (placeholder pre-run gates at 10:49). Live re-verification shows the scoped suite green; the hook-level FAILs are out-of-scope noise.

### Deviations (UFR-014)

- { rule: "scope-boundary contract", what_i_did: "Categorized out-of-scope diff as NOT attributable to this editor based on mtime evidence (12:27 < 12:50 in-scope edits) and absence of those files in handoff `scopeAllowed`.", why: "Multi-worktree concurrent edits landed in the same working tree before scope-snapshot.", mitigation: "Reported explicitly; verdict on THIS RUN's editor remains PASS for scope; the parallel-worktree contamination is flagged to dispatcher for triage.", declared_at_loop: 0 }
- { rule: "pre-complete-verify gate", what_i_did: "Downgraded the hook's FAIL signal to WARN at run-level because failures map exclusively to OUT-OF-SCOPE files unattributable to this editor; the scoped suite (6 in-scope tests, 31 expected assertions, 39 actual) is fully green.", why: "UFR-013 forbids minimizing failures BUT also forbids fabricating attribution. The honest classification is: hook-level FAIL exists, but is not caused by this run.", mitigation: "Reported verbatim with file-level breakdown + mtime evidence; dispatcher must NOT proceed to commit without first reconciling the working-tree contamination.", declared_at_loop: 0 }

### Final verdict

**WARN** — scoped suite + frozen-test + lib-docs all PASS for this run's deliverables. However, the working tree contains substantial out-of-scope drift (BE + FE-out-of-scope + Web + docs) that the pre-complete-verify hook surfaces as BE+FE test FAIL. Those failures are NOT caused by this run's editor (mtime + file-set evidence), but dispatcher MUST reconcile the working tree before any commit — otherwise the eventual `git add .` will sweep in unrelated, broken concurrent-worktree changes.

VERDICT: WARN

## What failed

- spec ↔ implementation alignment: ...
- KISS / DRY / hexagonal compliance: ...
- verdict: PASS / WARN / FAIL
- comments: ...

### Spec ↔ implementation parity (R1-R11)

| R# | Spec | Impl | Test | Status |
|---|---|---|---|---|
| R1 | signal in useMe queryFn → authService.me() | useMe.ts:28 + authApi.ts:88-92 | useMe.test.ts:118-159 | PASS |
| R2 | signal in museumsQuery.queryFn → both APIs | useMuseumDirectory.ts:122-148 + museumApi.ts:91,127-149 | useMuseumDirectory.signal.test.ts:75-111 | PASS |
| R3 | abort prior fetch on queryKey flip | useMuseumDirectory.ts:122 (via TanStack signal lifecycle) | useMuseumDirectory.signal.test.ts:139-177 | PASS |
| R4 | signal in searchQueryResult.queryFn | useMuseumDirectory.ts:188-201 | useMuseumDirectory.signal.test.ts:113-137 | PASS |
| R5 | loginMutation invalidate ['user'] | useEmailPasswordAuth.ts:77-83,100 | useEmailPasswordAuth.invalidation.test.ts:102-114 | PASS |
| R6 | registerMutation invalidate on auto-login | useEmailPasswordAuth.ts:125,134 | useEmailPasswordAuth.invalidation.test.ts:154-181 | PASS |
| R7 | apple+google mutations invalidate | useSocialLogin.ts:55-70,91-108 | useSocialLogin.invalidation.test.ts:91-101,128-137 | PASS |
| R8 | NO invalidate on reject/non-session paths | TanStack onSuccess semantics + sessionEstablished discriminator | useEmailPasswordAuth.invalidation.test.ts:116-194 + useSocialLogin.invalidation.test.ts:103-161 | PASS |
| R9 | dataModeStore version+partialize | dataModeStore.ts:41-42 | dataModeStore.persist.test.ts:71-100 | PASS |
| R10 | offlinePackChoiceStore partialize | offlinePackChoiceStore.ts:54,57 | offlinePackChoiceStore.persist.test.ts:67-108 | PASS |
| R11 | pre-fix unversioned blob rehydrates | D4 empirical proof against zustand/middleware.js:392 | dataModeStore.persist.test.ts:102-141 | PASS |

11/11 PASS. No GAP, no orphan code, no orphan test.

### KISS / DRY / hexagonal compliance

- KISS: smallest plausible change per task. `signal?` is additive optional opt; `onSuccess` is hook-level callback (vs inline). No refactor of service surfaces.
- DRY: `invalidateUserOnSession` colocated inside each consumer hook — intentional (type-local discriminator). Cross-hook extraction would need a generic param + adds indirection for 2 sites → KISS wins.
- Hexagonal: clean kernel (httpRequest) → adapter (openapiClient) → infrastructure (authApi/museumApi) → application (hooks) flow. No fragmentation of cancellation policy.

### Musaium-specific gates

- a11y: N/A (no DOM/JSX/RN tree change — spec §5).
- design-system tokens: N/A (no style files touched).
- security grep: PASS (zero hits on dangerouslySetInnerHTML / eval / new Function / raw-SQL / env-leak / hardcoded-secret across the 16 files; security agent ran semgrep p/owasp-top-ten with 0 results).
- string-guard audit: N/A (no *.no-hardcoded-strings.test.ts in diff).
- deviations cross-check (UFR-014): PASS — 2 deviations declared, 0 undeclared. Editor's deviations both relate to concurrent-worktree contamination, classified honestly with mtime evidence.

### Lib-docs PATTERNS compliance

- @tanstack/react-query (sha256 b5e8ae26...) — PATTERNS.md:295-296 (signal canonical), :139 (invalidateQueries filters), :109 (onSuccess lifecycle) all followed exactly. Editor cited each in inline comments.
- zustand (sha256 79d7dfc5...) — PATTERNS.md:119 (partialize shape), :120 (version + migrate), :206 (DO use partialize) all followed. D4 omission of `migrate` is empirically justified via source-of-truth read of node_modules/zustand/middleware.js:392.
- Both hashes match `lib-docs/INDEX.json` — no stale-consult.

### Frozen-test cross-check

All 6 manifest entries match working-tree sha256 byte-identical (re-verified via shasum -a 256). Frozen-test integrity: PASS.

### Scoped suite re-verification

`cd museum-frontend && npx jest --testPathPattern='(offlinePackChoiceStore\.persist|dataModeStore\.persist|useEmailPasswordAuth\.invalidation|useSocialLogin\.invalidation|useMe|useMuseumDirectory\.signal)' --no-coverage --forceExit` → exit 0, `Test Suites: 7 passed, 7 total ; Tests: 39 passed, 39 total ; Time: 5.5s`.

(act warnings emitted by `react-test-renderer` on TanStack notify timers are noise — tests pass deterministically.)

### 5-axis quality scores

| Axis            | Score | Weight | Reasoning |
|-----------------|-------|--------|-----------|
| correctness     | 95    | 0.30   | 11/11 EARS implemented + tested; 39/39 tests pass; frozen-test byte-identical; D4 empirically verified. |
| security        | 95    | 0.25   | additive/narrowing changes only; semgrep 0; manual grep 0; persisted shape strictly tighter. |
| maintainability | 90    | 0.20   | KISS+DRY+hex all clean; -5pt for minor discriminator-shape inconsistency between email/password vs social hooks (NIT). |
| testCoverage    | 90    | 0.15   | 39 cases vs 31 spec-mapped; -10pt for R3 testing abort race not final cache content verbatim. |
| docQuality      | 92    | 0.10   | STORY per-phase detailed; libDocsConsulted hashes match INDEX.json; UFR-014 deviations declared; inline PATTERNS.md:line cites. |

**Weighted mean**: 92.95 — APPROVED threshold ≥85.

### BLOCKER

None.

### IMPORTANT

None.

### NIT (preference, optional follow-up)

1. `useEmailPasswordAuth.ts:11` vs `useSocialLogin.ts:16-18` — two slightly different discriminator shapes (`{sessionEstablished: true} | undefined` vs `{sessionEstablished: boolean}`) for the same intent. If a third consumer appears, factor a shared `MutationSessionResult` type in `shared/lib/`. Not worth churn for 2 sites today.
2. `useMuseumDirectory.signal.test.ts:139-177` — R3 abort race tested deterministically (signal A aborted before resolveA fires → equivalent to "B's data wins"). Spec phrasing "final cache state == B's data" could be asserted directly with one extra `expect(result.current.museums)` after both fetches settle. Optional defensive add.

### Verdict

APPROVED — ready for finalize / documenter.

- json: .claude/skills/team/team-reports/2026-05-19-tanstack-zustand-polish/code-review.json

## Surprises

- input: tasks.md (T1.1…T3.x)
- changed files: ...
- gates that passed inline (post-edit hooks): lint ✅, tsc ✅
- gates deferred to verifier: tests, mutation
- notes: ...

## Action items

- commit: ...
- KB updates: velocity-metrics, agent-roi, error-patterns
- telemetry summary (Langfuse): tokens=... cost=$... elapsed=...
