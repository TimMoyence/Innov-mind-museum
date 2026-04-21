# Rapport Consolide -- Audit Qualite des Tests Musaium

> **Date**: 2026-04-01 | **4 equipes d'audit** | **~200 fichiers analyses** | **1436 tests**
>
> Equipes: QA Specialists (35+ fichiers) | Code Review (61 fichiers) | PM + Process (roadmap + CI + git) | Tech Lead + Architecture (50+ fichiers)

---

## Verdict Global

| Dimension | Note | Consensus |
|-----------|------|-----------|
| **Backend tests** | **B+** | Les 4 equipes convergent. Solide couverture business, bonne pyramide, factories partagees |
| **Frontend tests** | **D+** | Consensus unanime. 47% des features FE sans test. Seuils de coverage negligeables (25/13) |
| **Process & Governance** | **C** | Pas de CODEOWNERS, pas de branch protection, pas de detection de suppression de tests |
| **Regression Prevention** | **C+** | Backend verrouille par contrats OpenAPI + E2E. Frontend = passoire. Aucun mutation testing |

**En une phrase**: Le backend est bien protege, mais un developpeur peut aujourd'hui modifier n'importe quel test, supprimer des assertions, ou merger sans review sur main -- et rien ne le bloque.

---

## Les 10 Failles Critiques (consensus 4 equipes)

### FAILLE 1: Pas de CODEOWNERS -- tout le monde peut modifier tout test
- **Detectee par**: PM, Tech Lead, Code Review
- **Risque**: Un dev peut affaiblir un test de securite (guardrail, auth, RBAC) sans approbation speciale
- **Fix**: Creer `.github/CODEOWNERS` protegeant auth/, guardrail/, contract/, CI/

### FAILLE 2: Pas de branch protection sur `main`
- **Detectee par**: PM
- **Risque**: Push direct sur main = bypass total du CI
- **Fix**: Activer branch protection (1 review, status checks obligatoires, pas de force push)

### FAILLE 3: Frontend coverage seuils a 25/13 = pas de gate
- **Detectee par**: QA, PM, Tech Lead
- **Risque**: Le frontend peut regresser massivement sans que le CI ne bloque
- **Fix immediat**: Remonter a 40/20/35/40. Cible Q3: 50/30/45/50

### FAILLE 4: Aucun test E2E pour le streaming SSE
- **Detectee par**: QA, Tech Lead, Code Review
- **Risque**: L'endpoint le plus utilise par l'utilisateur (`postMessageStream`) n'a ZERO test d'integration/E2E. Un bug de streaming passe en prod sans detection
- **Fix**: Ajouter un test E2E SSE dans `chat.e2e.test.ts`

### FAILLE 5: `stream-buffer.ts` (7.9K, hot path) sans test
- **Detectee par**: QA, Tech Lead
- **Risque**: Le buffer qui decoupe les tokens LLM avant envoi SSE = 0 couverture. Perte de donnees possible
- **Fix**: Tests unitaires dedies pour le stream buffer

### FAILLE 6: `chatApi.ts` (18K, API client frontend) = 0 test
- **Detectee par**: QA, Code Review
- **Risque**: Le pont complet frontend-backend (error mapping, retry, token refresh, streaming) est invisible aux tests
- **Fix**: Tests unitaires avec MSW (Mock Service Worker) ou mocks Axios

### FAILLE 7: 10 features frontend livrees sans aucun test
- **Detectee par**: PM, QA
- **Liste**: Dark mode, image crop, biometric auth, SSE streaming client, TTS playback, swipe-to-delete, bulk delete, visit summary, museum map, multi-tenancy isolation
- **Fix**: Ecrire les tests manquants (priorite: SSE streaming, biometric, multi-tenancy)

### FAILLE 8: Tests AI manuels seulement (`workflow_dispatch`)
- **Detectee par**: PM
- **Risque**: Si un prompt LLM change, le drift n'est detecte que si quelqu'un pense a lancer le workflow manuellement
- **Fix**: Ajouter schedule nightly (`cron: '30 4 * * *'`)

### FAILLE 9: Pas de detection de suppression/modification de tests en CI
- **Detectee par**: Tech Lead, PM
- **Risque**: Un dev peut supprimer un fichier test dans un gros PR et personne ne le remarque
- **Fix**: Step CI qui detecte les fichiers `.test.ts` supprimes/modifies et alerte

