# Audit Enterprise-Grade -- Gaps Restants

> **Date**: 2026-04-02 | **4 agents d'audit** | **Post-Sprint 4** (2190 tests)
> Focus: Qu'est-ce qu'il manque pour etre veritablement enterprise-grade?

---

## Verdict: Ou en est-on?

| Dimension | Score | Commentaire |
|-----------|-------|-------------|
| **Unit/Integration Tests** | 8/10 | Solide. 2190 tests, factories, property-based, mutation testing |
| **E2E Backend** | 5/10 | 4 suites mais SSE streaming, multi-tenancy, rate limiting non testes E2E |
| **E2E Mobile** | 0/10 | ZERO. Aucun Maestro, Detox, ou Appium |
| **Contract Testing** | 7/10 | Reponses validees, mais pas de cross-service ni request schemas vs OpenAPI |
| **CI/CD Robustness** | 6/10 | Gates presentes mais audit non-bloquant, pas de SAST, timeouts manquants |
| **Security Scanning** | 4/10 | Trivy images seulement. Zero SAST (Semgrep/CodeQL). eslint-plugin-security != SAST |
| **Observability** | 9/10 | Excellent: Sentry, OpenTelemetry, Promtail/Loki, structured logging, smoke tests |
| **Performance Testing** | 3/10 | k6 scripts existent mais pas dans le CI. Pas de bundle size tracking |
| **Metrics/Dashboard** | 4/10 | quality-ratchet.json local. Pas de Codecov, pas de trend tracking |
| **DX (Developer Experience)** | 6/10 | `--runInBand` ralentit le CI. Pas de test caching |

---

## Les 25 Actions Enterprise-Grade Classees par Impact

### TIER 0 -- Fix Immediat (< 1h, impact securite)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | **Retirer `continue-on-error: true` du `pnpm audit`** dans ci-cd-backend.yml L48 | 5min | Vulnerabilites critiques bloquent enfin le merge |
| 2 | **Supprimer le job `mutation:` duplique** dans ci-cd-backend.yml (L479-515 duplique L106-140) | 5min | Bug YAML silencieux corrige |
| 3 | **Ajouter `permissions: contents: read`** en top-level des 3 workflows principaux | 10min | Principe de moindre privilege |
| 4 | **Ajouter `timeout-minutes`** a tous les jobs sans timeout (quality=15, deploy=20, build=30) | 15min | Pas de jobs zombies |

### TIER 1 -- Cette Semaine (securite + regression critique)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 5 | **Ajouter Semgrep au CI** (`.semgrep.yml` + `returntocorp/semgrep-action` sur chaque PR) | 3h | SAST sur chaque PR, scan 10s, detecte injections/XSS/path traversal |
| 6 | **Tests `s3-signing.ts` + `s3-path-utils.ts`** -- crypto signing + path traversal prevention. Zero tests, securite-critique | 2.5h | Regression S3 = toutes images cassees |
| 7 | **Test `social-token-verifier.ts`** -- JWKS verification Apple/Google. Zero tests | 2h | Regression = social login completement casse |
| 8 | **E2E multi-tenancy isolation** -- User A ne voit pas les sessions de User B | 4h | Data leak entre utilisateurs |
| 9 | **E2E SSE streaming** -- tester le vrai endpoint HTTP text/event-stream | 4h | Feature #1 utilisateur non testee E2E |
| 10 | **Ajouter Codecov** au CI backend + frontend (upload lcov) | 1.5h | Coverage diffs sur chaque PR, trend tracking gratuit |

### TIER 2 -- Ce Sprint (robustesse + gouvernance)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 11 | **CodeQL nightly** -- analyse semantique deep, taint tracking cross-fichiers | 3h | Detecte les vulnerabilites que Semgrep manque |
| 12 | **Test count ratchet dans le CI** -- empecher la suppression silencieuse de tests | 1h | Verrou anti-regression le plus important |
| 13 | **Tests `semaphore.ts`** + `fallback-orchestrator.ts` + `image-enrichment.service.ts` | 4.5h | Concurrence, failover LLM, pipeline image |
| 14 | **Tests `register.useCase.ts`** + `generateApiKey.useCase.ts` | 2.5h | Registration flow + API key limit (5 max) |
| 15 | **Bootstrap Maestro** pour mobile E2E (auth-flow.yaml + chat-flow.yaml) | 3j | Premiere couverture E2E mobile |
| 16 | **k6 dans le CI** (nightly, `grafana/k6-action`, seuils p95) | 4h | Detection regression perf automatique |
| 17 | **SBOM generation** (CycloneDX) sur chaque release build | 2h | Compliance EU Cyber Resilience Act |
| 18 | **Promouvoir quality ratchet dans le CI** (pas juste hook local) | 2h | Empeche regression metriques via CI |

