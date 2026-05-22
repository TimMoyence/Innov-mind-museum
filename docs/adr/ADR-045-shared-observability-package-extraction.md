# ADR-045 — `@musaium/shared/observability` extraction (sentry scrubber + helpers)

- **Status** : Amended 2026-05-21 — extraction **shipped** (superseding the original "Deferred" decision) ; email-hash algo divergence **ratified as intentional**. See [Amendment 2026-05-21](#amendment-2026-05-21--extraction-shipped--hash-algo-divergence-ratified-td-23).
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

> **Superseded by the 2026-05-21 amendment.** The manual cross-grep bridge above is no
> longer the mechanism: the shared package now holds the scrub logic and drift is enforced
> automatically by `scripts/sentinels/sentry-scrubber-parity.mjs`. Kept for historical context.

## Amendment 2026-05-21 — extraction shipped + hash-algo divergence ratified (TD-23)

Two facts have changed since the original "Deferred" decision; this amendment records both
(UFR-013 — the prior body no longer matches the code).

### 1. The extraction was done (the "Deferred" decision is superseded)

`packages/musaium-shared/src/observability/sentry-scrubber.ts` (+ `.test.ts`) now holds the
shared scrub logic (regex constants, traversal, URL/header/record scrubbing, breadcrumb
dropping). The three app files are **thin re-exports** that import that logic and inject only
their runtime-specific `hashEmail`:

- `museum-backend/src/shared/observability/sentry-scrubber.ts:8-16`
- `museum-web/src/lib/sentry-scrubber.ts:13-43`
- `museum-frontend/shared/observability/sentry-scrubber.ts`

Drift is no longer guarded by manual cross-grep but by the sentinel
`scripts/sentinels/sentry-scrubber-parity.mjs`. The original "ship 3 duplicated
implementations for V1" plan was therefore not what happened — the package shipped.

### 2. The `hashEmail` algo divergence is intentional (not drift)

The two implementations differ **by design** and this is ratified, not a debt to align:

| App | Algorithm | Source |
|---|---|---|
| Backend | 8-char SHA-256 hex (`node:crypto`) | `museum-backend/src/shared/observability/sentry-scrubber.ts:18-20` |
| Frontend + Web | 8-char deterministic 32-bit fold (`0xdeadbeef` / `Math.imul`), runtime-agnostic | `museum-web/src/lib/sentry-scrubber.ts:22-37` |

**Decision** — the email hash is **only an opaque correlation identifier, not a security
primitive**. Therefore:

- **Cross-runtime equality is not a goal.** The backend and client hashes of the same email
  intentionally differ; nothing in the system joins events across the BE/FE boundary on this
  value (it correlates events *within* one app's Sentry stream). Collision resistance and
  pre-image resistance are irrelevant because the value never gates access or identity.
- **The client deliberately avoids a `crypto` polyfill.** `museum-web` runs in client, server,
  and edge Next.js runtimes; `museum-frontend` is React Native. A 32-bit fold is dependency-free
  and works identically across all of them, where `node:crypto` / WebCrypto availability is
  inconsistent. Pulling a crypto polyfill into the client bundle to match the backend's SHA-256
  would add weight for zero functional gain (see above: equality is not a goal).
- **The backend uses `node:crypto` SHA-256** simply because it is already available there and
  costs nothing — not because the BE hash must be "stronger". Neither hash is a security control.

### Consequence

No code change is warranted. The earlier close-goal ("align FE/Web onto SHA-256-8hex with BE as
source of truth") is **explicitly rejected** in favour of this ratification. TD-23 closes as INFO.

### Reopen trigger (amended)

In addition to the original triggers: if a future feature ever needs to **join Sentry events
across the BE↔FE boundary by user**, the hash equality assumption changes and this decision must
be revisited (likely by passing a server-issued opaque user id rather than aligning hash algos).
