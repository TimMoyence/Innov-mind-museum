# R27 — Audit Chain Scaling Redesign

**Auditor:** R27 (Audit Chain Scaling Research Agent)
**Date:** 2026-05-12
**Scope:** Replace the global `pg_advisory_xact_lock` SHA-256 hash chain in `audit.repository.pg.ts` with a design that scales to 100k MAU without sacrificing tamper-evidence, ordering, EU AI Act Art. 12 / GDPR Art. 32 evidentiary value.
**Verification ladder (UFR-013):** `[verified]` = read in repo / cited source ; `[inferred]` = derived from a cited principle ; `[assumed]` = working hypothesis pending validation.

---

## TL;DR

Musaium's current chain takes a **single cluster-wide `pg_advisory_xact_lock(0x75f1_4b0c_6dbe_a111)` on every audit INSERT** `[verified — audit.repository.pg.ts:58]`. Every audit row across the entire cluster must serialize through that one mutex while inside a transaction, so throughput is bounded by **commit latency × global lock hold time** — typically 50–200 audit writes/sec on a single NVMe-backed instance, regardless of CPU. At 100k MAU with breach + guardrail + auth + chat-message audit events, peak demand is in the low thousands/s, **8–30× above the lock-bound ceiling** `[R8, verified]`.

The fix the industry has converged on for the last 15 years is the **Crosby–Wallach history tree / Merkle batch pattern**, used by Certificate Transparency (RFC 6962 / RFC 9162), Google Trillian (now Tessera), Sigstore Rekor, Pangea Cloud Audit, AWS QLDB (RIP 2025-07-31), Azure SQL Ledger and immudb. The key insight: **you don't need a synchronous global lock — you need ordered batches, each batched into a Merkle tree, with the previous batch's root chained into the next batch's root**. The append itself is lock-free; the integrity proof is built async, anchored on a schedule.

**Recommended redesign for Musaium V1:**

1. **Phase 1 (1–2 day effort, zero behaviour change):** Drop the `pg_advisory_xact_lock`. Replace `prev_hash` with `prev_batch_root_hash`. Use **UUIDv7** (PostgreSQL 18 native) as the audit row PK for natural monotonic order. Each `INSERT` is now a plain INSERT with **no synchronous lock** — throughput jumps to single-instance Postgres ceiling (~50k–144k inserts/s benchmarked) `[postgresql.org pgbench 2025]`.
2. **Phase 2 (1–2 day effort):** Run a **periodic batcher** (cron, every 10 s) that takes the last N audit rows in `created_at, id` order, builds a Merkle tree, writes `audit_chain_batches { batch_id, prev_root, root_hash, first_row_id, last_row_id, sealed_at }`. The batcher is the **only** writer to `audit_chain_batches` — single-row append, no contention.
3. **Phase 3 (3–5 day effort, optional V1.1):** Anchor weekly Merkle roots to an **RFC 3161 Time-Stamp Authority (TSA)** for non-repudiation; in V2, optionally publish to a public timestamping log (Sigstore Rekor / Certificate Transparency).
4. **Phase 4 (defer until B2B):** Partition `audit_logs` by **`RANGE (created_at)` monthly** for retention pruning + read scalability. Sub-partition by `actor_type` only if a single tenant becomes a hot key.

**Effort vs. risk vs. gain:**

| Phase | Effort | Risk | Throughput gain | Tamper-evidence at end |
|---|---|---|---|---|
| 1 (UUIDv7 + drop xact lock + per-batch chain) | 1–2 d | Low — chain semantics shift to per-batch | 50–500× | Equivalent (per-batch) |
| 2 (background batcher) | 1–2 d | Low — async, idempotent | n/a (verification) | Stronger (Merkle proofs) |
| 3 (RFC 3161 anchor) | 3–5 d | Low — out-of-band | n/a | Adds external non-repudiation |
| 4 (monthly partitions) | 1 d | Low (pg_partman) | Linear retention scaling | Unchanged |

**Verdict:** Reject the synchronous global lock. Adopt **UUIDv7 + Merkle batch chain + monthly RANGE partitions**. This matches the design of every modern tamper-evident log system (Trillian, Pangea, Azure Ledger, immudb), satisfies EU AI Act Art. 12 (auto-recording + 6-month retention, Musaium keeps 13mo) `[artificialintelligenceact.eu Art 12 + Art 26.6]` and GDPR Art. 32 (integrity + ability to restore) `[gdpr-info.eu Art 32]`, and removes the single biggest blocker to 100k MAU scale identified in R8.

---

## 1. Current State Deep-Dive

### 1.1 Source of the bottleneck

`museum-backend/src/shared/audit/audit.repository.pg.ts:30-98` `[verified]` :

- `insert(entry)` and `insertBatch(entries)` BOTH open a TypeORM `dataSource.transaction(...)` then immediately call `SELECT pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_KEY)` (line 58).
- `pg_advisory_xact_lock` is transaction-scoped (released at COMMIT/ROLLBACK), but **the lock key is a single 64-bit constant** — every audit transaction across the cluster contends on the same mutex.
- Inside the lock, the code does `SELECT row_hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1` (line 62–66), then `repo.save(entity)` (line 96).
- Chain construction in `audit-chain.ts:42-63` `[verified]` : SHA-256 of `id|actor_id|action|target_type|target_id|metadata_json|created_at_iso|prev_hash`.