### TIER 3 -- Ce Trimestre (polish + enterprise)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 19 | **Cross-service contract test** (ou Pact consumer-driven) | 1j | FE-BE schema drift detecte avant runtime |
| 20 | **E2E rate limiting** (RATE_LIMIT_SESSION=3, verifier 429 au 4e call) | 4h | Rate limiting prouve fonctionnel |
| 21 | **Chaos: Redis down** (testcontainers Redis stop mid-test, verifier fail-open) | 4h | Resilience prouvee |
| 22 | **Splitter unit/integration runs** (`--runInBand` seulement pour integration) | 3h | CI 30-50% plus rapide |
| 23 | **Bundle size tracking mobile** (expo export + seuil dans ratchet) | 3h | Prevenir bloat app |
| 24 | **External uptime monitoring** (UptimeRobot/Better Uptime sur /api/health) | 30min | Alerte independante downtime |
| 25 | **Frontend coverage bump** de 25/13 vers 40/25 (les tests existent deja) | 15min | Gate FE enfin significative |

---

## Backend: Fichiers Source Sans Aucun Test (P1)

| Fichier | Lignes | Risque |
|---------|--------|--------|
| `s3-signing.ts` | 81 | Crypto SigV4 -- regression = S3 mort |
| `s3-path-utils.ts` | 120 | Path traversal check -- securite |
| `social-token-verifier.ts` | ~175 | JWKS Apple/Google -- regression = social login mort |
| `semaphore.ts` | 119 | Concurrence -- bug = starvation ou OOM |
| `fallback-orchestrator.ts` | 49 | LLM failover -- zero confidence |
| `image-enrichment.service.ts` | 187 | Cache + Unsplash + Wikidata aggregation |
| `image-processing.service.ts` | 153 | Validation uploads -- securite-adjacent |
| `register.useCase.ts` | 98 | Registration flow complet |
| `generateApiKey.useCase.ts` | 86 | HMAC-SHA256, limit 5 par user |
| `upload-admission.middleware.ts` | 36 | DoS protection -- 503 quand trop de concurrent |
| `brevo-email.service.ts` | 34 | Email delivery -- failure silencieuse |
| `redis-cache.service.ts` | 109 | Fail-open non teste |

## Frontend: Screens Sans Test

| Screen | Fichier | Risque |
|--------|---------|--------|
| **Chat session** | `app/(stack)/chat/[sessionId].tsx` (12.6K) | P0 -- ecran principal utilisateur |
| Home tab | `app/(tabs)/home.tsx` (8.2K) | P1 |
| Settings | `app/(stack)/settings.tsx` (9.7K) | P1 |
| Preferences | `app/(stack)/preferences.tsx` (11.1K) | P1 |

## DRY Violations Restantes (3 fichiers)

| Fichier | Violation |
|---------|-----------|
| `chat-message-service.test.ts` | Local `makeSession()`, `makeMessage()` au lieu de shared factories |
| `chat-media.service.test.ts` | Local `makeSession()`, `makeMessage()` au lieu de shared factories |
| `orchestrator-messages.test.ts` | Local `createMessage()` au lieu de `makeMessage()` |

---

## Tooling Enterprise Recommande

| Outil | Usage | Priorite | Effort |
|-------|-------|----------|--------|
| **Semgrep** | SAST rapide sur chaque PR | HIGH | 3h |
| **CodeQL** | SAST deep nightly | HIGH | 3h |
| **Codecov** | Coverage trends + PR diffs | HIGH | 1.5h |
| **Maestro** | Mobile E2E (Expo-compatible) | HIGH | 3j |
| **CycloneDX** | SBOM generation | MEDIUM | 2h |
| **k6 in CI** | Perf regression nightly | MEDIUM | 4h |
| **Toxiproxy** | Chaos testing (Redis/S3 down) | MEDIUM | 4h |
| **oasdiff** | API breaking change detection | MEDIUM | 2h |
| **UptimeRobot** | External health monitoring | LOW | 30min |
| **Datadog CI Visibility** | Full CI metrics dashboard | LOW | 8h |

---

## Effort Total Estime

| Tier | Items | Effort |
|------|-------|--------|
| Tier 0 (immediat) | 4 | ~35min |
| Tier 1 (cette semaine) | 6 | ~17h |
| Tier 2 (ce sprint) | 8 | ~5-6j |
| Tier 3 (ce trimestre) | 7 | ~4-5j |
| **Total** | **25** | **~15-16j** |

---

## Ce Qui Est Deja Enterprise-Grade

- Observability stack (Sentry + OTEL + Promtail/Loki + structured logging)
- Mutation testing (Stryker 81% covered)
- Property-based testing (fast-check)
- OpenAPI contract validation (reponses)
- E2E avec vrai Postgres (testcontainers)
- Post-deploy smoke tests (staging + prod)
- Trivy image scanning (CRITICAL/HIGH bloquant)
- Dependabot (backend + frontend)
- Quality ratchet (test count, coverage, as-any, lint)
- DRY test factories (backend + frontend)
