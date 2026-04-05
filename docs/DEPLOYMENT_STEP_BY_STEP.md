# MuseumIA Deployment Step-by-Step (Local / Preprod / Prod)

This guide is the operational runbook for:

- backend API deployment (Docker + GHCR + VPS)
- mobile preview/production builds (EAS)
- environment setup (`local`, `preprod=staging`, `prod`)

It is intentionally explicit and command-oriented.

## 1. Scope and Environments

- `local`: developer machine
- `preprod`: staging backend + preview mobile builds
- `prod`: production backend + production mobile builds/submission

## 2. Prerequisites (Accounts / Tools / Access)

You need:

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
- `pnpm` 9.x (backend)
- `npm` (frontend, current project setup)
- Docker (for local e2e tests)
- `curl`, `jq` (recommended)

## 3. Repository Setup (Local)

Clone and install dependencies:

```bash
git clone <your-repo-url> museumia
cd museumia

cd museum-backend
pnpm install --frozen-lockfile

cd ../museum-frontend
npm install --no-audit --no-fund
```

## 4. Environment Templates (What to Copy)

### Backend

Use one of:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
cp .env.local.example .env
# or
cp .env.staging.example .env
# or
cp .env.production.example .env
```

### Frontend

Use one of:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
cp .env.local.example .env
# or
cp .env.preview.example .env
# or
cp .env.production.example .env
```

## 5. Local Development Validation (Before Any Deploy)

### Backend quality checks

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm run typecheck
pnpm test
```

### Backend e2e (Postgres + Docker, recommended before release)

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
RUN_E2E=true pnpm test -- --watchman=false --runInBand tests/e2e/api.postgres.e2e.test.ts
```

### Frontend quality checks

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npm run typecheck
npm test
```

## 6. Staging/Production Architecture (Target)

Recommended runtime architecture:

- VPS hosts Docker Compose services
- Backend image pulled from GHCR
- PostgreSQL (managed or VPS-hosted)
- S3-compatible private bucket for uploaded chat images
- Backend generates signed image URLs
- Mobile builds consume API via `EXPO_PUBLIC_API_BASE_URL_*`

## 7. GitHub Actions Secrets (Configure Before First Deploy)

### Backend deploy workflows

Required secrets (current workflows):

- `GHCR_USER`
- `GHCR_TOKEN`
- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_KEY`

### Mobile release workflow

Required secrets:

- `EXPO_TOKEN`
- `EXPO_PUBLIC_API_BASE_URL_STAGING`
- `EXPO_PUBLIC_API_BASE_URL_PROD`
- `EXPO_PUBLIC_EAS_PROJECT_ID`

Optional / prod submission secrets (only if submitting stores from CI):

- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_ID`
- `ASC_APP_ID`
- `APPLE_TEAM_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

## 8. VPS Preparation (Staging + Prod)

On the VPS (Ubuntu example):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
```

Install Docker Engine + Compose plugin (if not already present), then verify:

```bash
docker --version
docker compose version
```

Create application directory:

```bash
sudo mkdir -p /srv/museum
sudo chown -R $USER:$USER /srv/museum
cd /srv/museum
```

Place your `docker-compose.yml` (or the project compose file used by your workflows) with services:

- `backend-staging`
- `backend`

## 9. PostgreSQL Preparation

Prepare separate DBs/users for staging and prod (recommended).

Example SQL (run in PostgreSQL admin shell):

```sql
CREATE USER museumia_staging WITH PASSWORD 'replace';
CREATE DATABASE museumia_staging OWNER museumia_staging;

CREATE USER museumia_prod WITH PASSWORD 'replace';
CREATE DATABASE museumia_prod OWNER museumia_prod;
```

Ensure network/firewall allows the VPS backend container to reach PostgreSQL.

## 10. S3-Compatible Object Storage Preparation

Create private buckets:

- `museumia-staging-private`
- `museumia-prod-private`

Recommended settings:

- Private bucket (no public read)
- Server-side encryption enabled (if provider supports)
- Lifecycle cleanup for temporary/debug artifacts (if any)
- Credentials scoped to bucket only

Values to collect for backend `.env`:

- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_SESSION_TOKEN` (optional, for temporary credentials)
- `S3_OBJECT_KEY_PREFIX` (optional, recommended: `staging` / `prod`)
- `S3_PUBLIC_BASE_URL` (optional; supports `{bucket}` placeholder if using custom domain/proxy)

## 11. DNS and TLS

Prepare API hostnames:

- Staging: `staging-api.example.com`
- Production: `api.example.com`

