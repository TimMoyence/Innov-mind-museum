# Musaium — Release Checklist & Remaining Work

> Last updated: 2026-05-20 (W4 audit-360 run) — references refreshed for V1 launch 2026-06-01 | Overall: 111/112 tasks (99%) | Pre-launch verdict: GO (W4 cluster C/C7.4 sign-off).

---

## 1. Remaining Task

| ID | Description | Status | Priority |
|----|-------------|--------|----------|
| S2-02 | Support page Instagram handle | Deferred — Instagram handle not yet created | LOW |

---

## 2. Production Infrastructure — État actuel

> **Résolu (audit 2026-05-20)** : les "gaps" listés dans les versions Sprint-3/4 de ce
> document (Redis, volume uploads, llm-guard sidecar, healthcheck DB tous "manquants")
> sont désormais **tous présents** dans `museum-backend/deploy/docker-compose.prod.yml`.
> Cette section décrit l'état-cible vérifié, pas un backlog d'écarts.

### 2.1 docker-compose.prod.yml — Services présents

Le compose prod (`museum-backend/deploy/docker-compose.prod.yml`) contient :

| Service | Rôle | Notes |
|---------|------|-------|
| `backend` | API Express | `depends_on: db (service_healthy)` + monte le volume `uploads:/app/tmp/uploads` |
| `db` | PostgreSQL 16 (pgvector) | healthcheck `pg_isready` + `depends_on: condition: service_healthy` |
| `redis` | Cache + locks + rate-limit store | `redis:7-alpine`, `--requirepass`, healthcheck `redis-cli PING`, volume `redis_data:/data` |
| `llm-guard` | Sidecar AI Guardrails V2 (ADR-047) | `ghcr.io/timmoyence/museum-llm-guard`, hostname `llm-guard:8081`, intentionnellement absent de `depends_on` du backend (évite le deadlock cold-start) |

Volumes déclarés : `pgdata`, `redis_data`, `uploads`. Le volume `uploads` persiste
les images uploadées (`OBJECT_STORAGE_DRIVER=local` → `/app/tmp/uploads`) à travers les
restarts/redeploys.

> **Sémantique Redis** : Redis est une dépendance d'infrastructure requise une fois
> `CACHE_ENABLED=true`. Le backend ne déclare pas `redis` dans `depends_on` mais s'y
> connecte au runtime ; un Redis absent dégrade le cache/rate-limit, pas le boot.

### 2.2 Dockerfile.prod — Permissions uploads

`museum-backend/deploy/Dockerfile.prod` crée `/app/tmp/uploads` avec les bonnes
permissions pour `nodeuser` (uid 1001) avant le passage en non-root. Vérifier que ce
`RUN mkdir -p /app/tmp/uploads && chown ...` reste présent lors de toute refonte du
Dockerfile.

---

## 3. CRITICAL — .env Production : Variables manquantes & à corriger

### 3.1 CORS_ORIGINS — Domaines obsolètes (BLOQUANT)

**Actuel :**
```
CORS_ORIGINS=https://museum.asilidesign.fr,https://asilidesign.fr,https://www.asilidesign.fr
```

**Le nginx route déjà `musaium.com` et `musaium.fr` vers le backend.**
L'app mobile appelle `musaium.com`. Ces domaines sont absents de CORS → **les requêtes seront rejetées**.

**Correction :**
```
CORS_ORIGINS=https://musaium.com,https://www.musaium.com,https://musaium.fr,https://www.musaium.fr,https://museum.asilidesign.fr
```

> Note : les apps mobiles natives n'envoient pas d'en-tête `Origin` donc CORS ne les bloque pas directement,
> mais l'admin dashboard web et tout client navigateur en ont besoin.

### 3.2 Variables manquantes à ajouter

| Variable | Valeur | Raison |
|----------|--------|--------|
| `CACHE_ENABLED` | `true` | Active le cache Redis |
| `REDIS_URL` | `redis://redis:6379` | Pointe vers le service Redis du compose |
| `BREVO_API_KEY` | `<ta clé Brevo>` | **Sans elle, le reset password par email ne fonctionne pas** (warning au boot) |
| `GOOGLE_OAUTH_CLIENT_ID` | `<client-id-1>,<client-id-2>` | Requis si Google Sign-In est activé sur le mobile |
| `APP_VERSION` | `1.0.0` | Actuellement `local-dev` — utilisé par Sentry pour le suivi des releases |

### 3.3 Feature flags à activer (selon tes besoins)

Tous les feature flags sont à `false` par défaut. Les features sont codées et migrées mais **inactives** tant que le flag n'est pas set :

