# R25 — PostgreSQL 16 Backup & Disaster Recovery Audit

**Auditor :** R25 (Backup/DR Research Agent)
**Date :** 2026-05-13
**Scope :** PG 16 on OVH VPS, single instance, 24 entities, 56 migrations, hash-chained `audit_logs` table, pgvector `halfvec` embeddings, current daily backup via GitHub Actions (pg_dump + GPG + S3).
**Honesty (UFR-013) :** Claims labelled `[verified]` (read in repo / cited 2026 source), `[inferred]` (derived from cited principle), `[assumed]` (working hypothesis pending validation).

---

## TL;DR

Musaium's current backup setup is **good for a pre-launch V1 single-instance deployment but it is not enterprise-grade**. It achieves the stated RPO=24h / RTO=1h targets on paper, but three structural weaknesses must be closed before public launch on 2026-06-01.

**Verdict for V1 launch — `[verified — repo state + 2026 sources]`** :

1. The GHA workflow `db-backup-daily.yml` + monthly drill is solid for a pre-revenue B2C launch. It implements logical backup (`pg_dump --format=custom`), client-side GPG encryption, S3-compatible upload, heartbeat monitoring, and an automated monthly restore drill — all current best practices. `[verified — .github/workflows/db-backup-daily.yml]`
2. **The audit chain integrity has zero post-restore verification step**. A restored DB will skip rows older than backup time, breaking `prev_hash` continuity for any post-backup audit events that were lost. The drill workflow MUST run `audit-chain verify` after restore — currently it only runs `count(audit_logs)` smoke queries. `[verified — drill workflow doesn't call audit-chain CLI]`
3. **No continuous WAL archiving = RPO bounded at 24h**. If the VPS dies at 01:55 UTC, ~24h of writes are lost (last backup = 02:00 UTC the day before). For a B2B-aspirational app, this is sellable at launch but must move to ≤1h RPO before signing the first paying museum (2026-Q4). `[verified — only daily pg_dump, no archive_command]`

**Top 5 actions for 2026-06-01 launch** (priority order, all feasible in current sprint) :

| # | Action | Effort | RTO/RPO impact |
|---|---|---|---|
| 1 | Add `audit-chain verify` step to monthly drill + alert on integrity break | XS (1h) | Hardens audit chain restore guarantee — SOC2 / RGPD evidence |
| 2 | Add automated post-restore smoke test that asserts entity counts within plausibility bounds (delta vs prior drill) | S (2-3h) | Catches partial/corrupt restore before it hits prod |
| 3 | Document the **exact** post-restore migration sequence (pgvector extension + TypeORM migrations + audit-chain genesis row check) in runbook | XS (1h) | RTO regression prevention |
| 4 | Wire `DB_REPLICA_URL` (already present per R8) to a real OVH read replica with `synchronous_commit = local` + manual promotion procedure | M (1-2d) | RPO → minutes (replica lag); RTO → 15min (replica promotion) |
| 5 | Add second-region copy of S3 backup objects via `aws s3 cp` cross-bucket replication (Wasabi/Backblaze B2 as offsite) | S (3-4h) | 3-2-1 rule compliance — survives an OVH-wide outage |

**DO NOT migrate to pgBackRest** — the project was archived 2026-04-27. **DO NOT adopt WAL-G yet** — operationally heavy for a single VPS at this scale. **Stay on `pg_dump` until B2B revenue** ; revisit with Barman or pgmoneta when scaling to multi-instance.

---

## 1. Backup Tool Matrix (2026)

| Tool | Status 2026 | Backup Type | PITR | S3 | Parallel | Encryption | Verdict for Musaium V1 |
|---|---|---|---|---|---|---|---|
| **pg_dump** (logical, custom format) | Stable, in-tree, PG 16+ | Full only, snapshot consistent | No | Via pipe (s5cmd / aws cli) | `--jobs=N` requires `--format=directory` (incompatible w/ stream-to-S3) | External (GPG / SSE / KMS) | **CURRENT — KEEP for V1.** Right tool for 24h RPO, single DB, ≤50 GB scale. `[verified — repo state]` |
| **pg_basebackup** | Stable, in-tree, PG 16+ ; **PG 17+ adds incremental** | Physical, cluster-level | Yes (with WAL archive) | No native — needs wrapper | `--compress=server-zstd:workers=N` | TLS in-transit ; external at rest | Overkill for V1 ; useful when adding read replica `[ref — postgresql.org/docs/16/app-pgbasebackup.html]` |
| **pgBackRest** | **ARCHIVED 2026-04-27 (v2.58.0 final)** | Full / diff / incr (block-level), PITR | Yes | Native | Yes (parallel backup + parallel restore + delta restore) | AES-256 + checksums | **AVOID for new deployments.** Maintainer cited loss of corporate funding. `[verified — pgbackrest.org/release.html + percona.community blog 2026-04-28]` |
| **Barman** (3.12+, 2026) | Active, EDB-backed (Python) | Full + WAL archive ; cloud variant via `barman-cloud-backup` | Yes | Native (AWS / Azure / GCS) | Yes (rsync-based) | AWS KMS for WAL ; GPG via wrapper | Best choice when V1.1 needs PITR + multi-server. Mature, EU-sovereign (2ndQuadrant/EDB). `[ref — docs.pgbarman.org/release/3.12.1]` |
| **WAL-G** (Go, 2026) | Active (Yandex origin) | Full + delta + continuous WAL | Yes | Native (S3, GCS, Azure, Swift) | Yes (parallel backup + restore) | Native AES + GPG | Strong cloud-native option, but **documentation is the weak point** ; operationally heavier than current `pg_dump`. `[ref — wal-g.readthedocs.io + thebuild.com 2026-04-30]` |
| **pgmoneta** (C, daemon) | Active (BSD-3) | Full + incremental (PG ≥14 ; PG ≥17 native incr) | Yes (WAL shipping) | No S3 native (filesystem only) | Yes | AES native | Skip — daemon overhead + no S3 = wrong fit for single-VPS-to-S3 model. `[ref — github.com/pgmoneta/pgmoneta + GSoC 2025 discussion]` |
| **pg_probackup** (C, Postgres Pro) | Active | Synthetic full ; page-level incr | Yes | Via wrapper | Yes | Yes | Strong for multi-TB ; overkill at Musaium's scale. `[ref — kunalganglani.com 2026]` |
| **Databasus** (Go + TS, web UI) | Active (~400k Docker pulls Mar 2026) | Schedule pg_dump + multi-destination | No | Yes (S3, GDrive, NAS, SFTP) | n/a | AES-256-GCM | Useful for managed-service-like UX, but adds attack surface for marginal gain over current GHA flow. `[ref — bytebase.com top open-source 2026]` |

