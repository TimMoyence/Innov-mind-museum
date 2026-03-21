# CI/CD Secrets (Ops)

Ce document liste les secrets GitHub Actions utilisés par les workflows CI/CD du projet, avec leur rôle et la portée recommandée.

## Où configurer les secrets

- `Repository secrets`: pour les secrets partagés à tous les workflows/environnements.
- `Environment secrets` (`staging`, `production`): recommandé pour les secrets spécifiques à un environnement (surtout smoke tests et mobile prod).

## Variables GitHub Actions (non secret)

### `AUTO_TAG_BUILD_ANDROID`
- Type: `Repository variable` (pas un secret).
- Valeur recommandée par défaut: `false` (ou non définie).
- Rôle: contrôle si les tags `v*` déclenchent aussi le build/submit Android dans `mobile-release.yml`.
- Comportement:
  - `false` / absent: tags `v*` = flux iOS uniquement.
  - `true`: tags `v*` = iOS + Android.

Recommandation:
- Mettre les secrets de **prod** dans l’environnement GitHub `production`.
- Mettre les secrets de **staging** dans l’environnement GitHub `staging` (si vous l’utilisez).
- Limiter les permissions (principe du moindre privilège).

## Workflows concernés

- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-backend.yml`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-frontend.yml`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/deploy-backend.yml`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/deploy-backend-staging.yml`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/mobile-release.yml`

Note mobile:
- `mobile-release.yml` est désormais orienté release mobile uniquement.
- Il ne se déclenche plus sur `push` backend.
- Déclencheurs actifs: `workflow_dispatch`, `push main` (frontend only), `tag v*`.
- Les submits stores sont séparés en jobs iOS et Android.
- Sur `push main` frontend: iOS preview + Android `internal testing` store-grade avec auto-submit Google Play.
- Commit message pour cibler une plateforme:
  - `feature/ios-only` (ou `ios only`) => skip Android internal testing.
  - `feature/android-only` (ou `android only`) => skip iOS preview.

## Secrets Backend Deploy (GHCR + VPS)

### `GHCR_USER`
- Rôle: username pour push/pull d’images sur GHCR (`ghcr.io`).
- Utilisé par:
  - `deploy-backend.yml`
  - `deploy-backend-staging.yml`
- Portée recommandée: repository (ou organization si mutualisé).

### `GHCR_TOKEN`
- Rôle: token GitHub (ou PAT) avec permission `packages:write`/`packages:read` pour GHCR.
- Utilisé par:
  - `deploy-backend.yml`
  - `deploy-backend-staging.yml`
- Portée recommandée: repository / organization.

### `SERVER_HOST`
- Rôle: hostname/IP du VPS cible (deploy backend).
- Utilisé par:
  - `deploy-backend.yml`
  - `deploy-backend-staging.yml`
- Portée recommandée: environment (`staging`, `production`) si serveurs différents.

### `SERVER_USER`
- Rôle: utilisateur SSH pour le déploiement (ex: `deploy`).
- Utilisé par:
  - `deploy-backend.yml`
  - `deploy-backend-staging.yml`
- Portée recommandée: environment.

### `SERVER_KEY`
- Rôle: clé privée SSH du compte de déploiement.
- Utilisé par:
  - `deploy-backend.yml`
  - `deploy-backend-staging.yml`
- Portée recommandée: environment (jamais repository si prod/staging distincts).

## Secrets Smoke Tests Post-Deploy (Strictement requis)

Ces secrets sont **maintenant bloquants** dans les workflows de déploiement backend. Si absents, le workflow échoue avant l’étape de smoke.

### Staging

#### `STAGING_SMOKE_API_BASE_URL`
- Rôle: URL base de l’API staging (ex: `https://api-staging.example.com`).
- Utilisé par:
  - `deploy-backend-staging.yml`
- Doit pointer vers l’API exposant `/api/health`, `/api/auth/*`, `/api/chat/*`.

#### `STAGING_SMOKE_TEST_EMAIL`
- Rôle: email du compte de test utilisé pour les smoke tests staging.
- Utilisé par:
  - `deploy-backend-staging.yml`
- Note: le script peut créer le compte s’il n’existe pas encore (register fallback).

