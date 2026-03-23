# Mobile Internal Testing Flow

Ce document décrit le flux mobile Android recommandé pour `Musaium`:

- `push frontend` -> build cloud Android store-grade
- auto-submit Google Play `Internal testing`
- validation réelle via Play Console / Google Play
- production publique séparée et contrôlée

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

### 3. Push frontend => internal testing

Sur `push` vers `main` avec changements `museum-frontend/**`:

1. `quality-frontend`
2. `build-preview-ios`
3. `build-internal-android`
4. auto-submit Google Play `internal`

La prod publique Android n'est pas déclenchée par un simple push.

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

- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/mobile-release.yml`

### Push frontend

Un `push` sur `main` avec changements frontend lance:

1. vérification qualité
2. preview iOS
3. build Android `internal`
4. auto-submit Play `Internal testing`

### Commit message routing

- `feature/ios-only` -> skip Android internal testing
- `feature/android-only` -> skip iOS preview

## Commandes utiles

### Commit et push du frontend

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind

git add .gitignore museum-frontend docs .github/workflows/mobile-release.yml
git commit -m "feat(mobile): automate android internal testing flow"
git push origin main
```

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

Après un `push` frontend:

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

### Cas 2: un push ne doit pas lancer Android

Utiliser dans le commit:

- `feature/ios-only`

### Cas 3: besoin d'un APK manuel

Lancer manuellement:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
eas build --platform android --profile preview
```