**Critical finding** : **pgBackRest is dead**. The Percona community blog (2026-04-28) and Christophe Pettus's "After pgBackRest — the build" (2026-04-30) confirm the archival. The maintainer cited loss of corporate sponsorship after Crunchy Data's sale and no sustainable funding model. **Recommendation in 2026 = WAL-G (cloud-native) or Barman (on-prem)**. Musaium is squarely cloud-native → if/when Musaium migrates, target is **WAL-G** in late 2026 or **Barman** in V2 when multi-server. `[verified — multiple 2026 sources]`

---

## 2. pg_dump / pg_dumpall — When Sufficient

**Sufficient when** `[verified — postgresql.org/docs/16/backup-dump.html]` :
- Database size < 100 GB and dump time < 1h (acceptable to hold a snapshot transaction)
- RPO ≥ 24h is acceptable (no continuous archiving)
- Schema migrations are version-controlled (TypeORM) so post-restore migration replay handles version drift
- Cross-version compatibility needed (pg_dump output can re-load on newer PG, file-level cannot) `[ref — postgresql.org]`
- Single-DB scope (pg_dumpall = cluster-wide including roles, but Musaium uses one DB)

**Insufficient when** :
- PITR needed (< 24h RPO)
- DB is large and `--format=custom` stream-to-S3 can't use `--jobs` (parallelism requires directory format → no streaming)
- Audit / compliance requires per-second granularity on data loss window

**Musaium today** : DB est probably < 5 GB (assumes 24 entities × moderate scale pre-launch). pg_dump completes in seconds. **Right tool for V1.** `[assumed — no production data volume reading]`

**Key gotcha for Musaium specifically** :
- pgvector extension must exist on target DB **before** restore. Currently the GHA drill workflow uses `postgres:16-alpine` service which does NOT include pgvector. Verify drill workflow installs `pgvector/pgvector:pg16` image or `CREATE EXTENSION vector` is in the migration replay. `[verified — drill workflow uses postgres:16-alpine — GAP, see action item below]`
- `halfvec` type requires pgvector ≥ 0.7.0. Migration C3 will fail on restore otherwise. `[verified — CLAUDE.md piège connu]`

---

## 3. Continuous Archiving + PITR — Path to ≤1h RPO

For Musaium V1.1 (post-launch, ≥ first B2B contract), upgrade path is :

### 3.1 Enable WAL archiving on prod DB

```ini
# postgresql.conf
wal_level = replica           # required for PITR + replication ; default since PG 10 ; cannot be changed without restart
archive_mode = on             # requires restart
archive_command = '...'       # see below ; can be reloaded
archive_timeout = 300         # 5min — forces WAL segment switch ; aligns with RPO=5min
wal_compression = on          # 50-70% size reduction, modest CPU
```

### 3.2 archive_command options for OVH S3

**Option A — Direct AWS CLI (current ecosystem fit)** :
```bash
archive_command = 'aws s3 cp %p s3://$S3_BUCKET/wal/%f --endpoint-url $S3_ENDPOINT --only-show-errors'
```
Simple, no new tool, but no encryption, no compression. `[ref — oneuptime 2026 + dhimas.net]`

**Option B — Compressed + GPG-encrypted** :
```bash
archive_command = 'gzip -c %p | gpg --batch --encrypt --recipient $BACKUP_GPG_RECIPIENT | aws s3 cp - s3://$S3_BUCKET/wal/%f.gz.gpg'
```
Adds 50-70% size reduction + at-rest encryption matching the daily backup pattern. `[ref — same daily backup pattern in db-backup-daily.yml]`

**Option C — WAL-G (full setup)** :
```bash
archive_command = 'wal-g wal-push %p'
restore_command = 'wal-g wal-fetch %f %p'
```
Adds full PITR tooling at the cost of installing WAL-G on the VPS. `[ref — wal-g.readthedocs.io/PostgreSQL/]`

