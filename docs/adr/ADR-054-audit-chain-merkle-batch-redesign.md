# ADR-054 — Audit chain redesign: Merkle batch chain replaces per-row hash chain

**Status:** Proposed
**Date:** 2026-05-17
**Deciders:** Tech Lead (decision pending post-launch validation)
**Closes:** audit-2026-05-12 R27 (audit chain scaling redesign), R8 (capacity model)
**Source preserved:** This ADR is the canonical home of the R27 design rationale; the `docs/audit-2026-05-12-raw/04-research/R27-audit-chain-redesign.md` source folder is slated for deletion.

---

## Context

`museum-backend/src/shared/audit/audit.repository.pg.ts:30-98` opens a TypeORM transaction on every audit `INSERT`, then immediately calls `SELECT pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_KEY)` (line 58). The lock key is a **single 64-bit constant** (`0x75f1_4b0c_6dbe_a111`) — every audit transaction across the entire cluster contends on the same global mutex.

Inside the lock, the code reads the chain tail (`SELECT row_hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1`, line 62–66), then `repo.save(entity)` (line 96). Chain construction (`audit-chain.ts:42-63`) takes SHA-256 of `id|actor_id|action|target_type|target_id|metadata_json|created_at_iso|prev_hash`.

The code comment is honest about the structural cost (lines 24–28):

> "A simpler `FOR UPDATE SKIP LOCKED` on the tail row is insufficient because the chain is 'virtual' (defined by creation order, not a FK), so two concurrent inserts would both observe the same tail and fork."

That is correct for a per-row hash chain — the lock is structurally required by the **chosen design**, not by the **requirement** (tamper-evidence).

### Throughput ceiling

The serialization ceiling of `pg_advisory_xact_lock` on a single-instance Postgres is **50–200 audit writes/s** (commit-latency × global lock hold time). 166 `auditService.log` call sites across the codebase feed this single mutex. Peak demand at 100k MAU is **~50–500 writes/s sustained, bursting to 1000+ during incidents** (chat guardrail block/allow, auth events, breach events). The lock-bound ceiling is **8–30× below** demand at 100k MAU (R8 capacity model).

### Tamper-evidence properties to preserve

- SHA-256 deterministic over canonical (sorted-key JSON) payload
- Genesis = 64 hex zeros
- Verifier (`audit-chain-verifier.ts`) returns first break index + row id, pure function
- IP excluded from hash payload (allows the 13-mo IP anonymizer cron to update without breaking the chain)
- Nightly verification via `audit-chain-cli-core.ts`

These migrate from per-row to per-batch + Merkle inclusion proofs; none are lost.

### Compliance backdrop

- **EU AI Act Art. 12** (auto-recording of events) + **Art. 26.6** (≥6 mo retention) — Musaium current retention is 13 mo, exceeds the floor. Effective 2026-08-02 for high-risk systems. Musaium likely Art. 50 (chatbot transparency), not high-risk under Annex III, but B2B museum customers may request Art. 12-grade evidence for their own compliance.
- **GDPR Art. 32 §1(b)** — "integrity" is the explicit hook for tamper-evidence (hash chains, signatures).
- **GDPR Art. 33** — 72 h breach notification; audit log = forensic evidence.

---

## Decision

**Adopt Pattern B (Merkle batch chain) + UUIDv7 PK + Postgres triggers (defense in depth) + RFC 3161 anchor in Phase 3.**

This is the design every modern tamper-evident log system converged on:

- **Google Trillian / Tessera** (Sigstore Rekor, Google CT logs)
- **Certificate Transparency** RFC 6962 / RFC 9162
- **Pangea Cloud Secure Audit Log**
- **Azure SQL Ledger** (Microsoft)
- **immudb** (CodeNotary)
- **AWS QLDB** (deprecated 2025-07-31, AWS recommends Aurora PostgreSQL without cryptographic verifiability — exactly the gap this design closes)

The papers underpinning the pattern are 15–28 years old (Schneier–Kelsey 1998, Crosby–Wallach 2009). The move from per-row chains to Merkle batches is the **single largest documented performance leap in tamper-evident logging** — orders of magnitude on both insert throughput AND inclusion-proof size (O(n) → O(log n); for 80M events, **800 MB → ~3 KB**).

### Phases

| Phase | Effort | Risk | Throughput gain | Tamper-evidence at end |
|---|---|---|---|---|
| 1: UUIDv7 PK + drop xact lock + per-batch chain | 1–2 d | Low — chain semantics shift to per-batch | 50–500× | Equivalent (per-batch) |
| 2: Background batcher (every 10 s, Merkle root over last N rows) | 1–2 d | Low — async, idempotent | n/a (verification) | Stronger (Merkle inclusion proofs) |
| 3: RFC 3161 anchor (Sigstore TSA, V1.1) | 3–5 d | Low — out-of-band cron | n/a | Adds external non-repudiation |
| 4: Monthly RANGE partitioning (V1.2, when audit_logs > ~5M rows) | 1 d | Low (pg_partman) | Linear retention scaling | Unchanged |