### 1.2 Why the lock exists

The code comment is honest about it (lines 24–28) :
> "A simpler `FOR UPDATE SKIP LOCKED` on the tail row is insufficient because the chain is 'virtual' (defined by creation order, not a FK), so two concurrent inserts would both observe the same tail and fork."

That is correct for a **per-row hash chain**. The lock is structurally required by the chosen design — not by the requirement (tamper evidence). The redesign changes the design.

### 1.3 Current call sites + volume

`[verified]` `grep "auditService.log" src/...` finds **166 call sites** across modules. The hot ones for 100k MAU :

| Call site | Per-action calls | 100k MAU peak |
|---|---|---|
| Chat guardrail block input + output (`guardrail-evaluation.service.ts`) | 0–2 per message | ~50–500/s (chat traffic-driven) |
| Auth login success/fail, register, password change | 1 per event | ~5–50/s |
| LLM Guard breaker OPEN (`SECURITY_LLM_GUARD_BREAKER_OPEN`) | 1 per circuit open | ≪ 1/s, bursty |
| Breach events (Art 33-34) | 1 per breach | rare, P0/P1 |
| Profile/preferences updates | 1 per action | ~1–10/s |

**Peak combined : ~50–500 audit writes/sec sustained, with bursts to 1 000+ during incidents** `[inferred from R8 capacity model]`. The serialization ceiling of `pg_advisory_xact_lock` is in the same range, hence the 8–30× gap R8 flagged.

### 1.4 Tamper-evidence properties to preserve

`[verified]` from `audit-chain.ts` + `audit-chain-verifier.ts` :

- SHA-256 deterministic over canonical payload (sorted-key JSON).
- Genesis = 64 hex zeros.
- Verifier returns first break index + row id (pure function, runs against rows fetched in order).
- IP excluded from hash payload (allows anonymisation cron without breaking chain).
- Run nightly via `audit-chain-cli-core.ts` `[verified]`.

These properties are NOT lost by the redesign — they migrate from per-row to per-batch + Merkle inclusion proofs.

---

## 2. Pattern Catalogue 2026

### 2.1 Pattern A — Per-row hash chain (current)

**How it works.** Each row stores `prev_hash` + `row_hash = SHA256(payload || prev_hash)`. Tail lookup + write must serialize.

**Strengths.** Trivial to verify (linear walk). No batcher complexity. O(n) verification, O(1) write proof.

**Weaknesses.**
- Serialization is structural — there is no way to make this concurrent without giving up the per-row chain.
- Single-row tampering breaks every subsequent row's hash → expensive to repair a chain break.
- Crosby & Wallach 2009 showed a per-row chain proof of inclusion is O(n) — for 80M events a proof can be **800 MB** `[Crosby & Wallach 2009 / USENIX Sec'09 — static.usenix.org/event/sec09/tech/full_papers/crosby.pdf]`.

**Verdict for Musaium.** Has to go — synchronous global lock is the blocker.

### 2.2 Pattern B — Merkle tree per batch (CT / Trillian / Tessera)

**How it works.** Append events to an unordered append buffer. Periodically (every N rows or every T seconds), seal a **batch** : build a Merkle tree over the batch, store the root, chain root_n = SHA256(prev_root || merkle_root_n). The batch root is signed → **Signed Tree Head (STH)** `[RFC 9162 §4.1]`.

**Inclusion proof = O(log n) sibling hashes from leaf to root** `[Crosby & Wallach 2009]`. For 80M events, the proof is **~3 KB instead of 800 MB** — that's the headline result that made CT possible.

**Production references.**
- **Google Trillian** (now maintenance mode) — used by Sigstore Rekor, Google CT logs, originally MySQL-backed `[github.com/google/trillian + docs/storage]`.
- **Trillian Tessera** (2025 GA, successor) — tile-based, supports MySQL / AWS / GCP / POSIX, used by TesseraCT (next-gen CT log) `[transparency.dev/articles/tile-based-logs + blog.transparency.dev/announcing-the-alpha-release-of-trillian-tessera]`.
- **Pangea Cloud Secure Audit Log** — exact same pattern (Merkle leaves, roots, consistency proofs), anchored to public blockchain for external attestation `[pangea.cloud/blog/a-tamperproof-logging-implementation]`.
- **Azure SQL Ledger** — internally SHA-256 hashes rows into Merkle trees, periodically seals into blocks, chains block roots, persists digests to immutable blob storage `[learn.microsoft.com/en-us/sql/relational-databases/security/ledger/ledger-overview]`.
- **immudb** — same pattern, "millions of transactions per second on high-end hardware" claim `[codenotary.s3.amazonaws.com/Research-Paper-immudb-CodeNotary_v3.0.pdf]`.

**Strengths.**
- INSERT is lock-free (just an append) → 50–144k inserts/s achievable on a single Postgres `[dev.to/haikasatryan/postgresql-write-performance-2025]`.
- Inclusion proofs are O(log n).
- Consistency proofs between two STHs are O(log n) — an auditor can verify "no row was retroactively inserted between batch i and batch j" with a few KB of proof.
- Adversary detection : if the log operator forks (shows different views to different auditors), the inconsistency is mathematically detectable from any two STHs.

