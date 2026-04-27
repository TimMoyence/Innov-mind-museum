# V1 Operator Fallbacks

While paying-users SLA is not yet active, several automated workflows are
intentionally dormant (`db-backup-daily`, `db-backup-monthly-restore-drill`,
`tls-renewal`, `tls-cert-monitor`, `breach-72h-timer`). This runbook is the
operator-side substitute. **Activate the V2 workflows the day you onboard a
paying user — see `docs/V2_PENDING.md` for the secret list and enable
sequence.**

## Signal that a fallback is needed

| Trigger | Action below |
|---|---|
| Database stale (last `pg_dump` > 7 days) | §1 Manual backup |
| Backup file unreadable / restore unverified | §2 Manual restore drill |
| TLS cert < 14 days to expiry | §3 Manual cert renewal |
| Cert renewal failed twice in a row | §4 Cert monitor / escalation |
| Security incident (data breach, key leak) | §5 Manual breach timer + escalation |

---

## §1 Manual database backup

**Cadence target** : daily during week, weekly off-hours acceptable.
**RTO target** : 1h. **RPO target** : 24h.

Encrypt at the source so a plaintext SQL dump never touches the multi-tenant
`/tmp` filesystem on the VPS. Pre-import the operator's GPG public key on the
VPS once (`gpg --import < ops-pubkey.asc`) before running this for the first
time.

```bash
# On your laptop or a trusted ops jump host. Never inside the VPS shell history.
ssh deploy@prod.musaium.com bash -s <<'REMOTE'
  set -euo pipefail
  umask 077
  STAMP="$(date -u +%Y%m%d-%H%M%S)"
  OUT="/tmp/museum-${STAMP}.sql.gz.gpg"
  # POSTGRES_USER/POSTGRES_DB are exported in the postgres container by its
  # entrypoint. We rely on libpq defaults; do NOT pass -U "$PGUSER" — that
  # var is unset in the container and pg_dump would fall back to "root".
  docker compose -f /srv/museum/docker-compose.yml exec -T postgres \
    pg_dump --no-owner --no-acl \
    | gzip -9 \
    | gpg --encrypt --trust-model always --recipient ops@musaium.com \
    > "${OUT}"
  chmod 600 "${OUT}"
  echo "${OUT}"
REMOTE
```

Then pull the encrypted file off the VPS and archive it:

```bash
scp deploy@prod.musaium.com:/tmp/museum-*.sql.gz.gpg ~/Backups/musaium/
ssh deploy@prod.musaium.com 'rm -f /tmp/museum-*.sql.gz.gpg'
```

No plaintext dump exists at any point — the GPG-encrypted file is the only
artifact on disk on either side.

Log the backup in the incident issue tracker label `ops/backup-manual` so we
can later cross-reference RPO compliance.

## §2 Manual restore drill

**Cadence target** : monthly. Verifies the backup file is actually restorable.

```bash
# Spin up a throwaway postgres locally (Docker)
docker run --rm -d --name pg-drill -p 55432:5432 \
  -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill_restore postgres:16-alpine
sleep 5

# Decrypt + load
gpg --decrypt ~/Backups/musaium/museum-<latest>.sql.gz.gpg \
  | gunzip \
  | psql -h localhost -p 55432 -U postgres -d drill_restore

# Sanity assertions: museum table populated, audit trail rows present
psql -h localhost -p 55432 -U postgres -d drill_restore -c \
  "SELECT count(*) FROM museum;"
psql -h localhost -p 55432 -U postgres -d drill_restore -c \
  "SELECT count(*) FROM audit_log WHERE created_at > now() - interval '7 days';"

# Cleanup
docker stop pg-drill
```

Log the drill outcome in the issue tracker label `ops/drill-manual` with the
backup file fingerprint (`gpg --print-md SHA256 museum-*.sql.gz.gpg`).

## §3 Manual TLS cert renewal

**Cadence target** : every 60 days (Let's Encrypt valid 90 days, renew at
day 60 to leave a 30-day grace window).

```bash
ssh deploy@prod.musaium.com bash -s <<'REMOTE'
  set -euo pipefail
  sudo certbot renew --quiet --deploy-hook 'sudo nginx -s reload'
  sudo certbot certificates | grep -A2 musaium.com
REMOTE
```

If `certbot renew` reports "no certificates to renew", the cert is fine. If
it reports an error (e.g. ACME challenge failed), see §4.

After renewal, verify in a browser:
```bash
echo | openssl s_client -connect prod.musaium.com:443 -servername prod.musaium.com 2>/dev/null \
  | openssl x509 -noout -dates
```

