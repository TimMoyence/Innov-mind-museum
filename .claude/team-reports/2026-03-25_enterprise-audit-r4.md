# Cartographie Enterprise-Grade — Musaium R4

> **Run R4 | 2026-03-25 | Mode: chore (audit) | Scope: full-stack | 5 agents | Score: 88/100**
> **Verdict Sentinelle: CONDITIONNEL — Produit 3.52/5 (70%) — 3 bloquants release**

---

## Executive Summary

> **5 agents | Tests: 909+106 (0 fail) | as any: 0 | Typecheck: 0 errors | 12 CRITIQUE | 25 MAJEUR**

Musaium est un produit **mature pour un MVP** (score global 3.5/5) avec des fondations solides — architecture hexagonale, LLM orchestration avec fail-soft/budget/retry, JWT avec rotation de refresh tokens, logging structuré E2E, 1015 tests. Les axes d'amélioration pour atteindre le niveau enterprise-grade sont concentrés sur 4 thèmes :

1. **Résilience frontend** — React Error Boundary absent, état métier en useState local, messages d'erreur non i18n
2. **Couverture de tests** — Frontend dramatiquement sous-testé (16/~200 tests), OpenAPI spec incomplète (20/47 routes manquantes)
3. **Infrastructure de déploiement** — Zero-downtime absent, pas de security scanning CI, rate-limit in-memory
4. **Timeout & validation** — 2 appels HTTP sortants sans timeout, auth routes sans validation structurée

### Matrice de Maturité Globale

| Domaine | Backend | Frontend | Infra | Sécurité | QA |
|---------|:-------:|:--------:|:-----:|:--------:|:--:|
| **Score** | 3.9/5 | 3.7/5 | 3.2/5 | 3.8/5 | 3.0/5 |
| **Niveau** | Mature | Mature | Opérationnel | Mature | Opérationnel |

**Score Global Consolidé : 3.5 / 5 — Bon MVP, insuffisant Enterprise-Grade**

---

## Détail des Scores par Sous-Domaine

### Backend (3.9/5)

| Sous-domaine | Score | Forces | Faiblesses |
|---|:---:|---|---|
| Architecture hexagonale | 4/5 | Ports/adapters bien implémentés, barrel exports | 1 violation (socialLogin importe adapter), wiring dans useCase/ |
| Gestion des erreurs | 4/5 | AppError centralisé, pas de leak d'info | Factory unauthorized non exportée |
| Rate limiting | 3.5/5 | Multi-couche (IP, session, login, register) | In-memory only, routes admin/support sans limit spécifique |
| Latence & timeouts | 3.5/5 | Budget LLM, section runner, fail-soft | Fetch audio/TTS sans timeout |
| Gestion données | 4/5 | Cursor pagination, GDPR, optimistic lock | Indices DB à vérifier |
| Streaming SSE | 4/5 | Lifecycle, client disconnect, hard timeout | Pas de heartbeat |
| Input validation | 3.5/5 | Sanitization LLM robuste | Auth routes sans Zod/schema |
| Logging & observability | 4.5/5 | JSON structuré, requestId E2E, Sentry, OTel | 1 console.warn parasite |

### Frontend (3.7/5)

| Sous-domaine | Score | Forces | Faiblesses |
|---|:---:|---|---|
| Architecture feature-driven | 4/5 | Pas de violation ascendante, pure logic | 2 fichiers legacy hors features/ |
| Offline & résilience | 4/5 | Queue offline chat, ConnectivityProvider | 8 flux sans gestion offline, bug dequeue |
| Gestion erreurs | 4/5 | AppError exhaustif, Sentry, mapping | **Pas de Error Boundary**, messages non i18n |
| Latence & loading | 4/5 | Skeletons, streaming RAF throttle | Timeout LLM non ajusté côté client |
| Données & persistence | 3/5 | Settings + queue persists, SecureStore | **PE-004: useState local partout** |
| Rate limiting UX | 3/5 | Protection double-submit | Pas d'auto-retry 429 |
| Navigation & state | 4/5 | Guards solides, provider hierarchy | Draft perdu, startup error sans retry |
| Accessibilité & perf | 3.5/5 | 135 labels a11y, FlatList optimisé | Colors hardcodées, pas d'expo-image |

### Infrastructure (3.2/5)

| Sous-domaine | Score | Forces | Faiblesses |
|---|:---:|---|---|
| Docker | 3/5 | Multi-stage, non-root, healthcheck | **devDeps en prod (EP-007)**, .dockerignore incomplet |
| CI/CD | 3/5 | Lint+typecheck+OpenAPI+e2e+nightly | **Pas de security scan**, audit non-bloquant, pas de coverage |
| Déploiement | 2/5 | Smoke test post-deploy | **Non-zero-downtime**, migration inline, pas de rollback |
| Env governance | 4/5 | Centralisé, validé, CI guard | Drift mineur LLM_TIMEOUT |
| DB & migrations | 4/5 | 20 migrations propres, 25+ indices | DDL sans transaction, pas de dry-run |
| Monitoring & scaling | 3/5 | Sentry, OTel, health check, backup | **Rate-limit in-memory**, log rotation absent |