Ensure TLS termination is configured (reverse proxy or LB). Then verify:

```bash
curl -I https://staging-api.example.com/api/health
curl -I https://api.example.com/api/health
```

## 12. Create Backend `.env` on Servers

### Staging

On VPS, create staging env file from template:

```bash
cd /srv/museum
nano .env.backend-staging
```

Populate with values from `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/.env.staging.example`.

### Production

```bash
cd /srv/museum
nano .env.backend-prod
```

Populate with values from `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/.env.production.example`.

Important:

- `NODE_ENV=production`
- explicit `CORS_ORIGINS`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MEDIA_SIGNING_SECRET`
- `OBJECT_STORAGE_DRIVER=s3`
- complete S3 credentials

## 13. Backend Staging Deploy (Step-by-Step)

### Trigger

Push to `staging` (current workflow `.github/workflows/deploy-backend-staging.yml`) or run manual `workflow_dispatch`.

### What CI does

- runs backend quality checks
- builds Docker image
- pushes to GHCR (`museum-backend-staging`)
- SSH to VPS and runs:

```bash
docker compose pull backend-staging
docker compose up -d --remove-orphans backend-staging
```

### Manual verification after deploy

```bash
curl https://staging-api.example.com/api/health
```

Expected:

- HTTP `200` (or `503` if DB/LLM misconfigured; `503` still means service is reachable)
- JSON contains `status`, `checks`, `environment`, `version`, `timestamp`

## 14. Run Backend Migrations (Staging)

Run migrations in the backend container (example command; adapt container/service name):

```bash
docker compose exec backend-staging pnpm run migration:run
```

If your image does not include source scripts at runtime, use an alternate migration strategy:

- dedicated migration job in CI/CD
- one-shot migration container
- temporary `docker compose run --rm backend-staging pnpm run migration:run`

Then re-check:

```bash
curl https://staging-api.example.com/api/health
```

## 15. Backend Staging Smoke Test (Manual API)

Run a real smoke test sequence using a temporary user:

```bash
BASE_URL="https://staging-api.example.com"
EMAIL="smoke+$(date +%s)@example.test"
PASSWORD="Password123!"

curl -sS -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"firstname\":\"Smoke\",\"lastname\":\"Test\"}" | jq .