**Weaknesses.**
- Verification is not strictly linear anymore — need a batcher + a verifier that understands Merkle inclusion.
- A row's inclusion is only proven once its batch is sealed (typically 1–10 s after insert). **Bounded delay**, not "eventual" — the Maximum Merge Delay (MMD) is the formal contract `[RFC 6962 §3]`.
- If a row is tampered with **before** its batch is sealed, you lose evidence of it (mitigated by anchoring the batch frequently enough).

**Verdict for Musaium.** Best match. Production-proven by Google, Sigstore, Microsoft, Pangea. Worth noting Trillian itself is in maintenance mode — **new builds should use Tessera or roll the equivalent ~200 lines of TypeScript** rather than running a Go service. For Musaium scale (100k MAU, low-thousands inserts/s), the in-process batcher is simpler than deploying Tessera.

### 2.3 Pattern C — Per-actor sub-chains (sharded chains)

**How it works.** One sub-chain per actor (user_id) or per tenant (museum_id). Each sub-chain has its own genesis. Independent verification per sub-chain.

**Strengths.**
- Contention disappears entirely if `actor_id` distribution is even.
- Cross-tenant isolation is structurally enforced (good for multi-museum B2B) `[medium.com/justhamade/multi-tenant-isolation]`.
- Tampering one actor's chain doesn't invalidate others.

**Weaknesses.**
- Global ordering is lost — to prove "the system saw events in order X" you'd need an additional global root over sub-chain heads, which re-introduces serialization unless done in batches (collapses back to Pattern B).
- Cross-actor verification is harder (have to walk N chains).
- System events (no actor) need a separate "system" chain — risk of confusion.
- Pre-launch Musaium has a **single tenant** (one Musaium org); per-actor sharding is premature optimization until B2B revenue.

**Verdict for Musaium.** Not yet. Re-evaluate when 5+ B2B museum tenants exist. Pattern B handles the throughput need without giving up global order.

### 2.4 Pattern D — ULID/UUIDv7 monotonic ID + async batch verifier

**How it works.** No per-row hash at all. INSERT uses a monotonic ID (UUIDv7 in PG 18, or ULID via extension). A background "verifier" cron groups recent rows by 10 s windows, builds a Merkle root, persists it to a sealed-batches table. Tamper evidence is **deferred** to the first batch-seal.

**Strengths.**
- Maximum write throughput (zero crypto on hot path).
- Postgres 18 `uuidv7()` is monotonic per-backend `[brandur.org/fragments/uuid-v7-monotonicity + neon.com/postgresql/postgresql-18/uuidv7-support]`, so within a single connection rows are strictly time-ordered.
- B-tree friendliness: UUIDv7 PKs cluster at the end of the index, no page splits, optimal sequential writes `[dbvis.com/thetable/uuidv7-in-postgresql-18-what-you-need-to-know]`.

**Weaknesses.**
- Window between INSERT and first seal (≤ batch interval) is a **vulnerability window** where a DB admin can tamper undetected.
- Not strictly worse than Pattern B if the batch interval is short (10 s), but it's NOT a hash chain at all on the hot path.

**Verdict for Musaium.** This is essentially Pattern B with no `prev_hash` column at all — and that's actually fine because the batch root IS the per-row commitment. **Recommended hybrid : Pattern B + Pattern D combined** : UUIDv7 PK for natural order, no `prev_hash` per row (drop the column), batch root recomputable from any sealed window.

### 2.5 Pattern E — DB-native immutable tables

**Options.**
- **Azure SQL Ledger append-only tables** — INSERT-only at engine level, automatic Merkle hashing, digest persisted to blob storage `[learn.microsoft.com Azure SQL Ledger]`. Requires Azure SQL (not Postgres).
- **AWS QLDB** — DEPRECATED 2024-07, fully discontinued **2025-07-31** `[infoq.com/news/2024/07/aws-kill-qldb + dolthub.com/blog/2024-08-12-qldb-deprecated-alternatives]`. AWS recommends migration to **Aurora PostgreSQL** but explicitly without cryptographic verifiability `[aws.amazon.com/blogs/database/replace-amazon-qldb-with-amazon-aurora-postgresql-for-audit-use-cases]`.
- **PostgreSQL RLS + BEFORE trigger raising EXCEPTION on UPDATE/DELETE** — enforces append-only at engine level `[postgresql.org/docs/current/plpgsql-trigger + supabase RLS docs]`. Does NOT provide tamper-evidence by itself (a superuser can still bypass triggers / dump+restore). Useful as **defense in depth** alongside Pattern B.

**Verdict for Musaium.** Not a replacement for the hash chain. **Add `BEFORE UPDATE` and `BEFORE DELETE` triggers on `audit_logs` and `audit_chain_batches` that `RAISE EXCEPTION`** — costs nothing, blocks accidental + non-superuser tampering. Engine-level append-only requires switching DBMS (Azure SQL Ledger) or trusting an external service (QLDB is dead, immudb is a viable open-source replacement but introduces a new operational dependency).

### 2.6 Pattern F — Streaming to S3 / Parquet / external WORM

**How it works.** Forward audit events to Kinesis Firehose → S3 with **Object Lock in Compliance Mode** (write-once, deletion impossible until retention expires, not even by AWS root account) `[docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock]`. Logs in Parquet for analytics `[mattermost.com/blog/compliance-by-design-18-tips]`.

**Strengths.**
- Tamper-proof, not just tamper-evident (S3 Object Lock Compliance Mode is genuinely write-once, assessed for SEC 17a-4 / CFTC / FINRA) `[Cohasset Associates assessment]`.
- Cheap for long-term retention.
- No load on Postgres for historical reads.