### Sécurité (3.8/5)

| Sous-domaine | Score | Forces | Faiblesses |
|---|:---:|---|---|
| Auth & AuthZ | 4/5 | JWT rotation, bcrypt-12, HMAC API keys | Login route sans rate-limit IP |
| Input validation | 4/5 | Parameterized SQL, sanitizePromptInput | Auth routes sans schema validation |
| LLM security | 3.5/5 | Prompt isolation, guardrail multi-layer | Keyword guardrail bypassable |
| Data privacy | 4/5 | PII strip JWT, GDPR export/delete | Tokens loggés sans guard __DEV__ |
| API security | 4/5 | Helmet, CORS, signed URLs | — |
| Dépendances | 3.5/5 | Versions récentes | langsmith SSRF vuln |
| Configuration | 4/5 | Fail-fast startup, env validation | — |

### QA (3.0/5)

| Sous-domaine | Score | Forces | Faiblesses |
|---|:---:|---|---|
| Backend unit | 4/5 | 909 tests, bonne isolation | Analytics useCases sans test |
| Backend integration | 3.5/5 | Chat module bien couvert | Autres modules absents |
| Backend contract | 4/5 | Validator OpenAPI remarquable | **Spec ne couvre que 60% des routes** |
| Backend E2E | 3/5 | Auth+chat+RBAC couverts | Image, audio, support, museum absents |
| Backend résilience | 2.5/5 | LLM timeout, rate limit testés | **DB/S3/network failure non testés** |
| Backend sécurité | 3.5/5 | Guardrail excellent | Brute-force intégration absent |
| **Frontend** | **1/5** | 3 fichiers, 16 tests | **Dramatiquement insuffisant** |
| OpenAPI complétude | 2/5 | Spec auth+chat correcte | **20 routes manquantes** |

---

## Findings CRITIQUE — Top 12 (action immédiate)

| # | Domaine | Finding | Impact | Effort estimé |
|---|---------|---------|--------|:---:|
| **C1** | Frontend | Pas de React Error Boundary — crash JS = crash app | Force-quit obligatoire | S |
| **C2** | Frontend | [PE-004] useChatSession useState local — données perdues | Perte messages user | M |
| **C3** | Frontend | [PE-004] ConversationsScreen useState — re-fetch constant | Performance dégradée | M |
| **C4** | QA | 20 routes absentes OpenAPI spec (admin/museum/support) | Drift, pas de types générés | M |
| **C5** | QA | Frontend sous-testé : 16 tests / ~200 hooks+composants | Risque mobile majeur | L |
| **C6** | QA | useChatSession (12.6K, hook principal) — 0 test | Cœur UX sans filet | M |
| **C7** | DevOps | [EP-007] devDeps dans image Docker prod (3e run !) | +100MB, surface d'attaque | S |
| **C8** | DevOps | Déploiement non-zero-downtime + migration inline | Downtime chaque deploy | M |
| **C9** | DevOps | Zero security scanning CI | Vulns non détectées | S |
| **C10** | DevOps | Rate-limit in-memory incompatible multi-instance | Bypass en scaling | M |
| **C11** | DevOps | Pas de concurrency group deploy | 2 deploys simultanés | S |
| **C12** | QA | DB resilience non testée | Production failure | M |

---

## Findings MAJEUR — Top 25 (action planifiée)

| # | Domaine | Finding | Effort |
|---|---------|---------|:---:|
| M1 | Backend | Audio transcription fetch() sans timeout/AbortController | S |
| M2 | Backend | TTS fetch() sans timeout/AbortController | S |
| M3 | Backend | Auth register body sans validation structurée | S |
| M4 | Backend | SocialLoginUseCase importe adapter directement | S |
| M5 | Frontend | Dequeue offline avant try/catch — message perdu | S |
| M6 | Frontend | Messages erreur getErrorMessage() non i18n | M |
| M7 | Frontend | 429 sans auto-retry avec backoff | S |
| M8 | QA | E2E image upload + AI analysis jamais testé | M |
| M9 | QA | E2E audio upload + transcription jamais testé | M |
| M10 | QA | 4 admin analytics useCases 0 test | S |
| M11 | QA | Semaphore.ts 0 test | S |
| M12 | DevOps | .dockerignore incomplet | S |
| M13 | DevOps | DB healthcheck absent docker-compose | S |
| M14 | DevOps | Pas de coverage reporting CI | S |
| M15 | DevOps | Pas de Docker layer caching CI | S |
| M16 | DevOps | Pas de rollback automatisé post-deploy | M |
| M17 | DevOps | Migrations destructives sans transaction | M |
| M18 | DevOps | DB pool non ajusté multi-instance | S |
| M19 | DevOps | Token cleanup scheduler in-process | S |
| M20 | DevOps | Log rotation/shipping absent | S |
| M21 | Security | Login route sans rate-limit IP | S |
| M22 | Security | Guardrail keyword bypassable | L |
| M23 | Security | OCR guard désactivé par défaut | S |
| M24 | Security | langsmith@0.3.87 SSRF vulnerability | S |
| M25 | Security | Tokens vérification/reset loggés sans guard | S |

