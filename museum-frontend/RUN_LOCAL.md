# Musaium mobile — run local (Docker backend)

Quickstart pour un dev qui clone le repo et veut bosser sur le mobile aujourd'hui avec un backend local (pas le serveur prod).

## Pré-requis (1 fois)

```bash
# Backend Docker stack (Postgres + Redis + Adminer + backend dev server)
cd museum-backend
cp .env.example .env             # remplir au moins JWT_SECRET, DB_*, et 1 LLM API key
docker compose -f docker-compose.dev.yml up -d
curl -sf http://localhost:3000/api/health   # → {"status":"ok","checks":{"database":"up"}}

# Frontend deps (npm pas pnpm — Expo lockfile committed)
cd ../museum-frontend
npm install
```

## Lancer mobile en local — tout-en-un (recommandé)

Depuis la **racine du repo** :

```bash
pnpm dev:stack
```

Le script `scripts/dev-stack.sh` orchestre tout :
1. Vérifie que Docker daemon est UP
2. Démarre le stack `museum-backend/docker-compose.dev.yml` (backend + Postgres + Redis + Adminer) si pas déjà up
3. Attend que `/api/health` réponde 200 (timeout 30s)
4. Switch `museum-frontend/.env` → `.env.local-dev` (localhost, cert pinning OFF, APP_VARIANT=development)
5. Ouvre `museum-frontend/ios/Musaium.xcworkspace` dans Xcode (arrière-plan)
6. Lance Metro en premier plan sur `:8081`

Une fois Metro affiché → dans Xcode : `Cmd+R` pour build + run sur simulator. Hot reload actif.

**Quand tu finis** :
- `Ctrl+C` dans le terminal Metro → arrête Metro uniquement (Docker reste up pour la prochaine session)
- `pnpm dev:stack:down` → arrête le stack Docker proprement (volumes Postgres préservés)

## Alternative : juste Metro (sans toucher Docker ni Xcode)

Depuis `museum-frontend/` :

```bash
npm run env:local    # switch .env vers local-dev (instant)
npm run dev:check    # vérifie Docker backend healthy (instant)
npm run dev          # lance Metro (foreground)
```

Pratique si Docker tourne déjà et que tu veux juste re-démarrer Metro après un crash.

## Switcher entre local et prod-test

```bash
npm run env:local           # → .env = localhost:3000 + cert pinning OFF
npm run env:prod-test       # → .env = https://musaium.com + cert pinning ON (testflight-like)
npm run env:current         # affiche les 3 vars critiques de .env
```

Les 3 fichiers : `.env` (actif), `.env.local-dev` (template local), `.env.prod-test` (template prod). Tous gitignored (root `.gitignore` `**/.env.*` + re-include `!**/.env.*.example`).

## Tester sur un iPhone physique (même Wi-Fi)

```bash
# 1. Récupère l'IP LAN de ton Mac
ifconfig en0 | grep "inet " | awk '{print $2}'
# → ex: 192.168.1.68

# 2. Édite .env (ou .env.local-dev pour persister) :
#    EXPO_PUBLIC_API_BASE_URL=http://192.168.1.68:3000

# 3. Re-lance
npm run dev:local
```

Pas besoin de toucher `Info.plist` — `NSAllowsLocalNetworking=true` autorise déjà le cleartext HTTP vers les adresses privées (10.x, 192.168.x, 172.16-31.x).

## Build natif iOS local (Xcode)

```bash
cd museum-frontend/ios
open Musaium.xcworkspace
```

Build cible : iOS Simulator (Cmd+R). Premier build ~8-10 min (RN compilé from source — cf. `ios.buildReactNativeFromSource: true` dans `app.config.ts`). Builds suivants cachés.

⚠️ Si tu fais `npx expo prebuild --clean`, ré-applique les patches Podfile (cf. `CLAUDE.md § Pièges connus iOS Xcode Cloud build chain`).

## Troubleshooting

| Symptôme | Cause | Fix |
|---|---|---|
| `✗ Backend Docker UNREACHABLE` | Stack pas up | `cd museum-backend && docker compose -f docker-compose.dev.yml up -d` |
| `Connection refused 8081/8083` dans log Xcode | Metro pas lancé | `npm run dev` dans museum-frontend (autre terminal) |
| `Localhost backend URL is blocked for preview/production builds` | `APP_VARIANT=production` mais URL localhost | `npm run env:local` |
| App connecte au mauvais backend (musaium.com au lieu de localhost) | Cert pinning ON | `npm run env:local` (passe `EXPO_PUBLIC_CERT_PINNING_ENABLED=false`) |
| `Class _TtC10RCTSwiftUI... implemented in both` warnings | RN 0.83.6 prebuilt RNcore + local RCTSwiftUI doublonnent | Vérifier `ios.buildReactNativeFromSource: true` dans `app.config.ts` puis `cd ios && pod install` |

## Vérifier que CORS backend accepte ton appel

Le backend tourne avec `NODE_ENV=production` localement (intentionnel — config proche de la cible déploiement). CORS strict en mode prod, MAIS :
- **Mobile native fetch** = pas de header `Origin` → la middleware `cors` laisse passer (audit `museum-backend/src/shared/http/cors.config.ts`)
- **Browser-based dev tools** (Adminer, swagger) — pas configurés en local

Si tu as besoin de tester depuis le browser, ajoute temporairement les origins dans `museum-backend/.env` :
```
CORS_ORIGINS=https://musaium.com,...,http://localhost:8081,http://localhost:8082
```