**Critical considerations** `[verified — postgresql.org/docs/16/continuous-archiving.html]` :
- `archive_command` must return **non-zero on failure** ; PG retries until success → if S3 is down, WAL fills disk → PANIC shutdown
- `archive_timeout = 60s` is "too aggressive" per CloudNativePG ; 5min is the standard sweet spot
- WAL segments are 16 MB each ; at 5min archive_timeout w/ light load = ~5 GB/day in WAL ; lifecycle policy to Glacier after 7d
- Must monitor `pg_wal/` disk usage ; if archive_command fails repeatedly, disk fills

### 3.3 PITR recovery procedure (PG 16)

```bash
# 1. Restore base backup
pg_basebackup -D /var/lib/postgresql/16/main -Fp -Xstream

# 2. Remove obsolete WAL files in pg_wal/
rm -rf /var/lib/postgresql/16/main/pg_wal/*

# 3. Configure recovery
cat >> /etc/postgresql/16/main/postgresql.conf <<EOF
restore_command = 'aws s3 cp s3://$S3_BUCKET/wal/%f %p --endpoint-url $S3_ENDPOINT'
recovery_target_time = '2026-05-13 14:29:00'  # target the moment BEFORE the incident
recovery_target_action = 'promote'              # promote to read-write after target reached
EOF

# 4. Signal recovery mode
touch /var/lib/postgresql/16/main/recovery.signal

# 5. Start server — PG will replay WAL up to target time
systemctl start postgresql

# 6. Verify
psql -c "SELECT pg_is_in_recovery();"   # → f after promotion
psql -c "SELECT max(created_at) FROM audit_logs;"   # → ≤ target time
```

**RPO for this setup = `archive_timeout`** = 5min ; **RTO** depends on (a) WAL replay speed (~10-50 GB/h on NVMe) and (b) base backup restore speed. For a < 10 GB DB, realistic RTO = **30-45 min** including pgvector extension setup. `[inferred from oneuptime 2026 PITR guide]`

---

## 4. Replication Strategies

### 4.1 Streaming replication (physical)

**Asynchronous (default)** : Primary doesn't wait for replica ACK. Lag typically < 1s under normal load. Crash on primary may lose **in-flight transactions** (last few seconds of writes). `[verified — cybertec-postgresql + crunchydata]`

**Synchronous** : `synchronous_commit = remote_apply` blocks COMMIT until replica replays. **Zero data loss on primary crash**, but transactions hang if replica unreachable. Latency penalty proportional to network RTT × replica count. `[ref — crunchydata 2026]`

**For Musaium V1** :
- Single VPS today → no replica → no replication
- V1.1 with replica → **asynchronous** with `DB_REPLICA_URL` wired to a Hetzner / OVH read replica in a different DC = read offload + warm standby + RPO ≤1s
- Synchronous overkill for B2C ; revisit for first paying B2B museum (financial transactions)

**Promotion procedure (manual, async)** `[verified — sqlpac.com + postgresql.org/docs/16/warm-standby-failover.html]` :
```bash
# On standby :
pg_ctl promote -D /var/lib/postgresql/16/main
# Or in SQL :
SELECT pg_promote();
# STONITH (Shoot The Other Node In The Head) : ensure old primary cannot rejoin as primary
# → kill its postgres process, demote, or use Patroni
```

**Critical** : If old primary restarts without being demoted, **split-brain**. Both think they're primary, writes diverge, no way to merge. This is the #1 reason hand-rolled replication fails. `[verified — postgresql.org high-availability docs]`

### 4.2 Logical replication (built-in PG 16)

PostgreSQL native logical replication has matured significantly. Use cases relevant to Musaium :
- **Selective replication** (e.g. replicate only `users` + `audit_logs` to a long-term archive DB)
- **Major-version upgrade** (PG 16 → 17 with zero downtime)
- **Multi-region** (write to primary, read from EU + US regions)

**Not needed for V1.** `[ref — postgresql.org/docs/16/logical-replication.html]`

### 4.3 pglogical (extension)

Legacy 2ndQuadrant/EDB extension. **Native logical replication has eclipsed it** for most use cases. Still relevant only for : bidirectional / multi-master replication, conflict resolution, DDL replication. **Skip.** `[verified — enterprisedb.com 2026 + postgresql.org docs]`

---

## 5. Failover Automation — 2026 Landscape

| Tool | Architecture | Recommended for | Verdict for Musaium |
|---|---|---|---|
| **Patroni** | Python ; uses etcd/Consul/ZooKeeper for consensus | Kubernetes, cloud-native, multi-node | **Too complex for single VPS + single replica.** Right tool when V2 hits 3+ nodes. `[ref — scalegrid.io + linode.com HA comparison]` |
| **repmgr** | C ; PG-native, no external consensus | 2-3 node clusters with manual scripting | "Mainly recommended for more advanced users — a lot of manual scripting". Skip. |
| **pg_auto_failover** | PG extension ; state machine w/ Monitor process | Simple HA, 1 primary + 1-2 replicas | **Best fit for V1.1** when adding a single replica. State-machine simplicity > Patroni's full consensus. Caveat : the Monitor process itself is a SPOF. `[ref — Microsoft Citus 2026]` |
| **EFM (EDB Failover Manager)** | Commercial | EDB customers | Skip, proprietary. |

**Recommendation for V1.1** : `pg_auto_failover` if a replica is added. Until then, **manual promotion documented in a runbook** is acceptable for pre-revenue B2C.