### FAILLE 10: `api.postgres.e2e.test.ts` manque 8 migrations + duplique le harness
- **Detectee par**: Code Review, Tech Lead
- **Risque**: Les E2E legacy tournent contre un schema incomplet (10/20 migrations). Tests passent mais ne valident pas le vrai schema
- **Fix**: Refactoriser pour utiliser `createE2EHarness()` (qui a les 20 migrations)

---

## Findings par Equipe -- Synthese Croisee

### QA Specialists -- Qualite des tests eux-memes

| # | Finding | Severite |
|---|---------|----------|
| QA-1 | SSE streaming pipeline = 0 test integration/E2E | P0 |
| QA-2 | `stream-buffer.ts` (7.9K) sans test | P0 |
| QA-3 | `chatApi.ts` (18K) frontend completement non teste | P0 |
| QA-4 | `chatSessionLogic.pure.ts` (pure functions) sans test | P0 |
| QA-5 | 3 fichiers violent la regle DRY factory (createMessage local) | P1 |
| QA-6 | `openapi-response.contract.test.ts` valide 25+ endpoints dans un seul `it()` | P1 |
| QA-7 | Busy-wait loops dans `offline-queue.test.ts` au lieu de fake timers | P2 |
| QA-8 | Aucun test de concurrence/race condition nulle part | P2 |
| QA-9 | Pas de test request-schema (seulement response) dans les contrats | P1 |
| QA-10 | 15+ hooks/services frontend sans aucune couverture | P1 |

### Code Review -- Qualite structurelle des tests

| # | Finding | Severite |
|---|---------|----------|
| CR-1 | `makeUser`/`makeUserRepo` duplique dans 6+ fichiers auth | P1 |
| CR-2 | `createMessage` helper duplique dans 4 fichiers chat | P1 |
| CR-3 | `api.postgres.e2e.test.ts` = 712 lignes monolithiques, harness duplique | P1 |
| CR-4 | Assertions faibles (`toBeDefined`, `toBeTruthy`) dans 40+ assertions frontend | P2 |
| CR-5 | Assertions manquantes sur error codes dans auth route tests | P2 |
| CR-6 | `InMemoryChatRepository.listSessionMessages` ignore le cursor | P2 |
| CR-7 | Pas de `additionalProperties: false` dans les contrats OpenAPI (risque de leak) | P1 |
| CR-8 | E2E migration list hardcodee et divergente entre 2 fichiers | P1 |
| CR-9 | Pas de test de structure de prompt (message ordering + boundary marker) | P1 |
| CR-10 | 10 "golden tests" identifies pour protection speciale (securite) | P1 |

### PM + Process -- Alignement produit-tests

| # | Finding | Severite |
|---|---------|----------|
| PM-1 | Pas de CODEOWNERS file | P0 |
| PM-2 | Pas de branch protection sur main | P0 |
| PM-3 | 10 features frontend shipped sans tests | P0 |
| PM-4 | Frontend coverage seuils negligeables (25/13) | P0 |
| PM-5 | AI tests manuels seulement | P1 |
| PM-6 | museum-web a 0 seuils de coverage | P1 |
| PM-7 | Multi-tenancy (B2B isolation) sans test dedie | P1 |
| PM-8 | Pas de test review process separe | P1 |
| PM-9 | Coverage ratchet manuelle (pas auto-computed) | P2 |
| PM-10 | Audit log immutability non testee | P2 |

### Tech Lead -- Architecture des tests

| # | Finding | Severite |
|---|---------|----------|
| TL-1 | E2E legacy manque 8 migrations recentes | P0 |
| TL-2 | Pas de E2E streaming SSE | P0 |
| TL-3 | Frontend coverage thresholds trop bas | P0 |
| TL-4 | 6/12 interfaces repository sans in-memory implementation | P1 |
| TL-5 | Pas de cross-validation frontend-backend contract | P1 |
| TL-6 | Output guardrail sans test unitaire dedie | P1 |
| TL-7 | Pas de CI detection suppression de tests | P1 |
| TL-8 | Pas de SQL injection regression test | P2 |
| TL-9 | Perf test pas dans le CI | P2 |
| TL-10 | Schema drift check absent du CI | P2 |

