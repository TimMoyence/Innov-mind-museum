# ADR-044 — Multi-tenant museum onboarding (W2) deferred to V1.1

- **Status** : Deferred
- **Owner** : Tim
- **Created** : 2026-05-12 (cleanup sprint audit-cleanup-2026-05-12)
- **Source** : `docs/audit-cleanup-2026-05-12/PLAN_MASTER.md` (hors-scope V1)

## Context

V1 (2026-06-01) ships with multi-museum schema support (single PG instance, `museum_id` FK on entities) but **no self-service onboarding flow** for new museums. The current admin panel (`museum-web` /admin) allows manual museum creation by Musaium admin only, not by a B2B buyer.

W2 = "multi-tenant museum onboarding" — the full B2B SaaS-style flow: a museum admin signs up, configures branding, uploads catalog, invites staff, gets a tenant-scoped admin URL.

## Decision

Defer to V1.1. V1 ships with manual onboarding via Musaium internal admin. Each new B2B pilot museum is created by Tim/Musaium ops, not by self-service.

## Why

- Multi-tenant onboarding requires: signup flow + billing integration + branding customization + role management (admin/staff/curator) + tenant isolation tests + data egress flow. ≥3 weeks of engineering.
- Pre-launch B2B targets are ≤5 pilot museums — manual onboarding is acceptable.
- Pricing model is not yet locked — premature to wire billing.

## Consequences

- V1 ships with `museum_id` FK enforcement and schema scaffolding for multi-tenancy, but no UI for it on the B2B side.
- Reopening will need: pricing ADR (per-seat vs per-museum vs per-MAU), branding scope ADR, tenant-isolation security audit.

## Reopen trigger

Any of: ≥3 B2B pilots signed (manual onboarding pain real), pricing model locked by founder, Stripe / billing partner integration decided.