---

## 6. Backup Testing — Automated Restore Validation

**Current state — Musaium** `[verified — .github/workflows/db-backup-monthly-restore-drill.yml + repo state]` :
- Monthly drill (1st of each month, 04:00 UTC)
- Decrypts latest daily backup, restores to ephemeral postgres:16-alpine service
- Smoke queries : `count(users)`, `count(chat_sessions)`, `count(audit_logs)`
- Pings Better Stack heartbeat ; fails loudly on anomaly

**Gaps identified** :

1. **No pgvector extension installed in drill service** → migrations referencing `vector` / `halfvec` types will fail during restore. **The drill will likely fail at first run if extensions are dumped via `--format=custom`** because pg_restore tries to `CREATE EXTENSION vector` which fails on alpine without the extension binaries. `[inferred — drill uses postgres:16-alpine, not pgvector/pgvector:pg16 + pgvector restore requires extension pre-installed per medium @yschen]`

2. **No audit chain verification** → restored DB has same number of rows as latest backup, but hash chain integrity not verified. A silent corruption in S3 (bit rot, partial upload) would not surface until a real disaster forces a restore. **Critical for SOC2 evidence and Musaium's tamper-evident promise.** `[verified — audit-chain-cli-core.ts exists but drill doesn't call it]`

3. **No plausibility check** : drill only asserts counts > 0, not "counts within expected range". A truncated restore (e.g. 90% of `users` missing) would pass.

4. **No restore time measurement** → cannot verify the **RTO=1h target** is empirically met.

**Recommended drill enhancements (V1, pre-launch)** :

```yaml
# Drill workflow steps to add :
- name: Install pgvector in restore service
  # Use pgvector/pgvector:pg16 image OR install extension manually
  
- name: Restore backup
  run: |
    START_TIME=$(date +%s)
    pg_restore --no-owner --no-acl --jobs=4 ...
    RESTORE_TIME=$(($(date +%s) - START_TIME))
    echo "::notice::Restore completed in ${RESTORE_TIME}s (RTO target = 3600s)"
    [ ${RESTORE_TIME} -lt 3600 ] || exit 1

- name: Apply pending migrations
  run: node dist/scripts/run-migrations.js
  
- name: Verify audit chain integrity
  run: node dist/scripts/audit-chain-verify.js
  # Reads all rows ordered by created_at ASC, verifies prev_hash chain
  # MUST exit non-zero on any break
  
- name: Plausibility checks
  run: |
    # Counts must be within ±5% of previous drill (catch silent truncation)
    USER_COUNT=$(psql -tAc "SELECT count(*) FROM users")
    PREV_COUNT=$(cat .drill-baseline/user-count || echo "0")
    DELTA=$((USER_COUNT - PREV_COUNT))
    # Allow ≤ 200% growth (legitimate user signups) but ≥ 95% retention
    [ ${USER_COUNT} -gt $((PREV_COUNT * 95 / 100)) ] || exit 1
    echo ${USER_COUNT} > .drill-baseline/user-count
