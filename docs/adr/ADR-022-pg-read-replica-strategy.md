# ADR-022 — PostgreSQL read replica strategy

**Status:** Accepted (design — provisioning deferred to ops)
**Date:** 2026-05-01
**Deciders:** staff DB/SRE pass — subsystem F
**Spec:** docs/superpowers/specs/2026-05-01-F-scale-infra-design.md

## Context

Current architecture: single Postgres primary handles all reads + writes.
At 100K rps scale, the primary CPU saturates on read-heavy workloads
(chat detail, museum directory, dashboard).

Read traffic is overwhelmingly cache-friendly (chat sessions, museum
directory) and tolerant of seconds-stale data.

## Decision

Provision 2-5 streaming read replicas behind PgBouncer. Backend code
introduces a `DataSourceRouter` exposing `read` and `write` getters:
- `write` always points at the primary.
- `read` points at a replica when `DB_REPLICA_URL` env is set; otherwise
  falls back to the primary (no behavior change).

Repository code migrates gradually — call sites that explicitly tolerate
replica lag (chat history list, museum list) flip from
`AppDataSource.getRepository()` to `dataSourceRouter.read.getRepository()`.

Read-after-write paths (e.g. immediately reading the row just inserted)
stay on `write` to avoid stale reads.

## Consequences

- Primary CPU drops 5-10× on read-heavy endpoints once routing migrates.
- Async streaming replication has typical lag of 10-100ms in normal
  operation; up to several seconds during burst writes. Read paths must
  tolerate this — document the lag expectation per endpoint.
- Operational: replica failover increases ops complexity. Use a managed
  Postgres provider (RDS, Aiven, OVH) with replica health monitoring.

## Alternatives considered

- **Logical replication / event sourcing**: out of scope; adds
  consistency complexity for marginal gain at this scale.
- **Read-only routing in the application** (no proxy): chosen — simpler
  than PgPool, less moving parts than PgCat.
- **Single primary indefinitely**: rejected — does not scale past
  ~5K rps under typical museum workloads.