---

## Cartographie Résilience Réseau & Surcharge

### Backend — Gestion de la charge

| Mécanisme | Implémenté | Config | Scaling-ready |
|-----------|:---:|---|:---:|
| Rate limit global (IP) | OUI | 120 req/min/IP | NON (in-memory) |
| Rate limit session (chat) | OUI | 60 req/min | NON (in-memory) |
| Rate limit register | OUI | 5/10min | NON (in-memory) |
| Rate limit login (brute-force) | OUI | 10/10min per-email | NON (in-memory) |
| Semaphore LLM concurrency | OUI | maxConcurrent=5 | OUI |
| Budget timeout LLM | OUI | 25s total, 15s/section | OUI |
| DB connection pool | OUI | max=20 | Partiel |
| Graceful shutdown | OUI | SIGTERM + 10s timeout | OUI |

### Backend — Gestion des pannes

| Scénario | Couvert | Mécanisme | Testé |
|----------|:---:|---|:---:|
| LLM timeout | OUI | Section runner + fallback message | OUI |
| LLM provider down | OUI | Fail-soft + fallback | OUI |
| LLM réponse vide | OUI | Fallback statique | OUI |
| LLM output toxic | OUI | Output guardrail | OUI |
| DB down | PARTIEL | Error handler centralise | NON |
| S3 down | PARTIEL | Fail-open pour images | NON |
| Redis down | OUI | NoopCacheService fallback | OUI |
| Audio transcription timeout | NON | Pas de AbortController | NON |
| TTS timeout | NON | Pas de AbortController | NON |
| OCR failure | OUI | Fail-open | OUI |
| Rate limit hit | OUI | 429 + Retry-After header | OUI |
| Audit log failure | OUI | Fire-and-forget | OUI |
| Email service down | OUI | Warn + continue | OUI |

### Frontend — Gestion réseau & offline

| Flux utilisateur | Offline queue | Retry auto | UX dégradation | Error display |
|-----------------|:---:|:---:|:---:|:---:|
| Envoyer message chat | OUI | OUI (flush reconnect) | OUI (optimistic + banner) | OUI |
| Envoyer image | OUI (URI) | OUI | Partiel | OUI |
| Charger session | NON | NON | NON | Erreur brute |
| Streaming SSE | NON | Fallback non-streaming | OUI | OUI |
| Dashboard conversations | NON | NON | NON | Erreur brute |
| Login/Register | NON | NON | NON | ErrorNotice |
| Token refresh | NON | NON | NON | Logout forcé |
| Museum directory | NON | NON | NON | Liste vide |
| Settings | NON | NON | NON | Silencieux |
| Support tickets | NON | NON | NON | Non implémenté |

### Frontend — HTTP Client résilience

| Mécanisme | Implémenté | Config |
|-----------|:---:|---|
| Retry auto 5xx | OUI | 2 retries, 150ms/300ms backoff |
| Retry ECONNABORTED | OUI | Avec les 5xx |
| Retry 429 | NON | L'utilisateur doit re-essayer manuellement |
| Token refresh auto | OUI | 401 → refresh → retry original |
| Timeout global | OUI | 15s |
| Request ID propagation | OUI | UUID généré côté client |
| Error mapping | OUI | 8 kinds (Network, Unauthorized, etc.) |
| Sentry reporting | OUI | Filtré (Network/Timeout/Unknown only) |

---

## Cartographie Gestion des Données

### Persistence (ce qui survit à quoi)

| Donnée | Navigation | App restart | App crash | Stockage |
|--------|:---:|:---:|:---:|---|
| Auth refresh token | OUI | OUI | OUI | expo-secure-store |
| Auth access token | OUI | NON | NON | Variable module-level |
| Chat messages | NON | NON | NON | useState local |
| Chat sessions list | NON | NON | NON | useState local |
| Offline queue | OUI | OUI | OUI | AsyncStorage |
| Settings (locale, theme) | OUI | OUI | OUI | AsyncStorage |
| Saved session IDs | OUI | OUI | OUI | AsyncStorage |
| Search/sort filters | NON | NON | NON | useState local |
| Draft message text | NON | NON | NON | useState local |

