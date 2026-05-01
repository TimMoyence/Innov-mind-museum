# ADR-021 — PgBouncer transaction mode for backend → Postgres connections

**Status:** Accepted (design — provisioning deferred to ops)
**Date:** 2026-05-01
**Deciders:** staff DB/SRE pass — subsystem F
**Spec:** docs/superpowers/specs/2026-05-01-F-scale-infra-design.md

## Context

The current architecture wires the Express backend directly to Postgres via
TypeORM's connection pool (default 10 connections). At single-replica scale
this is fine. At 10-100 backend replicas (the F target), each replica would
hold its own pool of N connections — `replicas * N` Postgres connections,
overwhelming the primary's `max_connections` (typical 100-200).

## Decision

Provision PgBouncer in **transaction pooling mode** between every backend
replica and Postgres. Each backend instance opens 10 client connections to
PgBouncer (cheap), and PgBouncer multiplexes those onto a much smaller pool
of real Postgres connections (default ~50 per database).

## Consequences

PgBouncer transaction mode imposes constraints on the backend:
- **No `LISTEN/NOTIFY`** — PgBouncer doesn't forward async messages between
  client and server connections. The codebase audit (subsystem F Phase 2)
  must confirm none are used.
- **No prepared statement reuse across transactions** — TypeORM uses simple
  query mode by default; verify in F2.
- **No server-side cursors held outside a transaction** — affects long
  query streaming. Existing chat module does not stream from Postgres.
- **Session-scoped settings (`SET ...`)** evaporate between transactions;
  use `SET LOCAL` inside a tx instead. Audit logs etc. unaffected.
- **Advisory locks** scoped to a single transaction only — codebase does
  not currently use any.

After PgBouncer ships:
- Backend pool size on each replica drops from 10 to 5.
- Real Postgres `max_connections` stays at 100-200 (no need to scale up).
- Latency overhead per query: ~0.5ms (negligible vs typical 5-50ms query).

## Alternatives considered

- **Session pooling mode**: rejected — pooling efficiency drops to per-replica,
  no benefit at scale.
- **Statement pooling mode**: rejected — too restrictive (no transactions).
- **PgCat (Rust-based PgBouncer alternative)**: deferred — production-ready
  in 2026 but ops familiarity weights toward PgBouncer for first deploy.
  PgCat revisit in 12 months for read-write splitting at the proxy layer.
- **No pooler (TypeORM-only)**: works at <10 backend replicas, breaks beyond.
