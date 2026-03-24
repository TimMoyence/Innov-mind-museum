# Musaium — Release Checklist & Remaining Work

> Last updated: 2026-03-24 | Sprint 6 complete | Overall: 111/112 tasks (99%)

---

## 1. Remaining Task

| ID | Description | Status | Priority |
|----|-------------|--------|----------|
| S2-02 | Support page Instagram handle | Deferred — Instagram handle not yet created | LOW |

---

## 2. CRITICAL — Production Infrastructure Gaps

Les éléments ci-dessous sont des écarts entre l'état du code actuel et la configuration de production sur le VPS (`/srv/museum/`).

### 2.1 docker-compose.yml — Services manquants

Le docker-compose prod actuel ne contient que `backend` + `db`. Il manque :

#### A. Redis (BLOQUANT pour cache/locks)

Le backend utilise `ioredis` pour le cache de sessions, listes et distributed locks.
Sans Redis, `CACHE_ENABLED` doit rester `false` et le cache est un no-op.

```yaml
redis:
  image: redis:7-alpine
  volumes:
    - redis_data:/data
  networks:
    - private
  restart: unless-stopped
```

Ajouter aussi dans `volumes:` :
```yaml
volumes:
  pgdata:
  redis_data:
  uploads:
```

#### B. Volume uploads (BLOQUANT — perte d'images)

`OBJECT_STORAGE_DRIVER=local` écrit dans `/app/tmp/uploads` à l'intérieur du conteneur.
**Sans volume persistant, toutes les images sont perdues à chaque restart/redeploy.**

```yaml
backend:
  volumes:
    - uploads:/app/tmp/uploads
```

#### C. Healthcheck DB + depends_on condition

Le backend peut démarrer avant que PostgreSQL soit prêt → crash au boot.

```yaml
db:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER: ${DB_USER}
    POSTGRES_PASSWORD: ${DB_PASSWORD}
    POSTGRES_DB: ${PGDATABASE}
    POSTGRES_INITDB_ARGS: "--auth=scram-sha-256"
  volumes:
    - pgdata:/var/lib/postgresql/data
  networks:
    - private
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
    interval: 10s
    timeout: 5s
    retries: 5
  restart: unless-stopped

backend:
  depends_on:
    db:
      condition: service_healthy
    redis:
      condition: service_started
```

> **Changement de sémantique Redis** : dans la config précédente, Redis était
> complètement optionnel (absent du compose). Avec `depends_on: redis: condition: service_started`,
> Redis devient **requis au boot** — si le conteneur Redis est absent ou crashé, le backend
> ne démarrera pas. C'est voulu : une fois `CACHE_ENABLED=true` dans `.env`, Redis est une
> dépendance d'infrastructure, pas un bonus.
>
> Si Redis doit redevenir optionnel (fallback graceful), retirer le bloc `redis:` de
> `depends_on` et garder `CACHE_ENABLED=false` dans `.env`. Le backend utilisera alors
> `NoopCacheService` (in-memory no-op, aucun cache réel).

#### D. docker-compose.yml complet recommandé

```yaml
networks:
  web:
    external: true
  private:
    driver: bridge
    internal: true

volumes:
  pgdata:
  redis_data:
  uploads:

services:
  backend:
    image: ghcr.io/timmoyence/museum-backend:latest
    hostname: backend
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - uploads:/app/tmp/uploads
    networks:
      private: {}
      web:
        aliases:
          - museum-backend
    ports:
      - "127.0.0.1:3000:3000"
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${PGDATABASE}
      POSTGRES_INITDB_ARGS: "--auth=scram-sha-256"
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - private
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    networks:
      - private
    restart: unless-stopped
```

### 2.2 Dockerfile.prod — Bug permissions uploads

Le Dockerfile crée un `nodeuser` (uid 1001) mais ne crée pas `/app/tmp/uploads`.
Le user non-root n'a pas les permissions d'écrire dans `/app/`.

**Fix requis** dans `museum-backend/deploy/Dockerfile.prod`, avant `USER nodeuser` :

```dockerfile
RUN mkdir -p /app/tmp/uploads && chown nodeuser:nogroup /app/tmp/uploads
```

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
| `FEATURE_FLAG_STREAMING` | `false` | **`true`** (déjà set) | SSE chat streaming |
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
FEATURE_FLAG_STREAMING=true
FEATURE_FLAG_USER_MEMORY=false
FEATURE_FLAG_MULTI_TENANCY=false
FEATURE_FLAG_VOICE_MODE=false
FEATURE_FLAG_OCR_GUARD=false
FEATURE_FLAG_API_KEYS=false
```

---

## 4. Database — Migrations pendantes en production

20 migrations TypeORM existent. Si la prod n'a pas été déployée depuis le Sprint 3, les migrations suivantes sont **pendantes** :

| # | Migration | Description | Sprint |
|---|-----------|-------------|--------|
| 14 | `1774100000000-NormalizeEmailCase` | Normalisation emails lowercase | S3 |
| 15 | `1774200000000-AddUserRoleColumn` | Colonne `role` pour RBAC (user/admin/superadmin/moderator) | S4 |
| 16 | `1774200100000-CreateAuditLogsTable` | Table `audit_logs` + trigger immutable (17 event types) | S4 |
| 17 | `1774300000000-CreateMuseumsAndTenantFKs` | Table `museums` + FK `museum_id` sur users/sessions/api_keys | S4 |
| 18 | `1774300100000-CreateUserMemoriesTable` | Table `user_memories` (profil cross-session) | S4 |
| 19 | `1774400000000-AddModerationColumnsToMessageReports` | Colonnes modération (status, reviewedBy, etc.) | S4 |
| 20 | `1774400100000-CreateSupportTables` | Tables `support_tickets` + `ticket_messages` | S4 |
| 21 | `1774500000000-AddMuseumCoordinates` | Colonnes `latitude`/`longitude` sur `museums` | S4 |

**Ces migrations sont appliquées automatiquement par le CI/CD** (`deploy-backend.yml` ligne 129) :
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

Le workflow `deploy-backend.yml` SSH dans le VPS et fait :
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
- [ ] Migrer les DNS vers CloudFlare (voir `docs/CDN_CLOUDFLARE_SETUP.md`)
- [ ] SSL/TLS mode : Full (Strict)
- [ ] Vérifier le health endpoint à travers CloudFlare : `curl https://musaium.com/api/health`
- [ ] Tester le SSE streaming à travers CloudFlare (les réponses chat ne doivent pas être bufferisées)
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
| 4 | **Chat (streaming)** | Message being streamed | Show the live typing indicator |
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

- [ ] Choose hosting: Vercel / Netlify / CloudFlare Pages / VPS static
- [ ] Build: `cd museum-admin && npm run build`
- [ ] Deploy `dist/` to static hosting
- [ ] Set `VITE_API_BASE_URL` to production backend URL
- [ ] Add admin URL to backend `CORS_ORIGINS`

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
- [ ] Workflow `deploy-backend.yml` fonctionne (lint → test → build → deploy → migrate → smoke)
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
- [ ] SSE streaming fonctionne (si flag activé)
- [ ] Reset password email reçu (si Brevo configuré)
- [ ] Sentry reçoit les events
