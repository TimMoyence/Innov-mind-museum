# ADR-033 — zod 3 (BE) / 4 (FE) status-quo + post-launch unification plan

- **Status** : Accepted (2026-05-05)
- **Ticket** : SPRINT_2026-05-05_PLAN.md task D / web-version-harmonize-roadmap-2026-05-05
- **Supersedes** : N/A
- **Amends** : N/A

## Context

The 3 monorepo apps had diverged on zod major:

| App | Pin | First-party usage |
|---|---|---|
| `museum-backend` | `^3.25.76` | ~25 import sites: HTTP schemas (chat / auth / admin), JSONB validators, prompt-input sanitizer, langchain orchestrator support, llm-judge guardrail. Production-critical. |
| `museum-frontend` | `^4.4.1` | 1 import site: `museum-frontend/app/auth.tsx` — `z.object` schema for the login form, consumed via `zodResolver` of `@hookform/resolvers/zod`. |
| `museum-web` | (none) | 0 import sites. Forms use native HTML validation + React state. |

There is **no cross-app shared zod schema**. The FE/Web consume the BE contract via OpenAPI codegen (`openapi-typescript` → `museum-frontend/shared/api/generated/openapi.ts`, idem `museum-web/src/lib/api/generated/openapi.ts`), not by importing a zod runtime defined in BE.

zod 4 (early 2026) is a major release with several breaking changes vs 3:

- `z.string().email()` becomes `z.email()` (top-level validators).
- `z.string().datetime()` parses to `Date` not `string` (changed default behavior on `coerce`).
- Stricter `safeParse` error tree shape (formerly `error.issues`, now `error.tree`).
- `.transform()` chaining order tightened.

Migrating BE to zod 4 means rewriting / re-testing ~25 import sites, including production HTTP schemas and the LLM judge guardrail (banking-grade hot file per Phase 4 Stryker config). Cost is non-trivial (estimated ≥ 1 dev day of editing + verification, plus risk of regression in Stryker mutation kill ratio enforcement).

The cost of the status-quo split:

1. **Maintenance cognitive load** — engineers context-switching between BE and FE may forget which zod major is in scope. Mitigation: each app's `package.json` is the single source of truth, no shared runtime.
2. **No shared schema package** is currently planned, so the runtime split is invisible at the boundary (OpenAPI is the contract).
3. **Renovate noise** — separate update PRs per app. Acceptable.

## Decision

**Status quo documented**. The 3 apps stay where they are:

- `museum-backend`: zod `^3.25.76` (production-stable).
- `museum-frontend`: zod `^4.4.1` (one-call-site, low risk on bumps).
- `museum-web`: no zod (do not introduce — current form-validation strategy is sufficient).

**Re-evaluation deadline: 2026-Q4** (post-launch, ≥ 4 months after 1 June 2026 GA, allowing the zod 4 ecosystem — `@hookform/resolvers`, `drizzle-zod` pattern alignments, `openapi-typescript` zod-schema emitter — to settle).

**No shared `tools/schemas/` workspace package will be introduced before that re-evaluation.** Cross-app contracts continue to flow through OpenAPI.

## Consequences

**Positives** :

- Zero refactor cost incurred during the 2026-05-05 → 2026-05-19 P1 closure window. Banking-grade hot files (chat / auth schemas, llm-judge guardrail) stay untouched.
- BE keeps a long-running stable major (zod 3) for the launch.
- FE keeps a recent major (zod 4) on a low-blast-radius surface (single login form schema).

**Négatives / risques** :

- Future engineer encountering "why two majors?" must read this ADR. Mitigation: this ADR is the answer.
- If a bug emerges in the FE login form due to zod 4 behavior delta, the fix is local to one file. Mitigation: FE login form covered by Maestro + Vitest.
- If we later decide to ship a `@musaium/contracts` package exporting zod schemas across BE/FE, that work blocks on unification. Mitigation: such a package is not on NOW or NEXT in `ROADMAP_PRODUCT.md` — would be a `LATER` decision driven by use case.

## Verification protocol (re-evaluation 2026-Q4 checklist)

When the re-evaluation date arrives, verify **all 4** are true before opening the migration:

1. **Ecosystem ready** — `@hookform/resolvers/zod` ≥ supports zod 4 stable; `openapi-typescript` zod-emitter (if introduced) supports zod 4.
2. **No regression risk** — Stryker hot-files config still passes mutation kill ratio ≥ 80% on `llm-judge-guardrail.ts` + `sanitizePromptInput.ts` after a dry-run BE migration on a feature branch.
3. **Migration plan** — a `chore/zod-4-monorepo` branch pre-runs `pnpm test` on both BE and FE post-bump locally; Maestro + Playwright + Lighthouse smoke green.
4. **Single coordinated PR** — BE bump + FE confirmation + Web `package.json` (still no zod, just for completeness) merge as one ADR-superseding change.

If any of those is false, defer once more (add a 6-month pushback note in the next ADR).

## References

- `museum-backend/package.json` line `zod: ^3.25.76` (re-verified 2026-05-05)
- `museum-frontend/package.json` line `zod: ^4.4.1` + `museum-frontend/app/auth.tsx:8` (sole import)
- `museum-web/src/**` — `grep -rln 'zod'` returns 0 (verified 2026-05-05)
- `museum-backend/.stryker-hot-files.json` — banking-grade hot files include zod-touching code paths
- `docs/SPRINT_2026-05-05_PLAN.md` task D
- `docs/ROADMAP_PRODUCT.md` LATER section (no shared-contracts package planned pre-launch)
