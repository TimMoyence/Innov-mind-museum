# ADR-033 — zod status quo + post-launch unification plan

- **Status** : Accepted (2026-05-05, consolidated 2026-05-12 — supersedes the split ADR-033 / ADR-034)
- **Owner** : backend
- **Supersedes** : (consolidates the original ADR-033 status-quo note and ADR-034 defer plan into a single decision)
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

### Part A — Status quo through V1 launch

The 3 apps stay where they are:

- `museum-backend`: zod `^3.25.76` (production-stable).
- `museum-frontend`: zod `^4.4.1` (one-call-site, low risk on bumps).
- `museum-web`: no zod (do not introduce — current form-validation strategy is sufficient).

**Re-evaluation deadline: 2026-Q4** (post-launch, ≥ 4 months after 1 June 2026 GA, allowing the zod 4 ecosystem — `@hookform/resolvers`, `drizzle-zod` pattern alignments, `openapi-typescript` zod-schema emitter — to settle).

**No shared `tools/schemas/` workspace package will be introduced before that re-evaluation.** Cross-app contracts continue to flow through OpenAPI.

### Part B — Why defer the BE 3→4 migration specifically

Surface area is non-trivial: `grep -rn "from 'zod'"` returns 25 sites in `museum-backend/src/`. Zod schemas span:

- HTTP request/response contracts: chat, auth, support, review, admin, museum, daily-art (`adapters/primary/http/*.contracts.ts`).
- Persistence layer: `shared/db/jsonb-validator.ts` runs `schema.safeParse()` on every JSONB write across 6 entities — a regression here corrupts PG rows on save.
- Pagination: `shared/pagination/cursor-codec.ts` decodes user-facing cursors via `safeParse` — a regression breaks pagination invariants.
- Config: env validators rely on zod-style narrowing in `config/env*.ts`.

Known zod 4 breaking changes affecting our codebase:

1. **`ZodError` issue shape changed** — `path` element type, `code` enum, and `message` defaults shifted. Our error-mapping middleware `helpers/middleware/error.middleware.ts` expects the v3 shape; quiet drift would surface as 500s rather than 400s on validation failures.
2. **Default error message format** translates differently for several `z.string()` checks. Localized refusal layer (`art-topic-guardrail.ts`) and i18n surface consume these defaults indirectly.
3. **`.refine()` / `.superRefine()` API** — argument shape and inference changed. Not used directly (grep clean), but transitive deps (langchain, langfuse) might.
4. **`z.string().nonempty()` removed** — replaced by `.min(1)`. Verified clean.
5. **`safeParse()` return shape preserved**, but the `error` field wraps issues differently. `cursor-codec.ts` and `jsonb-validator.ts` parse this heuristically — both worth re-reading under v4 rather than trusting silently.
6. **Inferred type `z.infer<>` width** — sometimes narrower in v4; can break consumers that depended on the wider v3 inference.

No security-driven force factor: zod 3.x is not EOL, no published CVE against `^3.25.76` (verified via `pnpm audit`). Bump is correctness/ergonomics-driven.

## Concrete migration plan (when re-opened post-launch)

Phase 1 — instrumentation (½ day)
- Snapshot every active zod schema's behavior via property-based tests (fast-check is already a dev dep). Lock in the v3 shape.

Phase 2 — bump (½ day)
- `pnpm add zod@^4` in `museum-backend` only (frontend + web not in scope).
- Run `pnpm tsc --noEmit` — fix every type error in place.

Phase 3 — runtime audit (1 day)
- Run the full Jest suite under v4. Triage every failure.
- Re-read `error.middleware.ts` against the new `ZodError` shape — update the issue → HTTP 400 mapper if the shape shifted.
- Re-read `cursor-codec.ts` and `jsonb-validator.ts` — confirm `safeParse` result handling is forward-compatible.

Phase 4 — observability (½ day)
- Deploy to prod (no staging until B2B revenue per [project memory](../../README.md)). Watch the validation-error histogram for 24h via Grafana for any silent shape drift.

Phase 5 — bake
- 48h error-budget watch. Rollback = `git revert` + redeploy if regression.

## Re-evaluation gates (2026-Q4 checklist)

Re-open in the next sprint that meets ALL of:

1. V1 launch is shipped and stable (≥7 days post-2026-06-01 with no rollback).
2. Other backend hardening landings have produced at least one full nightly cycle (audit-chain verify, mutation testing) with green status.
3. Post-launch backlog is otherwise quiet (no security-blocker, no incident response).
4. **Ecosystem ready** — `@hookform/resolvers/zod` ≥ supports zod 4 stable; `openapi-typescript` zod-emitter (if introduced) supports zod 4.
5. **No regression risk** — Stryker hot-files config still passes mutation kill ratio ≥ 80% on `llm-judge-guardrail.ts` + `sanitizePromptInput.ts` after a dry-run BE migration on a feature branch.

## Trigger conditions for early re-opening (any one is sufficient)

1. A security advisory is published against `zod ^3.25.76` that affects our usage pattern.
2. A bug in our codebase is traced to a v3 issue that is fixed in v4.
3. A transitive dependency (langchain, langfuse, etc.) drops v3 support — would manifest as a deduped resolution warning at install.

## References

- `museum-backend/package.json` line `zod: ^3.25.76`
- `museum-frontend/package.json` line `zod: ^4.4.1` + `museum-frontend/app/auth.tsx` (sole import)
- `museum-web/src/**` — `grep -rln 'zod'` returns 0
- `museum-backend/.stryker-hot-files.json` — banking-grade hot files include zod-touching code paths
- `docs/_archive/sprints/SPRINT_RECAP_2026-04-30_TO_2026-05-05.md` (sprint context)
- `docs/ROADMAP_PRODUCT.md` LATER section (no shared-contracts package planned pre-launch)