#### `STAGING_SMOKE_TEST_PASSWORD`
- Rôle: mot de passe du compte de test smoke staging.
- Utilisé par:
  - `deploy-backend-staging.yml`

### Production

#### `PROD_SMOKE_API_BASE_URL`
- Rôle: URL base de l’API prod (ex: `https://api.example.com`).
- Utilisé par:
  - `deploy-backend.yml`

#### `PROD_SMOKE_TEST_EMAIL`
- Rôle: email du compte de test smoke prod.
- Utilisé par:
  - `deploy-backend.yml`
- Recommandation: compte dédié, permissions minimales, surveillé.

#### `PROD_SMOKE_TEST_PASSWORD`
- Rôle: mot de passe du compte de test smoke prod.
- Utilisé par:
  - `deploy-backend.yml`

## Secrets Mobile (Expo / EAS)

### `EXPO_TOKEN`
- Rôle: authentification Expo/EAS CLI pour builds et submissions.
- Utilisé par:
  - `mobile-release.yml`
- Requis pour:
  - preview builds
  - production builds
  - submissions

### `EXPO_PUBLIC_API_BASE_URL_STAGING`
- Rôle: base URL API staging injectée au build Expo.
- Utilisé par:
  - `mobile-release.yml`
- Vérifié explicitement avant build preview/prod.

### `EXPO_PUBLIC_API_BASE_URL_PROD`
- Rôle: base URL API prod injectée au build Expo.
- Utilisé par:
  - `mobile-release.yml`
- Vérifié explicitement avant build preview/prod/submit.

### `EXPO_PUBLIC_EAS_PROJECT_ID`
- Statut: plus requis par le workflow mobile actuel.
- Raison: le `projectId` EAS doit désormais être la source de vérité du projet Expo lui-même (`app.json` après `eas project:init`), pas un secret GitHub dupliqué.
- Recommandation: retirer ce secret du repository pour éviter les mismatches.

## Secrets Mobile Production Submission (Stores)

### `APPLE_APP_SPECIFIC_PASSWORD`
- Rôle: mot de passe spécifique app Apple pour soumission iOS.
- Utilisé par:
  - `mobile-release.yml` (`submit-production-ios`)

### `APPLE_ID`
- Rôle: identifiant Apple Developer / App Store Connect.
- Utilisé par:
  - `mobile-release.yml` (`submit-production-ios`)

### `ASC_APP_ID`
- Rôle: identifiant App Store Connect de l’app.
- Utilisé par:
  - `mobile-release.yml` (`submit-production-ios`)

### `APPLE_TEAM_ID`
- Rôle: team ID Apple Developer.
- Utilisé par:
  - `mobile-release.yml` (`submit-production-ios`)

### `GOOGLE_SERVICE_ACCOUNT_JSON`
- Rôle: JSON du service account Google Play pour soumission Android.
- Utilisé par:
  - `mobile-release.yml` (`build-internal-android`)
  - `mobile-release.yml` (`submit-production-android`)
- Le workflow écrit ce JSON dans `.secrets/google-service-account.json` au runtime CI.
- Note: requis aussi pour le flux auto `push -> Google Play Internal testing`.

## Bonnes pratiques (recommandées)

- Créer des comptes de smoke test dédiés (`staging` et `prod`) séparés.
- Ne pas réutiliser les comptes personnels/admin pour les smoke tests.
- Faire tourner le mot de passe smoke régulièrement.
- Restreindre la clé SSH de deploy (`SERVER_KEY`) au seul hôte/service de déploiement.
- Pour GHCR, utiliser un token à portée minimale.
- Documenter l’inventaire des secrets dans votre gestionnaire de secrets interne (Vault, 1Password, etc.).

## Sentry (Observability)

| Secret | Role | Used by | Scope |
|--------|------|---------|-------|
| `SENTRY_AUTH_TOKEN` | Authentication for Sentry CLI (source map upload, release creation) | `deploy-backend.yml`, `deploy-backend-staging.yml`, EAS builds (via `eas secret:create`) | repository |
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
6. Déclencher `deploy-backend-staging` et vérifier que le smoke test passe.
7. Déclencher `deploy-backend` et vérifier que le smoke test passe.
