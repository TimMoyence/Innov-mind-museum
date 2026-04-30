# ADR-012 — Test Pyramid Taxonomy

- **Status**: Accepted (2026-04-30)
- **Owner**: QA/SDET
- **Scope**: museum-backend, museum-frontend, museum-web
- **Spec**: `docs/superpowers/specs/2026-04-30-phase0-test-truth-foundations-design.md`

## Context

The 2026-04-30 banking-grade audit revealed that 21 of 32 files in `museum-backend/tests/integration/` exercise no infrastructure boundary at all. They live in `tests/integration/` purely by historical convention. Without a deterministic rule for tier classification, every later phase of the test transformation (real-PG migration, mutation testing on hot files, mobile e2e on PR) inherits this ambiguity. ADR-012 fixes the foundation.

## Decision

Adopt the following four-tier taxonomy across the three apps. Tier membership is determined by file path AND by a mechanically-checkable import signature.

### Definitions

| Tier | Lives in | Definition (this repo) | Allowed dependencies |
|---|---|---|---|
| **Unit** | `tests/unit/` (BE), `__tests__/` (FE), `src/__tests__/` (web) | Tests a single function, class, or pure module in isolation. No I/O. No real time, file system, network, or DB. | Pure functions, fakes/stubs of collaborators, in-memory repos *iff the test exercises orchestration logic that needs a repo shape but not real persistence* |
| **Integration** | `tests/integration/` (BE only) | Tests a slice of the system that crosses **at least one infrastructure boundary** — real DB (Postgres testcontainer), real Redis, real S3 (LocalStack), or real LangChain orchestrator with stub LLM client. | Real DB via `tests/helpers/e2e/postgres-testcontainer.ts`, real Redis via container, real BullMQ queues, mock external HTTP only |
| **E2E** | `tests/e2e/` (BE), `museum-frontend/.maestro/` (mobile), `museum-web/e2e/` (web — to be created in Phase 3) | Tests a full user-visible flow across the full stack. HTTP request → DB → response. Mobile: real RN screen + mock backend or staging. Web: real Next.js + real backend or staging. | Full app harness; only the LLM provider is mocked (cost) |
| **Contract** | `tests/contract/` (BE) | Tests OpenAPI spec ↔ runtime traffic agreement. Either Pact-style consumer-driven, or runtime-recorded fixtures replayed against the live spec. | Spec file + recorded request/response fixtures |

### Decision rule (mechanically checkable)

> A file lives in `tests/integration/` **iff** it satisfies at least one of: (a) imports a TypeORM `DataSource` / `getRepository(...)` against a real testcontainer, (b) imports `tests/helpers/e2e/postgres-testcontainer.ts` (or its sibling Redis / S3 helpers), or (c) issues a real outbound network request (`fetch` / `axios` / `got` / `node:http(s)`) against a non-stub URL — i.e., crosses any infrastructure boundary, not just the DB. If none of those hold, the file belongs in `tests/unit/`.

### In-memory repo policy

In-memory repos (`createInMemoryUserRepo`, etc.) remain legal in `tests/unit/` (legitimate fakes for orchestration testing). They become illegal in `tests/integration/` (which by definition must cross infra boundaries).

### Naming convention

- `*.test.ts` — default; tier inferred from path.
- `*.smoke.test.ts` — opt-in marker for fast-feedback smoke subset (allowed in all tiers).
- `*.e2e.test.ts` — must live in `tests/e2e/`.
- `*.integration.test.ts` — opt-in clarity marker inside `tests/integration/`.

## Rejected alternatives

- **Tier-per-folder convention without import signature** — rejected: gives reviewers no objective way to settle tier disputes. Two reasonable people will classify the same file differently.
- **Single "tests" folder, tier inferred only from imports** — rejected: hurts grep ergonomics; CI shard splits depend on path-based filters.
- **Three-tier model (unit / integration / e2e), no contract tier** — rejected: contract testing is a Phase-3 deliverable with distinct semantics (spec-truth, not behaviour-truth). Carving it out now avoids reclassifying again later.

## Consequences

### Positive
- Phase 1 (real-PG migration) has a deterministic decision rule — no per-file debate.
- Reviewers can answer "is this an integration test?" by reading imports, not by intuition.
- The taxonomy enables a CI guard: any file under `tests/integration/` that does not match the signature can be auto-flagged. (Implemented as part of Phase 0 if effort allows; otherwise Phase 1.)

### Negative
- 8 existing files require `git mv` to comply with the taxonomy on day one. Mitigation: one atomic commit dedicated to the move (Phase 0 Commit B).
- 1 existing file (`tests/integration/security/ssrf-matrix.test.ts`) sits in a grey zone — exercises real `fetch` but no DB. Decision: keep under `tests/integration/` because it crosses the network boundary; rename to `*.integration.test.ts` for clarity.
- Until Phase 1 lands the CI tier-signature guard, the rule is grep-able for reviewers but not self-enforcing for authors. A new test author who forgets to import the testcontainer helper can silently land a real-DB test under `tests/unit/` (or omit the integration suffix). Mitigation: Phase 0 Commit D's ESLint plugin focuses on factory adoption, not tier classification — the tier-classification CI guard is explicitly tracked as a Phase 1 follow-up.

## Follow-ups

- Phase 0 Commit B — `git mv` 8 files, rename 1 file.
- Phase 0 Commit D — ESLint plugin enforces factory adoption (related discipline).
- Phase 1 — UPGRADE 12 deferred files to real-PG; install path-signature CI guard.
- Phase 7 — FE factory migration (175 files).