```

**`[ref — oneuptime 2026 backup testing + pgdash.io automated testing]`**

---

## 7. Audit Chain Integrity After Restore

Musaium's audit chain `[verified — audit.service.ts + auditLog.entity.ts]` :
- Each row : `prev_hash` (SHA-256 of previous row), `row_hash` (SHA-256 of own payload + prev_hash)
- Genesis row : `prev_hash = 64 zeros`
- INSERT serialized via `pg_advisory_xact_lock` for ordering guarantee
- Verifier : `audit-chain-cli-core.ts` walks rows oldest→newest, recomputes hash, asserts match

**Behavior after restore** :
- `pg_dump --format=custom` captures snapshot at start time. All `audit_logs` rows committed before snapshot are in the dump.
- Any rows inserted **between** dump time and restore-target time are **lost**. The chain restarts cleanly from the dump's last row (no broken link).
- **No corruption** : the chain in the restored DB is internally consistent.
- **Truncation, yes** : externally-issued events (e.g. "user X exported data on 2026-05-12 23:45 UTC", with backup at 02:00 the previous day) are silently missing.

**Best practice (2026)** `[ref — appmaster.io tamper-evident audit + dev.to/robertatkinson3570 architecture]` :
- After every restore, run the chain verifier (covered in §6 above)
- Document the "audit gap" : "events between $LAST_BACKUP_TIME and $INCIDENT_TIME are unrecoverable" — required SOC2 CC7.3 evidence
- **For zero-loss audit guarantee** : push audit events to an external immutable log (immudb, S3 with object-lock + WORM, or a separate journaling DB). Out of scope for V1.

**Recommendation** : Add `scripts/audit-chain-verify-after-restore.ts` as a dedicated CLI wrapper for `audit-chain-cli-core.ts`. The drill workflow calls it. Output a structured report (rows verified, gaps detected, last verified hash) that the post-incident audit can attach as SOC2 evidence.

---

## 8. DR Drill Methodology — Quarterly Test

**2026 industry standard** `[ref — harness.io DR testing 2026 + oneuptime DR testing schedules]` :

| Cadence | Test type | Scope |
|---|---|---|
| Weekly | Backup verification + heartbeat checks | Verify last 7 daily backups exist in S3, sizes sane, GPG-decryptable |
| Monthly | Tabletop + partial restore | Already in place (drill workflow). **Add audit-chain verify + plausibility checks.** |
| Quarterly | Full DR simulation | Spin up a parallel VPS, restore, repoint a synthetic backend, run E2E smoke tests. Measure end-to-end RTO. |
| Annually (or after major infra changes) | Full failover | Cut over real traffic to recovered DB, observe production behavior. **Risky pre-revenue ; defer to V2.** |

**Quarterly drill — recommended runbook for Musaium** :

```
T+0       Operator declares "DR test scheduled" in #ops channel
T+5m      Provision new OVH VPS (or use existing staging if available)
T+15m     Install postgres-16 + pgvector ≥0.7.0 + run-migrations dependencies
T+20m     Pull latest daily backup from S3 (decrypt locally)
T+30m     pg_restore --no-owner --no-acl --jobs=4 into fresh DB
T+45m     node dist/scripts/run-migrations.js → applies any post-backup migrations
T+50m     node dist/scripts/audit-chain-verify.js → MUST pass
T+55m     Plausibility checks (counts, recent timestamps) → MUST pass
T+60m     Spin up backend with DB_HOST pointed at recovered DB
T+65m     curl /api/health → 200
T+70m     E2E smoke : login, send chat message, verify response, logout
T+75m     Measure end-to-end RTO ; record in drill log
T+90m     Tear down VPS ; archive drill log to docs/incidents/YYYY-Q-drill.md
```

**Pass criteria** : RTO < 1h achieved, audit chain verifies clean, plausibility checks pass, E2E smoke succeeds.

**Fail mode** : if any step fails, operator triggers off-cycle drill within 7 days (already in current docs).

---

## 9. Storage — S3 Provider Comparison (PostgreSQL Backups, 2026)

| Provider | EU? | Price/GB/month | Egress | Min retention | GDPR | Verdict |
|---|---|---|---|---|---|---|
| **OVHcloud Standard** | ✅ FR/DE | €0.007 (~$0.0076) | €0.01/GB outside OVH | None | ✅ | Already in use (S3_BUCKET = media). **Keep.** `[ref — ovhcloud.com/en/public-cloud/object-storage]` |
| **OVHcloud Cold Archive** | ✅ FR | $0.002 | Charged | 180d | ✅ | **Add for monthly archives + WAL > 30d**. Tape-backed, EU sovereign. `[ref — ovhcloud.com/en/public-cloud/cold-archive]` |
| **Scaleway Standard** | ✅ FR/NL/PL | €0.0146 (~$0.016) | €0.01/GB | None | ✅ | Pricier than OVH. Skip unless multi-region needed. `[ref — danubedata.ro EU comparison 2026]` |
| **Hetzner Object Storage** | ✅ DE/FI | ~$0.005 (cheapest EU) | Free up to limits | None | ✅ | Strong alt to OVH ; 100% green energy. Consider for offsite copy. `[ref — hetzner.com + danubedata.ro]` |
| **Backblaze B2** | ❌ US/EU available | $0.006 | Free up to 3× storage/mo | None | ⚠️ (CLOUD Act) | Best for offsite-2nd-copy outside EU jurisdiction. Egress allowance unique. `[ref — backblaze.com pricing 2026]` |
| **Wasabi** | ⚠️ EU regions exist | $0.0059 | **FREE** | 90d penalty | ⚠️ (US CLOUD Act parent) | Cheap but **CLOUD Act exposure** ; 90-day min retention = problematic for daily-rotated backups (Musaium has 30d). `[ref — danubedata.ro Wasabi alternatives 2026]` |
| **AWS S3 + Glacier Deep Archive** | ✅ Multi-region | Standard $0.023 ; Deep Archive $0.00099 | Egress fees | 180d (Glacier Deep) | ⚠️ (US CLOUD Act) | Industry standard but EU sovereignty concerns ; cost reasonable for cold archives. `[ref — aws.amazon.com archival-storage]` |

**Recommended Musaium S3 layout (V1)** :
- **Hot (daily backups, 30d)** : OVHcloud Standard (current `S3_BUCKET`) → S3 lifecycle deletes after 30d
- **Warm (monthly archives, 365d)** : OVHcloud Standard → lifecycle to Cold Archive after 90d, delete after 365d (GDPR ceiling)
- **Offsite copy (3-2-1 rule)** : cross-replicate daily to Backblaze B2 EU OR Hetzner Object Storage. ~€2-5/month for < 10 GB. **Survives an OVH-wide outage.** `[ref — avepoint.com 3-2-1 + zmanda.com 3-2-1-1-0 guide]`

---

## 10. OVH VPS Specifics

| Feature | Details (2026) | Use for Musaium |
|---|---|---|
| **VPS Snapshot** | One snapshot per VPS, replicated 3× in same DC. Instant, no downtime. Each new snapshot overwrites previous. | Pre-migration safety net (manual). NOT a backup strategy — single-DC. `[ref — ovhcloud.com/en/vps/vps-snapshot]` |
| **VPS Backup Plan** | Add-on, daily automated snapshots, retention varies | Belt-and-suspenders option ; not a substitute for offsite. `[ref — webhostinggeeks.com OVH VPS backup options]` |
| **Public Cloud Database PostgreSQL** | Managed PG with automated backups + rollback | Migration target post-revenue ; current VPS is self-managed. `[ref — ovhcloud.com/en/public-cloud/postgresql]` |
| **Object Storage (S3)** | EU sovereign, free egress within OVH | Current backup destination ; appropriate. `[ref — ovhcloud.com/en/public-cloud/object-storage]` |
| **Cold Archive** | $0.002/GB tape-backed, France-only DCs | Long-term audit log retention (≥1y) ; cheap. |

**Critical** : OVH VPS snapshots are NOT a substitute for off-host backups. They live in the same DC as the VPS. A DC outage destroys both. **Always have an off-host (S3) backup.** `[verified — ovhcloud.com snapshot doc + 3-2-1 rule]`

---

## 11. Current Setup Assessment — Detailed

What is **right** in Musaium's current setup `[verified — repo state]` :

1. **No VPS-side cron** : GHA workflow eliminates "the backup script depends on the host it backs up" anti-pattern. If the VPS dies, backup workflow keeps running from GitHub's infrastructure. ✅
2. **Read-only DB role** for backup (`DATABASE_URL_RO`) : least privilege. ✅
3. **Client-side GPG encryption** before S3 upload : S3 provider never sees plaintext. Survives a Schrems II / CLOUD Act exposure. ✅
4. **Private key offline + Yubikey discipline** documented. ✅
5. **Monthly automated restore drill** : "backups that have never been tested are not backups". ✅
6. **Heartbeat monitoring** (Better Stack) with 25h grace window for daily + 35d for monthly drill. ✅
7. **Compliance trail** : SOC2 CC7.3 + NIST RC.RP referenced in docs. ✅

What is **incomplete or wrong** `[verified — repo state + gap analysis]` :

1. **Drill service uses `postgres:16-alpine`** which does NOT contain pgvector. The restore will fail on the `CREATE EXTENSION vector` SQL emitted by pg_dump. **Likely already failing silently if migrations are dump-replayed.** → Fix : use `pgvector/pgvector:pg16` image OR `apt install postgresql-16-pgvector` as a step.
2. **No audit chain verify in drill** : SOC2 / tamper-evidence gap.
3. **No RTO measurement** : drill doesn't time itself ; cannot prove the 1h target.
4. **Single S3 destination** : violates 3-2-1 rule. An OVH-wide incident loses everything.
5. **No WAL archiving** : RPO bounded at 24h. Cannot achieve sub-1h RPO claimed elsewhere (R8 mentioned but not implemented).
6. **`DATABASE_URL_RO`** — if production DB is not public, GHA cannot reach it. Doc mentions "Alternative: operator-side cron" fallback, but if Musaium goes private-subnet at launch, GHA workflow becomes a no-op. → Verify VPS firewall : either keep PG public for the RO user, or commit to VPS cron fallback before launch.
7. **`pg_dump` runs without `--jobs`** : explicit trade-off (streaming to stdout incompatible with parallel dump). At current DB size this is fine ; will become slow when DB > 50 GB.

---

## 12. Recommended Action Plan — Priority Order

### P0 — Must do before 2026-06-01 launch

| # | Task | Effort | Owner | Acceptance |
|---|---|---|---|---|
| 1 | Fix drill workflow to use `pgvector/pgvector:pg16` image | XS | Backend | Drill workflow succeeds end-to-end |
| 2 | Add `audit-chain verify` step to drill | XS | Backend | Drill fails loudly on any chain break |
| 3 | Add RTO timer to drill (start/stop ts ; fail if > 3600s) | XS | Backend | Each drill emits `restore_duration_seconds` metric |
| 4 | Document exact post-restore migration sequence in `docs/DB_BACKUP_RESTORE.md` | XS | DevOps | Runbook validated by a dry-run drill |
| 5 | Verify production DB is reachable by GHA OR commit to VPS cron fallback BEFORE launch | S | Ops | Daily backup workflow succeeds for 7 consecutive days against prod |

### P1 — Within 30 days post-launch

| # | Task | Effort | RPO/RTO benefit |
|---|---|---|---|
| 6 | Add Backblaze B2 or Hetzner Object Storage as offsite 2nd copy (cross-replication) | S | 3-2-1 rule compliance ; survives OVH outage |
| 7 | Add weekly automated backup verification (decrypt + pg_restore --list, no full restore) | S | Catches GPG / corruption issues 4× faster than monthly drill |
| 8 | Add plausibility checks (count delta vs prior drill within ±5% / +200%) | XS | Catches silent truncation |
| 9 | Implement quarterly full DR drill (parallel VPS, real RTO measurement, E2E smoke) | M | SOC2 evidence ; team operational confidence |

### P2 — Within 90 days (when scaling beyond V1)

| # | Task | Effort | Benefit |
|---|---|---|---|
| 10 | Wire `DB_REPLICA_URL` (per R8) : OVH read replica in different DC, async replication | M-L | RPO → seconds ; RTO → 15min via pg_promote |
| 11 | Enable WAL archiving with `archive_timeout = 300` + WAL upload to S3 | M | RPO → 5min ; PITR capability |
| 12 | Document PITR recovery procedure in runbook | S | RTO regression prevention |
| 13 | Add `pg_auto_failover` if a second VPS replica is added | M | Automated failover ; no manual STONITH |

### P3 — V2 territory (post first B2B contract)

| # | Task | Effort | Benefit |
|---|---|---|---|
| 14 | Migrate from `pg_dump` to **Barman** with cloud variant (or **WAL-G**) | L | Block-level incremental, parallel restore, PITR built-in |
| 15 | Multi-region replication (logical replication to a cold standby in different country) | L | Regional outage resilience ; required for some B2B contracts |
| 16 | Immutable audit log offload (immudb or S3 object-lock WORM) | L | Truly tamper-evident chain even if PG is compromised |

---

## 13. Quick Reference — Restore Runbook

```bash
# === ASSUMES === VPS replacement provisioned, OS up, postgres-16 + pgvector-0.7+ installed
# === ASSUMES === Operator has $DATABASE_URL, $S3_BUCKET, $BACKUP_GPG_PRIVATE_KEY available