## §4 Cert monitor / escalation

If two consecutive renewals fail:
1. Check `/var/log/letsencrypt/letsencrypt.log` on the VPS for the underlying error.
2. Common cause : nginx :80 not reachable (firewall change, port-redirect broken).
   Test : `curl -I http://prod.musaium.com/.well-known/acme-challenge/test`
3. If `< 5 days` to expiry and ACME still failing : open an incident with label
   `severity/high` and consider switching to a temporary self-signed cert
   while debugging — but warn users (the iOS app refuses self-signed
   regardless because of `NSAppTransportSecurity` + `NSRequiresCertificateTransparency` set in `app.config.ts`).

## §5 Manual breach timer + escalation

When the security playbook is triggered (see `docs/incidents/BREACH_PLAYBOOK.md`),
the 72h CNIL timer must be tracked manually until `breach-72h-timer.yml` is
re-enabled.

```bash
# Open a tracking issue immediately on detection
gh issue create \
  --title "[security] Breach detected $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --label "severity/critical,security,gdpr-art33" \
  --body "$(cat docs/incidents/BREACH_PLAYBOOK.md | head -20)
GDPR Article 33 deadline: $(date -u -v+72H +%Y-%m-%dT%H:%M:%SZ) (72h from detection)."
```

Set a calendar reminder 6 hours before deadline. CNIL contact info and
escalation chain live at
[`docs/incidents/BREACH_PLAYBOOK.md#6-escalation-tree`](../incidents/BREACH_PLAYBOOK.md#6-escalation-tree)
(notification portal: <https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles>).

---

## V2 activation checklist

Run this checklist the day you onboard the first paying user.
[`docs/CI_CD_SECRETS.md`](../CI_CD_SECRETS.md) is the spec source of truth for
each secret; the names below are the ones the dormant workflows actually
reference (verify by `grep -h 'secrets\.' .github/workflows/{db-backup-daily,db-backup-monthly-restore-drill,tls-renewal,tls-cert-monitor,breach-72h-timer}.yml`).

**Encrypted backup pipeline** (`db-backup-daily`, `db-backup-monthly-restore-drill`):

- [ ] `DATABASE_URL_RO` — read-only DSN against prod postgres
- [ ] `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — reuse the existing media bucket; backups land under `backups/daily/`
- [ ] `BACKUP_GPG_PUBLIC_KEY` (used at backup time) and `BACKUP_GPG_PRIVATE_KEY` (used by the monthly restore drill only)
- [ ] `BACKUP_GPG_RECIPIENT` — recipient email matching the public-key user-id
- [ ] `BACKUP_HEARTBEAT_URL` — Better Stack / Healthchecks.io URL pinged on success

**TLS automation** (`tls-renewal`, `tls-cert-monitor`):

- [ ] `VPS_HOST`, `VPS_USER`, `VPS_DEPLOY_SSH_KEY` — same VPS the deploy workflow uses; the SSH key must have `sudo certbot` allowed (NOPASSWD line in `/etc/sudoers.d/`)
- [ ] `CERT_RENEWAL_HEARTBEAT_URL` — heartbeat for the renewal cron
- [ ] `BETTER_STACK_HEARTBEAT_URL` — heartbeat for the cert monitor cron
- [ ] `TLS_MONITOR_DOMAINS` — comma-separated list of domains to probe on :443

**Breach 72h timer** (`breach-72h-timer`):

- [ ] No new secrets — the workflow uses the built-in `GITHUB_TOKEN` to comment on issues labelled `gdpr-art33`. Confirm the label exists in the repo before enabling.

**Enable the workflows** :

- [ ] `gh workflow enable db-backup-daily.yml`
- [ ] `gh workflow enable db-backup-monthly-restore-drill.yml`
- [ ] `gh workflow enable tls-renewal.yml`
- [ ] `gh workflow enable tls-cert-monitor.yml`
- [ ] `gh workflow enable breach-72h-timer.yml`

**Validate end-to-end** :

- [ ] `gh workflow run db-backup-daily.yml` — run once manually, confirm S3 object present and heartbeat received
- [ ] `gh workflow run db-backup-monthly-restore-drill.yml` — confirm the drill restores cleanly
- [ ] `gh workflow run tls-renewal.yml` — confirm renew step exits 0 even when nothing is due
- [ ] Update [`docs/V2_PENDING.md`](../V2_PENDING.md) to mark the V2 milestone as active and note the activation date

After activation, all sections above (§1–§5) become **fallbacks only** — the
automated workflows take primary responsibility, and operators step in only
when an automation alert fires.