---

## Architecture de Verrous Anti-Regression Proposee

Le consensus des 4 equipes converge vers un systeme a **4 couches**:

### Couche 1: Governance (Semaine 1)
```
CODEOWNERS + Branch Protection + Test Change Label
```
- `.github/CODEOWNERS` protegeant auth/, guardrail/, contract/, CI/
- Branch protection: 1 review, status checks required, no force push
- GitHub Action: label `test-change` sur tout PR modifiant `*.test.ts`
- CI bot comment: "Ce PR modifie des tests. Reviewer: verifier qu'aucune assertion n'a ete affaiblie."

### Couche 2: Detection (Semaines 2-3)
```yaml
# CI step: test modification/deletion detection
- name: Flag test modifications
  run: |
    DELETED_TESTS=$(git diff --diff-filter=D --name-only origin/main...HEAD | grep -E '\.test\.(ts|tsx)$' || true)
    if [ -n "$DELETED_TESTS" ]; then
      echo "::error::BLOQUANT -- Fichiers test supprimes: $DELETED_TESTS"
      exit 1
    fi
    MODIFIED_TESTS=$(git diff --name-only origin/main...HEAD | grep -E '\.test\.(ts|tsx)$' || true)
    if [ -n "$MODIFIED_TESTS" ]; then
      echo "::warning::Tests modifies (review obligatoire): $MODIFIED_TESTS"
    fi
```
- Suppression de test = **build failure** (bloquant)
- Modification de test = **warning** + label automatique

### Couche 3: Mutation Testing (Mois 2)
```bash
pnpm add -D @stryker-mutator/core @stryker-mutator/jest-runner @stryker-mutator/typescript-checker
```
```json
{
  "mutate": [
    "src/modules/auth/core/**/*.ts",
    "src/modules/chat/application/guardrail*.ts",
    "src/modules/chat/application/session-access.ts",
    "src/shared/validation/**/*.ts"
  ],
  "thresholds": { "high": 80, "low": 60, "break": 50 }
}
```
- Nightly CI job
- Alerte si mutation score < 50% (break threshold)
- Cible: 80%+ pour auth + guardrail

### Couche 4: Intelligence (Trimestre)
- Test Impact Analysis (`--changedSince` + `--findRelatedTests`)
- Auto-ratcheting coverage (CI calcule le seuil precedent, bloque si baisse)
- Property-based testing (fast-check) pour sanitization, parsing, codecs
- Schema drift CI check (generer migration vide = preuve zero drift)

---

## Plan d'Action Prioritise

### CETTE SEMAINE (Tier 0)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | Creer `.github/CODEOWNERS` | 1h | Bloque modification tests securite sans review |
| 2 | Activer branch protection sur `main` | 30min | Empeche bypass CI |
| 3 | Remonter seuils coverage frontend a 40/20/35/40 | 30min | Detecte regressions FE |
| 4 | Ajouter test E2E streaming SSE | 4h | Couvre l'endpoint le plus critique |
| 5 | Ajouter test multi-tenancy isolation | 4h | Couvre regle B2B critique |

### CE SPRINT (Tier 1)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 6 | Tests `stream-buffer.ts` | 3h | Hot path du streaming |
| 7 | Tests `chatApi.ts` (frontend) | 1j | 18K de code pont FE-BE |
| 8 | Tests `chatSessionLogic.pure.ts` | 2h | Pure functions, facile |
| 9 | CI: detection suppression de tests | 2h | Verrou anti-weakening |
| 10 | CI: label `test-change` sur PRs | 2h | Visibilite |
| 11 | Consolider factories auth (DRY) | 2h | Elimine drift entites |
| 12 | Refactoriser `api.postgres.e2e.test.ts` vers harness | 3h | Schema complet |
| 13 | Nightly schedule pour AI tests | 30min | Detecte drift LLM |
| 14 | Tests 10 features FE manquantes (top 5) | 3j | SSE, biometric, dark mode, TTS, swipe |

