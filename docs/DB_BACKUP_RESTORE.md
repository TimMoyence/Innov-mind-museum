# Database Backup & Restore

## Backup Schedule

- **Frequency**: Daily at 03:00 UTC
- **Tool**: `pg_dump` with custom format (compressed)
- **Location**: VPS at `/srv/museum/backups/`
- **Retention**: 7 daily + 4 weekly (max 35 days)
- **Script**: `museum-backend/scripts/backup-db.sh`

## Backup User

The backup process uses a dedicated PostgreSQL role with minimal permissions:

```sql
CREATE ROLE museumia_backup WITH LOGIN PASSWORD '<password>';
GRANT CONNECT ON DATABASE museumia_prod TO museumia_backup;
GRANT USAGE ON SCHEMA public TO museumia_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO museumia_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO museumia_backup;
```

## Cron Setup (VPS)

```cron
# /etc/cron.d/museum-backup
0 3 * * * deploy PGDATABASE=museumia_prod DB_HOST=localhost DB_PORT=5432 BACKUP_DB_USER=museumia_backup BACKUP_DB_PASSWORD=<password> BACKUP_DIR=/srv/museum/backups BACKUP_HEARTBEAT_URL=<url> /srv/museum/scripts/backup-db.sh >> /srv/museum/backups/backup.log 2>&1
```

## Restore Procedure

### 1. Restore to staging (always test first)

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

### 2. Restore to production (emergency only)

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

- Backups contain personal data (user emails, chat history)
- Maximum retention: 35 days (7 daily + 4 weekly)
- After processing a GDPR deletion request, the deleted data naturally ages out of all backups within 35 days
- If immediate purging is required, restore the most recent backup, apply the deletion, re-dump

## Monitoring

If Better Stack Uptime is configured, the backup script sends a heartbeat ping on success.
Set `BACKUP_HEARTBEAT_URL` to the heartbeat monitor URL.
An alert fires if no ping is received within 25 hours.