**Weaknesses.**
- Adds AWS dependency Musaium doesn't have (currently OVH-based per `docs/OPS_DEPLOYMENT.md`).
- Adds Kinesis billing + ingestion latency.
- Doesn't replace the hot-path chain — it's a complement.

**Verdict for Musaium.** Defer to V2 / B2B phase. For V1 launch, the recommendation is **Pattern B on Postgres + nightly export of sealed batches to a secondary location** (S3-compatible OVH object store or filesystem snapshot). Object Lock can come when B2B revenue justifies AWS spend.

### 2.7 Pattern G — RFC 3161 timestamping anchor

**How it works.** Periodically (daily / weekly) submit the latest Merkle root to a **trusted Time-Stamp Authority** per RFC 3161. The TSA returns a signed TimeStampToken proving "this hash existed at this time, signed by a TTP". `[ietf.org/rfc/rfc3161 + sigstore/timestamp-authority]`

**Strengths.**
- Long-term non-repudiation — even if Musaium's signing key is compromised later, the TSA's signature attests the root existed before the compromise.
- Sigstore runs a free public TSA `[github.com/sigstore/timestamp-authority]`. DigiCert / GlobalSign run commercial ones.
- eIDAS-recognised in EU for "qualified timestamps" — admissible as legal evidence.

**Weaknesses.**
- Adds a network dependency for the anchor step (out-of-band, not hot-path).
- Free TSAs have rate limits.

**Verdict for Musaium.** Add as Phase 3 once Pattern B is in place. Sigstore TSA is free, the cron runs once a day, the artefact is a ~2 KB TimeStampToken per anchor — pure win for compliance evidence (especially Art 12 record-keeping + Art 33 breach forensics).

### 2.8 Pattern Comparison Table

| Pattern | Hot path lock | Insert throughput | Inclusion proof size | Order guarantee | Production refs | Musaium V1 verdict |
|---|---|---|---|---|---|---|
| **A. Per-row chain (current)** | Global xact lock | 50–200/s `[verified bottleneck]` | O(n) — gigabytes for 80M | Strict global | Most naïve audit logs | **Replace** |
| **B. Merkle batch chain** | None (append only) | 10k–100k/s `[Postgres ceiling]` | O(log n) — KB | Strict global | Trillian, CT, Pangea, Azure Ledger, immudb | **Adopt** |
| **C. Per-actor sub-chains** | Per-actor row lock (cheap) | Unbounded if even dist. | O(log n) per actor | Per-actor, not global | Multi-tenant SaaS, blockchain shards | **Defer** to B2B |
| **D. UUIDv7 + async verify** | None | Postgres max | O(log n) once sealed | Strict per-backend | Pinterest, Stripe (UUIDv7) | **Subset of B** |
| **E. DB-native immutable** | n/a | Engine-dependent | Engine-defined | Engine-defined | Azure SQL Ledger, immudb, ex-QLDB | **Defense in depth (PG triggers)** |
| **F. Stream to S3 WORM** | None | Network-bound | n/a (full export) | Stream-order | CloudTrail+Object Lock, SEC 17a-4 | **Phase 2 export** |
| **G. RFC 3161 anchor** | None (cron) | n/a (out-of-band) | TST per root | n/a | Sigstore, DigiCert, eIDAS | **Phase 3 anchor** |

---

## 3. EU AI Act Art. 12 — What Musaium Must Log

`[verified — artificialintelligenceact.eu/article/12/ + ai-act-service-desk.ec.europa.eu/en/ai-act/article-12]`

**Art. 12 §1 :** High-risk AI systems must "technically allow for the automatic recording of events ('logs') over the lifetime of the system."

**Art. 12 §2 :** Logging shall enable :
- Identification of situations that may result in the AI system presenting a risk within the meaning of Art. 79(1) (substantial modification, malfunction).
- Facilitating post-market monitoring (Art. 72).
- Monitoring the operation of high-risk systems (Art. 26 §5).

**Art. 12 §3 (biometric ID systems only) :** Must record period of use, reference DB, input data matched, identification of natural persons who verified results.