**Phases 1 + 2 are the load-bearing work (~1 sprint). Phase 3 and Phase 4 ship in subsequent sprints. All phases reversible at TypeORM migration revert.**

### Concrete design

**Phase 1 — Drop the lock (reversible):**

1. Add `batch_id` column to `audit_logs` (nullable initially) via `node scripts/migration-cli.cjs generate --name=AddAuditBatchId`.
2. Remove `acquireChainLock` from `insert` + `insertBatch`. `INSERT` becomes plain `INSERT ... RETURNING id, created_at`.
3. Switch PK to **UUIDv7** — natively supported in PostgreSQL 18 (`SELECT uuidv7()`), or via Node-side `uuid@v9+` for PG 16. UUIDv7 is monotonic per-backend; B-tree clusters at the end of the index, no page splits, optimal sequential writes.
4. Stop computing `prev_hash` per row; keep both columns during the migration window for rollback safety.
5. Verifier unchanged — walks rows in `created_at, id` order. UUIDv7 resolves `created_at` ties via embedded timestamp.

**Phase 2 — Batch Merkle root chain:**

```sql
CREATE TABLE audit_chain_batches (
  batch_id        BIGSERIAL PRIMARY KEY,
  prev_root       VARCHAR(64) NOT NULL,
  root_hash       VARCHAR(64) NOT NULL,
  first_row_id    UUID NOT NULL,
  last_row_id     UUID NOT NULL,
  row_count       INTEGER NOT NULL CHECK (row_count > 0),
  sealed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (root_hash)
);
```

`BIGSERIAL` is fine — only the batcher writes, contention is irrelevant.

New scheduled job `audit-chain-batcher.job.ts` (every 10 s, `RegisteredJob` pattern, register via `audit-cron.registrar.ts`):

- `SELECT … FROM audit_logs WHERE batch_id IS NULL ORDER BY created_at, id LIMIT 5000`.
- Build a Merkle tree (binary, SHA-256, RFC 6962 §2 canonical algorithm).
- Fetch the most recent `audit_chain_batches.root_hash`.
- `INSERT` new batch row with `root_hash = SHA256(prev_root || merkle_root)`.
- `UPDATE audit_logs SET batch_id = ? WHERE id IN (...)`. Idempotent via `WHERE batch_id IS NULL`.

Cost: ~5000 rows / cycle, ~10 ms Merkle build, ~50 ms transaction. Negligible at 100k MAU.

**Defense in depth — Postgres triggers:**

```sql
CREATE TRIGGER no_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_no_update_delete();
CREATE TRIGGER no_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_no_update_delete();
```

The IP anonymizer needs an exception — handled via session-scoped `SET LOCAL audit.allow_ip_anon = true` checked by the trigger (`current_setting('audit.allow_ip_anon', true)`). Same triggers on `audit_chain_batches`.

**Phase 3 — RFC 3161 anchor (V1.1):**

