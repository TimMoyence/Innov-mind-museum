# MUSAIUM — Product State Overview

> **Date**: 2026-04-14
> **Status**: Document autoritatif unique — remplace les roadmaps éparpillées
> **Méthode**: Audit /team avec 4 agents parallèles + croisement des rapports de sprints + vérification directe du code
> **Portée**: Backend + Mobile Frontend + Web + Infrastructure + IA

Ce document répond aux questions clés sur l'état de Musaium : **qu'est-ce qui existe, qu'est-ce qui marche, et le produit tient-il sa promesse ?** Il remplace la dispersion des rapports de planification antérieurs comme source unique de vérité sur l'existant.

---

## 1. Verdict exécutif — Réponses directes

| Question | Réponse | Détail |
|---|---|---|
| **Prête pour la prod ?** | **OUI** | 3879 tests verts (2604 BE + 1096 FE + 179 web), typecheck 0 erreur sur les 3 apps, 0 `as any`, CI/CD complet, monitoring Sentry 3/3 runtimes, backups automatisés, runbook rollback, audit security PASS |
| **Prête pour 1000 utilisateurs ?** | **OUI (techniquement), sans marge** | Redis rate-limit + cache, PgBouncer pooler, feature flags, SSE streaming, fail-open partout. **Limite** : déploiement single-node → scale horizontale pas testée, SSE stateful. Pour 1000 MAU : largement. Pour 1000 concurrent : nécessite validation load test (k6 doc existe, pas de fichier k6 au repo) |
| **Photos ville + musées ?** | **OUI** | Upload image + camera + gallery, validation magic bytes, SSRF-protected, preview avant envoi, Wikidata P18 + Unsplash enrichment, storage S3 avec presigned URLs, OCR guard |
| **Prompting fin / personnalité adaptative ?** | **OUI, sophistiqué (8/10)** | 4 couches de personnalisation (request → session → cross-session memory → expertise auto-détectée), guide level beginner/intermediate/expert, museum mode, mode audio accessibilité, 7 langues, structured metadata `[META]` output |
| **Musaium tient-elle sa promesse ?** | **OUI** | La promesse (compagnon IA conversationnel pour musée, reconnaissance d'œuvres, adaptation au visiteur) est délivrée. Le cœur produit fonctionne et est robuste |
| **Features promises développées ce dernier mois ?** | **OUI à 95%** | Wikidata KB, Web search multi-provider, Knowledge extraction, Low-Data Mode, User Memory, Design System, Chat UX, Apple review fixes, Expo 55 upgrade — tous livrés. **Non livré** : Museum Walk interactif (seule la map view existe, pas le flow guidé inter-musées) |

---

## 2. Production Readiness — État détaillé

### 2.1 Qualité code (2026-04-14)

| App | Tests | Typecheck | `as any` | ESLint | Coverage |
|---|---|---|---|---|---|
| **museum-backend** | 2604 ✅ | 0 erreur ✅ | 0 ✅ | 0 erreur ✅ | 72.86% stmts, 57.61% branches (ratchet verrouillé) |
| **museum-frontend** | 1096 ✅ | 0 erreur ✅ | 0 ✅ | 0 erreur ✅ | 131 fichiers de tests (71 components + 25 hooks + 32 infra + 22 screens) |
| **museum-web** | 179 ✅ | 0 erreur ✅ | 0 ✅ | 0 erreur ✅ | 20 fichiers Vitest (admin, a11y, i18n, privacy, api) |
| **Total** | **3879 tests** | PASS | — | — | — |

### 2.2 CI/CD complet

8 workflows GitHub Actions (`/.github/workflows/`) :

| Workflow | Rôle |
|---|---|
| `ci-cd-backend.yml` | Quality gate (tsc + ESLint + SBOM + OpenAPI validate + Stryker mutation + unit/contract/e2e) → deploy prod/staging via `_deploy-backend.yml` avec Trivy + Sentry release + smoke test |
| `ci-cd-web.yml` | Quality gate (lint/build/test/audit) → Lighthouse CI (perf≥0.85, a11y≥0.90, SEO≥0.90) → Docker/GHCR → VPS deploy |
| `ci-cd-mobile.yml` | Quality gate (Expo Doctor + OpenAPI sync + i18n + tests) → Maestro E2E → EAS Build + store submit |
| `ci-cd-llm-guard.yml` | LLM Guard sidecar validation — runs guardrail smoke tests against the deployed guard service |
| `_deploy-backend.yml` | Reusable zero-downtime deploy avec rollback automatique en cas d'échec smoke test |
| `deploy-privacy-policy.yml` | Déploiement statique de la politique de confidentialité |
| `codeql.yml` | SAST nightly (security-extended + security-and-quality) |
| `semgrep.yml` | SAST nightly (OWASP top 10 + javascript/typescript/nodejs) |

### 2.3 Sécurité — Posture

**IMPLÉMENTÉ :**
- JWT dual-secret (access 15min / refresh 30j) + reuse detection
- RBAC 4 rôles (admin / moderator / museum_manager / visitor) enforced route-level
- Password policy + bcrypt cost 12 + rate limiter login (5/5min)
- Reset tokens SHA-256 hashés, email case-insensitive (migration normalizeEmailCase)
- JWT claims strippés (id seulement, PII fetched from DB)
- SSRF protection (17 regex patterns IPv4/IPv6/private + RFC1918)
- Magic bytes validation sur upload images (JPEG/PNG/GIF/WebP)
- Input guardrail multilingue (EN/FR/DE/ES/IT/JP/ZH/AR)
- Output guardrail fail-CLOSED (OWASP LLM 2026)
- PII sanitizer avant LLM et avant cache
- Audit logging (17+ types d'événements)
- Rate limiting Redis-backed (IP + session + per-user cross-session)
- API key auth B2B (feature-flagged)
- CodeQL + Semgrep + Trivy nightly
- CSP strict sur `/api/*`, Swagger carve-out, HSTS 2 ans + preload
- `.env` jamais commit, secrets rotation documentée (CI_CD_SECRETS.md)

### 2.4 Observabilité

- **Sentry** : backend (Node) + mobile (React Native) + web (client/server/edge) — 4/4 runtimes
- **Logs structurés** : JSON avec requestId, userId, service, environment, hostname
- **Promtail → Loki** : log aggregation configurée (`promtail-config.yml`)
- **APM** : Sentry Performance avec custom spans (LLM orchestrate/stream, audio transcribe, OCR, S3 upload)
- **Uptime monitoring** : BetterUptime documenté (heartbeat URL dans backup-db.sh)
- **Distributed tracing** : CORS + SSE trace headers propagés frontend → backend

### 2.5 Infrastructure & Déploiement

| Composant | État |
|---|---|
| Dockerfile backend prod | Multi-stage, non-root uid 1001, source maps stripped |
| Dockerfile web prod | Next.js standalone, non-root uid 1001, healthcheck |
| docker-compose.prod.yml | backend + pgbouncer + web + db (PG16 scram-sha-256) + redis 7 password |
| **PgBouncer** | Configuré (`deploy/pgbouncer/pgbouncer.ini` + entrypoint) — backend → `pgbouncer:6432` |
| Nginx | TLS 1.2+1.3, HTTP/2, HSTS 2yr, Cloudflare IPs, rate limit 30r/s global + 5r/m auth, blocage scanners (PHP/ASP/env/git/wp) |
| Backups | `scripts/backup-db.sh` — pg_dump custom, cron 03:00 UTC, retention 7j+4sem, rôle SELECT-only |
| Rollback | `deploy/rollback.sh` — revert migrations + retag image + healthcheck, exit codes 42/43/44 |
| Runbook | `docs/RUNBOOK.md` (Docker, migration, DB restore, escalade P1-P4) + `RUNBOOK_AUTO_ROLLBACK.md` |

---

## 3. Inventaire Produit — Ce qui existe

### 3.1 Mobile (museum-frontend)

**17 écrans réels** — zéro scaffold :
- Tabs : Home, Conversations, Museums
- Stack : auth, chat, settings, preferences, onboarding, change-email, change-password, discover, guided-museum-mode, museum-detail, privacy, reviews, support, terms, tickets, create-ticket, ticket-detail, not-found

### 3.2 Features Mobile livrées

| Feature | État | Détail |
|---|---|---|
| **Chat SSE streaming** | ✅ | Parser SSE custom + throttle 40ms + cursor animé + guardrail incrémental |
| **TTS (listen button)** | ✅ | OpenAI TTS-1 + `expo-audio` natif + `HTMLAudioElement` web + cache Redis 24h |
| **Auto-TTS (audio mode)** | ✅ | Joue automatiquement les réponses quand mode description audio actif |
| **Thumbs up/down feedback** | ✅ | Full-stack (migration DB + endpoint + UI avec haptic) |
| **Image pick/camera** | ✅ | `expo-image-picker` + optim pipeline + preview inline avec × |
| **Offline queue** | ✅ | `useOfflineQueue` + persistent storage + flush sur reconnect |
| **Visit Summary modal** | ✅ | Artworks discutées, rooms visitées, durée, expertise détectée |
| **Message context menu** | ✅ | Copy / Share / Report via native Share API |
| **Voice recording** | ✅ | Dual-platform : `expo-audio` natif + `MediaRecorder` web + transcription Whisper |
| **Follow-up / recommendations / deeper context** | ✅ | Drivés par metadata `[META]` du LLM |
| **Museum directory** | ✅ | Fetch `/api/museums/directory` + distance Haversine + FlashList |
| **Map view (Leaflet)** | ✅ | WebView + Leaflet 1.9.4 + CartoDB dark/light + 5 marker categories + user GPS dot |
| **Géolocalisation nearby** | ✅ | `useLocation` + search API + dedup OSM vs DB |
| **8 langues (FR/EN/ES/DE/IT/JA/ZH/AR)** | ✅ | Parité parfaite (746 lignes par fichier locale) |
| **RTL arabe** | ✅ | `I18nManager.forceRTL()` + `needsRTLReload` |
| **Dark mode** | ✅ | `ThemeMode: system\|light\|dark` persisté, `useColorScheme()` |
| **Accessibilité** | ✅ | 234 `accessibilityLabel`, roles + hints, `useReducedMotion` |
| **Social login (Apple + Google)** | ✅ | `useSocialLogin` + disponibilité check Apple |
| **Biometric auth** | ✅ | Face ID / Touch ID / Iris + enrollment check + settings toggle |
| **Change password / change email** | ✅ | Écrans + API + validation |
| **Export data (GDPR)** | ✅ | JSON via native Share sheet |
| **Support tickets in-app** | ✅ | Create / list / detail / reply — full CRUD |
| **Reviews (star rating)** | ✅ | Submission + paginated list + stats |
| **Daily art card** | ✅ | Rendue sur Home + save/dismiss |
| **Onboarding carousel** | ✅ | FlatList swipeable + StepIndicator + Reanimated |
| **GDPR consent register** | ✅ | Checkbox obligatoire + liens Terms/Privacy |
| **Forgot password** | ✅ | Email reset + success dialog |
| **In-app review prompt** | ✅ | `expo-store-review` après session réussie |
| **FlashList** | ✅ | Chat, conversations, museums (reviews encore en FlatList) |
| **React Compiler** | ✅ | `babel-plugin-react-compiler` activé |

### 3.3 Web (museum-web)

**13 pages réelles, toutes fonctionnelles** :

**Landing** : Hero + App Preview + How It Works + Chat AI Showcase + Maps Showcase + Bento Feature Grid + FAQ + Download CTA. JSON-LD 4 schémas (MobileApp, Organization, Website, FAQPage). Framer Motion + liquid-glass SVG.

**Admin Panel (7/7 fonctionnelles)** :
| Page | État |
|---|---|
| Dashboard | Live stats `/api/admin/stats` (users, conversations, messages) |
| Users | Paginé + search debounced + filtre role + édition role |
| Analytics | Recharts LineChart + BarChart + granularité daily/weekly/monthly |
| Tickets | Paginé + filtres status/priority + détail + inline reply |
| Audit Logs | Paginé + filtre action |
| Reports | Paginé + filtre status + mise à jour (content moderation) |
| Support | Staff view séparée du public avec role check |

**Autres** : Privacy (contenu GDPR réel 11KB, pas scaffold), Support (FAQ accordion + ContactForm), Reset Password, Admin Login (JWT + refresh token interceptor). i18n FR + EN (dictionnaires 11-12KB).

### 3.4 Backend (museum-backend) — 58 routes documentées

**Chat module** (`/api/chat/`) : sessions CRUD, messages (+ streaming SSE), audio transcribe, TTS, feedback, report, image-url signé, describe (text/audio/both), memory preference, art-keywords sync

**Auth module** (`/api/auth/`) : register, login, refresh, logout, me, social-login (Apple/Google), change-password, change-email, confirm-email-change, forgot-password, reset-password, verify-email, onboarding-complete, export-data, delete-account, api-keys CRUD (B2B)

**Museum module** (`/api/museums/`) : directory (public), search (Overpass + Nominatim), detail, CRUD admin, low-data-pack

**Admin module** (`/api/admin/`) : stats, users, audit-logs, reports, tickets

**Review module** (`/api/reviews/`) : submit, list, moderation

**Support module** (`/api/support/tickets/`) : CRUD tickets + messages

**Daily Art** (`/api/daily-art/`) : rotation quotidienne

### 3.5 Scalabilité — Composants prêts

| Composant | Statut |
|---|---|
| Redis cache (ioredis) | ✅ Full API + fail-open + in-memory fallback |
| Redis rate limiting | ✅ Sliding-window, IP + session + per-user |
| PgBouncer pooler | ✅ Configuré dans docker-compose prod |
| LLM response caching | ✅ Decorator `CachingChatOrchestrator`, clé PII-sanitisée, popularity tracking Redis ZINCRBY |
| Circuit breaker LLM | ✅ 3-state FSM (CLOSED → OPEN → HALF_OPEN) sliding window |
| Semaphore concurrency | ✅ Cap sur LLM calls simultanés |
| SSE streaming avec jitter buffer | ✅ 2-phase (classifier puis drain 35ms) |
| Connection pool monitor | ✅ Warn à 80% usage toutes les 60s |
| Feature flags (9) | ✅ Env-var driven : voiceMode, ocrGuard, apiKeys, streaming, multiTenancy, userMemory, knowledgeBase, imageEnrichment, webSearch, knowledgeExtraction |

---

## 4. Pipeline IA — Deep Dive (la différenciation)

**Scores (agent prompting-scanner) :**

| Dimension | Score | Justification |
|---|---|---|
| Prompting Sophistication | **8/10** | 7 dimensions contextuelles, structured `[META]` output |
| Personalization Depth | **8/10** | 4 couches de personnalisation |
| Knowledge Grounding | **7/10** | Wikidata + DB locale + web search multi-provider |
| Architecture Quality | **9/10** | Hexagonal, circuit breaker, fail-open, PII-safe |

### 4.1 Providers LLM supportés
- **OpenAI** (`ChatOpenAI`)
- **DeepSeek** (via endpoint OpenAI-compatible)
- **Google Gemini** (`ChatGoogleGenerativeAI`)

Sélection via `env.llm.provider`. Pas de fallback automatique entre providers (circuit breaker fire mais pas de switch).

### 4.2 Construction du system prompt — 7 dimensions dynamiques

Le system prompt (`buildSystemPrompt()` dans `llm-prompt-builder.ts`) est assemblé à chaque requête en fonction de :

1. **Guide level** (beginner/intermediate/expert) → change le registre de vocabulaire explicitement
2. **Museum mode** (on/off) → phrases courtes "à lire en marchant" vs expansives
3. **Conversation phase** (greeting/active/deep, dérivée du nb de messages) → la phase "deep" demande au LLM de référencer les œuvres déjà discutées
4. **Audio description mode** → paragraphe accessibilité complet (couleurs, textures, composition, phrases naturelles)
5. **Low-data mode** → cap dur 100-150 mots
6. **Language** (7 locales) → `"Respond in [language]."`
7. **Visit context block** → musée, salle, œuvres discutées, rooms visitées, nearby museums, expertise détectée

### 4.3 4 couches de personnalisation

**Couche 1 — Request-level** : `guideLevel`, `museumMode`, `locale`, `location`, `audioDescriptionMode`, `lowDataMode` envoyés par le client à chaque message.

**Couche 2 — Session-level (Visit Context)** : `VisitContext` persisté sur `ChatSession`, mis à jour après chaque message. Tracks :
- `artworksDiscussed[]` (cap 5 dans le prompt)
- `roomsVisited[]`
- `museumName` + `museumConfidence` (0-1, +0.3 par artwork matching)
- `detectedExpertise` auto-promu après 3 signaux consistants
- `nearbyMuseums` geo-résolus à la création de session

**Couche 3 — Cross-session (User Memory)** : `UserMemory` entity persistée, Redis-cached 1h. Tracks sur **toutes** les sessions :
- `sessionCount`, `lastSessionId`
- `preferredExpertise`
- `favoriteArtists[]` (cap 10), `notableArtworks[]` (cap 20)
- `museumsVisited[]` (cap 10)
- `favoritePeriods[]`, `interests[]`, `summary`
- `disabledByUser` (GDPR opt-out) — API : `GET/PATCH /api/chat/memory/preference`

Le bloc `[USER MEMORY]` est injecté dans le prompt : `"Returning visitor (N sessions). Expertise: intermediate. Favorite artists: Monet, Vermeer..."`

**Couche 4 — Adaptive expertise auto-detection** : Le LLM set `expertiseSignal` dans sa réponse metadata. Après 3 signaux cohérents, `detectedExpertise` est promu, puis feeds back dans le prompt. Feedback loop auto-adaptative sans friction utilisateur.

### 4.4 Knowledge Grounding — 3 sources parallèles

Toutes fetchées en parallèle, fail-open, placées avant le `HumanMessage` dans l'ordre de priorité :

1. **Local Knowledge DB (priorité 1)** — `DbLookupService` query la table `ExtractedContent` (populée par le worker BullMQ `knowledge-extraction` qui scrape + classifie). Bloc `[LOCAL KNOWLEDGE]` placé en premier.

2. **Wikidata (priorité 2)** — `WikidataClient` : search `wbsearchentities` → filtre par art-keyword → SPARQL pour creator/inception/material/collection/movement/genre/P18-image. Injection : `"[KNOWLEDGE BASE — verified facts from Wikidata]. Use these verified facts as ground truth. Do not contradict them."` — mécanisme anti-hallucination principal. QID validé avant interpolation SPARQL (injection defense).

3. **Web Search (priorité 3, real-time)** — `FallbackSearchProvider` séquentiel : Tavily → Google CSE → Brave → SearXNG → DuckDuckGo. Bloc `[WEB SEARCH]` avec instruction de citer en markdown. URLs enfilées en fire-and-forget dans le worker d'extraction pour grossir la DB locale.

**Smart search term extraction** : Regarde d'abord le `detectedArtwork.title` dans le metadata du dernier assistant message (si le LLM a déjà identifié l'œuvre, ce titre est utilisé pour le lookup), sinon fallback texte utilisateur si ≥3 mots.

### 4.5 Guardrails — Sécurité LLM

**Input** :
- Art-topic guardrail (16 insults + injection patterns multilingues 8 langues)
- PII sanitizer strip avant LLM
- Context fields (location) guardrail-checked avant injection dans le prompt
- OCR guard sur images (Tesseract, fail-open)
- Magic byte validation images

**Structural** :
- System instructions AVANT user content dans l'array de messages
- Boundary marker `[END OF SYSTEM INSTRUCTIONS]`
- `<user_message>` XML tagging
- HTML entity encoding `< >` dans user messages

**Output** :
- Art-topic classifier fail-CLOSED (OWASP LLM 2026)
- Localized refusal messages 7 locales
- Cache skip si PII count > 0 ou si user memory/KB/web search block présent
- Audit log sur tous les blocks

### 4.6 Image Enrichment Pipeline

`ImageEnrichmentService` :
- Fetch Wikidata P18 + Unsplash en parallèle
- Scoring : source + caption relevance + API position + dimensions
- Déduplication + ranking
- In-memory cache
- Retourné au client comme `EnrichedImage[]` pour display

---

## 5. Scale Readiness — 1000 utilisateurs

### 5.1 Ce qui tient

- **Cache Redis** : LLM responses, KB, user memory, web search, OSM/Overpass, TTS audio — toute la hot path est cachée
- **Rate limiting Redis** : IP + session + per-user cross-session (fix SEC-20 pour empêcher le bypass par rotation de session)
- **PgBouncer** : pooler transactionnel, backend ne frappe jamais PG directement
- **Circuit breaker LLM** : empêche cascade failures si provider down
- **Semaphore LLM** : cap sur concurrent calls
- **Fail-open partout** : Wikidata/Redis/KB timeouts ne cassent jamais le chat
- **Feature flags** : kill switches pour toutes les features lourdes
- **CachingChatOrchestrator** : popular questions → cache Redis hit

### 5.2 Zones à valider avant 1000 concurrent

1. **SSE streaming ne scale pas horizontalement** — chaque connexion SSE tient une socket ouverte → sticky sessions obligatoires ou cap instance
2. **Déploiement single-node** — pas de replicas prod ; horizontal scaling pas testé
3. **Pas de fichier k6 au repo** — `docs/HORIZONTAL_SCALING.md` documente la démarche mais aucun fichier k6 exécutable trouvé (le Sprint log mentionne "k6 200-VU stress test" mais les fichiers ne sont pas au repo)
4. **LLM cost** — à 1000 MAU avec sessions multiples, le budget OpenAI/Gemini devient significatif ; Low-Data Mode mitige mais pas de cap de cost tracking user-level
5. **DB pool = 50** — suffisant en single-node, à valider sur load test

### 5.3 Pour 1000 MAU

**Verdict : OK sans changement**. Les caches, le rate limiting et les circuit breakers couvrent largement le trafic d'1000 utilisateurs actifs mensuels.

### 5.4 Pour 1000 concurrent

**Verdict : nécessite validation load test + probablement sticky sessions**. Recommandé avant une hausse de trafic : lancer k6 réel et measurer p95/p99 SSE + LLM latency.

---

## 6. Ce qui a été construit ce dernier mois (2026-03-14 → 2026-04-14)

Résumé des sprints majeurs des 30 derniers jours. Détail complet archivé dans `docs/archive/v1-sprint-2026-04/SPRINT_LOG.md`.

### 6.1 Features produit livrées

| Livraison | Date | Impact |
|---|---|---|
| **Wikidata Knowledge Enrichment** | V3.1 Sprint 4 | Differenciateur #1 — réduit drastiquement les hallucinations LLM sur les œuvres |
| **Knowledge Extraction module** | 2026-04-10 | 3 entités + BullMQ worker + HTML scraper + classifier LLM + DB lookup avec bloc prompt `[LOCAL KNOWLEDGE]` |
| **Web Search multi-provider** | 2026-04-10 | 5 providers (Tavily/Google/Brave/SearXNG/DDG) + fallback séquentiel |
| **Smart Low-Data Mode** | 2026-04-07 | Backend CachingChatOrchestrator + frontend DataMode + NetInfo auto-detect + settings 8 langues |
| **Cross-session User Memory** | S4/V3 | Entity + service + Redis cache + GDPR opt-out + bloc prompt |
| **Image Enrichment (Wikidata P18 + Unsplash)** | 2026-03-31 | Pipeline scoring + dedup + cache |
| **In-app Support Tickets** | V3.1 Sprint 3 | 3 écrans mobile (create, list, detail) + backend CRUD |
| **Admin Web Complet** | V3.1 Sprint 2 | 4 pages connectées (analytics, reports, tickets, support) |
| **Design System 3-layer** | 2026-04-09 | Primitives + functional + semantic tokens, migration 22 chat/auth + 21 stack screens |
| **Chat UX Overhaul** | 2026-03-31 PM | WhatsApp-like image preview, TTS listen, Visit Summary, thumbs up/down, offline image retry |
| **Museum Walk V1 — Map View** | FT-02 | Leaflet + position utilisateur dans Museums tab (parcours interactif PAS livré) |
| **Visit Summary Modal** | UX-03 | Artworks, rooms, duration, expertise |
| **Geolocation Museum Search (Overpass)** | FT-05 | Nominatim + Haversine + dedup OSM/DB |
| **Review module** | R13 | Backend + frontend + star rating |
| **Change Email + confirm flow** | FE-01 | Écran + API + settings link + i18n 8 langues |
| **Reset Password page museum-web** | FT-06 | Complet avec token + redirection |
| **Museum seed script + low-data-pack endpoint** | LDM-04 | MuseumQaSeed entity + GET endpoint |

### 6.2 iOS / App Store

- **Expo 55 upgrade** : régénération `ios/` + nouveaux Pods + test coverage restauré
- **Apple Review fixes** : suppression UIBackgroundModes audio (rejection 2.5.4), amélioration purpose strings camera/location (5.1.1), suppression ATT framework (2.1)
- **Xcode Cloud fix** : HERMES_CLI_PATH + suppress prebuild
- **Crash diagnostics** : uncaught exception handler + Sentry 8.7.0 upgrade qui fix crash natif iOS

### 6.3 Tests & Quality

- **QE sprint** : 6.9 → 10/10 quality excellence
- **Mock walls éliminés** : low-value frontend tests refactorés
- **Stryker mutation testing** : intégré en CI
- **10 E2E golden path tests**
- **37 ESLint warnings** → 0 (frontend)
- **as-any** : 4 → 0 (backend + frontend)
- **Maestro E2E mobile** : intégré au CI
- **131 fichiers test mobile** (71 components + 25 hooks + 32 infra + 22 screens)

### 6.4 Sécurité hardening

- **PiiSanitizer** + 4 audit priorities (privacy module)
- **CI security** : CODEOWNERS + top-level permissions + blocking SBOM + CodeQL nightly
- **SEC-19** : reject orphan session adoption + symmetric anti-theft
- **SEC-20** : per-user rate limiter sur chat + media
- **SSRF** : protection sur HTML scraper
- **Prompt injection** : améliorations multilingues (8 langues)
- **Review filter security fix**
- **path-to-regexp 8.4.0** (ReDoS CVE fix)
- **langsmith >=0.4.6** (SSRF CVE fix)
- **LLMCircuitBreaker** wired

### 6.5 Web & Landing redesign

- **Sprint 1** : SEO foundations + animation fixes
- **Sprint 2** : visual sections avec live components
- **Sprint 3** : premium scroll animations
- **Sprint 4-5** : 14 visual fixes production review
- **Hero animation** : migration Remotion → Framer Motion
- **"App Mirror" redesign** : alignement avec le design system mobile

---

## 7. Gaps connus & dette technique

### 7.1 Features planifiées mais pas livrées

| Feature | État | Référence |
|---|---|---|
| **Museum Walk interactif (parcours guidé inter-musées)** | **NON livré** (seule la map view existe). Le screen `guided-museum-mode.tsx` est informationnel (lit les settings, pas de flow walk) | `docs/FEATURE_MUSEUM_WALK.md`, `docs/walk/` — spec complète, 0 ligne de code |
| **Push notifications (expo-notifications)** | NON livré | Planifié Sprint S3 walk |
| **IAP / Monetisation (RevenueCat)** | NON livré | Planifié Sprint S4 walk |
| **Free tier gate (5 queries/jour)** | Partiel (free tier gate existe côté code mais pas UI paywall) | FT-04 |
| **Offline-first Walk (cartes offline)** | NON livré | Planifié Sprint S5 walk |

### 7.2 Code mort / à nettoyer

| Item | Détail |
|---|---|
| `useImageManipulation` hook | Créé (crop + rotate via `expo-image-manipulator`) mais jamais importé — l'UI crop n'est pas exposée |
| `reviews.tsx` FlatList | Seul écran mobile qui utilise encore FlatList au lieu de FlashList — impact perf minime |
| Email verification screen | `/api/auth/verify-email` typé en OpenAPI et appelé côté backend, mais pas de route `verify-email.tsx` côté app pour le deep link post-registration |

### 7.3 Limites techniques actuelles

| Limite | Détail | Impact |
|---|---|---|
| **OCR English-only** | `createWorker('eng')` dans `ocr-service.ts` | Guardrail sur images en langues non-EN moins efficace |
| **LLM provider failover** | Circuit breaker fire mais pas de switch automatique vers un autre provider | Si OpenAI down, circuit ouvert → erreur user, pas de fallback Gemini |
| **Multi-section LLM** | Architecture supporte `sectionPlan[]` mais une seule section `summary` déployée | Extension point future, pas utilisé aujourd'hui |
| **Pas de chain-of-thought / few-shot** | Prompts zéro-shot pour l'instant | Prompts pourraient être affinés |
| **Guide level pas auto-override** | Le client envoie `guideLevel`, et l'expertise détectée est injectée en contexte mais n'override pas automatiquement le `guideLevel` du prompt system | Si le client envoie toujours `beginner`, le vocabulary register reste beginner |
| **Wikidata lookup-based** | SPARQL 7 propriétés, 1 résultat, pas de RAG vectoriel | Coverage limitée aux œuvres avec descriptions art-keyword |
| **SSE pas horizontalement scalable** | Sticky sessions requises | Limite scale horizontal |
| **Pas de fichier k6 au repo** | Docs `docs/HORIZONTAL_SCALING.md` + mention load test Sprint log, mais aucun fichier k6 exécutable au repo | Scaling test non reproductible en CI |
| **Reviews en FlatList** | 1 liste non-FlashList | Perf mineure |
| **Support screen liens externes** | `support.tsx` route vers Instagram/Telegram. Le système tickets in-app existe en parallèle mais n'est pas le CTA principal du support screen | UX discutable |
| **Pas de shared component library** | Les tokens sont partagés via `design-system/`, mais chaque app a ses propres composants React | Pas bloquant, mais duplication potentielle |

### 7.4 Items reportés / en attente stakeholder

- **Google Play Data Safety Form** — remplissage Play Console (tâche PO, pas code)
- **CAPTCHA hCaptcha** — différé (nécessite compte hCaptcha)
- **PostHog analytics** — différé (nécessite compte)
- **ATT Tracking** — retiré (Apple review 2.1)
- **Instagram handle** — pas encore créé
- **Network Security Config Android** — différé (Expo managed ne supporte pas directement)

---

## 8. Architecture — Coup d'œil rapide

### 8.1 Backend — Hexagonal

```
src/
├── config/env.ts                  # single source of env (Zod-validated)
├── data/db/                       # TypeORM data-source + migrations
├── modules/                       # 1 dossier = 1 bounded context
│   ├── admin/                     # RBAC, analytics, audit, moderation
│   ├── auth/                      # register, login, social, biometric, API keys
│   ├── chat/                      # LLM orchestration + SSE + image/audio + guardrails
│   ├── daily-art/                 # rotation quotidienne
│   ├── museum/                    # CRUD + directory + Overpass search
│   ├── knowledge-extraction/      # BullMQ + scraper + classifier + DB lookup
│   ├── review/                    # star ratings
│   └── support/                   # tickets in-app
├── shared/                        # cross-cutting (cache, observability, email, audit)
├── helpers/                       # middlewares (auth, rate-limit, requestId, error)
└── app.ts                         # Express factory avec DI overrides
```

**Pattern** : chaque module suit `domain → useCase → adapters/primary/secondary`. Barrel `index.ts` monte le dependency graph. Test helpers factorisés (`tests/helpers/`) — directive DRY strictement enforcée.

### 8.2 Frontend — Feature-driven

```
app/                               # Expo Router file-based
├── (tabs)/                        # home, conversations, museums
└── (stack)/                       # 17 écrans stack

features/                          # 1 feature = 1 bounded context
├── art-keywords/                  # offline classifier sync
├── auth/                          # social, biometric, GDPR, reset, biometric
├── chat/                          # session, streaming, TTS, voice, offline, summary
├── conversation/                  # list, search, infinite scroll, swipe
├── daily-art/
├── legal/
├── museum/                        # directory + map Leaflet + geolocation
├── onboarding/
├── review/
├── settings/                      # theme, data mode, memory, biometric toggle
└── support/                       # tickets CRUD

shared/                            # api (generated OpenAPI types), ui, config, i18n, infra
```

### 8.3 Web — Next.js 15 App Router

```
src/
├── app/[locale]/                  # FR/EN i18n routing
│   ├── page.tsx                   # landing 8 sections
│   ├── admin/                     # 7 pages fonctionnelles
│   ├── privacy/
│   ├── support/
│   └── reset-password/
├── components/marketing/          # 9 Framer Motion components
├── lib/                           # api, auth, i18n, seo, privacy-content
└── middleware.ts                  # i18n routing
```

---

## 9. Métriques clés au 2026-04-14

| Métrique | Valeur |
|---|---|
| Tests total (3 apps) | **3879** (2604 BE + 1096 FE + 179 web) |
| Typecheck errors | **0** (3 apps) |
| `as any` count | **0** (3 apps) |
| ESLint errors | **0** (3 apps) |
| Coverage backend | **72.86%** stmts / 57.61% branches |
| Backend routes | **58** (OpenAPI contract-tested) |
| Modules backend | **8** (admin, auth, chat, daily-art, museum, knowledge-extraction, review, support) |
| Langues mobile | **8** (FR/EN/ES/DE/IT/JA/ZH/AR) |
| Accessibility labels mobile | **234** |
| Features flags | **9** |
| Audit event types | **17+** |
| LLM providers | **3** (OpenAI / DeepSeek / Google) |
| Web search providers | **5** (Tavily / Google / Brave / SearXNG / DuckDuckGo) |
| CI workflows | **7** |
| Sentry runtimes | **4** (backend + mobile + web client/server/edge) |

### Historique sprints (progression globale)

Détail archivé dans `docs/archive/v1-sprint-2026-04/PROGRESS_TRACKER.md` — 22 sprints/phases complétés depuis S1 :
S1 → S1.5 → S2 → S3 → Post-S3 Audit → S4 → S5 → S6 → S7 → S8 → Phase 0 Store Readiness → W1 Web → W2 Web → Store Submission Polish → Technical Polish → V3 Sprints 2-5 → R13 Liquid Glass → R15 God-File Decomposition → Production Hardening → Chat UX → Hotfix → V2 Features (Knowledge Extraction + Web Search + Smart Low-Data + Design System + iOS fixes + Apple Review) — **345/346 tâches complétées (99%)**.

---

## 10. Conclusion

**Musaium tient sa promesse produit.** L'application est un compagnon IA de musée conversationnel fonctionnel, avec :
- Un pipeline IA multi-provider sophistiqué qui personnalise réellement la réponse (4 couches)
- Une base de connaissance anti-hallucination (Wikidata + DB locale + web search)
- Un onboarding fluide avec 8 langues + RTL + accessibilité
- Un écosystème complet : mobile + web landing + admin panel + support tickets
- Une infra production-grade : CI/CD, Sentry, backups, rollback, RBAC, feature flags
- 3879 tests verts et 0 erreur de typecheck sur les 3 apps

**Pour aller en prod maintenant** : oui, sous réserve de compléter les tâches PO (Google Play Data Safety Form, confirmation handles support) et de lancer un load test réel si le trafic attendu dépasse les centaines de users concurrent.

**Pour aller à 1000 MAU** : prêt. Rien à faire.

**Pour aller à 1000 concurrent users** : valider d'abord un load test k6 (pas de fichier exécutable au repo actuellement), et anticiper les sticky sessions SSE.

**Ce qui manque vraiment** (au sens "différenciateur produit non livré") : le **Museum Walk interactif** (parcours guidé inter-musées avec narration IA en marchant) reste au stade spec. Le reste de la roadmap MASTER_ROADMAP_V2 / V3 est quasi intégralement livré.

---

## Annexe A — Documents sources (à consulter pour le détail)

**Suivi actif (2026-04-20+)** :
- `.claude/tasks/` — task lists /team
- `team-reports/` — audits sortants

**Archives (jusqu'au 2026-04-19)** :
- `docs/archive/v1-sprint-2026-04/PROGRESS_TRACKER.md` — checkbox tracker par sprint
- `docs/archive/v1-sprint-2026-04/SPRINT_LOG.md` — journal technique immutable

**Références produit (stables)** :
- `docs/FEATURE_MUSEUM_WALK.md` — spec Museum Walk (non implémenté)
- `docs/FEATURE_KNOWLEDGE_BASE_WIKIDATA.md` — spec Wikidata (implémenté)
- `docs/STORE_SUBMISSION_GUIDE.md` — checklist submission stores
- `docs/RELEASE_CHECKLIST.md` — checklist release

**Ops & sécurité** :
- `docs/RUNBOOK.md` + `docs/RUNBOOK_AUTO_ROLLBACK.md`
- `docs/CI_CD_SECRETS.md` — rotation secrets
- `docs/DB_BACKUP_RESTORE.md`
- `docs/DEPLOYMENT_STEP_BY_STEP.md`
- `docs/HORIZONTAL_SCALING.md`
- `docs/security/network-hardening.md`

**Archivés (historique, à ne plus consulter pour l'état actuel)** :
- `docs/archive/roadmaps/` — anciennes roadmaps MASTER_ROADMAP_V2, V3_REVIEW_AND_PLAN, V2_MUSEUM_WALK_STRATEGY (contenu obsolète)
- `docs/archive/fullcodebase-analyse/` — analyse initiale pré-Sprint 1 (historique)

**Plans non implémentés (backlog)** :
- `docs/walk/` — sprints Museum Walk S0-S5 (non démarrés)

---

*Document généré par /team audit — agents parallèles (repo-scanner, feature-verify, prompting-scanner, web-infra). Prochaine mise à jour recommandée : après chaque sprint majeur, ou trimestriellement.*
