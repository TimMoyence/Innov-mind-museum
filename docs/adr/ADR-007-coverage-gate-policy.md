# ADR-007 — Coverage gate CI policy

- **Status**: Accepted — Implemented (proposed 2026-04-21, shipped Phase 8 2026-05-04, pre-commit gate + CI hard-fail wired)
- **Owner**: Platform / CI
- **Scope**: museum-backend, museum-frontend, museum-web

## Context

The 2026-04-20 audit flagged "coverage non-measured" across the three apps. Cross-verification (Pass 0 / Explore agent) corrected this:

| App | `coverage` config | CI behaviour |
|---|---|---|
| museum-backend | `jest.config.ts` declares `coverageThreshold` = 88 / 74 / 86 / 89 (stmt/br/fn/ln) — **enforced** | `pnpm test -- --coverage` runs; CI gate hard-fails on miss |
| museum-frontend | `jest.config.js` declares `coverageThreshold` = 91 / 78 / 80 / 91 — **enforced** | `npm run test:coverage` — CI gate hard-fails on miss |
| museum-web | `vitest.config.ts` — `coverage.thresholds` = lines: 70 / branches: 54 / functions: 64 / statements: 68 | CI gate wired |

Net result today: thresholds exist but no merge is blocked on coverage. The audit's "coverage is marketing" critique holds at the CI gate level even though per-app configs are mostly sane.

## Decision

Adopt a three-app coverage gate with staged rollout:

1. **museum-backend** — `.github/workflows/ci-cd-backend.yml` quality-gate step runs `pnpm test -- --coverage --runInBand`. Jest's built-in threshold enforcement propagates a non-zero exit code; CI step fails the pipeline.
2. **museum-frontend** — `.github/workflows/ci-cd-mobile.yml` quality-gate step runs `npm run test:coverage` (which maps to `jest --coverage`). Thresholds already in `jest.config.js`; step fails on miss.
3. **museum-web** — add `test.coverage` block to `vitest.config.ts` with initial thresholds **lines: 70 / branches: 60 / functions: 70 / statements: 70**. Rationale: web admin panel currently has 0 tests on auth/refresh; thresholds start achievable and ratchet up bloc-by-bloc.
4. **Ratchet rule** — `.claude/quality-ratchet.json` records current coverage; any PR that reduces coverage without an accompanying ADR explanation is blocked. The ratchet is updated only by merging commits that raise the bar; never lower it silently.
5. **Reporting** — Codecov (or equivalent) artifact upload is out of scope for this ADR; gates run locally in CI.

## Rejected alternatives

- **Keep the existing "defined but not enforced" thresholds** — rejected: they provide false assurance. The audit's core complaint stands until CI enforces.
- **Uniform threshold across all 3 apps** — rejected: apps have different maturity and risk profiles. Backend is the production brain (88 %), web admin is nascent (70 %), mobile is mid-term (86 %).
- **Coverage-per-file gates** (not just global) — rejected for initial rollout: too noisy and blocks unrelated PRs. May be added in a follow-up once per-app baselines stabilise.

## Consequences

### Positive
- Every PR observes a coverage delta; regressions are caught at merge.
- Thresholds are **visible** — currently they exist but are invisible to reviewers because CI never prints them.
- Historical ratchet via `.claude/quality-ratchet.json` creates a durable downward-pressure trail on coverage erosion.

### Negative
- Existing PRs that drift coverage (e.g., adding untested code paths) will be rejected until tests accompany the change. Short-term friction; long-term discipline.
- museum-web is currently at ~0 % on admin routes — the ADR's 70 % target requires ~10 new tests per admin area before the gate goes green. Tracked as [Bloc C5].

## Follow-ups

- [Bloc C1] ticket — CI workflow edits + vitest.config.ts addition.
- [Bloc C5] ticket — 10 web admin tests to bring museum-web over the 70 % floor before the CI gate is enabled on `push`.
- Monthly review — raise thresholds by 2–3 pts per app per quarter until converging on 90 % / 85 % / 80 % / 90 %.
