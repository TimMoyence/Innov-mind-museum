# PLAN 04 — Backend Chat Slim Down

**Phase** : 2 (Refactor Structurel)
**Effort** : 4-5 jours
**Pipeline /team** : enterprise
**Prérequis** : P03 (cartographie fraîche), P05 (tests shared/ OK avant touch)
**Débloque** : performance et maintenabilité long terme du module chat

## Context

L'audit backend a classé le module `chat/` comme excellent au niveau hexagonal, mais **3 fichiers dépassent les seuils de lisibilité** :

| Fichier | LOC | Seuil | Problème |
|---|---|---|---|
| `chat/useCase/chat-message.service.ts` | 457 | 300 | Orchestration + validation + persistence mélangées |
| `chat/adapters/secondary/langchain.orchestrator.ts` | 500 | 300 | Circuit-breaker + prompt building + orchestration |
| `chat/adapters/secondary/llm-section-runner.ts` | 365 | 300 | Section runner + retry + metrics |

**Objectif** : -50% LOC sur le top 3 via séparation des responsabilités. Cible cumulée : 1322 → ~630 LOC (-52%).

**Contrainte** : `chat.service.ts` (facade publique) ne change pas de signature — aucun breaking change côté HTTP routes ni tests e2e.

## Actions

### 1. Cartographier les dépendances avant split

Via gitnexus-impact-analysis :
```
Quelles fonctions appellent chat-message.service.ts ?
Quelles fonctions sont appelées par chat-message.service.ts ?
Mêmes questions pour langchain.orchestrator.ts et llm-section-runner.ts
```

Documenter dans `docs/plans/reports/P04-impact-map.md`.

### 2. Split `chat-message.service.ts` (457 → ~450 répartis sur 3 fichiers)

Responsabilités détectées :
- **Préparation** : load session, validate input, fetch history, build context
- **Guardrail** : keyword check input, sanitize, decide block/allow
- **Commit** : persist messages, emit analytics, trigger background jobs

Découpage cible :
```
chat/useCase/
├── chat-message.service.ts          # Facade (150L) — orchestration haut niveau
├── message-preparation.service.ts   # NEW (150L) — load session, history, context
├── message-guardrail.service.ts     # NEW (100L) — input guardrail + sanitization
└── message-commit.service.ts        # NEW (150L) — persistence + analytics + jobs
```

Convention :
- Chaque sub-service accepte ses ports en constructor injection
- `chat-message.service.ts` compose les 3 sub-services
- Tests existants (in-memory) continuent de passer

### 3. Split `langchain.orchestrator.ts` (500 → ~460 répartis)

Responsabilités :
- **Circuit breaker** : state machine OPEN/HALF/CLOSED, failure counting
- **Prompt builder** : assembler system prompts + history + user message
- **Orchestration** : sequentiel des sections, retry, timeout

Découpage cible :
```
chat/adapters/secondary/langchain/
├── langchain.orchestrator.ts        # Facade (280L) — orchestration sections
├── circuit-breaker.ts               # NEW (100L) — state machine
└── prompt-builder.ts                # NEW (80L) — assemblage messages
```

Attention : `prompt-builder.ts` DOIT respecter l'ordre `[SystemMessage(system), SystemMessage(section), ...history, HumanMessage(user)]` (cf. CLAUDE.md — AI Safety).

### 4. Split `llm-section-runner.ts` (365 → ~200)

Responsabilités :
- **Runner core** : exécution d'une section
- **Retry logic** : exponential backoff, jitter
- **Metrics emission** : OpenTelemetry spans, timing

Découpage cible :
```
chat/adapters/secondary/langchain/
├── llm-section-runner.ts            # (200L) — section execution only
├── llm-retry.strategy.ts            # NEW (80L) — backoff + jitter
└── llm-metrics.emitter.ts           # NEW (80L) — OTel spans
```

Note : jitter = `sonarjs/pseudo-random` OK (cf. CLAUDE.md ESLint exceptions).

### 5. Préserver coverage

Chaque split respecte la règle DRY factories (cf. `feedback_dry_test_factories.md`) :
- Nouveaux services testés via `tests/helpers/chat/` existants
- Pas de nouveau mock repo — réutiliser `buildChatTestService()` depuis `tests/helpers/chat/chatTestApp.ts`

### 6. Contrat préservé

`chat.service.ts` (facade) conserve sa signature publique. Toutes les HTTP routes + e2e tests passent sans modification.

