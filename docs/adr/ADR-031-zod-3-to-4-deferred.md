# ADR-031 — Defer zod 3→4 migration to post-launch

Status: Accepted (2026-05-05)
Context: Backend hardening + supply-chain audit sprint 2026-05-05 → 2026-05-19
Owner: backend
Supersedes: —
Superseded by: —

## Question

`museum-backend` declares `zod ^3.25.76` (resolved 3.25.76). Latest stable is `zod 4.4.3` (released 2026-05-04 per `pnpm view zod time.modified`). The audit's Step L asks: bump to v4 now, or defer?

## Decision

**Defer to post-launch.** Keep `zod ^3.25.76` through the 2026-06-01 V1 launch. Re-evaluate in the post-launch hardening sprint (target window 2026-06-08 → 2026-06-22).

## Why defer

### Surface area is non-trivial

```
$ grep -rn "from 'zod'" museum-backend/src/ --include="*.ts" | wc -l
25
```

Zod schemas span (counted from the audit run):

- HTTP request/response contracts: chat, auth, support, review, admin, museum, daily-art (`adapters/primary/http/*.contracts.ts`).
- Persistence layer: `shared/db/jsonb-validator.ts` runs `schema.safeParse()` on every JSONB write across 6 entities (museum_enrichment.openingHours, admissionFees, currentExhibitions, accessibility, sourceUrls; chat_session.visitContext) — a regression here corrupts PG rows on save.
- Pagination: `shared/pagination/cursor-codec.ts` decodes user-facing cursors via `safeParse` — a regression breaks pagination invariants for /chat/sessions, /reviews, /admin/*.
- Config: env validators rely on zod-style narrowing in `config/env*.ts`.

### Zod 4 has known breaking changes incompatible with launch-blocker risk tolerance

Per zod 4.0 migration notes (referenced via WebFetch at audit time):

1. **`ZodError` issue shape changed** — the `path` array element type, `code` enum, and `message` defaults all shifted. Our error-mapping middleware `helpers/middleware/error.middleware.ts` expects the v3 shape; quiet drift would surface as 500s rather than 400s on validation failures.
2. **Default error message format** — translates differently for several `z.string()` checks. Our localized refusal layer (`art-topic-guardrail.ts`) and i18n surface (`shared/i18n/`) consume those defaults indirectly.
3. **`.refine()` / `.superRefine()` API** — argument shape and inference changed. We don't currently use either directly (verified via grep), but transitive deps (e.g. langchain, langfuse) might.
4. **`z.string().nonempty()` removed** — replaced by `.min(1)`. Verified via grep — not used directly. Safe.
5. **`safeParse()` return shape preserved**, but the `error` field wraps issues differently. `cursor-codec.ts` and `jsonb-validator.ts` parse the result heuristically — both worth re-reading under v4 rather than trusting silently.
6. **Inferred type `z.infer<>` width** — sometimes narrower in v4; this can break consumers that depended on the wider v3 inference for permissive callers.

Each of these is individually fixable. Together, with 25 importing files and persistence-layer coupling, the migration is a focused multi-day refactor — too much surface area to land alongside the 2026-06-01 V1 launch hardening sprint without test-driven verification of every contract.

### Sprint scope hygiene

The 2026-05-05 → 2026-05-19 sprint window is explicitly scoped to "backend hardening + supply-chain audit + LLM judge Redis". Pulling in a major dependency bump that touches 25 files dilutes the audit-trail signal of the other 11 changes (Steps A-K). Better discipline: separate sprint, separate PR, separate review.

### No security-driven force factor

Zod 3.x is not EOL. There is no published CVE against `zod ^3.25.76` at audit time (verified via `pnpm audit`). The bump is correctness/ergonomics-driven, not security-driven — no urgency override.

## Concrete migration plan (for the post-launch PR)

Phase 1 — instrumentation (½ day)
- Snapshot every active zod schema's behavior via property-based tests (fast-check is already a dev dep). Lock in the v3 shape.

Phase 2 — bump (½ day)
- `pnpm add zod@^4` in `museum-backend` only (frontend + web are not in scope of this ADR).
- Run `pnpm tsc --noEmit` — fix every type error in place.

Phase 3 — runtime audit (1 day)
- Run the full Jest suite under v4. Triage every failure.
- Re-read `error.middleware.ts` against the new `ZodError` shape — update the issue → HTTP 400 mapper if the shape shifted.
- Re-read `cursor-codec.ts` and `jsonb-validator.ts` — confirm `safeParse` result handling is forward-compatible.

Phase 4 — observability (½ day)
- Deploy to staging behind the `staging` env. Watch the validation-error histogram for 24h to catch any silent shape drift on real traffic.

Phase 5 — production (atomic)
- Promote staging → prod. Watch error budget for 48h.

## Acceptance criteria for re-opening

Re-open in the next sprint that meets ALL of:

1. V1 launch is shipped and stable (≥7 days post-2026-06-01 with no rollback).
2. The other Step A-K landings are merged and have produced at least one full nightly cycle (audit-chain verify, mutation testing) with green status.
3. The post-launch sprint backlog is otherwise quiet (no security-blocker, no incident response).

## Trigger conditions for early re-opening (any one is sufficient)

1. A security advisory is published against `zod ^3.25.76` that affects our usage pattern.
2. A bug in our codebase is traced to a v3 issue that is fixed in v4.
3. A transitive dependency (langchain, langfuse, etc.) drops v3 support — would manifest as a deduped resolution warning at install.

## Status flip

This ADR was authored as a "defer to post-launch" placeholder during the 2026-05-05 backend hardening sprint. The decision is final until one of the trigger conditions fires or the post-launch acceptance criteria are met.