Submit the latest Merkle root to **Sigstore TSA** (https://github.com/sigstore/timestamp-authority — free, public, RFC 3161-compliant) daily. Persist the `TimeStampToken` to `audit_chain_anchors(anchor_id, batch_id_at_anchor, root_hash_at_anchor, tst_token bytea, tsa_url, anchored_at)`. Verifier extension validates each TST against the TSA's public cert. Sigstore TSA signature is eIDAS-recognised — admissible as legal evidence in EU.

**Phase 4 — Monthly RANGE partitions:**

Convert `audit_logs` to `PARTITION BY RANGE (created_at)` with monthly children via **pg_partman** auto-create + drop > 13 months. Retains the IP anonymizer cron (already excluded from hash).

### Phase 5 — deferred indefinitely

Per-tenant sub-chains: re-evaluate when ≥5 B2B museum tenants exist. Pattern C (per-actor sharded chains) is **not adopted V1** — global ordering loss + cross-actor verification complexity not justified for a single-tenant launch.

---

## Consequences

### Positive

- INSERT becomes lock-free → throughput rises from **50–200/s → 50k–144k/s** (single-instance Postgres ceiling per pgbench 2025).
- Inclusion proofs become **O(log n)** — a B2B customer auditing 80M events gets ~3 KB proof instead of 800 MB.
- Consistency proofs between two Signed Tree Heads are O(log n) — adversarial fork detection becomes mathematical.
- Each batch is independently re-verifiable: tampering one row inside a batch invalidates that batch's root but NOT subsequent batches' chain.
- Satisfies EU AI Act Art. 12 + GDPR Art. 32 §1(b) integrity. With Phase 3 anchor, evidence is eIDAS-grade.

### Negative / accepted

- Verification is no longer linear — needs a batcher + verifier that understands Merkle inclusion.
- A row's inclusion is only proven once its batch is sealed (≤10 s after insert). **Bounded delay**, not "eventual" — Maximum Merge Delay (MMD) is the formal contract (RFC 6962 §3). Mitigated by short batch interval + Phase 3 anchor frequency.
- Tampering before batch seal loses evidence of that row. Mitigated by triggers (defense in depth) and short MMD.
- One new background job (`audit-chain-batcher.job.ts`) to monitor. Alert if `audit_chain_batches.sealed_at` is > 5 min old.

### Honesty caveats (UFR-013)

1. Throughput numbers (50–200/s ceiling current; 50k–144k/s post-redesign) are derived from generic Postgres benchmarks + R8 estimates, **not measured on Musaium's actual deployment**. Phase 0 of the migration plan is "instrument the existing lock_wait histogram" precisely to replace estimates with measurements.
2. UUIDv7 native PG support shipped in PostgreSQL 18 (Sept 2025). Musaium current PG version is **PostgreSQL 16**. Phase 1 must either ship Node-side `uuid@v9+` v7 generation OR coordinate with a PG 18 upgrade.
3. AWS QLDB deprecation (2025-07-31) verified through multiple secondary sources (InfoQ, DoltHub, AWS migration guides) but not separately confirmed on aws.amazon.com.

---

## Alternatives considered

- **Per-actor sub-chains (Pattern C).** Rejected V1: pre-launch Musaium is single-tenant; global ordering loss isn't worth the contention relief that Pattern B already delivers.
- **Azure SQL Ledger / immudb / QLDB-as-a-service.** Rejected: operational dependency, AWS-only or new vendor lock-in; QLDB is dead.
- **S3 Object Lock Compliance Mode (Pattern F).** Rejected as primary V1 — adds AWS dependency Musaium doesn't have (OVH-based per `docs/OPS_DEPLOYMENT.md`). Defer to V2 / B2B once revenue justifies.
- **Keep the current per-row chain + horizontally shard Postgres.** Rejected: sharding strategy doesn't help — the global lock is per-cluster, not per-instance, by design.
- **Replace hash with PQ-resilient hash (SHA3-256 / Blake3) now.** Rejected for V1: SHA-256 acceptable per NIST 2026; PQ migration is addressable in V2 once the batch chain is in place (per-batch root recomputation is feasible).

---

## Rollback

Each phase ships independently with its own TypeORM migration. Rollback path:

1. Phase 2 rollback: stop the batcher job, drop `audit_chain_batches` triggers; rows remain readable; old verifier still works as long as `prev_hash` was preserved in Phase 1.
2. Phase 1 rollback: re-enable `pg_advisory_xact_lock` in the repository code; `batch_id` column becomes inert; chain verifier continues to validate the per-row `row_hash` chain.
3. Phase 3 rollback: stop the anchor cron; `audit_chain_anchors` rows remain valid evidence; no chain break.

Per-phase reversibility is the explicit design property that makes the redesign low-risk.

---

## References

- `docs/audit-2026-05-12-raw/04-research/R27-audit-chain-redesign.md` — full research source (slated for deletion; rationale preserved here)
- `museum-backend/src/shared/audit/audit.repository.pg.ts:30-98` — current implementation
- `museum-backend/src/shared/audit/audit-chain.ts:42-63` — current chain construction
- `museum-backend/src/shared/audit/audit-chain-verifier.ts` — verifier (will be extended in Phase 2)
- [Crosby & Wallach 2009 — Efficient Data Structures for Tamper-Evident Logging](https://static.usenix.org/event/sec09/tech/full_papers/crosby.pdf)
- [RFC 6962 — Certificate Transparency](https://www.rfc-editor.org/rfc/rfc6962.html)
- [RFC 9162 — Certificate Transparency v2](https://www.rfc-editor.org/rfc/rfc9162.html)
- [RFC 3161 — Time-Stamp Protocol](https://www.ietf.org/rfc/rfc3161.txt)
- [Sigstore Timestamp Authority](https://github.com/sigstore/timestamp-authority)
- [Trillian Tessera (2025 GA)](https://github.com/transparency-dev/tessera)
- [Azure SQL Ledger](https://learn.microsoft.com/en-us/sql/relational-databases/security/ledger/ledger-overview)
- [EU AI Act Article 12](https://artificialintelligenceact.eu/article/12/)
- [GDPR Article 32](https://gdpr-info.eu/art-32-gdpr/)
- [PostgreSQL UUIDv7 in PG 18 (DBVis)](https://www.dbvis.com/thetable/uuidv7-in-postgresql-18-what-you-need-to-know/)
- ADR-052 — soft-delete + suspend (also touches `audit_logs` actor reference integrity)