| Flag | Default | Recommandation | Impact |
|------|---------|----------------|--------|
| `FEATURE_FLAG_USER_MEMORY` | `false` | **`true`** si tu veux la personnalisation cross-session | Injecte le profil utilisateur dans le prompt LLM |
| `FEATURE_FLAG_MULTI_TENANCY` | `false` | `true` si multi-musées activé | Isole les données par musée |
| `FEATURE_FLAG_VOICE_MODE` | `false` | `true` si TTS activé | Réponses audio via OpenAI TTS |
| `FEATURE_FLAG_OCR_GUARD` | `false` | `false` pour l'instant | Guardrail OCR (pas encore mature) |
| `FEATURE_FLAG_API_KEYS` | `false` | `false` sauf si API publique | Auth par clé API pour partenaires |

### 3.4 Variables mortes à supprimer

Ces 4 variables sont dans le `.env` mais **ne sont référencées nulle part dans le code** :

```
LLM_PARALLEL_ENABLED=false          # ← SUPPRIMER (n'existe pas dans env.ts)
LLM_TIMEOUT_EXPERT_COMPACT_MS=20000 # ← SUPPRIMER (n'existe pas dans env.ts)
LLM_SECTIONS_MAX_CONCURRENT=2       # ← SUPPRIMER (n'existe pas dans env.ts)
ANTHROPIC_API_KEY=...               # ← SUPPRIMER (non utilisé par le backend)
```

### 3.5 .env complet recommandé

```env
# === General ===
NODE_ENV=production
PORT=3000
TRUST_PROXY=true
APP_VERSION=1.0.0

# === Network ===
CORS_ORIGINS=https://musaium.com,https://www.musaium.com,https://musaium.fr,https://www.musaium.fr,https://museum.asilidesign.fr
JSON_BODY_LIMIT=5mb
REQUEST_TIMEOUT_MS=20000

# === Database ===
PGDATABASE=museumAI
DB_HOST=db
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<MOT_DE_PASSE>
DB_POOL_MAX=20
DB_SYNCHRONIZE=false

# === Auth ===
JWT_ACCESS_SECRET=<SECRET_32+_CHARS>
JWT_REFRESH_SECRET=<SECRET_32+_CHARS>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
MEDIA_SIGNING_SECRET=<SECRET_32+_CHARS>
APPLE_CLIENT_ID=com.musaium.mobile
GOOGLE_OAUTH_CLIENT_ID=<CLIENT_ID_IOS>,<CLIENT_ID_ANDROID>

# === LLM ===
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_AUDIO_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
LLM_TEMPERATURE=0.3
LLM_TIMEOUT_MS=15000
LLM_TIMEOUT_SUMMARY_MS=8000
LLM_TOTAL_BUDGET_MS=25000
LLM_RETRIES=1
LLM_RETRY_BASE_DELAY_MS=250
LLM_MAX_CONCURRENT=5
LLM_MAX_HISTORY_MESSAGES=12
LLM_MAX_TEXT_LENGTH=2000
LLM_MAX_IMAGE_BYTES=3145728
LLM_MAX_AUDIO_BYTES=12582912
LLM_INCLUDE_DIAGNOSTICS=false
OPENAI_API_KEY=<CLE_OPENAI>
GOOGLE_API_KEY=<CLE_GOOGLE>
DEEPSEEK_API_KEY=<CLE_DEEPSEEK>

# === Storage ===
OBJECT_STORAGE_DRIVER=local
LOCAL_UPLOADS_DIR=/app/tmp/uploads
S3_SIGNED_URL_TTL_SECONDS=900

# === Cache (Redis) ===
CACHE_ENABLED=true
REDIS_URL=redis://redis:6379
CACHE_SESSION_TTL_SECONDS=3600
CACHE_LIST_TTL_SECONDS=300

# === Rate Limiting ===
RATE_LIMIT_IP=120
RATE_LIMIT_SESSION=60
RATE_LIMIT_WINDOW_MS=60000

# === Upload ===
UPLOAD_ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp
UPLOAD_ALLOWED_AUDIO_MIME_TYPES=audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/aac

# === Email ===
BREVO_API_KEY=<CLE_BREVO>

# === Observability ===
SENTRY_DSN=<DSN_SENTRY>
SENTRY_TRACES_SAMPLE_RATE=0.1

# === Feature Flags ===
FEATURE_FLAG_USER_MEMORY=false
FEATURE_FLAG_MULTI_TENANCY=false
FEATURE_FLAG_VOICE_MODE=false
FEATURE_FLAG_OCR_GUARD=false
FEATURE_FLAG_API_KEYS=false
```

---

## 4. Database — Migrations en production

