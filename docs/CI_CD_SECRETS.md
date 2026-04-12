# CI/CD Secrets (Ops)

Ce document liste les secrets GitHub Actions utilisés par les workflows CI/CD du projet, avec leur rôle et la portée recommandée.

## Où configurer les secrets

- `Repository secrets`: pour les secrets partagés à tous les workflows/environnements.
- `Environment secrets` (`staging`, `production`): recommandé pour les secrets spécifiques à un environnement (surtout smoke tests et mobile prod).

## Variables GitHub Actions (non secret)

### `AUTO_TAG_BUILD_ANDROID`
- Type: `Repository variable` (pas un secret).
- Valeur recommandée par défaut: `false` (ou non définie).
- Rôle: contrôle si les tags `v*` déclenchent aussi le build/submit Android dans `ci-cd-mobile.yml`.
- Comportement:
  - `false` / absent: tags `v*` = flux iOS uniquement.
  - `true`: tags `v*` = iOS + Android.

Recommandation:
- Mettre les secrets de **prod** dans l’environnement GitHub `production`.
- Mettre les secrets de **staging** dans l’environnement GitHub `staging` (si vous l’utilisez).
- Limiter les permissions (principe du moindre privilège).

## Workflows concernés

- `.github/workflows/ci-cd-backend.yml` — quality gate + E2E + deploy prod/staging
- `.github/workflows/ci-cd-web.yml` — quality gate + Lighthouse CI + deploy Docker/GHCR → VPS
- `.github/workflows/ci-cd-mobile.yml` — quality gate + Maestro E2E + EAS build + store submit
- `.github/workflows/_deploy-backend.yml` — reusable deploy workflow (called by ci-cd-backend)
- `.github/workflows/deploy-privacy-policy.yml` — privacy policy static page deploy
- `.github/workflows/codeql.yml` — CodeQL security analysis (security-extended + security-and-quality)
- `.github/workflows/semgrep.yml` — SAST static analysis scanning

Note mobile:
- `ci-cd-mobile.yml` est désormais orienté release mobile uniquement.
- Il ne se déclenche plus sur `push` backend.
- Déclencheurs actifs: `workflow_dispatch`, `push main` (frontend only), `tag v*`.
- Les submits stores sont séparés en jobs iOS et Android.
- Sur `push main` frontend: iOS preview + Android `internal testing` store-grade avec auto-submit Google Play.
- Commit message pour cibler une plateforme:
  - `feature/ios-only` (ou `ios only`) => skip Android internal testing.
  - `feature/android-only` (ou `android only`) => skip iOS preview.

## Secrets Maestro E2E (Mobile)

### `MAESTRO_CLOUD_API_KEY`
- Rôle: API key for Maestro Cloud, used to run E2E mobile tests on cloud devices.
- Utilisé par:
  - `ci-cd-mobile.yml` (`maestro-e2e` job)