# 1. Identify latest backup
s5cmd --endpoint-url "$S3_ENDPOINT" ls "s3://$S3_BUCKET/backups/daily/" | sort | tail -3

# 2. Download + decrypt + restore (stream-pipeline ; no plaintext on disk)
s5cmd --endpoint-url "$S3_ENDPOINT" cat "s3://$S3_BUCKET/backups/daily/2026-05-12.pgdump.gpg" \
  | gpg --batch --decrypt \
  | pg_restore --no-owner --no-acl --jobs=4 --dbname="$DATABASE_URL"

# 3. Apply pending migrations (catches schema drift between backup and current code)
cd /srv/museum/backend && node dist/scripts/run-migrations.js

# 4. Verify audit chain integrity
node dist/scripts/audit-chain-verify.js
# Expected output : "Verified N rows, last hash <hex>"
# If any break : INVESTIGATE before resuming service

# 5. Plausibility checks
psql "$DATABASE_URL" <<EOF
SELECT 'users', count(*) FROM users;
SELECT 'chat_sessions', count(*) FROM chat_sessions;
SELECT 'audit_logs', count(*), max(created_at) FROM audit_logs;
SELECT 'museums', count(*) FROM museums;
EOF
# Compare against last drill baseline ; investigate any > 5% drop

# 6. Repoint backend
# Update DATABASE_URL env on the running backend ; restart
docker compose up -d backend