**64 migrations TypeORM** existent (`ls museum-backend/src/data/db/migrations/*.ts | wc -l`,
vérifié 2026-05-20). Toute migration non encore appliquée sur la prod est **pendante**.
La liste autoritative des migrations pendantes se lit toujours depuis le serveur via
`migration:show` (commande ci-dessous), pas depuis ce document — la liste figée Sprint-3/4
qui se trouvait ici a été retirée car obsolète.

**Ces migrations sont appliquées automatiquement par le CI/CD** (job deploy de
`ci-cd-backend.yml`) :
```bash
docker compose exec -T backend node ./node_modules/typeorm/cli.js migration:run -d dist/src/data/db/data-source.js
```

Pour vérifier l'état actuel sur le serveur :
```bash
ssh user@vps "cd /srv/museum && docker compose exec -T backend node ./node_modules/typeorm/cli.js migration:show -d dist/src/data/db/data-source.js"
```

---

## 5. Déploiement Backend — Étapes pas à pas

### 5.1 Pré-déploiement (sur le VPS via SSH)

```bash
ssh user@vps
cd /srv/museum
```

#### A. Mettre à jour docker-compose.yml

Remplacer le contenu par la version complète de la section 2.1.D ci-dessus.

#### B. Mettre à jour .env

Appliquer les corrections de la section 3 :
```bash
nano .env
# 1. Corriger CORS_ORIGINS (ajouter musaium.com/musaium.fr)
# 2. Ajouter CACHE_ENABLED=true
# 3. Ajouter REDIS_URL=redis://redis:6379
# 4. Ajouter BREVO_API_KEY si disponible
# 5. Corriger APP_VERSION (retirer local-dev)
# 6. Supprimer les 4 vars mortes
# 7. Ajouter les feature flags souhaités
```

#### C. Fixer les permissions uploads dans Dockerfile.prod

Ce fix doit être fait **dans le repo** puis poussé :

Dans `museum-backend/deploy/Dockerfile.prod`, ajouter avant `USER nodeuser` :
```dockerfile
RUN mkdir -p /app/tmp/uploads && chown nodeuser:nogroup /app/tmp/uploads
```

#### D. Déployer

```bash
# Tirer la nouvelle image (après push du fix Dockerfile)
docker compose pull backend

# Démarrer tous les services (redis sera créé)
docker compose up -d

# Vérifier que tout tourne
docker compose ps

# Appliquer les migrations
docker compose exec -T backend node ./node_modules/typeorm/cli.js migration:run \
  -d dist/src/data/db/data-source.js

# Vérifier les migrations appliquées
docker compose exec -T backend node ./node_modules/typeorm/cli.js migration:show \
  -d dist/src/data/db/data-source.js
```

#### E. Smoke test

```bash
# Health check
curl -s http://localhost:3000/api/health | jq .

# Attendu :
# { "status": "ok", "checks": { "database": "up", "llmConfigured": true }, "version": "1.0.0" }
```

### 5.2 Vérifier le CI/CD

Le job deploy de `ci-cd-backend.yml` SSH dans le VPS et fait :
```bash
docker compose pull backend
docker compose up -d --remove-orphans backend
docker compose exec -T backend node ./node_modules/typeorm/cli.js migration:run ...
```

**Attention** : le CI ne fait `up -d` que sur `backend`. Si Redis est ajouté au compose, il faut soit :
- Lancer `docker compose up -d` (sans filtre de service) une première fois manuellement
- Soit modifier le workflow pour `docker compose up -d --remove-orphans` (sans filtrer `backend`)

Redis n'a pas besoin d'être re-pull à chaque deploy, donc un `docker compose up -d` initial suffit.

### 5.3 CloudFlare CDN (optionnel)