Check :
```bash
cd museum-backend
pnpm test -- --testPathPattern=chat
pnpm test:e2e -- --testPathPattern=chat
pnpm test:contract:openapi
```

### 7. Git workflow recommandé

1 commit par split file :
```
refactor(chat): extract message-preparation service
refactor(chat): extract message-guardrail service
refactor(chat): extract message-commit service
refactor(chat): thin chat-message.service as orchestrator facade
refactor(langchain): extract circuit-breaker
refactor(langchain): extract prompt-builder
refactor(langchain): slim langchain.orchestrator
refactor(langchain): split llm-section-runner retry/metrics
```

## Verification

```bash
cd museum-backend

# Taille des fichiers après refactor
wc -l src/modules/chat/useCase/chat-message.service.ts
wc -l src/modules/chat/useCase/message-preparation.service.ts
wc -l src/modules/chat/useCase/message-guardrail.service.ts
wc -l src/modules/chat/useCase/message-commit.service.ts
# attendu: 150 / 150 / 100 / 150

wc -l src/modules/chat/adapters/secondary/langchain/langchain.orchestrator.ts
wc -l src/modules/chat/adapters/secondary/langchain/circuit-breaker.ts
wc -l src/modules/chat/adapters/secondary/langchain/prompt-builder.ts
# attendu: 280 / 100 / 80

wc -l src/modules/chat/adapters/secondary/langchain/llm-section-runner.ts
wc -l src/modules/chat/adapters/secondary/langchain/llm-retry.strategy.ts
wc -l src/modules/chat/adapters/secondary/langchain/llm-metrics.emitter.ts
# attendu: 200 / 80 / 80

# Tests verts
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:contract:openapi

# AI Safety préservée
grep -r "END OF SYSTEM INSTRUCTIONS" src/modules/chat/
grep -r "sanitizePromptInput" src/modules/chat/
# attendu: présences inchangées

# GitNexus impact post-refactor
gitnexus analyze --incremental
# Vérifier impact risk level sur chat/ : doit rester ≤ 2
```

## Fichiers Critiques

### À splitter
- `museum-backend/src/modules/chat/useCase/chat-message.service.ts`
- `museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts`
- `museum-backend/src/modules/chat/adapters/secondary/llm-section-runner.ts`

### À créer
- `museum-backend/src/modules/chat/useCase/message-preparation.service.ts`
- `museum-backend/src/modules/chat/useCase/message-guardrail.service.ts`
- `museum-backend/src/modules/chat/useCase/message-commit.service.ts`
- `museum-backend/src/modules/chat/adapters/secondary/langchain/circuit-breaker.ts`
- `museum-backend/src/modules/chat/adapters/secondary/langchain/prompt-builder.ts`
- `museum-backend/src/modules/chat/adapters/secondary/langchain/llm-retry.strategy.ts`
- `museum-backend/src/modules/chat/adapters/secondary/langchain/llm-metrics.emitter.ts`

### À préserver (contrat public)
- `museum-backend/src/modules/chat/useCase/chat.service.ts` (facade)
- `museum-backend/src/modules/chat/http/chat.route.ts` (HTTP unchanged)
- `museum-backend/src/modules/chat/chat-module.ts` (composition root — adapter wiring)

### À réutiliser (pas recréer)
- `tests/helpers/chat/chatTestApp.ts` → `buildChatTestService()`
- `tests/helpers/chat/message.fixtures.ts` → `makeMessage()`, `makeSession()`
- `modules/chat/domain/art-topic-guardrail.ts` (guardrail logic, ne pas dupliquer)

## Risques

- **Haut** : régression fonctionnelle sur chat pipeline si tests coverage insuffisant. Mitigation : P05 DOIT passer avant P04.
- **Moyen** : changement ordre des messages LLM → AI Safety cassée. Mitigation : lint rule custom OU test explicite sur ordre (ajouter un `expect` dans le test existant).
- **Moyen** : GitNexus impact risk level peut grimper temporairement pendant le split. Acceptable si ≤ 2 après rebase final.

## Done When

- [ ] 3 fichiers obèses splittés en 10 fichiers ciblés
- [ ] Taille totale ≤ 650 LOC (était 1322)
- [ ] Tous tests verts (unit + e2e + contract)
- [ ] AI Safety invariants préservés (grep checks)
- [ ] GitNexus re-indexé, impact risk ≤ 2
- [ ] 8 commits atomiques avec message refactor(...)
- [ ] `chat.service.ts` facade unchanged (public API stable)
