# ADR-045 — `@musaium/shared/observability` extraction (sentry scrubber + helpers)

- **Status** : Deferred
- **Owner** : Tim
- **Created** : 2026-05-12 (cleanup sprint audit-cleanup-2026-05-12)
- **Source** : `docs/audit-cleanup-2026-05-12/PLAN_MASTER.md` (hors-scope V1)

## Context

Sentry-related infrastructure currently duplicates between `museum-backend`, `museum-frontend`, and `museum-web`:

- Backend: `museum-backend/src/shared/observability/sentry-init.ts` + `sentry-scrubber.ts`
- Frontend: `museum-frontend/shared/observability/sentry-init.ts` + `global-error-handler.ts`
- Web: `museum-web/src/lib/sentry-init.ts` + scrubber

Each app re-implements similar scrubber logic (PII redaction for emails, JWT tokens, prompt-injection probes). Drift risk: a scrubber rule added in BE but missed in FE leaks PII via mobile-side Sentry events.

## Decision

Defer extraction of `@musaium/shared/observability` workspace package to post-launch. V1 (2026-06-01) ships with the three duplicated implementations, kept in sync manually via cross-grep when adding a scrubber rule.

## Why

- pnpm workspace package introduction requires: `package.json` workspaces config + tsconfig path aliases + Renovate group rule + CI workflow path-filter updates.
- The drift cost today is low (3 scrubbers, ~50 lines each, infrequent changes).
- Pre-launch is the wrong time to introduce a workspace package — extraction risk > maintenance saving.

## Reopen trigger

Any of: a scrubber drift causes a PII leak in Sentry, the workspace gains a 4th app (e.g. a CLI or admin tool), a Sentry SDK migration forces a coordinated update across all 3 apps.

## Bridge (today)

Until reopened, any change to a scrubber rule must:
1. `grep -rn "scrub" museum-{backend,frontend,web}` to find all 3 sites
2. Mirror the change in all 3 in the same PR
3. Add a one-line cross-ref comment in each site: `// Mirrors museum-backend/.../sentry-scrubber.ts L<N>`