Si CloudFlare est activé en front du VPS :
- [ ] Migrer les DNS vers CloudFlare (voir `docs/adr/ADR-024-cloudflare-cdn-strategy.md` — l'ancien runbook `CDN_CLOUDFLARE_SETUP.md` a été archivé/supprimé 2026-05-07, decision-only ADR remplace le runbook)
- [ ] SSL/TLS mode : Full (Strict)
- [ ] Vérifier le health endpoint à travers CloudFlare : `curl https://musaium.com/api/health`
- [ ] Vérifier que le backend reçoit la vraie IP client (header `CF-Connecting-IP` si nginx configuré)

---

## 6. App Store Screenshots Required

### iOS (iPhone 6.7" — required for App Store)
Device: iPhone 15 Pro Max (6.7") or 6.5" alternative

| # | Screen | Content | Notes |
|---|--------|---------|-------|
| 1 | **Onboarding** | First slide with app branding | Show the carousel entry point |
| 2 | **Home** | Home tab with welcome message | Show the main entry screen |
| 3 | **Chat** | Active conversation with artwork photo | Show image + AI response with metadata |
| 4 | **Chat (voice)** | Voice reply with audio playback control | Show the TTS audio affordance |
| 5 | **Conversations** | Dashboard with multiple sessions | Show the conversation list with titles |
| 6 | **Museums** | Museum directory with distance badges | Show the geolocation-sorted list |
| 7 | **Museum Detail** | Museum info + "Start Chat Here" CTA | Show the museum-to-chat flow |
| 8 | **Settings** | Settings hub with dark mode + biometric | Show Security + Appearance cards |
| 9 | **Dark Mode** | Chat in dark mode | Show theme versatility |
| 10 | **Multilingual** | Chat or settings in Arabic (RTL) | Show RTL layout + Arabic text |

### iOS (iPad 12.9" — required if supporting iPad)
Same 10 screens, captured on iPad Pro 12.9" simulator.

### Google Play
| Size | Requirement |
|------|-------------|
| Phone | Min 2, max 8 screenshots. 16:9 or 9:16 ratio. Min 320px, max 3840px. |
| 7" tablet | Optional but recommended |
| 10" tablet | Optional but recommended |

**Recommended: same 8-10 screenshots as iOS**, adapted to Android device frames.

### Feature Graphic (Google Play)
- Size: 1024 x 500 px
- Content: App logo + tagline + museum imagery
- Required for Google Play listing

### App Icon
- iOS: 1024x1024 (no alpha, no transparency) — already configured in `app.config.ts`
- Google Play: 512x512 with 32-bit color — same asset

---

## 7. Screenshot Capture Process

```bash
# iOS Simulator (iPhone 15 Pro Max)
cd museum-frontend
npx expo start --ios
# In Simulator: Cmd+S to capture screenshot
# Screenshots saved to ~/Desktop/

# Android Emulator
npx expo start --android
# In Emulator: click camera icon or Cmd+S

# Automated (optional)
npx expo start --ios --device "iPhone 15 Pro Max"
# Use Maestro or Detox for automated screenshot capture
```

**Tip**: Set `APP_VARIANT=production` for screenshots (hides dev indicators).

---

## 8. Apple Deployment — Current Status & Next Steps

### Completed
- [x] Etape 1.1: App created on App Store Connect
- [x] Etape 1.2: App finalized on ASC (Musaium, com.musaium.mobile)

### Next Steps

#### Etape 2 — Collect Credentials
- [ ] Note your **Apple ID** (email)
- [ ] Note your **Apple Team ID** (developer.apple.com → Membership → Team ID)
- [ ] Note your **ASC App ID** (App Store Connect → app → General → App Information)

#### Etape 3 — App-Specific Password
- [ ] Go to https://appleid.apple.com
- [ ] Sign-In and Security → App-Specific Passwords
- [ ] Generate, name it "EAS Submit", copy the `xxxx-xxxx-xxxx-xxxx` password

#### Etape 4 — Set Environment Variables
```bash
export APPLE_ID="your-email@icloud.com"
export APPLE_TEAM_ID="XXXXXXXXXX"
export ASC_APP_ID="1234567890"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
```

#### Etape 5 — Build iOS Production
```bash
cd museum-frontend
eas build --platform ios --profile production
```
EAS auto-creates Distribution Certificate + Provisioning Profile on first build.

#### Etape 6 — Submit to TestFlight
```bash
eas submit --platform ios --profile production --latest
```

#### Etape 7 — Test on TestFlight
- [ ] Wait ~5-15 min for Apple processing
- [ ] Install TestFlight on iPhone
- [ ] Test all flows: auth, chat, camera, museums, biometric, RTL

#### Etape 8 — App Store Review Preparation
- [ ] Upload 10 screenshots (6.7" iPhone required)
- [ ] Write app description (FR + EN)
- [ ] Write "What's New" text
- [ ] Set age rating (4+ — no objectionable content)
- [ ] Set pricing (Free)
- [ ] Fill privacy policy URL (in-app at /privacy)
- [ ] Submit for review

---

## 9. Google Play Deployment

### Prerequisites
- [ ] Google Play Console access (https://play.google.com/console)
- [ ] App already created (internal testing track)
- [ ] Service account JSON key for EAS submit

### Steps

#### Build Android Production
```bash
cd museum-frontend
eas build --platform android --profile production
```

#### Submit to Internal Testing
```bash
eas submit --platform android --profile production --latest
```

#### Prepare Store Listing
- [ ] Upload 8 screenshots (phone)
- [ ] Upload feature graphic (1024x500)
- [ ] Write short description (80 chars max)
- [ ] Write full description (4000 chars max)
- [ ] Complete Data Safety form (reference: `docs/GOOGLE_PLAY_DATA_SAFETY.md`)
- [ ] Set content rating (IARC questionnaire)
- [ ] Set target audience (general)
- [ ] Set pricing (Free)

#### Promote to Production
- [ ] Internal testing → Closed testing → Open testing → Production
- [ ] Each stage requires review (~1-3 days)

---

## 10. Admin Dashboard Deployment

> Admin panel is now `museum-web` (Next.js 15 + React 19 + Tailwind 4, pnpm), replacing the former `museum-admin` (Vite+React, deleted 2026-04-04). Build command: `pnpm build` (NOT `npm run build` — `museum-web` is a pnpm workspace, see CLAUDE.md). CI pipeline = `.github/workflows/ci-cd-web.yml` (quality → Lighthouse → Docker/GHCR → VPS).

- [ ] Choose hosting: Docker/GHCR → VPS (current pipeline) · alternative: Vercel / Netlify / CloudFlare Pages
- [ ] Build: `cd museum-web && pnpm install && pnpm lint && pnpm build`
- [ ] Lighthouse CI PR gate ≥ 95 on landing (W4.1 / `docs/operations/LIGHTHOUSE_AUDIT.md`)
- [ ] Deploy to hosting platform (or push to `main` to trigger `ci-cd-web.yml`)
- [ ] Set API base URL environment variable to production backend URL
- [ ] Add admin URL to backend `CORS_ORIGINS`
- [ ] Verify admin pages render: `/{locale}/admin/login`, `/admin/museums/new` (W2.1), `/admin/museums/[id]/branding` (W2.2), `/admin/analytics` with per-museum filter (W2.3)

---

## 11. Post-Release Monitoring

- [ ] Verify Sentry captures errors (backend + frontend)
- [ ] Check OTel traces arriving at collector (if `OTEL_ENABLED=true`)
- [ ] Run k6 smoke test against production: `k6 run -e BASE_URL=https://musaium.com tests/perf/k6/auth-flow.k6.js`
- [ ] Monitor CloudFlare analytics (if CDN enabled)
- [ ] Check audit logs populating: `GET /api/admin/audit-logs`
- [ ] Verify Redis cache hit rate: check backend logs for cache metrics
- [ ] Test password reset flow (requires `BREVO_API_KEY`)
- [ ] Test image upload persistence (upload → restart container → image still accessible)

---

## 12. Synthèse — Checklist de release finale

### Infrastructure (VPS)
- [ ] **docker-compose.yml** mis à jour avec Redis + volume uploads + healthcheck DB
- [ ] **Dockerfile.prod** fixé (permissions `/app/tmp/uploads` pour nodeuser)
- [ ] Premier `docker compose up -d` pour créer le service Redis

### Configuration (.env)
- [ ] `CORS_ORIGINS` corrigé avec domaines `musaium.com` / `musaium.fr`
- [ ] `CACHE_ENABLED=true` + `REDIS_URL=redis://redis:6379`
- [ ] `BREVO_API_KEY` configuré (reset password)
- [ ] `GOOGLE_OAUTH_CLIENT_ID` configuré (si Google Sign-In)
- [ ] `APP_VERSION` mis à jour (pas `local-dev`)
- [ ] Variables mortes supprimées (4)
- [ ] Feature flags activés selon les besoins
- [ ] Tous les secrets sont des valeurs fortes (>32 chars pour JWT)

### Database
- [ ] Toutes les migrations appliquées (vérifier avec `migration:show`)
- [ ] `DB_SYNCHRONIZE=false` confirmé

### CI/CD
- [ ] Secrets GitHub Actions à jour (`GHCR_*`, `SERVER_*`, `PROD_SMOKE_*`, `SENTRY_*`)
- [ ] Job deploy de `ci-cd-backend.yml` fonctionne (lint → test → build → deploy → migrate → smoke)
- [ ] Smoke test credentials créées (user de test en prod)

### Mobile
- [ ] Screenshots capturées (iOS + Android)
- [ ] Store listings complétés (descriptions, privacy policy)
- [ ] TestFlight / Internal Testing validés
- [ ] Soumission pour review

### Validation finale
- [ ] `curl https://musaium.com/api/health` retourne `{ "status": "ok" }`
- [ ] Login/Register fonctionne
- [ ] Chat + image upload fonctionne
- [ ] Reset password email reçu (si Brevo configuré)
- [ ] Sentry reçoit les events
