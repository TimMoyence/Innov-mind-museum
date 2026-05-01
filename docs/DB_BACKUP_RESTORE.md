# Database Backup & Restore

> **Authoritative source for SOC2 CC7.3 / NIST RC.RP-1.** The current production
> backup pipeline is the GitHub Actions workflow described in
> [Architecture (GHA-driven)](#architecture-gha-driven). The legacy VPS cron
> documented further down is **deprecated** and kept for historical reference
> only — operators commissioning new environments should not provision it.

## RTO / RPO Targets

| Metric | Target | How it is enforced |
|---|---|---|
| **RPO (Recovery Point Objective)** | 24h | Daily backup at 02:00 UTC. Worst-case data loss = traffic between last backup and incident. |
| **RTO (Recovery Time Objective)** | 1h | Restore drill (monthly) measures end-to-end time. See [Disaster recovery walkthrough](#disaster-recovery-walkthrough). |

Assumptions:
- Operator has an admin shell on the VPS or replacement host within 5 minutes of paging.
- The S3 backup bucket is reachable from the recovery host.
- The operator's GPG private key is available offline (Yubikey / paper key / 1Password). The drill workflow holds a CI-scoped copy for the monthly job — that copy must NEVER be the only one.

## Architecture (GHA-driven)

```
┌─ scheduled 02:00 UTC ─────────────────────────────────────────────────┐
│  GitHub Actions runner                                                │
│    1. pg_dump  --format=custom --no-owner --no-acl  $DATABASE_URL_RO  │
│    2. gpg --encrypt --recipient $BACKUP_GPG_RECIPIENT                 │
│    3. s5cmd pipe → s3://$S3_BUCKET/backups/daily/YYYY-MM-DD.pgdump.gpg│
│    4. heartbeat ping (Better Stack)                                   │
└───────────────────────────────────────────────────────────────────────┘

┌─ scheduled 1st of month, 04:00 UTC ───────────────────────────────────┐
│  GitHub Actions runner with postgres:16-alpine service                │
│    1. s5cmd ls + pick newest backups/daily/*.pgdump.gpg               │
│    2. gpg --decrypt (private key from BACKUP_GPG_PRIVATE_KEY secret)  │
│    3. pg_restore into the service postgres                            │
│    4. smoke queries: count(users), chat_sessions, audit_logs          │
│    5. fail loudly + notify Better Stack on any anomaly                │
└───────────────────────────────────────────────────────────────────────┘
```

- **No VPS systemd timer.** No SSH from the VPS to S3. The runner connects
  directly to Postgres via `DATABASE_URL_RO` (read-only role). If the production
  DB is **not** reachable from the public internet, see
  [Alternative: operator-side cron](#alternative-operator-side-cron).
- **Bucket reuse.** Backups land in the existing media S3 bucket
  (`S3_BUCKET`) under prefix `backups/daily/`. No second bucket is provisioned.
- **Encryption at rest.** Every object is GPG-encrypted to the operator's
  long-term key BEFORE leaving the runner. The S3 provider never sees plaintext.

### S3 layout

```
s3://$S3_BUCKET/
├── backups/
│   ├── daily/                 # written by db-backup-daily.yml
│   │   ├── 2026-04-26.pgdump.gpg
│   │   └── ...
│   └── monthly/               # operator-curated long-term archive (manual today)
│       └── 2026-04.pgdump.gpg
└── media/                     # untouched, existing app uploads
```

### Lifecycle policy (operator must apply at the S3 provider)

The workflow does NOT manage object expiration. Apply these rules at the
bucket level (Scaleway console / AWS S3 lifecycle / OVH UI):

| Prefix | Rule | Justification |
|---|---|---|
| `backups/daily/` | Delete after **30 days** | RPO 24h × 30 windows = full month of restore points. |
| `backups/monthly/` | Delete after **365 days** | GDPR retention ceiling for personal data dumps. |

Quick check after applying: `s5cmd ls s3://$S3_BUCKET/backups/daily/ \| wc -l` should stay under ~32.

### Required GitHub Actions secrets

Cross-link: see `docs/CI_CD_SECRETS.md` § DB Backup for full descriptions, scope, and rotation.

| Secret | Used by | Purpose |
|---|---|---|
| `DATABASE_URL_RO` | `db-backup-daily.yml` | Read-only Postgres role connection string for `pg_dump`. |
| `BACKUP_GPG_PUBLIC_KEY` | `db-backup-daily.yml` | ASCII-armored public key, recipient of every encryption. |
| `BACKUP_GPG_RECIPIENT` | `db-backup-daily.yml` + drill | Key ID or email matching `BACKUP_GPG_PUBLIC_KEY`. |
| `BACKUP_GPG_PRIVATE_KEY` | `db-backup-monthly-restore-drill.yml` ONLY | ASCII-armored private key. Drill scope only — daily backup must never need it. |
| `BACKUP_HEARTBEAT_URL` | both workflows | Better Stack heartbeat URL; `/fail` suffix used on failure. |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | both workflows | Same media bucket as the runtime app. |

### Operator runbook — first-time GPG key seeding

1. On a trusted workstation, generate (or reuse) a long-term backup key:
   ```bash
   gpg --quick-generate-key "Musaium DB Backups <ops@example.com>" rsa4096 sign,encr 5y
   gpg --list-keys --keyid-format LONG
   # note the FINGERPRINT and the LONG key ID
   ```
2. Export the **public** key (ASCII-armored) and paste into GitHub secret `BACKUP_GPG_PUBLIC_KEY`:
   ```bash
   gpg --armor --export <FINGERPRINT>
   ```
3. Set `BACKUP_GPG_RECIPIENT` to the long key ID or email.
4. Export the **private** key for drill use only:
   ```bash
   gpg --armor --export-secret-keys <FINGERPRINT>
   ```
   Paste into GitHub secret `BACKUP_GPG_PRIVATE_KEY`.
   Scope this secret to the `db-backup-monthly-restore-drill.yml` environment if your repo
   uses GitHub Environments — see CI_CD_SECRETS.md.
5. Back up the private key offline (Yubikey export / paper key / encrypted USB).
   **The CI-scoped copy must NEVER be the only existing copy.**

### Operator runbook — verify a single backup manually

```bash
# 1. Find the latest daily backup
s5cmd --endpoint-url "$S3_ENDPOINT" ls "s3://$S3_BUCKET/backups/daily/*.pgdump.gpg" | sort | tail -n 5

# 2. Download
s5cmd --endpoint-url "$S3_ENDPOINT" cp \
  "s3://$S3_BUCKET/backups/daily/2026-04-26.pgdump.gpg" ./check.pgdump.gpg

# 3. Decrypt (requires private key in local gpg keyring)
gpg --output check.pgdump --decrypt check.pgdump.gpg

# 4. Inspect structure WITHOUT restoring
pg_restore --list check.pgdump | head -n 30

# 5. (Optional) full restore into a throwaway local DB
createdb backup_check && pg_restore --no-owner --no-acl --dbname=backup_check check.pgdump
psql -d backup_check -c "SELECT count(*) FROM users;"
dropdb backup_check
```

### Local pipeline test

`museum-backend/deploy/scripts/pg-backup-local.sh` mirrors the GHA pipeline
for ad-hoc operator testing. See the script header for env variables.

### Alternative: operator-side cron

If `DATABASE_URL_RO` is **not** reachable from the public internet (DB locked
to VPN / private subnet), the GHA workflow cannot run. Fall back to running
the same pipeline from the VPS itself via cron:

```cron
0 2 * * * deploy DATABASE_URL_RO=... BACKUP_GPG_RECIPIENT=... S3_BUCKET=... \
  S3_ENDPOINT=... S3_REGION=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
  BACKUP_HEARTBEAT_URL=... \
  /srv/museum/scripts/pg-backup-local.sh >> /var/log/museum-backup.log 2>&1
```

We do NOT scaffold this systemd / cron path automatically — it is a manual
fallback the operator must opt into. The monthly restore drill MUST still
run from GHA against the produced object, so the S3 bucket is the single
source of truth either way.

## Disaster recovery walkthrough

End-to-end procedure from "production DB lost" to "service restored". Aligns
with `docs/incidents/BREACH_PLAYBOOK.md` § 5 (db-compromise) and the SOC2
CC7.3 evidence trail.

```
T+0     Incident detected (alert / oncall page)
T+5m    Confirm scope: data corruption, deletion, or compromise?
T+10m   Stop writes: scale backend to 0 replicas (or `docker compose stop backend`)
T+15m   Identify recovery target: latest daily backup from S3
        s5cmd --endpoint-url "$S3_ENDPOINT" ls "s3://$S3_BUCKET/backups/daily/" | sort | tail
T+20m   Provision recovery DB:
          - same Postgres major version (16) on a fresh host or new database
          - empty schema, no extensions yet
T+25m   Pull + decrypt + restore:
          s5cmd cp s3://$S3_BUCKET/backups/daily/<KEY> ./recovery.pgdump.gpg
          gpg --decrypt recovery.pgdump.gpg > recovery.pgdump
          pg_restore --no-owner --no-acl --jobs=4 \
            --dbname=postgres://recover@new-host:5432/musaium recovery.pgdump
T+45m   Re-apply pending migrations newer than the backup:
          docker compose run --rm backend node dist/scripts/run-migrations.js
T+50m   Repoint backend env (DB_HOST / DATABASE_URL) at recovery DB
T+55m   Smoke test: curl /api/health; login flow; one chat message
T+60m   Resume traffic — RTO 1h target met.
```

After-action:
- Document the incident in `docs/incidents/YYYY-MM-DD-<slug>.md`.
- If a compromise was suspected: rotate `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DB_PASSWORD`, `S3_*` per `docs/CI_CD_SECRETS.md`.
- Run an **off-cycle restore drill** (`workflow_dispatch` on `db-backup-monthly-restore-drill.yml`) within 7 days to confirm the pipeline still works under post-incident conditions.

---

## Legacy: VPS cron (DEPRECATED)

The sections below describe the previous VPS-side pg_dump cron. They are kept
for historical context and for environments that have not yet migrated to the
GHA flow above. **Do not use for new installations.**

### Backup Schedule (legacy)

- **Frequency**: Daily at 03:00 UTC
- **Tool**: `pg_dump` with custom format (compressed)
- **Location**: VPS at `/srv/museum/backups/`
- **Retention**: 7 daily + 4 weekly (max 35 days)
- **Script**: `museum-backend/scripts/backup-db.sh`

### Backup User (legacy)

The legacy VPS cron uses a dedicated PostgreSQL role with minimal permissions.
The new GHA flow uses the same pattern via `DATABASE_URL_RO`.

```sql
CREATE ROLE museumia_backup WITH LOGIN PASSWORD '<password>';
GRANT CONNECT ON DATABASE museumia_prod TO museumia_backup;
GRANT USAGE ON SCHEMA public TO museumia_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO museumia_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO museumia_backup;
```

### Cron Setup (VPS, legacy)

```cron
# /etc/cron.d/museum-backup
0 3 * * * deploy PGDATABASE=museumia_prod DB_HOST=localhost DB_PORT=5432 BACKUP_DB_USER=museumia_backup BACKUP_DB_PASSWORD=<password> BACKUP_DIR=/srv/museum/backups BACKUP_HEARTBEAT_URL=<url> /srv/museum/scripts/backup-db.sh >> /srv/museum/backups/backup.log 2>&1
```

### Restore Procedure (legacy local backups)

#### 1. Restore to staging (always test first)

```bash
# List available backups
ls -la /srv/museum/backups/daily/

# Restore
pg_restore \
  --host=localhost \
  --port=5432 \
  --username=museumia_staging \
  --dbname=museumia_staging \
  --clean \
  --if-exists \
  --no-owner \
  --jobs=4 \
  /srv/museum/backups/daily/musaium-backup-YYYY-MM-DD-HHMMSS.dump

# Run pending migrations
cd /srv/museum/backend && node dist/src/data/db/run-migrations.js

# Verify
curl https://staging-api.example.com/api/health
```

#### 2. Restore to production (emergency only)

```bash
# Stop the backend
docker compose stop backend

# Restore
pg_restore \
  --host=localhost \
  --port=5432 \
  --username=museumia_prod \
  --dbname=museumia_prod \
  --clean \
  --if-exists \
  --no-owner \
  --jobs=4 \
  /srv/museum/backups/daily/musaium-backup-YYYY-MM-DD-HHMMSS.dump

# Restart
docker compose start backend

# Verify
curl https://api.example.com/api/health
```

## GDPR Compliance

- Backups contain personal data (user emails, chat history).
- Daily retention 30 days at S3 lifecycle level (see [S3 layout](#s3-layout)).
- After processing a GDPR deletion request, deleted data naturally ages out of all backups within 30 days.
- If immediate purging is required, restore the most recent backup, apply the deletion, re-dump, and overwrite the affected S3 objects.
- Monthly archives kept up to 12 months — same GDPR ceiling as the live application database.

## Monitoring

Both GHA workflows ping `BACKUP_HEARTBEAT_URL` on success and `BACKUP_HEARTBEAT_URL/fail`
on failure (Better Stack heartbeat semantics). Configure the heartbeat in Better Stack
with a 25h window for the daily job and a 35-day window for the monthly drill so a
single missed cycle pages the on-call engineer.

## Index migration recovery — INVALID after a CONCURRENTLY interrupt

`CREATE INDEX CONCURRENTLY` runs without taking an `ACCESS EXCLUSIVE` lock,
so a SIGKILL or connection drop during the build leaves the index in
`pg_index` with `indisvalid = false`. Postgres ignores invalid indexes when
planning queries but will refuse to create a new index with the same name
unless the broken one is dropped first.

### Diagnose

```sql
SELECT i.relname AS index_name, c.relname AS table_name, x.indisvalid
FROM pg_index x
JOIN pg_class i ON i.oid = x.indexrelid
JOIN pg_class c ON c.oid = x.indrelid
WHERE x.indisvalid = false;
```

Any row returned is a stale invalid index from an interrupted build.

### Recover

1. Drop the invalid index (CONCURRENTLY so reads keep flowing):

   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS "<index-name>";
   ```

2. Re-run the migration. The migration's `IF NOT EXISTS` clause is safe — it
   simply rebuilds the missing index.

   ```bash
   pnpm migration:run
   ```

3. Verify validity:

   ```sql
   SELECT relname, indisvalid FROM pg_class
   JOIN pg_index ON pg_class.oid = indexrelid
   WHERE relname = '<index-name>';
   ```

   `indisvalid = t` confirms recovery.

### When to use this

Triggered automatically if a CI deploy step is killed mid-`migration:run` for
an index migration (A1 / A2 / future). For non-index migrations, the
TypeORM migration table tracks completion atomically — they either run
fully or roll back.

Note: any migration declaring `transaction = false` (CONCURRENTLY-style)
must use the `--transaction each` flag for `migration:run` and `--transaction
none` for `migration:revert`. Both are wired into `museum-backend/package.json`
since A1 (commits 6368e468 and the follow-up `--transaction none` fix).