### SPRINT SUIVANT (Tier 2)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 15 | Stryker mutation testing (auth + guardrail) | 2j | Vraie mesure qualite tests |
| 16 | Tests request-schema OpenAPI (pas seulement response) | 4h | Detecte drift input |
| 17 | Cross-validation contracts FE-BE | 4h | Aligne les deux cotes |
| 18 | Output guardrail test unitaire dedie | 3h | Isole du service |
| 19 | Guardrail evasion tests (Unicode, homoglyphs, base64) | 1j | Securite adversariale |
| 20 | In-memory repos manquants (6 interfaces) | 2j | Tests fideles aux vraies implem |
| 21 | SQL injection regression test | 3h | Defense en profondeur |
| 22 | `additionalProperties: false` sur contrats securite | 2h | Previent data leak |

### BACKLOG (Tier 3)

| # | Action | Effort |
|---|--------|--------|
| 23 | Property-based testing (fast-check) pour sanitization/parsing | 2j |
| 24 | Auto-ratcheting coverage (CI auto-compute) | 4h |
| 25 | Performance assertion tests (budgets p95) | 1j |
| 26 | Migration reversibility tests | 4h |
| 27 | Graceful shutdown test | 3h |
| 28 | Visual regression testing (Chromatic/Percy) | 2j |
| 29 | Mobile E2E (Maestro -> regression flows) | 3j |

---

## Golden Tests -- Ne Jamais Modifier Sans Approbation

Les 4 equipes s'accordent sur ces tests "sacres":

| Test | Protege | Raison |
|------|---------|--------|
| `jwt-pii-strip.test.ts` | JWT ne contient JAMAIS de PII | RGPD + securite |
| `security-fixes.test.ts` | Login oracle ne leak pas le type de compte | Securite |
| `require-role.test.ts` | RBAC ne leak pas les roles requis | Securite |
| `art-topic-guardrail.test.ts` | Guardrail input bloque insults/injection | AI Safety |
| `chat-service-orchestrator-errors.test.ts` | Guardrail output bloque leaks | AI Safety |
| `rbac.e2e.test.ts` | RBAC E2E enforcement | Securite |
| `openapi-response.contract.test.ts` | Contrat API stable | Compatibilite |
| `chat-service-ownership.test.ts` | Isolation sessions cross-user | Securite |
| `db-resilience.test.ts` | Pas de leak SQL dans les erreurs | Securite |
| `input-validation.test.ts` | XSS, zero-width, control chars bloques | Securite |

---

## Metriques Cibles

| Metrique | Actuel | Q2 2026 | Q3 2026 |
|----------|--------|---------|---------|
| Backend statement coverage | 72.86% | 75% | 80% |
| Backend branch coverage | 57.61% | 60% | 65% |
| Frontend statement coverage | ~25% | 40% | 50% |
| Frontend branch coverage | ~13% | 20% | 30% |
| Mutation score (auth + guardrail) | -- | 70% | 80% |
| Test-to-feature ratio (FE) | 47% | 70% | 85% |
| E2E suites | 4 | 6 | 8 |
| AI test cadence | Manuel | Nightly | Nightly + PR critical |

---

## Outils Recommandes

| Outil | Usage | Priorite |
|-------|-------|----------|
| **Stryker Mutator** | Mutation testing JS/TS | Q2 |
| **fast-check** | Property-based testing | Q2-Q3 |
| **MSW (Mock Service Worker)** | Tests HTTP frontend realistes | Q2 |
| **CODEOWNERS** | Protection fichiers critiques | Immediat |
| **GitHub Branch Protection** | Gate obligatoire | Immediat |

---

## Sources (references web des 4 equipes)

- Stryker Mutator: https://stryker-mutator.io/
- Goldbergyoni JS Testing Best Practices: https://github.com/goldbergyoni/javascript-testing-best-practices
- Google DORA 2025 AI-Assisted Development Report
- Codecov -- Mutation Testing as quality metric
- SonarSource -- Quality Gates
- InfoQ -- Pipeline Quality Gates
- Testomat.io -- Protected Tests concept
- BrowserStack / Harness -- Regression Testing in CI/CD
- Modern Test Pyramid Guide 2025 (FullScale, Devzery)

---

> **Rapports individuels complets disponibles dans:**
> - `docs/QA_AUDIT_REPORT.md` (QA Specialists)
> - `docs/TEST_ARCHITECTURE_AUDIT.md` (Tech Lead)
> - `docs/V1_Sprint/PRODUCT_TEST_AUDIT_2026-04-01.md` (PM + Process)
> - Code Review: rapport inline (pas de fichier separe)