LOGIN_JSON=$(curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
echo "$LOGIN_JSON" | jq .

ACCESS_TOKEN=$(echo "$LOGIN_JSON" | jq -r '.accessToken')
REFRESH_TOKEN=$(echo "$LOGIN_JSON" | jq -r '.refreshToken')

curl -sS "$BASE_URL/api/auth/me" -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

SESSION_JSON=$(curl -sS -X POST "$BASE_URL/api/chat/sessions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"locale":"en-US","museumMode":true}')
echo "$SESSION_JSON" | jq .

SESSION_ID=$(echo "$SESSION_JSON" | jq -r '.session.id')

curl -sS -X POST "$BASE_URL/api/chat/sessions/$SESSION_ID/messages" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"text":"Tell me about this artwork.","context":{"locale":"en-US","museumMode":true,"guideLevel":"beginner"}}' | jq .

curl -sS "$BASE_URL/api/chat/sessions/$SESSION_ID?limit=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

curl -sS -X POST "$BASE_URL/api/auth/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" | jq .
```

## 16. Backend Production Deploy (Step-by-Step)

### Trigger

Push to `main` (current workflow `.github/workflows/deploy-backend.yml`) after staging validation.

### Workflow result

- quality checks
- image build/push GHCR (`museum-backend`)
- VPS deploy:

```bash
docker compose pull backend
docker compose up -d --remove-orphans backend
```

### Production checks

```bash
curl https://api.example.com/api/health
```

Then run the same smoke sequence as staging against `https://api.example.com`.

## 17. Backend Rollback (Step-by-Step)

If deploy fails after rollout:

1. Find previous working image SHA tag in GHCR / GitHub Actions logs.
2. Update your compose image reference to the previous SHA tag.
3. Redeploy service.

Example:

```bash
cd /srv/museum
# edit compose image tag to ghcr.io/<user>/museum-backend:<previous_sha>
docker compose pull backend
docker compose up -d --remove-orphans backend
curl https://api.example.com/api/health
```

Rollback checklist:

- health reachable
- auth login works
- chat create/list works
- image upload/history path works

## 18. Mobile EAS Preparation (Preview + Production)

Ensure frontend env values and GitHub secrets are set:

- `EXPO_PUBLIC_API_BASE_URL_STAGING`
- `EXPO_PUBLIC_API_BASE_URL_PROD`
- `EXPO_PUBLIC_EAS_PROJECT_ID`

Local verification:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npm run typecheck
npm test
```

## 19. Mobile Preview Build (Preprod)

Manual local (optional):

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npx eas build --platform android --profile preview --non-interactive --no-wait
npx eas build --platform ios --profile preview --non-interactive --no-wait
```

CI path:

- `mobile-release.yml` on PR / push to `main` (preview builds when not tag release and `EXPO_TOKEN` exists)

### Preview validation checklist

- App opens and reaches staging backend
- Login works (`/api/auth/login`)
- `/api/auth/me` works after app restart (refresh token path)
- Text chat works
- Image upload works
- Historical image re-display works
- Audio route works

## 20. Mobile Production Build + Submission

### Build production

Local/manual:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npx eas build --platform android --profile production --non-interactive --no-wait
npx eas build --platform ios --profile production --non-interactive --no-wait
```

CI path:

- create tag `vX.Y.Z`
- push tag
- `mobile-release.yml` runs `build-production`

### Submit production (if using CI)

Triggered by the same tag flow (`submit-production` job):

```bash
npx eas submit --platform android --profile production --latest --non-interactive
npx eas submit --platform ios --profile production --latest --non-interactive
```

## 21. Final Verification Checklist (Release Readiness)

Backend:

- `GET /api/health` returns expected `environment/version`
- auth login/refresh/logout/me all pass
- chat create/list/get/delete-if-empty pass
- image signed URL endpoint returns URL and image resolves
- audio route returns transcription + assistant response

Mobile:

- preview/prod app points to correct API base URL
- no localhost API URL in preview/prod builds
- session persists via refresh token across app restart
- expired access token refreshes automatically
- logout invalidates refresh token and returns to login

## 22. Incident Runbook (Quick Diagnostics)

### Health failing (`503`)

Check:

- DB connectivity / credentials / firewall
- `PGDATABASE`, `DB_HOST`, `DB_PORT`
- `OPENAI_API_KEY` / provider keys if `llmConfigured=false`

Commands:

```bash
docker compose logs --tail=200 backend
docker compose ps
curl -sS https://api.example.com/api/health | jq .
```

### Login/refresh failures (`401`)

Check:

- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` consistency after deploy
- DB migration for `auth_refresh_tokens` applied

Commands:

```bash
docker compose exec backend pnpm run migration:show
docker compose logs --tail=200 backend
```

### Image history not loading

Check:

- `OBJECT_STORAGE_DRIVER`
- `MEDIA_SIGNING_SECRET`
- S3 credentials / bucket access
- local uploads path (`LOCAL_UPLOADS_DIR`) for dev

Commands:

```bash
curl -sS -X POST https://api.example.com/api/chat/messages/<messageId>/image-url \
  -H "Authorization: Bearer <token>" | jq .
```

## 23. Database Backup

See [DB_BACKUP_RESTORE.md](DB_BACKUP_RESTORE.md) for the complete backup schedule, restore procedure, and GDPR compliance notes.

## 24. Notes for CI/CD Hardening (Next Step)

Recommended additions (if not yet implemented):

- backend Docker-enabled e2e job on PRs
- OpenAPI spec validation/lint in CI
- codegen sync check (frontend types from OpenAPI)
- post-deploy smoke script job (staging/prod)

Musaium transforme votre visite au musée en une expérience interactive et enrichissante.

📸 Photographiez une œuvre  
Prenez en photo un tableau, une sculpture ou toute œuvre d'art depuis l'application. L'IA analyse l'image et vous fournit des informations détaillées : artiste, époque, mouvement artistique, techniques utilisées et contexte historique.

🎙️ Posez vos questions à voix haute Activez le microphone et posez votre question directement. Musaium transcrit votre voix et vous répond en langage naturel, comme un guide personnel.

💬 Dialoguez avec votre guide IA : Continuez la conversation pour approfondir un sujet : demandez des anecdotes, des comparaisons avec d'autres œuvres ou des explications adaptées à votre niveau.

🏛️ Conçu pour le musée : Musaium est spécialisé dans l'art et la culture. L'assistant reste focalisé sur les œuvres et refuse les sujets hors contexte, pour une expérience fiable et pertinente.

Fonctionnalités clés :
• Analyse d'œuvres d'art par photo
• Questions vocales avec transcription automatique
• Conversations contextuelles avec historique
• Sélection de photos depuis la galerie
• Fonctionne avec les grands musées du monde entier
• Respectueux de votre vie privée (RGPD)