- Portée recommandée: repository.
- Configuration: Generate from [maestro.mobile.dev](https://maestro.mobile.dev) dashboard → API Keys.

## Secrets Backend Deploy (GHCR + VPS)

### `GHCR_USER`
- Rôle: username pour push/pull d’images sur GHCR (`ghcr.io`).
- Utilisé par:
  - `_deploy-backend.yml` (reusable deploy workflow, called by `ci-cd-backend.yml`)
- Portée recommandée: repository (ou organization si mutualisé).

### `GHCR_TOKEN`
- Rôle: token GitHub (ou PAT) avec permission `packages:write`/`packages:read` pour GHCR.
- Utilisé par:
  - `_deploy-backend.yml` (reusable deploy workflow, called by `ci-cd-backend.yml`)
- Portée recommandée: repository / organization.

### `SERVER_HOST`
- Rôle: hostname/IP du VPS cible (deploy backend).
- Utilisé par:
  - `_deploy-backend.yml` (reusable deploy workflow, called by `ci-cd-backend.yml`)
- Portée recommandée: environment (`staging`, `production`) si serveurs différents.

### `SERVER_USER`
- Rôle: utilisateur SSH pour le déploiement (ex: `deploy`).
- Utilisé par:
  - `_deploy-backend.yml` (reusable deploy workflow, called by `ci-cd-backend.yml`)
- Portée recommandée: environment.

### `SERVER_KEY`
- Rôle: clé privée SSH du compte de déploiement.
- Utilisé par:
  - `_deploy-backend.yml` (reusable deploy workflow, called by `ci-cd-backend.yml`)
- Portée recommandée: environment (jamais repository si prod/staging distincts).

## Secrets Smoke Tests Post-Deploy (Strictement requis)

Ces secrets sont **maintenant bloquants** dans les workflows de déploiement backend. Si absents, le workflow échoue avant l’étape de smoke.

### Staging

#### `STAGING_SMOKE_API_BASE_URL`
- Rôle: URL base de l’API staging (ex: `https://api-staging.example.com`).
- Utilisé par:
  - `ci-cd-backend.yml` (staging deploy job)
- Doit pointer vers l’API exposant `/api/health`, `/api/auth/*`, `/api/chat/*`.

#### `STAGING_SMOKE_TEST_EMAIL`
- Rôle: email du compte de test utilisé pour les smoke tests staging.
- Utilisé par:
  - `ci-cd-backend.yml` (staging deploy job)
- Note: le script peut créer le compte s’il n’existe pas encore (register fallback).

#### `STAGING_SMOKE_TEST_PASSWORD`
- Rôle: mot de passe du compte de test smoke staging.
- Utilisé par:
  - `ci-cd-backend.yml` (staging deploy job)

### Production

#### `PROD_SMOKE_API_BASE_URL`
- Rôle: URL base de l’API prod (ex: `https://api.example.com`).
- Utilisé par:
  - `ci-cd-backend.yml` (production deploy job via `_deploy-backend.yml`)

#### `PROD_SMOKE_TEST_EMAIL`
- Rôle: email du compte de test smoke prod.
- Utilisé par:
  - `ci-cd-backend.yml` (production deploy job via `_deploy-backend.yml`)
- Recommandation: compte dédié, permissions minimales, surveillé.

#### `PROD_SMOKE_TEST_PASSWORD`
- Rôle: mot de passe du compte de test smoke prod.
- Utilisé par:
  - `ci-cd-backend.yml` (production deploy job via `_deploy-backend.yml`)

## Secrets Mobile (Expo / EAS)

### `EXPO_TOKEN`
- Rôle: authentification Expo/EAS CLI pour builds et submissions.
- Utilisé par:
  - `ci-cd-mobile.yml`
- Requis pour:
  - preview builds
  - production builds
  - submissions

### `EXPO_PUBLIC_API_BASE_URL_STAGING`
- Rôle: base URL API staging injectée au build Expo.
- Utilisé par:
  - `ci-cd-mobile.yml`
- Vérifié explicitement avant build preview/prod.

### `EXPO_PUBLIC_API_BASE_URL_PROD`
- Rôle: base URL API prod injectée au build Expo.
- Utilisé par:
  - `ci-cd-mobile.yml`
- Vérifié explicitement avant build preview/prod/submit.

### `EXPO_PUBLIC_EAS_PROJECT_ID`
- Statut: plus requis par le workflow mobile actuel.
- Raison: le `projectId` EAS doit désormais être la source de vérité du projet Expo lui-même (`app.json` après `eas project:init`), pas un secret GitHub dupliqué.
- Recommandation: retirer ce secret du repository pour éviter les mismatches.

## Secrets Mobile Production Submission (Stores)

### `APPLE_APP_SPECIFIC_PASSWORD`
- Rôle: mot de passe spécifique app Apple pour soumission iOS.
- Utilisé par:
  - `ci-cd-mobile.yml` (`submit-production-ios`)

### `APPLE_ID`
- Rôle: identifiant Apple Developer / App Store Connect.
- Utilisé par:
  - `ci-cd-mobile.yml` (`submit-production-ios`)

### `ASC_APP_ID`
- Rôle: identifiant App Store Connect de l’app.
- Utilisé par:
  - `ci-cd-mobile.yml` (`submit-production-ios`)

### `APPLE_TEAM_ID`
- Rôle: team ID Apple Developer.
- Utilisé par:
  - `ci-cd-mobile.yml` (`submit-production-ios`)

### `GOOGLE_SERVICE_ACCOUNT_JSON`
- Rôle: JSON du service account Google Play pour soumission Android.
- Utilisé par:
  - `ci-cd-mobile.yml` (`build-internal-android`)
  - `ci-cd-mobile.yml` (`submit-production-android`)
- Le workflow écrit ce JSON dans `.secrets/google-service-account.json` au runtime CI.
- Note: requis aussi pour le flux auto `push -> Google Play Internal testing`.

## Secrets Rotation Policy

### Schedule

| Secret | Rotation | Procedure | Downtime |
|--------|----------|-----------|----------|
| `JWT_ACCESS_SECRET` | Quarterly | Dual-key (see below) | Zero |
| `JWT_REFRESH_SECRET` | Quarterly | Dual-key (see below) | Zero |
| `MEDIA_SIGNING_SECRET` | Quarterly | Direct replace | Zero (URLs re-signed on access) |
| `SERVER_KEY` (SSH) | Annually | Generate new key pair, update GitHub + VPS | Zero |
| `GHCR_TOKEN` | Annually or on compromise | Regenerate PAT, update GitHub secret | Zero |
| `SENTRY_AUTH_TOKEN` | Annually | Regenerate in Sentry dashboard, update GitHub + EAS | Zero |
| `BREVO_API_KEY` | On compromise only | Regenerate in Brevo dashboard, update VPS `.env` | Brief (email outage during update) |
| `OPENAI_API_KEY` | On compromise only | Regenerate in OpenAI dashboard, update VPS `.env` | Brief (chat outage during update) |
| `DEEPSEEK_API_KEY` | On compromise only | Regenerate in provider dashboard, update VPS `.env` | Brief |
| `GOOGLE_API_KEY` | On compromise only | Regenerate in Google Cloud Console, update VPS `.env` | Brief |
| `REDIS_PASSWORD` | Quarterly | Rotate via `CONFIG SET requirepass` + update VPS `.env` + restart (see below) | Brief (cache + rate-limit re-auth) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Annually | Create new key in provider, update VPS `.env`, delete old | Zero (if done sequentially) |
| `EXPO_TOKEN` | Annually | Regenerate in Expo dashboard, update GitHub secret | Zero |
| Smoke test passwords | Quarterly | Change in app + update GitHub secret | Zero |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Annually | Create new key in GCP, update GitHub secret, delete old | Zero |
| Apple credentials | On certificate renewal (yearly) | Renew in Apple Developer Portal, update GitHub | Zero |

### Zero-Downtime JWT Rotation (Dual-Key Pattern)

JWT secrets require a grace period where both old and new keys are valid.

**Step 1 — Generate new secret**
```bash
node -e "console.log(require(‘crypto’).randomBytes(64).toString(‘hex’))"
```

**Step 2 — Deploy with dual verification**
The backend currently validates tokens with a single secret. For zero-downtime rotation:

1. Set the new secret in `.env` on VPS
2. Restart backend — new tokens are signed with the new secret
3. Existing access tokens (15min TTL) expire naturally within 15 minutes
4. Existing refresh tokens (7d TTL) will fail on next refresh and force re-login
5. **Grace period**: ~15 minutes for access tokens, up to 7 days for refresh tokens

**Alternative (if users must not re-login)**:
1. Temporarily modify `verifyAccessToken` to try both old and new secrets
2. Deploy with both secrets
3. Wait 7 days (max refresh token lifetime)
4. Remove old secret, deploy again

**Step 3 — Verify**
```bash
# Test login flow
curl -X POST https://musaium.com/api/auth/login \
  -H ‘Content-Type: application/json’ \
  -d ‘{"email":"test@test.com","password":"test"}’ | jq .accessToken
```

### External API Key Rotation

**Brevo / OpenAI / Deepseek / Google**:
1. Generate new API key in provider dashboard (do NOT delete old key yet)
2. Update `.env` on VPS with new key
3. Restart backend: `docker compose restart backend`
4. Verify with health check: `curl https://musaium.com/api/health | jq .`
5. Test the specific service (send test email, ask test question)
6. Delete old API key in provider dashboard

**Redis Password**:

Redis runs inside the private docker network with `--requirepass` enforced by `deploy/docker-compose.prod.yml`. The backend reads `REDIS_PASSWORD` from the VPS `.env`; both the cache service and the rate-limit store pass it as an explicit ioredis option so it overrides anything embedded in `REDIS_URL`.

1. Generate a new password on a trusted host:
   ```bash
   openssl rand -base64 32
   ```
2. Apply it live without dropping existing sessions:
   ```bash
   ssh vps 'docker compose -f /opt/museum/docker-compose.prod.yml exec redis \
     redis-cli -a "$REDIS_PASSWORD" CONFIG SET requirepass "<new-password>"'
   ```
3. Update `REDIS_PASSWORD` in the VPS `.env` file (so the next restart keeps the new value).
4. Restart the backend so both the cache client and the rate-limit client pick up the new secret:
   ```bash
   ssh vps 'docker compose -f /opt/museum/docker-compose.prod.yml restart backend'
   ```
5. Verify:
   ```bash
   ssh vps 'docker compose -f /opt/museum/docker-compose.prod.yml exec redis \
     redis-cli -a "$REDIS_PASSWORD" PING'
   # → PONG
   curl -sf https://api.musaium.com/api/health | jq .
   ```

Notes:
- The redis container's healthcheck uses `REDIS_PASSWORD`, so the container will report unhealthy if the env file is stale — this is the signal to re-run the sequence above.
- `REDIS_PASSWORD` is **not** a GitHub secret — it lives only in the VPS `.env` file (same as `DB_PASSWORD`, `OPENAI_API_KEY`, etc.).
- Keep the old password in a paste buffer for ~30 seconds in case a rollback is needed; do not write it to disk.

**S3 Storage**:
1. Create new access key in provider dashboard
2. Update `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` in VPS `.env`
3. Restart backend
4. Test image upload + retrieval
5. Delete old access key

### Emergency Key Revocation

If a secret is compromised:

1. **Immediately** rotate the compromised secret (steps above)
2. If JWT secret: all active sessions become invalid — users must re-login
3. If API key: revoke old key in provider dashboard immediately
4. If SSH key: remove old public key from VPS `~/.ssh/authorized_keys`
5. Audit GitHub Actions logs for unauthorized usage
6. Document the incident in `docs/incidents/`

## Bonnes pratiques (recommandees)

- Creer des comptes de smoke test dedies (`staging` et `prod`) separes.
- Ne pas reutiliser les comptes personnels/admin pour les smoke tests.
- Faire tourner le mot de passe smoke regulierement.
- Restreindre la cle SSH de deploy (`SERVER_KEY`) au seul hote/service de deploiement.
- Pour GHCR, utiliser un token a portee minimale.
- Documenter l’inventaire des secrets dans votre gestionnaire de secrets interne (Vault, 1Password, etc.).

## Sentry (Observability)

| Secret | Role | Used by | Scope |
|--------|------|---------|-------|
| `SENTRY_AUTH_TOKEN` | Authentication for Sentry CLI (source map upload, release creation) | `_deploy-backend.yml` (called by `ci-cd-backend.yml`), EAS builds (via `eas secret:create`) | repository |
| `SENTRY_ORG` | Sentry organization slug | Deploy workflows | repository |
| `SENTRY_PROJECT_BACKEND` | Sentry project slug for the backend API | Deploy workflows | repository |

### Frontend (EAS)

The `@sentry/react-native/expo` plugin in `app.config.ts` auto-uploads source maps during EAS builds when `SENTRY_AUTH_TOKEN` is available as an EAS secret.

Setup: `eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>`

### Backend DSN

Set `SENTRY_DSN` in the backend `.env` file on the VPS (not in GitHub secrets — it's a runtime env var).

### Frontend DSN

Set `EXPO_PUBLIC_SENTRY_DSN_ANDROID` and `EXPO_PUBLIC_SENTRY_DSN_IOS` in the frontend `.env` file or EAS build profile env vars.

## Checklist de mise en place (rapide)

1. Configurer `GHCR_*` et `SERVER_*`.
2. Configurer les secrets smoke staging (`STAGING_SMOKE_*`).
3. Configurer les secrets smoke prod (`PROD_SMOKE_*`).
4. Configurer les secrets Expo/EAS (`EXPO_*`).
5. Configurer les secrets store submission Apple/Google.
6. Déclencher `ci-cd-backend` (staging job) et vérifier que le smoke test passe.
7. Déclencher `ci-cd-backend` (production job) et vérifier que le smoke test passe.