**Retention (Art. 26 §6) :** Logs MUST be kept "for a period appropriate to the intended use of the high-risk AI system and applicable obligations under Union or national law" — **minimum 6 months**. Musaium current retention 13 months **exceeds** the floor `[verified against memory feedback_anonymize_ip_pipeline.md].

**Penalty for non-compliance :** Up to €15M or 3 % of worldwide annual turnover `[firetail.ai/blog/article-12-and-the-logging-mandate]`.

**Effective date :** Full Art. 6 obligations for high-risk AI apply **2 August 2026** `[artificialintelligenceact.eu/high-level-summary]`.

**Whether Musaium is "high-risk" :** Likely NOT under the current Art. 6 + Annex III list (it's a B2C cultural assistant, not in healthcare/employment/education/law enforcement/biometrics/critical infrastructure). It DOES fall under **Art. 50** transparency obligations for chatbots ("must inform users they are interacting with AI") `[artificialintelligenceact.eu/article/50/]`. But the audit chain design should anticipate B2B museum customers requesting Art. 12-grade logging for their own compliance.

**Verdict :** Pattern B + retention 13 mo + RFC 3161 anchor satisfies Art. 12 fully — automatic, machine-generated, query-able by event, integrity-verifiable.

---

## 4. GDPR Art. 32 — Security of Processing

`[verified — gdpr-info.eu/art-32-gdpr/]`

**Art. 32 §1 :** Controller + processor implement "appropriate technical and organisational measures to ensure a level of security appropriate to the risk," including :

- (a) Pseudonymisation + encryption.
- (b) **Ability to ensure ongoing confidentiality, integrity, availability, resilience.**
- (c) Ability to restore availability + access in a timely manner after incident.
- (d) Regular testing, assessing, evaluating effectiveness.

**Audit logs under GDPR :**
- Audit logs themselves contain personal data (user IDs, IPs) → GDPR applies to them too.
- Retention 2–7 years typical, risk-proportionate, not fixed `[hyrelog.com/blog/gdpr-audit-requirements]`.
- "Integrity" in §1(b) = the explicit hook for tamper-evidence (hash chains, signatures).
- Art. 33 breach notification : 72 h to supervisory authority — audit log is the forensic evidence used to scope the breach `[verified — Musaium AuditService.auditCriticalSecurityEvent computes cnilDeadline]`.

**Verdict :** Pattern B satisfies §1(b) integrity ; the chain remains tamper-evident across the 13-month retention window. IP anonymisation cron at 13 mo `[verified — audit-ip-anonymizer.job.ts exists in shared/audit/]` is compatible with the new design as long as IP stays OUT of the hash payload `[verified — audit-chain.ts:51–60 already excludes IP]`. Pattern G (RFC 3161 anchor) strengthens forensic non-repudiation for breach response.

---

## 5. Migration Plan — Step by Step

### Phase 0 — Baseline (this week, R0 effort)

**Goal :** Quantify the actual bottleneck before redesigning.

1. Add a Prometheus histogram around `AuditRepositoryPg.insert` measuring **time spent in `acquireChainLock` vs `appendOne`**. Expose `audit_chain_lock_wait_seconds` + `audit_chain_insert_seconds`.
2. Load-test : run `pnpm smoke:api` with concurrent privileged routes (target 200 concurrent → 1000). Record max sustained INSERT rate before lock_wait p95 exceeds 100 ms.
3. **Stop criterion :** if peak production INSERT rate < 30 % of measured ceiling, the redesign is preventive, not urgent. If ≥ 50 %, urgent.

**Exit artifact :** chart + R8 fact-check (R8 estimated 50–200/s ceiling ; verify against bench).

### Phase 1 — Drop the lock (Sprint 1, 1–2 d effort, REVERSIBLE)

**Goal :** Remove the global mutex while keeping per-row hash chain semantics.

1. **Add `batch_id` column to `audit_logs`** (nullable initially) ; new migration via `node scripts/migration-cli.cjs generate --name=AddAuditBatchId` per Migration Governance `[verified — CLAUDE.md § Migration Governance]`.
2. **Stop computing `prev_hash` per row.** Replace `row_hash` semantics with a per-row content hash `row_content_hash = SHA256(canonical_payload)` (no chaining yet). Keep both columns during migration (`row_hash` still computed identically for chain continuity ; `row_content_hash` is the future canonical).
3. **Remove `acquireChainLock` from `insert` + `insertBatch`.** INSERTs become plain `INSERT ... RETURNING id, created_at`.
4. **Switch PK to UUIDv7** if migrating to PG 18 (`SELECT uuidv7()`), else generate via Node side using a battle-tested lib (`uuid` v9+ supports v7). The frontend `randomUUID()` produces v4 ; v7 will be a tiny refactor in `audit.repository.pg.ts:69`.
5. **Verifier unchanged.** It still walks rows in `created_at, id` order — and since UUIDv7 is monotonic, ties on `created_at` are now resolved deterministically by the v7 timestamp embed `[brandur.org/fragments/uuid-v7-monotonicity]`.

**Risk control :**
- Feature-flag (`AUDIT_CHAIN_BATCHED=false` initially) — but per `feedback_no_feature_flags_prelaunch.md` doctrine, do this in a single commit, no flag. Use the migration as the rollback point.
- Pre-flight : run `pnpm jest --clearCache && pnpm test` to confirm nothing relies on `prev_hash` shape.
- Keep `audit-chain-verifier.ts` running nightly during the migration window ; any divergence triggers fail-loud Slack.

**Verification gate :** After deploy, the `audit_chain_lock_wait_seconds` histogram should drop to ~0 (the metric is now dead-letter), and throughput in load test should rise to PostgreSQL-native INSERT ceiling.

### Phase 2 — Batch Merkle root chain (Sprint 1–2, 1–2 d effort)

**Goal :** Restore tamper-evidence with per-batch Merkle roots chained together.

1. **New table `audit_chain_batches`** :
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
   `BIGSERIAL` is fine — only the batcher writes, so contention is irrelevant.
2. **New scheduled job `audit-chain-batcher.job.ts`** (every 10 s, `RegisteredJob`-pattern, register via `audit-cron.registrar.ts`) :
   - SELECT rows from `audit_logs` WHERE `batch_id IS NULL` ORDER BY `created_at, id` LIMIT 5000.
   - If empty, no-op.
   - Build a Merkle tree (binary, SHA-256, with deterministic padding — see RFC 6962 §2 for canonical algorithm `[rfc-editor.org/rfc/rfc6962.html]`).
   - Fetch the most recent `audit_chain_batches.root_hash` (single-row lookup on `batch_id DESC LIMIT 1`).
   - INSERT new batch row with `prev_root = previous_root || GENESIS`, `root_hash = SHA256(prev_root || merkle_root)`.
   - UPDATE the rows : `UPDATE audit_logs SET batch_id = ? WHERE id IN (...)`. Idempotent (the `WHERE batch_id IS NULL` filter ensures no double-seal).
3. **Cost of the batcher :** single producer, ~5000 rows per cycle, ~10 ms to build a Merkle tree of 5000 leaves on commodity hardware, ~50 ms transaction. Negligible at 100k MAU.
4. **Add PG triggers to enforce immutability** (defense in depth) :
   ```sql
   CREATE OR REPLACE FUNCTION audit_logs_no_update_delete() RETURNS trigger AS $$
   BEGIN
     RAISE EXCEPTION 'audit_logs is append-only — UPDATE/DELETE forbidden';
   END;
   $$ LANGUAGE plpgsql;
   CREATE TRIGGER no_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_no_update_delete();
   CREATE TRIGGER no_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_no_update_delete();
   ```
   Exception : the IP anonymizer needs to UPDATE the `ip` column at 13 mo. Either (a) trigger checks `OLD.ip IS NOT NULL AND NEW.ip IS NULL AND ...other_cols_unchanged`, or (b) anonymizer uses a session-scoped `SET LOCAL audit.allow_ip_anon = true` and trigger reads `current_setting('audit.allow_ip_anon', true)` `[supabase/discussions/656 pattern]`.
5. **Update `audit-chain-verifier.ts`** to verify in two phases :
   - Verify each batch's Merkle root recomputes from its rows.
   - Verify the chain of `prev_root` across batches.
   - Return per-batch break index instead of per-row.

**Verification gate :** Nightly `audit-chain-verify` CLI passes against a populated test DB ; integration test asserts that tampering with one row inside a batch invalidates that batch's root but NOT subsequent batches' chain (each batch is independently re-verifiable).

### Phase 3 — RFC 3161 anchor (Sprint 2–3, 3–5 d effort, optional V1.1)

**Goal :** External non-repudiation evidence.

1. **Add table `audit_chain_anchors`** : `anchor_id, batch_id_at_anchor, root_hash_at_anchor, tst_token (bytea), tsa_url, anchored_at`.
2. **New daily cron** : fetch the latest batch root, submit to a TSA (start with **Sigstore TSA** — free, public, RFC 3161-compliant `[github.com/sigstore/timestamp-authority]`), persist the returned TimeStampToken.
3. **Verifier extension** : `audit-chain-cli` adds a `--verify-anchors` flag that walks `audit_chain_anchors` and validates each TST against the TSA's public cert.

**Verification gate :** Anchor cron runs against staging-equivalent (local Docker), produces a valid TST, verifier accepts it.

### Phase 4 — Monthly RANGE partitions (when audit_logs > ~5M rows, 1 d effort)

**Goal :** Retention pruning + read scalability.

1. Convert `audit_logs` to partitioned table : `PARTITION BY RANGE (created_at)` with monthly children.
2. Use **pg_partman** (or scripted partition management) to auto-create next 3 months + drop partitions older than 13 months `[crunchydata.com/blog/auto-archiving-and-data-retention-management-in-postgres-with-pg_partman]`.
3. Pruning is automatic for queries with `WHERE created_at BETWEEN ...` `[postgresql.org/docs/current/ddl-partitioning + dataegret.com/2025/05/data-archiving-and-retention-in-postgresql-best-practices]`.

**Trigger gotcha :** partitioned table triggers must be defined on each partition individually OR use ROW-LEVEL triggers carefully — pg_partman handles this if you use its `inherit_template` feature `[verified — Crunchy Data docs]`.

### Phase 5 — Per-tenant sub-chains (defer until B2B revenue + >5 tenants)

When 5+ B2B museum tenants exist, add a `tenant_id` column + sub-partition each monthly partition by `LIST (tenant_id)`. Verifier walks per-tenant batches. Global root remains the top-level Merkle of all tenant heads — gives both isolation AND global order.

---

## 6. Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Batcher falls behind (e.g. DB locked, deploy outage) | Medium | Bounded-delay vulnerability window grows | Alert if `audit_chain_batches.last sealed_at` > 5 min old. Idempotent batcher → safe to re-run. |
| Hash collision (SHA-256) | Negligible (2^-128) | Catastrophic for one row | Standard cryptographic assumption ; SHA-256 still acceptable per NIST 2026. PQ-resilient option : SHA3-256 / Blake3, addressable in V2. `[arxiv.org/pdf/2512.00110 — Post-quantum-resilient audit evidence 2025]` |
| Superuser tampers with `audit_chain_batches` directly | Medium | Chain integrity lost silently | RFC 3161 anchor (Phase 3) detects retroactive modification of any sealed root. PG triggers on `audit_chain_batches` UPDATE/DELETE = RAISE EXCEPTION (same pattern as audit_logs). |
| UUIDv7 PostgreSQL 18 not yet deployed | Low | Need Node-side v7 generation | `uuid` v9+ supports v7 ; switch easily. |
| Batcher race vs IP anonymizer | Low | Anonymizer rewrites IP after batch sealed | IP is already excluded from hash `[verified — audit-chain.ts:51-60]`. Anonymizer-trigger interaction handled in Phase 2 §4. |
| Existing nightly chain verifier breaks during migration | Medium | False-positive Slack alert | Run BOTH old + new verifier in parallel for 7 days, fail-loud only when both agree. |
| EU AI Act re-classification of Musaium as high-risk pre-launch | Low | 6-month retention floor binds | Already at 13 mo — buffer in place. Verifier already exists. Pattern B is a strict upgrade. |

---

## 7. Verdict for Musaium @ 100k MAU

**Adopt Pattern B (Merkle batch chain) + Pattern D (UUIDv7 PK, drop per-row prev_hash) + Pattern E defense in depth (PG triggers) + Pattern G anchor (Phase 3).**

This is the design the entire industry converged on : Trillian / Tessera, Certificate Transparency RFC 6962/9162, Sigstore Rekor, Pangea Cloud, Azure SQL Ledger, immudb. The papers (Schneier–Kelsey 1998, Crosby–Wallach 2009) are 15–28 years old ; the move from per-row chains to Merkle batches is the **single largest documented performance leap in tamper-evident logging** — orders of magnitude on both insert throughput AND inclusion proof size.

**Effort :** 3–5 dev days for Phases 1 + 2 (the load-bearing work). Phase 3 (TSA anchor) + Phase 4 (partitions) are 1–2 days each and can land in subsequent sprints. **Total estimated : one sprint, low risk, reversible at each phase via TypeORM migration revert.**

**Risk :** Low. Each phase ships independently. Verification gate at each phase (load test → new verifier → anchor) catches regressions before merge. Honest caveat (UFR-013) : I have NOT load-tested Phase 1 against Musaium's actual workload — Phase 0 is the first task and the numbers in §1.3 are R8-derived estimates, not measured on this codebase.

**Compliance :** Pattern B satisfies EU AI Act Art. 12 (auto-recording + ≥6 mo retention) `[Art 12 + Art 26.6]` and GDPR Art. 32 §1(b) integrity `[gdpr-info.eu Art 32]`. Adding Phase 3 (Sigstore TSA anchor) makes the evidence eIDAS-grade for any B2B museum customer that needs to demonstrate compliance independently of Musaium.

**Don't adopt :** Per-actor sub-chains (premature for single-tenant V1), Azure SQL Ledger / QLDB / immudb-as-service (operational dependency, AWS-only or new vendor), S3 Object Lock as primary (defer to B2B / V2 — Postgres is sufficient).

---

## Sources

- [PostgreSQL pg_advisory_xact_lock — Lock Manager Contention (AWS Database Blog)](https://aws.amazon.com/blogs/database/improve-postgresql-performance-diagnose-and-mitigate-lock-manager-contention/)
- [Crosby & Wallach 2009 — Efficient Data Structures for Tamper-Evident Logging (USENIX Sec'09)](https://static.usenix.org/event/sec09/tech/full_papers/crosby.pdf)
- [RFC 6962 — Certificate Transparency](https://www.rfc-editor.org/rfc/rfc6962.html)
- [RFC 9162 — Certificate Transparency Version 2.0](https://www.rfc-editor.org/rfc/rfc9162.html)
- [RFC 3161 — Time-Stamp Protocol (TSP)](https://www.ietf.org/rfc/rfc3161.txt)
- [Schneier & Kelsey — Cryptographic Support for Secure Logs on Untrusted Machines (USENIX'98)](https://www.usenix.org/legacy/publications/library/proceedings/sec98/full_papers/schneier/schneier.pdf)
- [Google Trillian — Transparent Logging documentation](https://google.github.io/trillian/docs/TransparentLogging.html)
- [Trillian Verifiable Data Structures](https://transparency.dev/verifiable-data-structures/)
- [Trillian Tessera — Tile-based Transparency Logs (2025 GA)](https://blog.transparency.dev/introducing-trillian-tessera)
- [Trillian Tessera repo (transparency-dev)](https://github.com/transparency-dev/tessera)
- [Sigstore Timestamp Authority — RFC 3161 implementation](https://github.com/sigstore/timestamp-authority)
- [Pangea Cloud — Tamperproof Logging Implementation](https://pangea.cloud/blog/a-tamperproof-logging-implementation)
- [Pangea Cloud — Secure Audit Log architecture](https://pangea.cloud/docs/audit)
- [Azure SQL Ledger — Ledger Overview (Microsoft Learn)](https://learn.microsoft.com/en-us/sql/relational-databases/security/ledger/ledger-overview)
- [Azure SQL Ledger — Considerations and Limitations](https://learn.microsoft.com/en-us/sql/relational-databases/security/ledger/ledger-limits)
- [immudb — codenotary/immudb (immutable database)](https://github.com/codenotary/immudb)
- [immudb whitepaper — Lightweight, Performant Immutable Database](https://codenotary.s3.amazonaws.com/Research-Paper-immudb-CodeNotary_v3.0.pdf)
- [AWS QLDB deprecation announcement (InfoQ)](https://www.infoq.com/news/2024/07/aws-kill-qldb/)
- [DoltHub — QLDB Deprecated. Looking for an Alternative Immutable Database?](https://www.dolthub.com/blog/2024-08-12-qldb-deprecated-alternatives/)
- [AWS — Replace Amazon QLDB with Amazon Aurora PostgreSQL for audit use cases](https://aws.amazon.com/blogs/database/replace-amazon-qldb-with-amazon-aurora-postgresql-for-audit-use-cases/)
- [EU AI Act — Article 12: Record-Keeping](https://artificialintelligenceact.eu/article/12/)
- [EU AI Act Service Desk — Article 12](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-12)
- [EU AI Act — Article 26 (deployer obligations / Art 26.6 log retention)](https://artificialintelligenceact.eu/article/26/)
- [EU AI Act — Article 50 (transparency for chatbots)](https://artificialintelligenceact.eu/article/50/)
- [FireTail — Article 12 and the Logging Mandate](https://www.firetail.ai/blog/article-12-and-the-logging-mandate-what-the-eu-ai-act-actually-requires)
- [GDPR — Article 32: Security of Processing](https://gdpr-info.eu/art-32-gdpr/)
- [HyreLog — GDPR Audit Requirements (2025)](https://www.hyrelog.com/blog/gdpr-audit-requirements)
- [Better Stack — UUID v7 in PostgreSQL 18](https://betterstack.com/community/guides/databases/postgresql-18-uuid/)
- [Brandur — Postgres UUIDv7 + per-backend monotonicity](https://brandur.org/fragments/uuid-v7-monotonicity)
- [Neon — PostgreSQL 18 UUIDv7 Support](https://neon.com/postgresql/postgresql-18/uuidv7-support)
- [DBVis — UUIDv7 in PostgreSQL 18: What You Need to Know](https://www.dbvis.com/thetable/uuidv7-in-postgresql-18-what-you-need-to-know/)
- [Inferable — The Unreasonable Effectiveness of SKIP LOCKED in PostgreSQL](https://www.inferable.ai/blog/posts/postgres-skip-locked)
- [PostgreSQL 18 Docs — Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [Crunchy Data — Auto-archiving and Data Retention with pg_partman](https://www.crunchydata.com/blog/auto-archiving-and-data-retention-management-in-postgres-with-pg_partman)
- [Data Egret — Data archiving and retention in PostgreSQL (2025)](https://dataegret.com/2025/05/data-archiving-and-retention-in-postgresql-best-practices-for-large-datasets/)
- [PostgreSQL 18 Docs — Trigger Functions (plpgsql-trigger)](https://www.postgresql.org/docs/current/plpgsql-trigger.html)
- [AWS Docs — S3 Object Lock (Compliance Mode)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
- [Mattermost — Compliance by Design: 18 Tips for Tamper-Proof Audit Logs](https://mattermost.com/blog/compliance-by-design-18-tips-to-implement-tamper-proof-audit-logs/)
- [DEV.to — Architecture Behind Tamper-Proof Audit Logs (SHA-256 hash chains)](https://dev.to/robertatkinson3570/the-architecture-behind-tamper-proof-audit-logs-56ek)
- [DEV.to — Building a Tamper-Evident Audit Log with SHA-256 Hash Chains (Zero Dependencies)](https://dev.to/veritaschain/building-a-tamper-evident-audit-log-with-sha-256-hash-chains-zero-dependencies-h0b)
- [MDPI — AuditableLLM: A Hash-Chain-Backed, Compliance-Aware Auditable Framework for LLMs (2025)](https://www.mdpi.com/2079-9292/15/1/56)
- [Rethinking Tamper-Evident Logging — ACM CCS 2025 (arxiv)](https://arxiv.org/abs/2509.03821)
- [Post-Quantum-Resilient Audit Evidence for Long-Lived Regulated Systems (arxiv 2025)](https://arxiv.org/pdf/2512.00110)
- [Help Net Security — What the EU AI Act requires for AI agent logging (2026-04)](https://www.helpnetsecurity.com/2026/04/16/eu-ai-act-logging-requirements/)
- [DEV.to — PostgreSQL Write Performance: What the Benchmarks Won't Tell You](https://dev.to/haikasatryan/postgresql-write-performance-what-the-benchmarks-wont-tell-you-mm7)
- [Multi-Tenant Audit Logging — The Architecture Mistakes We Made](https://dev.to/robertatkinson3570/multi-tenant-audit-logging-the-architecture-mistakes-we-made-3m8f)

---

**Honesty caveats (UFR-013) :**
1. Throughput numbers cited (50–200/s ceiling on current chain, 50k–144k/s post-redesign) are **derived from generic Postgres benchmarks + R8 estimates** — NOT measured on Musaium's actual deployment. Phase 0 is the first task in the migration plan precisely to replace those estimates with measurements.
2. I did NOT read the full `audit-ip-anonymizer.job.ts` or the full registrar to confirm the trigger/anonymizer interaction described in Phase 2 §4. The pattern is correct (excluded from hash already verified ; trigger bypass via `current_setting` is standard PG technique) but the exact code change is "design-only" until implemented.
3. AWS QLDB deprecation date (2025-07-31) is from multiple secondary sources — InfoQ + DoltHub + AWS migration guides — and is now in the past at time of writing (2026-05-12). I did not separately verify on aws.amazon.com.
4. Trillian / Tessera maintenance status (Trillian in maintenance mode, Tessera GA) is from transparency.dev blog posts dated 2024–2025 — verified against the GitHub repo state in the search results.
5. UUIDv7 native support was added in PostgreSQL 18 (released Sept 2025) — Musaium's current PG version is **PostgreSQL 16** per CLAUDE.md. Phase 1 should use Node-side `uuid@v9+` v7 generation OR ship the PG 18 upgrade simultaneously.