### GDPR Compliance

| Capacité | Implémenté | Mécanisme |
|----------|:---:|---|
| Export données utilisateur | OUI | Transaction REPEATABLE READ, pagination 50 |
| Suppression compte | OUI | CASCADE sessions/messages + S3 images cleanup |
| Token cleanup | OUI | Scheduler 6h + distributed lock |
| PII dans JWT | NON | Seulement userId, role, museumId |
| PII dans logs | PARTIEL | Tokens de vérification/reset loggés |
| Consentement | OUI | Tracking transparency demandé |

---

## Roadmap de Remédiation Priorisée

### Phase 1 — Quick Wins (effort S, impact élevé) — ~2-3 jours

| # | Action | Finding ref |
|---|--------|------------|
| 1 | Ajouter React Error Boundary (wrap root layout) | C1 |
| 2 | Fix devDeps Docker: `pnpm install --prod` dans runtime stage | C7 |
| 3 | Ajouter concurrency group aux deploy workflows | C11 |
| 4 | Ajouter AbortController aux fetch audio/TTS | M1, M2 |
| 5 | Fix dequeue offline: peek + try/catch + dequeue on success | M5 |
| 6 | Ajouter rate-limit IP sur /login route | M21 |
| 7 | Ajouter security scanning CI (Trivy pour Docker image) | C9 (partiel) |
| 8 | Optimiser .dockerignore | M12 |
| 9 | Ajouter healthcheck DB dans docker-compose | M13 |
| 10 | Guard tokens logging avec __DEV__ | M25 |
| 11 | Activer pnpm audit --audit-level=critical sans continue-on-error | C9 (partiel) |

### Phase 2 — Résilience & Tests (effort M) — ~5-7 jours

| # | Action | Finding ref |
|---|--------|------------|
| 12 | Migrer useChatSession vers Zustand/MMKV persistent store | C2 |
| 13 | Migrer conversations state vers le même store | C3 |
| 14 | Écrire tests useChatSession (jest-expo + renderHook) | C6 |
| 15 | Compléter OpenAPI spec (admin, museum, support routes) | C4 |
| 16 | Ajouter auto-retry 429 avec exponential backoff | M7 |
| 17 | Internationaliser getErrorMessage() via i18n | M6 |
| 18 | Implémenter zero-downtime deploy (blue-green ou rolling) | C8 |
| 19 | Ajouter rollback automatisé post-deploy | M16 |
| 20 | Ajouter coverage reporting CI | M14 |
| 21 | Ajouter tests résilience DB (pool exhausted, timeout) | C12 |
| 22 | Écrire E2E image upload + AI analysis | M8 |

### Phase 3 — Enterprise Hardening (effort L) — ~2-3 semaines

| # | Action | Finding ref |
|---|--------|------------|
| 23 | Implémenter distributed rate-limiting (Redis-backed) | C10 |
| 24 | Compléter la pyramide de tests frontend (L2 hooks + L3 components) | C5 |
| 25 | Remplacer guardrail keyword par LLM-based classifier | M22 |
| 26 | Ajouter CodeQL/SAST dans CI | C9 (complet) |
| 27 | Séparer readiness/liveness probes | DevOps |
| 28 | Implémenter log shipping (Loki, CloudWatch, ou ELK) | M20 |
| 29 | Ajouter Dependabot/Renovate pour dependency updates | Security |
| 30 | Cache API côté client (TanStack Query ou SWR) | Frontend perf |

---

## Points Forts Identifiés

- **Architecture hexagonale backend** — ports/adapters bien implémentés, 0 violation dans les couches domain/application
- **LLM orchestration** — budget timeout, section runner, semaphore, fail-soft avec fallback, output guardrail
- **JWT security** — refresh rotation, family reuse detection, bcrypt-12, timing-safe HMAC
- **Logging structuré** — JSON, requestId E2E, Sentry intégré, OTel prêt
- **1015 tests** — 909 backend + 106 frontend, 0 `as any`, 0 fail
- **GDPR compliance** — export, delete, token cleanup, PII minimal
- **Accessibilité** — 135 labels a11y, FlatList optimisé, keyboard avoidance
- **Offline chat** — Queue persistante, flush auto, optimistic UI, banner status
- **Error handling centralisé** — AppError hierarchy, mapping Axios exhaustif
- **Migration governance** — CLI, 20 migrations séquentielles, CI guard DB_SYNCHRONIZE

---

<!-- DETAIL REFERENCE ci-dessous — archive consultable, pas du contexte obligatoire -->

## Rapports Complets par Agent

Les rapports détaillés de chaque agent sont disponibles dans les sections ci-dessus et dans:
- Security: `.claude/team-reports/2026-03-25_security-audit-r4.md`
- Voir les findings complets avec fichier:ligne dans chaque rapport d'agent