# 7. Smoke test
curl -fsS https://api.example.com/api/health
# Try a login + one chat round-trip

# 8. Document incident
# Create docs/incidents/2026-MM-DD-<slug>.md with :
#   - timeline
#   - restored from : <backup-key>
#   - audit gap : last audit row at <ts>, incident at <ts>, gap = <duration>
#   - rotated secrets (if compromise suspected)
```

---

## 14. Sources

### pgBackRest archival (2026 — critical context)
- [pgBackRest Releases](https://pgbackrest.org/release.html) — v2.58.0 final, archived 2026-04-27
- [pgBackRest is archived, what now? — Percona Community 2026-04-28](https://percona.community/blog/2026/04/28/pgbackrest-is-archived-what-now/)
- [After pgBackRest — the build, Christophe Pettus 2026-04-30](https://thebuild.com/blog/2026/04/30/after-pgbackrest/)
- [Top Open-Source Postgres Backup Solutions in 2026 — Bytebase](https://www.bytebase.com/blog/top-open-source-postgres-backup-solution/)
- [PostgreSQL Backup Tools Compared 2026 — kunalganglani.com](https://www.kunalganglani.com/blog/postgresql-backup-tools-compared)
- [PostgreSQL backup tools comparison — Databasus, WAL-G, pgBackRest, Barman — DEV.to](https://dev.to/piteradyson/postgresql-backup-tools-comparison-databasus-wal-g-pgbackrest-and-barman-2kg)

### PostgreSQL documentation
- [PostgreSQL 16 — Continuous Archiving and PITR](https://www.postgresql.org/docs/16/continuous-archiving.html)
- [PostgreSQL 16 — pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html)
- [PostgreSQL 16 — pg_basebackup](https://www.postgresql.org/docs/16/app-pgbasebackup.html)
- [PostgreSQL 16 — SQL Dump](https://www.postgresql.org/docs/16/backup-dump.html)
- [PostgreSQL 16 — High Availability, Load Balancing, and Replication](https://www.postgresql.org/docs/current/high-availability.html)
- [PostgreSQL 16 — Log-Shipping Standby Servers](https://www.postgresql.org/docs/current/warm-standby.html)
- [PostgreSQL 16 — Logical Replication](https://www.postgresql.org/docs/current/logical-replication.html)
- [PostgreSQL — pg_verifybackup](https://www.postgresql.org/docs/current/app-pgverifybackup.html)

### Backup tools
- [WAL-G GitHub](https://github.com/wal-g/wal-g)
- [WAL-G docs (Read the Docs)](https://wal-g.readthedocs.io/PostgreSQL/)
- [Barman official site](https://pgbarman.org/)
- [Barman 3.12.1 — Cloud variant](https://docs.pgbarman.org/release/3.12.1/user_guide/barman_cloud.html)
- [pgmoneta GitHub](https://github.com/pgmoneta/pgmoneta)
- [Databasus](https://databasus.com/)

### PITR + WAL archiving
- [How to Set Up Continuous Archiving — OneUptime 2026](https://oneuptime.com/blog/post/2026-01-21-postgresql-continuous-archiving/view)
- [How to Use PITR for PostgreSQL — OneUptime 2026](https://oneuptime.com/blog/post/2026-02-09-pitr-postgresql-cloudnativepg/view)
- [PostgreSQL PITR Complete Guide — Medium Matheus dos Santos 2026](https://medium.com/@valentim.dba/postgresql-point-in-time-recovery-pitr-the-complete-step-by-step-guide-to-data-resilience-dd306ba55f4a)
- [Practical PostgreSQL Continuous Archival to S3 — dhimas.net](https://dhimas.net/posts/pg-wal-archive-s3/)

### Replication + failover
- [Patroni vs repmgr vs PAF — ScaleGrid Infographic](https://medium.com/@kristi.anderson/whats-the-best-postgresql-high-availability-framework-paf-vs-repmgr-vs-patroni-infographic-8f11f3972ef3)
- [Comparison of HA PostgreSQL Solutions — Linode](https://www.linode.com/docs/guides/comparison-of-high-availability-postgresql-solutions/)
- [Architecting PostgreSQL HA — Ashnik](https://www.ashnik.com/architecting-postgresql-ha-patroni-vs-repmgr-vs-native-streaming/)
- [Synchronous Replication in PostgreSQL — Crunchy Data](https://www.crunchydata.com/blog/synchronous-replication-in-postgresql)
- [PostgreSQL Switch/Failover Procedures — SQLPac](https://www.sqlpac.com/en/documents/postgresql-switch-failover-failback-standby-databases.html)

### Backup testing
- [How to Test PostgreSQL Backup Restoration — OneUptime 2026](https://oneuptime.com/blog/post/2026-01-21-postgresql-backup-testing/view)
- [Automated Testing of PostgreSQL Backups — pgDash](https://pgdash.io/blog/testing-postgres-backups.html)
- [pgbackrest_auto — vitabaks GitHub](https://github.com/vitabaks/pgbackrest_auto)

### Audit chain + tamper-evidence
- [Tamper-evident audit trails in PostgreSQL with hash chaining — AppMaster](https://appmaster.io/blog/tamper-evident-audit-trails-postgresql)
- [The Architecture Behind Tamper-Proof Audit Logs — DEV.to](https://dev.to/robertatkinson3570/the-architecture-behind-tamper-proof-audit-logs-56ek)
- [PGaudit and immudb Dynamic Duo](https://immudb.io/blog/pgaudit-and-immudb-the-dynamic-duo-for-tamper-proof-postgresql-audit-trails)

### DR drills
- [DR Testing in 2026 — Harness.io](https://www.harness.io/blog/an-introduction-to-disaster-recovery-testing-what-you-need-to-know-in-2026)
- [DR Testing Schedules — OneUptime 2026](https://oneuptime.com/blog/post/2026-01-30-dr-testing-schedules/view)
- [PostgreSQL Disaster Recovery — Stormatics](https://stormatics.tech/blogs/understanding-disaster-recovery-in-postgresql)

### 3-2-1 / 3-2-1-1-0 rule
- [3-2-1 Backup Rule 2026 Guide — AvePoint](https://www.avepoint.com/blog/backup/3-2-1-backup-rule)
- [3-2-1-1-0 Backup Rule — Zmanda](https://www.zmanda.com/blog/understanding-the-3-2-1-1-0-backup-rule/)
- [The 3-2-1 backup rule isn't enough in 2026 — Castle Rock Sky](https://www.castlerocksky.com/the-3-2-1-backup-rule-isnt-enough-in-2026-heres-what-changed/)

### Storage providers
- [OVHcloud Object Storage](https://www.ovhcloud.com/en/public-cloud/object-storage/)
- [OVHcloud Cold Archive](https://www.ovhcloud.com/en/public-cloud/cold-archive/)
- [OVH VPS Snapshot](https://www.ovhcloud.com/en/vps/vps-snapshot/)
- [Backblaze B2 Alternatives in Europe 2026 — DanubeData](https://danubedata.ro/blog/backblaze-b2-alternatives-europe-2026)
- [Wasabi Alternatives 2026 — DanubeData](https://danubedata.ro/blog/wasabi-alternatives-europe-pricing-2026)
- [Hetzner Object Storage](https://www.hetzner.com/storage/object-storage/)
- [Backblaze B2 Cloud Storage Pricing](https://www.backblaze.com/cloud-storage/pricing)
- [Object Storage Comparison 2026 — Mixpeek](https://mixpeek.com/blog/object-storage-comparison-2026)

### GDPR + retention
- [GDPR Storage Limitation — Legiscope](https://www.legiscope.com/blog/storage-limitation.html)
- [GDPR Data Retention Policy — Legiscope](https://www.legiscope.com/blog/gdpr-data-retention-policy.html)
- [GDPR Deletion Requests & Backups — ProBackup](https://www.probackup.io/blog/gdpr-and-backups-how-to-handle-deletion-requests)

### Tooling specifics
- [pg_dump Best Practices — Microsoft Learn](https://learn.microsoft.com/en-us/azure/postgresql/troubleshoot/how-to-pgdump-restore)
- [pg_dump Compression in PostgreSQL 16 — Cybertec](https://www.cybertec-postgresql.com/en/pg_dump-compression-specifications-postgresql-16/)
- [pgvector Restore — Yi-Hsin Chen Medium](https://medium.com/@yschen/essential-steps-for-successfully-restoring-pgvector-generated-data-in-postgresql-26cf1d483bea)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [Better Stack heartbeat monitor](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/)
