# Mobile Internal Testing Flow

Ce document décrit le flux mobile Android recommandé pour `Musaium`:

- déclenchement **manuel** (`workflow_dispatch`) -> build cloud Android store-grade sur EAS
- auto-submit Google Play `Internal testing`
- validation réelle via Play Console / Google Play
- production publique séparée et contrôlée

> **Note déclenchement (2026-05)** — le build Android internal **n'est plus déclenché par un `push` sur `main`**. Le trigger on-push drainait le quota EAS Free plan à chaque merge ; les opérateurs lancent désormais le job `build-internal-android` manuellement depuis l'onglet **Actions** (`workflow_dispatch`, profil `internal`). Sur `push`/`pull_request`, le workflow ne lance que `quality` + `prebuild` (+ Maestro en nightly). Voir le bloc `on:` de `.github/workflows/ci-cd-mobile.yml`.

## Objectif

Éviter le téléchargement manuel d'APK à chaque changement frontend et faire du `cloud-first`:

1. build Android `AAB` sur EAS
2. upload automatique sur Google Play `Internal testing`
3. testeurs internes via Play Store
4. release publique séparée

## Décisions d'architecture

### 1. Android internal testing utilise un build store-grade

Le profil EAS `internal` produit un build Android avec:

- package de production
- canal EAS `internal`
- cible API `staging`

Le package reste celui de production pour rester compatible avec la même fiche Google Play.

### 2. Cible API découplée du package

Le frontend ne déduit plus la cible API uniquement de `APP_VARIANT`.

Variables utilisées:

- `APP_VARIANT`
- `EXPO_PUBLIC_API_ENVIRONMENT`

Cela permet:

- `package production` + `API staging` pour le track interne
- `package production` + `API production` pour la vraie release publique

### 3. Dispatch manuel => internal testing

Lancement manuel via **Actions > mobile > Run workflow** (`workflow_dispatch`) avec `profile=internal`, `platform=android`:

1. `quality` (lint, tests, OpenAPI sync, i18n, expo-doctor)
2. `build-internal-android` (EAS build profil `internal` + `--auto-submit-with-profile internal`)
3. auto-submit Google Play `internal`

La prod publique Android n'est pas déclenchée par ce flux ; elle utilise `profile=production` (+ `submit=yes` pour `submit-production-android`).

## Pré-requis

### GitHub Secrets

Requis:

- `EXPO_TOKEN`
- `EXPO_PUBLIC_API_BASE_URL_STAGING`
- `EXPO_PUBLIC_API_BASE_URL_PROD`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

Voir aussi:

- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/docs/CI_CD_SECRETS.md`

### Google Play Console

Avant le premier flux automatisé:

1. l'app Google Play doit exister
2. le compte service Google Play doit être lié
3. un premier upload manuel peut être nécessaire selon l'état initial du projet Play Console

## Profils EAS

### `preview`

- usage: build installable manuel
- sortie attendue: APK
- usage principal: debug/sideload ponctuel

### `internal`

- usage: flux automatisé `push -> Google Play Internal testing`
- sortie attendue: AAB store-grade
- submit auto: oui

### `production`

- usage: release publique
- sortie attendue: AAB store-grade
- submit: manuel / tag selon workflow

## Workflow GitHub

Fichier:

- `.github/workflows/ci-cd-mobile.yml`

### Triggers réels

Le bloc `on:` du workflow déclenche:

- `pull_request` / `push` (main, tags `v*`) sur les paths `museum-frontend/**`, `museum-backend/openapi/**`, le workflow lui-même -> jobs `quality` + `prebuild` uniquement (feedback rapide).
- `schedule` (cron `17 3 * * *`) -> matrice Maestro Android + iOS nightly.
- `workflow_dispatch` (inputs `profile` / `platform` / `submit`) -> les jobs de build/submit. **C'est le seul déclencheur des builds EAS.**

### Jobs de build / submit (tous `workflow_dispatch`)

- `build-preview-ios` / `build-preview-android` — profil `preview` (installable manuel).
- `build-internal-android` — profil `internal` + auto-submit Play `internal`.
- `build-production-ios` / `build-production-android` — profil `production`.
- `submit-production-ios` / `submit-production-android` — `eas submit` vers les stores (requiert `submit=yes`). `build-production-android` + `submit-production-android` ont aussi un trigger tag `v*` gardé par la var `AUTO_TAG_BUILD_ANDROID`.

## Commandes utiles

### Lancer le flux internal Android

Via l'UI GitHub: **Actions > mobile > Run workflow** avec `profile=internal`, `platform=android`.

### Build production Android manuel

Pour préparer une vraie release publique:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend

export EXPO_PUBLIC_API_BASE_URL_STAGING="https://musaium.com"
export EXPO_PUBLIC_API_BASE_URL_PROD="https://musaium.com"

eas build --platform android --profile production --non-interactive
```

## Validation attendue

### Internal testing

Après un dispatch manuel `profile=internal`:

1. le workflow GitHub doit être vert
2. le build EAS Android `internal` doit être créé
3. la soumission Google Play doit viser le track `internal`
4. la version doit apparaître dans Play Console

### Production publique

La release publique Android doit rester séparée:

1. build `production`
2. validation
3. submit explicite

## Runbook court

### Cas 1: le workflow part mais Android n'arrive pas sur Play

Vérifier:

1. `GOOGLE_SERVICE_ACCOUNT_JSON`
2. statut du build EAS
3. statut de la soumission Play
4. existence du track `internal`

### Cas 2: éviter un build Android non voulu

Les builds ne partent que sur `workflow_dispatch` manuel — un `push`/`pull_request` ne lance jamais `build-internal-android`. Il suffit donc de ne pas dispatcher le job.

### Cas 3: besoin d'un APK manuel

Lancer manuellement:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
eas build --platform android --profile preview
```
