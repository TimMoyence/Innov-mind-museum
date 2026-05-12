# ADR-046 — Zod 4 BE migration deferred (per ADR-033 plan)

- **Status** : Deferred
- **Owner** : backend
- **Created** : 2026-05-12 (cleanup sprint audit-cleanup-2026-05-12)
- **Source** : `docs/audit-cleanup-2026-05-12/PLAN_MASTER.md` (hors-scope V1) + ADR-033

## Context

This ADR exists to provide a discoverable "deferred V1.1 work item" entry-point for the BE zod 3→4 migration. The full decision rationale, surface analysis, migration plan, and re-evaluation gates are in `ADR-033-zod-status-quo-and-defer-plan.md`. This ADR is the V1.1 backlog stub.

## Decision

The BE `museum-backend` zod migration from `^3.25.76` to `^4` is deferred per `ADR-033`. Re-open in the 2026-Q4 hardening sprint when ADR-033's re-evaluation gates are met.

## Trigger conditions

See `ADR-033` § "Trigger conditions for early re-opening" — any of: zod 3 CVE, transitive dep drops v3, bug traced to a v3 issue fixed in v4.

## References

- `ADR-033-zod-status-quo-and-defer-plan.md` (full decision)
