# OPS — Deployment & Runbook

> Single source of truth for deploying, operating, and recovering Musaium production.
> Merges former `DEPLOYMENT_STEP_BY_STEP.md`, `RUNBOOK.md`, `RUNBOOK_AUTO_ROLLBACK.md`.

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [Scope & Environments](#2-scope--environments)
3. [Prerequisites](#3-prerequisites)
4. [Repository Setup (Local)](#4-repository-setup-local)
5. [Environment Templates](#5-environment-templates)
6. [Local Validation Before Deploy](#6-local-validation-before-deploy)
7. [Target Architecture](#7-target-architecture)
8. [GitHub Actions Secrets](#8-github-actions-secrets)
9. [VPS Preparation](#9-vps-preparation)
10. [PostgreSQL Preparation](#10-postgresql-preparation)
11. [S3 Object Storage Preparation](#11-s3-object-storage-preparation)
12. [DNS & TLS](#12-dns--tls)
13. [Backend `.env` on Servers](#13-backend-env-on-servers)
14. [Backend Staging Deploy](#14-backend-staging-deploy)
15. [Backend Migrations (Staging)](#15-backend-migrations-staging)
16. [Backend Staging Smoke Test](#16-backend-staging-smoke-test)
17. [Backend Production Deploy](#17-backend-production-deploy)
18. [Mobile EAS Preview Build](#18-mobile-eas-preview-build)
19. [Mobile Production Build + Submission](#19-mobile-production-build--submission)
20. [Release Readiness Checklist](#20-release-readiness-checklist)
21. [Incident Runbook (Diagnostics)](#21-incident-runbook-diagnostics)
22. [Auto-Rollback (CI)](#22-auto-rollback-ci)
23. [Manual Rollback Procedures](#23-manual-rollback-procedures)
24. [Database Backup & Restore](#24-database-backup--restore)
25. [Mobile Rollback (EAS)](#25-mobile-rollback-eas)
26. [Escalation](#26-escalation)
27. [Related Files](#27-related-files)

---

## 1. Quick Reference

```bash
# Backend deploy triggers
# staging:  push to `staging` branch
# prod:     push to `main` branch

# Check backend health
curl -s https://api.musaium.com/api/health | jq .

# Tail backend logs on VPS
ssh deploy@<SERVER_HOST>
docker compose logs --tail=200 -f backend

# Emergency manual rollback (see §23 for details)
cd /srv/museum && ./rollback.sh docker-compose.yml backend "ghcr.io/timmoyence/museum-backend"

# Mobile OTA update (preview)
cd museum-frontend
eas update --branch preview --message "Patch note"
```

---

## 2. Scope & Environments

- **`local`** — developer machine
- **`preprod`** / **`staging`** — staging backend + preview mobile builds
- **`prod`** — production backend + production mobile builds/submission

Musaium deploys 3 surfaces:

| Surface | Repo path | Deploy target |
|---|---|---|
| Backend API | `museum-backend/` | Docker → GHCR → VPS |
| Mobile app | `museum-frontend/` | EAS Build → App Store / Google Play |
| Web (landing + admin) | `museum-web/` | Docker → GHCR → VPS |

---

## 3. Prerequisites

- GitHub repo admin or maintainer access
- GitHub Actions secrets admin access
- VPS SSH access (`SERVER_HOST`, `SERVER_USER`, private key)
- Docker + Docker Compose on VPS
- GHCR credentials (or PAT with package read/write)
- PostgreSQL instance(s) for staging/prod
- S3-compatible object storage bucket(s) (private)
- Expo account + EAS project (`EXPO_PUBLIC_EAS_PROJECT_ID`)
- Apple / Google store credentials for mobile submission

Local tools:

- Node.js 22+
- `pnpm` 9.x (backend, web)
- `npm` (mobile frontend)
- Docker (local e2e tests)
- `curl`, `jq` (recommended)

---

## 4. Repository Setup (Local)

```bash
git clone <your-repo-url> musaium
cd musaium

cd museum-backend && pnpm install --frozen-lockfile
cd ../museum-frontend && npm install --no-audit --no-fund
cd ../museum-web && pnpm install --frozen-lockfile
```

---

## 5. Environment Templates

### Backend

```bash
cd museum-backend
cp .env.local.example .env
# or .env.staging.example / .env.production.example
```

### Frontend

```bash
cd museum-frontend
cp .env.local.example .env
# or .env.preview.example / .env.production.example
```

---

## 6. Local Validation Before Deploy

### Backend

```bash
cd museum-backend
pnpm run typecheck
pnpm test
pnpm test:contract:openapi
pnpm openapi:validate
```

### Backend e2e (Docker + Postgres)

```bash
cd museum-backend
RUN_E2E=true pnpm test -- --watchman=false --runInBand tests/e2e/api.postgres.e2e.test.ts
```

### Mobile

```bash
cd museum-frontend
npm run lint
npm test
```

---

## 7. Target Architecture

- VPS hosts Docker Compose services
- Backend image pulled from GHCR
- PostgreSQL (managed or VPS-hosted)
- S3-compatible private bucket for uploaded chat images
- Backend generates signed image URLs
- Mobile builds consume API via `EXPO_PUBLIC_API_BASE_URL_*`

---

## 8. GitHub Actions Secrets

### Backend deploy

- `GHCR_USER`
- `GHCR_TOKEN`
- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_KEY`

### Mobile release

- `EXPO_TOKEN`
- `EXPO_PUBLIC_API_BASE_URL_STAGING`
- `EXPO_PUBLIC_API_BASE_URL_PROD`
- `EXPO_PUBLIC_EAS_PROJECT_ID`

### Store submission (optional)

- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_ID`
- `ASC_APP_ID`
- `APPLE_TEAM_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

Full list: [`docs/CI_CD_SECRETS.md`](CI_CD_SECRETS.md).

---

## 9. VPS Preparation

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
# Install Docker Engine + Compose plugin, then verify:
docker --version
docker compose version

sudo mkdir -p /srv/museum
sudo chown -R $USER:$USER /srv/museum
cd /srv/museum
# Place your docker-compose.yml with services: backend-staging, backend
```

---

## 10. PostgreSQL Preparation

```sql
CREATE USER museumia_staging WITH PASSWORD 'replace';
CREATE DATABASE museumia_staging OWNER museumia_staging;

CREATE USER museumia_prod WITH PASSWORD 'replace';
CREATE DATABASE museumia_prod OWNER museumia_prod;
```

Ensure network/firewall allows the VPS backend container to reach PostgreSQL.

---

## 11. S3 Object Storage Preparation

Private buckets required:

- `museumia-staging-private`
- `museumia-prod-private`

Recommended settings: private, server-side encryption, lifecycle cleanup, credentials scoped to bucket only.

Values for backend `.env`:

- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `S3_SESSION_TOKEN` (optional)
- `S3_OBJECT_KEY_PREFIX` (optional: `staging` / `prod`)
- `S3_PUBLIC_BASE_URL` (optional, supports `{bucket}` placeholder)

---

## 12. DNS & TLS

Prepare API hostnames (staging + prod). Verify:

```bash
curl -I https://staging-api.example.com/api/health
curl -I https://api.example.com/api/health
```

### 12.1 TLS / certificate management

> **TL;DR** — Let's Encrypt + certbot live on the VPS. Renewal is **driven from GitHub Actions** twice a week (`tls-renewal.yml`, Mon/Thu 03:17 UTC). Expiry is **probed hourly** from GHA (`tls-cert-monitor.yml`) and escalates to a GitHub `incident` issue + Better Stack alert when <2 days remain. No VPS systemd timer is required for the renewal trigger today; the manual SSH fallback is documented below.

#### Architecture

```
[GHA scheduler]──cron Mon/Thu 03:17 UTC──▶ tls-renewal.yml
       │                                          │
       │                                          ▼
       │                          ssh deploy@VPS  (key-based, host-pinned)
       │                                          │
       │                                          ▼
       │                          sudo certbot renew --quiet
       │                                          │
       │                                          ▼
       │                          --deploy-hook 'nginx -s reload'   (runs only on actual renew)
       │                                          │
       │             ┌────success────heartbeat──────────┘
       │             ▼
       │        Better Stack heartbeat (CERT_RENEWAL_HEARTBEAT_URL)
       │
       └─cron hourly──▶ tls-cert-monitor.yml
                                     │
                                     ▼
                  openssl s_client probe per domain (TLS_MONITOR_DOMAINS)
                                     │
                       ┌─────────────┼──────────────┐
                       │ <14d        │ <5d          │ <2d
                       ▼             ▼              ▼
                  GH issue     + BetterStack    + label `incident`
                  (`cert-      `/fail` ping     (escalates via
                  expiry-near`)                  breach-72h-timer.yml)
```

**On-VPS layout** (do not change without coordination):

| Path / package | Role |
|---|---|
| `apt install certbot python3-certbot-nginx` | certbot v2.x package source: Debian/Ubuntu official repo |
| `/etc/letsencrypt/live/<domain>/fullchain.pem` | symlink to current cert chain |
| `/etc/letsencrypt/live/<domain>/privkey.pem` | symlink to current private key |
| `/etc/letsencrypt/renewal/<domain>.conf` | per-cert renewal config (authenticator, deploy-hook) |
| `/etc/nginx/sites-enabled/musaium.conf` | nginx vhost referencing the symlinks above |
| `sudo certbot certificates` | inventory + days-to-expiry per cert |
| `sudo certbot renew --dry-run` | validate ACME challenge end-to-end without consuming rate limits |

#### Required GHA secrets

Register in GitHub repo → Settings → Secrets and variables → Actions. Cross-referenced in [`docs/CI_CD_SECRETS.md` § TLS Certificate Renewal](CI_CD_SECRETS.md#secrets-tls-certificate-renewal-r17--soc2-cc66).

| Secret | Purpose |
|---|---|
| `VPS_HOST` | SSH host (e.g. `vps.musaium.com` or its IP) |
| `VPS_USER` | SSH user (typically `deploy`) with `NOPASSWD` sudo on `certbot` and `nginx -s reload` only |
| `VPS_DEPLOY_SSH_KEY` | Private key (ed25519 recommended) matching the public key seeded in VPS `~/.ssh/authorized_keys` |
| `CERT_RENEWAL_HEARTBEAT_URL` | Better Stack (or equivalent) heartbeat URL pinged on successful run |
| `BETTER_STACK_HEARTBEAT_URL` | Better Stack heartbeat URL — pinged with `/fail` on renewal failure or <5d expiry |
| `TLS_MONITOR_DOMAINS` | CSV of domains to probe hourly, e.g. `api.musaium.com,musaium.com` |

#### Operator runbook — first-time setup

1. **Generate the deploy key on a workstation** (never on the VPS, never on a CI runner):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/musaium-tls-renew -C "gha-tls-renew@musaium" -N ''
   ```
2. **Seed the public key on the VPS** in `~deploy/.ssh/authorized_keys`. **Constrain it** so a stolen key cannot do anything else:
   ```
   restrict,command="sudo /usr/bin/certbot renew --quiet --deploy-hook '/usr/sbin/nginx -s reload'" ssh-ed25519 AAAA...gha-tls-renew@musaium
   ```
   - `restrict` disables port forwarding, agent forwarding, X11, PTY allocation.
   - `command="..."` pins the key to exactly one command — even if `tls-renewal.yml` is altered to send another command, the VPS executes the pinned one.
   - The user `deploy` must have `NOPASSWD` sudo for **only** `certbot` and `nginx -s reload`. Example `/etc/sudoers.d/deploy-tls`:
     ```
     deploy ALL=(root) NOPASSWD: /usr/bin/certbot renew --quiet --deploy-hook /usr/sbin/nginx -s reload
     deploy ALL=(root) NOPASSWD: /usr/bin/certbot certificates
     ```
3. **Register the GHA secrets** listed above. Paste the `~/.ssh/musaium-tls-renew` private key (full file, including header/footer) into `VPS_DEPLOY_SSH_KEY`.
4. **Smoke test from GHA** (do not wait for the cron):
   - Actions → `tls-renewal` → Run workflow (branch `main`).
   - Verify the run succeeds and that the heartbeat URL was pinged.
5. **Verify on the VPS**:
   ```bash
   ssh deploy@<VPS_HOST> 'sudo certbot certificates'
   # Confirm "VALID: 89 days" or similar — and that the renewal is logged
   # in /var/log/letsencrypt/letsencrypt.log
   ```
6. **Smoke test the monitor**:
   - Actions → `tls-cert-monitor` → Run workflow → check the JSON report in the run logs (one entry per domain in `TLS_MONITOR_DOMAINS`, with `days_remaining` ≥ 14).

#### Manual fallback (no GHA secrets yet, or GHA-side outage)

If the deploy key is not yet seeded, or if GitHub Actions is unavailable, perform the renewal manually from the operator workstation:

```bash
ssh deploy@<VPS_HOST> 'sudo certbot renew && sudo nginx -s reload'
ssh deploy@<VPS_HOST> 'sudo certbot certificates'
```

This is the same command the GHA workflow drives remotely; the only difference is the trigger.

#### Failure modes and escalation

| Symptom | Likely cause | Action |
|---|---|---|
| `tls-renewal` run fails — SSH error | Key not in authorized_keys, host key mismatch, network egress blocked | Reseed key per § 12.1 step 2; check `ssh-keyscan` output in workflow logs |
| `tls-renewal` run fails — `certbot` error | ACME challenge failure (DNS, port 80 nginx, rate limit) | `sudo certbot renew --dry-run` on VPS; review `/var/log/letsencrypt/letsencrypt.log` |
| `tls-cert-monitor` opens `cert-expiry-near` issue | Renewal hasn't run yet or no-op'd | Trigger `tls-renewal` manually; if it succeeds, monitor will close the loop next hour |
| Issue gains `incident` label (<2 days) | Renewal has been failing silently for ≥10 days | Treat as **availability incident**: invoke manual fallback above, then file post-mortem in `docs/incidents/`. Per `BREACH_PLAYBOOK.md`, an availability incident under GDPR Art 4(12) may carry CNIL notification obligations if it is sustained — log via `auditCriticalSecurityEvent` so the `breach-72h-timer.yml` SLA tracker takes over (`docs/incidents/BREACH_PLAYBOOK.md § 4`) |

> **SOC2 mapping**: this control closes audit finding **R17** (`team-reports/2026-04-26-security-compliance-full-audit.md § P9`) under criterion **CC6.6** (system communications & boundary protection / availability). The remediation plan tracks this work as **W2.T5** (`team-reports/2026-04-26-security-remediation-plan.md`).

---

## 13. Backend `.env` on Servers

### Staging

```bash
cd /srv/museum
nano .env.backend-staging
```

Populate from `museum-backend/.env.staging.example`.

### Production

```bash
cd /srv/museum
nano .env.backend-prod
```

Populate from `museum-backend/.env.production.example`.

Critical values:

- `NODE_ENV=production`
- explicit `CORS_ORIGINS`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MEDIA_SIGNING_SECRET`
- `OBJECT_STORAGE_DRIVER=s3`
- complete S3 credentials

### Immutable image tags — `IMAGE_TAG` / `WEB_IMAGE_TAG` / `LLM_GUARD_IMAGE_TAG`

Depuis 2026-04-24, `docker-compose.prod.yml` référence les images via une variable d’environnement **obligatoire** (plus de fallback `:latest`) :

```yaml
image: ghcr.io/timmoyence/museum-backend:${IMAGE_TAG:?IMAGE_TAG required — use commit SHA from CI}
image: ghcr.io/timmoyence/museum-web:${WEB_IMAGE_TAG:?WEB_IMAGE_TAG required — use commit SHA from CI}
image: ghcr.io/timmoyence/museum-llm-guard:${LLM_GUARD_IMAGE_TAG:?LLM_GUARD_IMAGE_TAG required — use commit SHA from CI}
```

La syntaxe `${VAR:?msg}` fait **échouer `docker compose` immédiatement** si la variable n’est pas définie — aucun démarrage silencieux sur un tag mutable. C’est la garantie SHA-pinning.

Le pipeline CI exporte `IMAGE_TAG=${{ github.sha }}` (resp. `WEB_IMAGE_TAG`, `LLM_GUARD_IMAGE_TAG`) dans le step `appleboy/ssh-action` via `envs:`, ce qui force un pull déterministe sur la SHA du commit déployé.

**Opérateurs : `docker compose` manuel sur le VPS**

L’opérateur DOIT exporter les trois variables avant tout `docker compose pull` / `up -d`. Deux options :

- **Option A — `/srv/museum/.env`** (persistant) : ajouter en haut du fichier :
  ```
  IMAGE_TAG=<commit-sha-à-déployer>
  WEB_IMAGE_TAG=<commit-sha-à-déployer>
  LLM_GUARD_IMAGE_TAG=<commit-sha-à-déployer>
  ```
- **Option B — inline** (ad hoc) :
  ```bash
  IMAGE_TAG=abc123 WEB_IMAGE_TAG=abc123 LLM_GUARD_IMAGE_TAG=abc123 \
    docker compose pull && docker compose up -d
  ```

Oublier une variable → `docker compose` s’arrête avec un message clair (`IMAGE_TAG required — use commit SHA from CI`). Pas de silent drift.

> Astuce rollback : `docker tag ghcr.io/…/museum-backend:<sha-précédent> ghcr.io/…/museum-backend:latest` + re-tag de la SHA ciblée dans `.env` reste le mécanisme du `rollback.sh`. Le script met à jour `IMAGE_TAG` avant le `up -d`, donc pas de régression fonctionnelle.

---

## 14. Backend Staging Deploy

### Trigger

Push to `staging` (workflow `.github/workflows/ci-cd-backend.yml`) or run manual `workflow_dispatch`.

### What CI does

1. Runs backend quality checks
2. Builds Docker image
3. Pushes to GHCR (`museum-backend-staging`)
4. SSH to VPS:
   ```bash
   docker compose pull backend-staging
   docker compose up -d --remove-orphans backend-staging
   ```

### Manual verification

```bash
curl https://staging-api.example.com/api/health
```

Expected: `200` (or `503` if DB/LLM misconfigured).

---

## 15. Backend Migrations (Staging)

```bash
docker compose exec backend-staging pnpm run migration:run
```

Alternatives if image has no source scripts:

- dedicated migration job in CI/CD
- one-shot migration container
- `docker compose run --rm backend-staging pnpm run migration:run`

Verify via health check.

---

## 16. Backend Staging Smoke Test

Run a full smoke sequence with a temporary user:

```bash
BASE_URL="https://staging-api.example.com"
EMAIL="smoke+$(date +%s)@example.test"
PASSWORD="Password123!"

# Register
curl -sS -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"firstname\":\"Smoke\",\"lastname\":\"Test\"}" | jq .

# Login
LOGIN_JSON=$(curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
ACCESS_TOKEN=$(echo "$LOGIN_JSON" | jq -r '.accessToken')
REFRESH_TOKEN=$(echo "$LOGIN_JSON" | jq -r '.refreshToken')

# Me
curl -sS "$BASE_URL/api/auth/me" -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# Create chat session
SESSION_JSON=$(curl -sS -X POST "$BASE_URL/api/chat/sessions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"locale":"en-US","museumMode":true}')
SESSION_ID=$(echo "$SESSION_JSON" | jq -r '.session.id')

# Send chat message
curl -sS -X POST "$BASE_URL/api/chat/sessions/$SESSION_ID/messages" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"text":"Tell me about this artwork.","context":{"locale":"en-US","museumMode":true,"guideLevel":"beginner"}}' | jq .

# Fetch history
curl -sS "$BASE_URL/api/chat/sessions/$SESSION_ID?limit=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# Refresh token
curl -sS -X POST "$BASE_URL/api/auth/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" | jq .
```

---

## 17. Backend Production Deploy

### Trigger

Push to `main` after staging validation.

### Workflow result

1. Quality checks (tsc + ESLint + tests + OpenAPI + audit)
2. Image build + push GHCR (`museum-backend`)
3. VPS deploy:
   ```bash
   docker compose pull backend
   docker compose up -d --remove-orphans backend
   ```
4. Trivy scan
5. Sentry release
6. Post-deploy smoke test

### Production verification

```bash
curl https://api.example.com/api/health
```

Re-run the smoke sequence from §16 against `https://api.example.com`.

---

## 18. Mobile EAS Preview Build

```bash
cd museum-frontend
npx eas build --platform android --profile preview --non-interactive --no-wait
npx eas build --platform ios --profile preview --non-interactive --no-wait
```

CI path: `ci-cd-mobile.yml` builds previews on PR / push to main.

### Preview validation checklist

- App opens and reaches staging backend
- Login works (`/api/auth/login`)
- `/api/auth/me` works after app restart (refresh token path)
- Text chat works
- Image upload works
- Historical image re-display works
- Audio route works

---

## 19. Mobile Production Build + Submission

### Build production

```bash
cd museum-frontend
npx eas build --platform android --profile production --non-interactive --no-wait
npx eas build --platform ios --profile production --non-interactive --no-wait
```

CI path:

1. Create tag `vX.Y.Z`
2. Push tag
3. `ci-cd-mobile.yml` runs `build-production` + `submit-production`

### Submit

```bash
npx eas submit --platform android --profile production --latest --non-interactive
npx eas submit --platform ios --profile production --latest --non-interactive
```

---

## 20. Release Readiness Checklist

### Backend

- `GET /api/health` returns expected `environment/version`
- auth login/refresh/logout/me all pass
- chat create/list/get/delete-if-empty pass
- image signed URL endpoint returns URL and image resolves
- audio route returns transcription + assistant response

### Mobile

- preview/prod app points to correct API base URL
- no localhost API URL in preview/prod builds
- session persists via refresh token across app restart
- expired access token refreshes automatically
- logout invalidates refresh token and returns to login

---

## 21. Incident Runbook (Diagnostics)

### Health failing (`503`)

Check:

- DB connectivity / credentials / firewall
- `PGDATABASE`, `DB_HOST`, `DB_PORT`
- `OPENAI_API_KEY` / provider keys if `llmConfigured=false`

```bash
docker compose logs --tail=200 backend
docker compose ps
curl -sS https://api.example.com/api/health | jq .
```

### Login/refresh failures (`401`)

Check:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` consistency
- DB migration for `auth_refresh_tokens` applied

```bash
docker compose exec backend pnpm run migration:show
docker compose logs --tail=200 backend
```

### Image history not loading

Check:

- `OBJECT_STORAGE_DRIVER`
- `MEDIA_SIGNING_SECRET`
- S3 credentials / bucket access
- `LOCAL_UPLOADS_DIR` for dev

```bash
curl -sS -X POST https://api.example.com/api/chat/messages/<messageId>/image-url \
  -H "Authorization: Bearer <token>" | jq .
```

---

## 22. Auto-Rollback (CI)

**Scope:** `ci-cd-backend.yml` — prod + staging deploys.
**Trigger:** deploy step or post-deploy smoke test fails.
**Outcome:** service is automatically restored to the previous image + migration state within ~3 minutes. The CI job still reports as failed so on-call is paged.

### How it works

Each deploy step is wrapped by two companion steps:

1. **`Upload rollback helper`** (SCP) — ships `museum-backend/deploy/rollback.sh` to `/srv/museum/rollback.sh` on the VPS.
2. **`Capture pre-deploy rollback state`** — on the VPS, retags the currently-running image `:latest` → `:previous` and snapshots the pre-run migration count into `/srv/museum/.rollback/<service>/pre-count.txt`.
3. **`Deploy on VPS`** — pulls `:latest`, runs migrations, restarts, health-checks. After `migration:run` it computes the delta (`post_count - pre_count`) and writes it to `/srv/museum/.rollback/<service>/applied-count.txt`.
4. **`Post-deploy smoke test`** — runs `scripts/smoke-api.cjs`.
5. **`Auto-rollback on deploy or smoke failure`** — SSH-invokes `rollback.sh <compose-file> <service> <image-ref>`, which:
   - runs `migration:revert` exactly `applied-count.txt` times
   - retags `:previous` → `:latest`
   - `docker compose up -d --force-recreate <service>`
   - runs the same 20-try health loop as the deploy step
6. **`Notify Sentry of rollback`** — emits a `deploys new --name rollback-<sha>` event.
7. **`Fail job after successful rollback`** — deliberately fails the workflow so GitHub/Sentry/Slack alerts fire.

### Exit codes from `rollback.sh`

| Code | Meaning | Action |
|---:|---|---|
| `0` | Rollback succeeded end-to-end | Read workflow logs, diagnose root cause, re-deploy a fix |
| `42` | `migration:revert` failed mid-loop | **DB in intermediate state** — see "Partial migration revert" below |
| `43` | Image retag or `docker compose up` failed | SSH manually, inspect `docker images`, ensure `:previous` still exists |
| `44` | Rolled-back container failed its healthcheck | SSH manually, inspect `docker compose logs <service>`, old image itself is broken |

### What auto-rollback does NOT do

- **Does not resurrect dropped data.** If a migration's `up()` drops a column/truncates a table, its `down()` recreates the schema only. Review destructive migrations manually.
- **Does not touch Redis cache.** Flush manually if a bad deploy poisoned it: `docker compose exec redis redis-cli -a "$REDIS_PASSWORD" FLUSHDB`.
- **Does not roll back the uploaded Docker image in GHCR.** `:latest` in the registry still points at the broken build.
- **Does not notify PagerDuty/Slack directly.** Only Sentry is wired.

### Partial migration revert (exit code 42)

The database is in an intermediate state. Decide:

1. **Can the failing `down()` be patched safely?** Push a hotfix migration, then re-deploy. Do not try to re-run `migration:revert`.
2. **Is the remaining partial state compatible with the rolled-back code?** Check app — `docker compose up -d backend` with `:previous`. If boots and `/api/health` green, investigate.
3. **Is the old code incompatible with the partial schema?** Re-run `migration:run` to finish, then revert to the **new** image (undo the rollback). Debug the smoke-test failure on the new release without blocking ops.

Never delete rows from the `migrations` table by hand — TypeORM's idempotency assumes the table is authoritative.

---

## 23. Manual Rollback Procedures

### Backend Docker rollback (manual)

When CI is down or you need to rollback outside the workflow:

```bash
ssh deploy@<SERVER_HOST>
cd /srv/museum

# 1. Inspect last CI state
cat .rollback/backend/applied-count.txt
docker image inspect ghcr.io/timmoyence/museum-backend:previous >/dev/null && echo "OK" || echo "MISSING"

# 2. Roll back migrations
for i in $(seq 1 $(cat .rollback/backend/applied-count.txt)); do
  docker compose run --rm --no-deps -T backend \
    node ./node_modules/typeorm/cli.js migration:revert -d dist/src/data/db/data-source.js
done

# 3. Retag and restart
docker tag ghcr.io/timmoyence/museum-backend:previous ghcr.io/timmoyence/museum-backend:latest
docker compose up -d --force-recreate --no-deps --timeout 30 backend

# 4. Verify
curl -sf https://api.musaium.com/api/health | jq .
```

Or simply re-run the helper:

```bash
chmod +x rollback.sh
./rollback.sh docker-compose.yml backend "ghcr.io/timmoyence/museum-backend"
```

### Backend fallback: identify previous image by SHA

```bash
docker image ls ghcr.io/timmoyence/museum-backend --format '{{.Tag}} {{.CreatedAt}}' | head -5
cd /srv/museum
# edit docker-compose.yml: replace :latest with <previous sha>
docker compose pull backend
docker compose up -d backend
curl -s https://musaium.com/api/health | jq .
```

### Backend fallback: rebuild from specific commit

```bash
git checkout <commit-hash>
docker build -f deploy/Dockerfile.prod -t ghcr.io/timmoyence/museum-backend:rollback .
docker compose up -d backend
```

### Revert a single migration

```bash
docker exec -it museum-backend sh
npx typeorm migration:revert -d dist/src/data/db/data-source.js
npx typeorm migration:show -d dist/src/data/db/data-source.js
```

**ATTENTION** : a migration revert does NOT restore deleted data.

### Rollback museum-web (Next.js)

```bash
ssh deploy@<SERVER_HOST>
cd /srv/museum-web
docker image ls ghcr.io/timmoyence/museum-web --format '{{.Tag}} {{.CreatedAt}}' | head -5
# Edit tag, then:
docker compose pull web
docker compose up -d web
```

### Testing the rollback (staging only)

On staging, not prod:

1. Push a commit with a deliberately broken smoke test (e.g., bad `SMOKE_TEST_PASSWORD` temporarily set to a wrong value).
2. Observe workflow: deploy green, smoke red, rollback fires, Sentry records a `rollback-<sha>` deploy, workflow ends red.
3. `ssh vps && docker compose ps backend-staging` — the running container's image label should match the previous SHA.
4. Restore the correct smoke secret.

Run this drill once per quarter.

---

## 24. Database Backup & Restore

See [`docs/DB_BACKUP_RESTORE.md`](DB_BACKUP_RESTORE.md) for the complete backup schedule, restore procedure, and GDPR compliance notes.

### Quick restore

```bash
ls -la /srv/museum/backups/daily/
docker compose stop backend
pg_restore \
  --host=localhost --port=5432 \
  --username=museumia_prod --dbname=museumia_prod \
  --clean --if-exists \
  /srv/museum/backups/daily/<backup-file>.dump
docker compose start backend
curl -s https://musaium.com/api/health | jq .
```

### Single-table restore

```bash
pg_restore \
  --host=localhost --port=5432 \
  --username=museumia_prod --dbname=museumia_prod \
  --table=<table_name> --clean \
  /srv/museum/backups/daily/<backup-file>.dump
```

---

## 25. Mobile Rollback (EAS)

Mobile builds cannot be "rolled back" once submitted to stores.

Options:

1. **OTA Update** — if `expo-updates` is configured, publish a patch via `eas update`
2. **New submission** — build from stable commit and submit
3. **Store removal** — temporarily withdraw the app (last resort)

```bash
cd museum-frontend
git checkout <stable-commit>
eas update --branch production --message "Rollback to stable"
```

---

## 26. Escalation

| Severity | Action | Contact |
|---|---|---|
| P1 (service down) | Rollback immediately + notify team | Tim (lead) |
| P2 (feature broken) | Hotfix within the hour, deploy staging first | Tim (lead) |
| P3 (minor degradation) | Fix in next sprint | Dev team |
| P4 (cosmetic) | Backlog | Dev team |

### P1 incident checklist

- [ ] Health check failing? → auto-rollback (§22) or manual (§23)
- [ ] DB corrupted? → restore backup (§24)
- [ ] Migration broken? → revert migration (§23)
- [ ] Mobile crash? → OTA update (§25)
- [ ] After resolution: post-mortem in `docs/incidents/`

---

## 27. Related Files

- `.github/workflows/ci-cd-backend.yml` — deploy + rollback orchestration
- `.github/workflows/ci-cd-web.yml` — web deploy
- `.github/workflows/ci-cd-mobile.yml` — mobile EAS orchestration
- `museum-backend/deploy/rollback.sh` — rollback shell invoked on the VPS
- `museum-backend/scripts/count-applied-migrations.cjs` — migration delta helper
- `museum-backend/scripts/check-migration-down.cjs` — CI gate blocking irreversible migrations
- `museum-backend/scripts/smoke-api.cjs` — post-deploy smoke test script
- [`docs/CI_CD_SECRETS.md`](CI_CD_SECRETS.md) — secrets consumed by workflows
- [`docs/DB_BACKUP_RESTORE.md`](DB_BACKUP_RESTORE.md) — backup schedule and restore
- [`docs/UPTIME_MONITORING.md`](UPTIME_MONITORING.md) — uptime checks and alerting
- [`docs/MOBILE_INTERNAL_TESTING_FLOW.md`](MOBILE_INTERNAL_TESTING_FLOW.md) — internal mobile testing
- [`docs/RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) — release checklist

---

## Grafana + Prometheus + AlertManager (C1.1, ADR-036)

Self-hosted observability stack — runs as part of the production
docker-compose alongside the backend / pgbouncer / redis / db / museum-web.
Dashboards JSON, AlertManager rules, datasource YAML, Prometheus scrape
config — all version-controlled in `infra/grafana/` (source of truth).
**Never edit through the Grafana UI** ; drift is invisible and silently
overridden on the next provisioner pass.

### Topology

The 4 obs services (`prometheus`, `grafana`, `alertmanager`,
`alertmanager-telegram`) are declared in
`museum-backend/deploy/docker-compose.prod.yml`. They share the `obs`
bridge network ; `grafana` also joins the existing `web` network so
nginx can reach it ; `prometheus` also joins `private` to scrape the
backend at `backend:3000/metrics`.

| Service | Network(s) | Image | Role |
|---|---|---|---|
| `prometheus` | obs + private | `prom/prometheus:v2.55.1` | Scrapes backend `/metrics` every 30s ; 14d retention. |
| `grafana` | obs + private + web | `grafana/grafana:11.4.0` | Dashboard host. Anonymous Viewer (the gate is at nginx — see § Single-auth iframe). |
| `alertmanager` | obs | `prom/alertmanager:v0.27.0` | Routes firing alerts to the Telegram bridge. |
| `alertmanager-telegram` | obs | local build (`./obs/alertmanager-telegram`) | Translates AM webhook → Telegram Bot API `sendMessage`. |

### Single source of truth — compose, /srv/museum/, and CI

`museum-backend/deploy/docker-compose.prod.yml` in the repo IS the
prod compose. Every push to `main` SCPs it to
`/srv/museum/docker-compose.yml` on the VPS, after backing up the
previous file to `docker-compose.yml.bak.<UTC-timestamp>`. The CI step
`Install compose + obs config + nginx snippet on VPS` validates the
candidate compose with `docker compose ... config` BEFORE replacing
the live one — a syntax error or a missing required env var aborts
the deploy with prod still running on the prior compose.

Operators no longer hand-edit the live compose. Schema changes go
through PR + review + CI. If you ever need to rescue prod by
reverting to the previous compose:

```bash
ssh user@vps 'sudo cp /srv/museum/docker-compose.yml.bak.<TIMESTAMP> /srv/museum/docker-compose.yml \
  && cd /srv/museum && docker compose up -d --remove-orphans'
```

### One-shot bootstrap (only what CI cannot do)

CI handles compose scp + obs rsync + nginx snippet install + reload +
`docker compose up -d` + RBAC smoke on every push. The operator owns
three things ONCE per environment :

```bash
# A. Create the Telegram bot.
#    - Open Telegram → @BotFather → /newbot → copy the token.
#    - /start your new bot from Tim's Telegram account.
#    - Get the chat id:
#        curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" \
#          | jq -r '.result[].message.chat.id' | head -1

# B. Add the 5 obs vars to /srv/museum/.env on the VPS:
#      ENV=production
#      GRAFANA_ADMIN_USER=admin
#      GRAFANA_ADMIN_PASSWORD=<24+ char random>
#      GRAFANA_ROOT_URL=https://musaium.fr/grafana/
#      TELEGRAM_BOT_TOKEN=<token from BotFather>
#      TELEGRAM_CHAT_ID=<chat id from getUpdates>

# C. Add ONE line to /etc/nginx/sites-enabled/musaium.conf inside the
#    `server { }` block that terminates TLS for musaium.fr:
#        include /etc/nginx/snippets/musaium-grafana.conf;
#    CI installs the snippet at /etc/nginx/snippets/musaium-grafana.conf
#    on every deploy but does NOT touch the vhost itself (too critical
#    to mutate from a runner). Without this `include`, /grafana/
#    returns nginx default (404).
sudo nano /etc/nginx/sites-enabled/musaium.conf  # add the include
sudo nginx -t && sudo systemctl reload nginx     # validate + apply
```

That's it. The next push to `main` deploys the full stack automatically.

### First-time bootstrap from an existing manually-edited compose

If your VPS currently runs a hand-edited `/srv/museum/docker-compose.yml`
(pre-PR-G state) and you want CI to take over:

```bash
# 1. Inspect the diff between your live compose and the repo version.
ssh user@vps 'cat /srv/museum/docker-compose.yml' > /tmp/live-compose.yml
diff /tmp/live-compose.yml museum-backend/deploy/docker-compose.prod.yml
# Reconcile any operator customisations into the repo file BEFORE the
# next push, otherwise they are lost on the first scp+install.

# 2. Make a manual safety backup before the first CI-driven deploy.
ssh user@vps 'sudo cp /srv/museum/docker-compose.yml /srv/museum/docker-compose.yml.pre-pr-g'

# 3. Push to main. CI does the rest.
```

### Recurring deploy (every push to `main`)

Owned by `ci-cd-backend.yml` `deploy-prod` job. The relevant steps are :

| Step | What it does |
|---|---|
| `Sync prod compose + obs config to VPS (/tmp staging)` | scp `museum-backend/deploy/docker-compose.prod.yml` + `infra/grafana/` + `infra/nginx/conf.d/grafana.conf` to `/tmp/musaium-deploy-staging/` |
| `Install compose + obs config + nginx snippet on VPS` | `docker compose config` validates candidate compose → backup live to `.bak.<ts>` → install candidate as `/srv/museum/docker-compose.yml` → rsync `/srv/museum/obs/` → install nginx snippet → `nginx -t && systemctl reload nginx` |
| `Deploy obs stack on VPS` | `docker compose pull prometheus grafana alertmanager` + `up -d` the 4 obs services + Grafana healthcheck wait + Prometheus rule-loaded grep |
| `Post-deploy obs smoke (RBAC gate)` | runs `museum-backend/scripts/smoke-grafana-prod.sh` ; only if `PROD_SUPER_ADMIN_PASSWORD` is set in repo secrets, otherwise skipped silently |

The smoke step is conditional on the secret so a deploy from a fresh
clone (no super_admin secrets yet) still goes green.

The migration `1778240000000-AddSuperAdminRoleAndBackfill` extends the
`users_role_enum` and the next migration
`1778240010000-BackfillSuperAdminOwner` promotes
`tim.moyence@gmail.com` to `super_admin` automatically — both run in the
backend deploy pipeline. No manual SQL needed unless you ever lose
super_admin and need to re-promote :

```sql
UPDATE users SET role = 'super_admin' WHERE email = 'tim.moyence@gmail.com';
```

### Single-auth iframe (D9 update — 2026-05-08 PR-G)

The earlier Phase 2 design relied on Grafana basic-auth as a second login
prompt inside the iframe. PR-G replaces that with an `auth_request` gate
at the nginx layer pointing at the backend
`GET /api/auth/super-admin-check` endpoint:

```
client → nginx /grafana/...  ── auth_request ──►  backend /api/auth/super-admin-check
                                                  ├─ 204  → nginx forwards to grafana
                                                  └─ 401  → nginx returns 401, no Grafana hop
```

Grafana itself runs `GF_AUTH_ANONYMOUS_ENABLED=true` with `Viewer` org
role — the actual gate is the nginx subrequest. A network-level bypass
of nginx would expose a read-only dashboard, but Grafana only listens on
the `obs` Docker network (no `ports:` mapping), so the only path from
the public internet is through nginx.

The session cookie set by museum-web at login is the ONLY credential the
super_admin user provides. From their perspective : they log into
`/fr/admin`, click "Ops · Grafana" in the sidebar, and the dashboard
loads inside the iframe.

### Roles + access matrix

| Role | Sees /fr/admin ? | Sees Ops · Grafana nav ? | /grafana/ via nginx ? |
|---|---|---|---|
| `visitor` | no (login redirect) | no | 401 |
| `moderator` | yes | no | 401 |
| `museum_manager` | no (admin shell role guard rejects) | no | 401 |
| `admin` (B2B museum operator) | yes | no | 401 |
| **`super_admin`** (Tim, Musaium) | **yes** | **yes** | **200** |

The strict separation means a museum operator with `admin` role NEVER
sees cross-tenant ops data, by construction.

### Telegram smoke-fire

```bash
ssh user@vps "docker exec museum-alertmanager-1 amtool alert add chat_e2e_p99_high \
  severity=warning service=musaium-backend \
  --annotation summary='manual smoke' \
  --annotation description='triggered by ops to verify the bridge'"
```

Expect a Telegram message in Tim's chat within a few seconds. If the
bridge is down, AlertManager logs the webhook failure but the alert
itself remains tracked in the AlertManager UI at `:9093`.

### Dashboard editing workflow

1. `cp infra/grafana/dashboards/chat-latency.json /tmp/before.json`.
2. Edit in Grafana UI (visually nicer than hand-editing JSON).
3. Export: dashboard menu → Share → Export → "Save to file".
4. `mv ~/Downloads/chat-latency-*.json infra/grafana/dashboards/chat-latency.json` and review the diff.
5. PR the change.
6. After merge, on the VPS: `rsync` infra/grafana/ → /srv/museum/obs/, then `docker compose restart grafana`.

### Alert silencing

UI at `http://${VPS_IP}:9093` → "Silences" → "New". Comment + expiry
mandatory. Silences are not version-controlled — mirror them into the
on-call runbook if they outlive a deploy.

### Rollback

- Dashboard JSON / alerting rules / scrape config are git-tracked →
  `git revert` + `rsync` + `docker compose restart grafana prometheus`
  restores prior state. Prometheus retains its TSDB data, no loss.
- AlertManager rule hot-reload: `curl -X POST http://${VPS_IP}:9093/-/reload`.
- Demote tim back to `admin` (last-resort, manual): see SQL one-liner above.

### What the iframe exposes (cross-tenant data warning, D9)

- **All tenants' chat data, aggregated.** There is no `museumId` scoping
  in the Prometheus metrics (cardinality budget per spec §5 NFR forbade
  museum-scoped labels).
- The proper B2B museum-admin latency panel ships in **W3.2** post-launch
  with Recharts + a backend proxy that scopes queries to the caller's
  `museumId`. Until W3.2 ships, B2B museum admins have no chat-latency
  visibility (by design).

### Enforcement layers (defense in depth)

1. nginx `auth_request /grafana-auth-check` → backend.
2. backend `/api/auth/super-admin-check` returns 204 only for
   `req.user.role === 'super_admin'`.
3. museum-web `RoleGuard allowedRoles={['super_admin']}` on
   `/admin/ops/grafana/layout.tsx` (defense for the iframe page itself).
4. museum-web `AdminShell` only renders the "Ops · Grafana" nav link for
   `super_admin` users (UX-level guard, not security — assume hidden links
   are still discoverable).
5. Grafana not exposed via host port — only reachable through nginx.
