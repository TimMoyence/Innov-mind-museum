# NL-1.3 — P10 Art Keywords R15 Closure Report

**Date** : 2026-04-17
**Sprint** : NL-1 Phase 2 Closure
**Effort réel** : ~30min (vs 5j plan original, largement done en amont)

## Scope

Vérifier la complétude de la feature R15 Art Keywords (mini-LLM classifier + dynamic keywords + offline sync) contre l'inventaire de la mémoire `project_smart_art_keywords_wip.md` (22 jours).

## Reality check vs mémoire

### Backend — tous les fichiers présents, architecture évoluée

| Mémoire (checkpoint) | Réalité 2026-04-17 |
|---|---|
| `src/modules/chat/domain/artKeyword.entity.ts` | ✓ présent |
| `src/modules/chat/domain/artKeyword.repository.interface.ts` | ✓ présent |
| `src/modules/chat/infrastructure/artKeyword.repository.typeorm.ts` | ✓ **déplacé** vers `adapters/secondary/` (hexagonal strict) |
| `src/modules/chat/application/art-topic-classifier.ts` | ✓ **déplacé** vers `useCase/art-topic-classifier.ts` |
| Migration `1774543058554-CreateArtKeywordsTable.ts` | ✓ **évolué** : 2 migrations `1775100000000-CreateArtKeywordsTable.ts` + `1775400000000-AddArtKeywordCategoryAndUpdatedAt.ts` |
| `@anthropic-ai/sdk` installé + Haiku classifier | **Refactoré** : utilise OpenAI `gpt-4o-mini` / Google `gemini-2.0-flash-lite` / Deepseek `deepseek-chat` (cheapest available), fail-open sans modèle configuré |

### Frontend — migration vers module dédié

| Mémoire (checkpoint) | Réalité 2026-04-17 |
|---|---|
| `features/chat/infrastructure/artKeywordsStore.ts` | **Déplacé** vers `features/art-keywords/infrastructure/artKeywordsStore.ts` (propre module hexagonal) |
| `features/chat/application/useKeywordsSync.ts` | **Renommé** `useArtKeywordsSync.ts` dans `features/art-keywords/application/` |
| `features/chat/infrastructure/chatApi.ts` | Endpoints extraits vers `features/art-keywords/infrastructure/artKeywordsApi.ts` |
| `app/_layout.tsx` mount `useKeywordsSync()` | ✓ mounted (via `useArtKeywordsSync`) |

Ajout non-mémorisé : `features/art-keywords/application/useArtKeywordsClassifier.ts` (classification front côté client via store) + `domain/contracts.ts` (types OpenAPI-sourced).

### Tests

| Suite | Count | Status |
|---|---|---|
| BE `art-topic-classifier.test.ts` | 79 tests total avec | ✓ |
| BE `art-topic-guardrail.test.ts` | les 3 suites | ✓ |
| BE `artKeyword.repository.test.ts` | | ✓ |
| FE `artKeywordsApi.test.ts` | | ✓ |
| FE `artKeywordsStore.test.ts` | | ✓ |
| FE `useArtKeywordsSync.test.ts` | | ✓ |

Aucun test échoué. 79 tests BE spécifiques + tests FE dédiés verts.

## Architecture finale

### Backend
```
modules/chat/
├── domain/
│   ├── artKeyword.entity.ts           # TypeORM entity
│   └── artKeyword.repository.interface.ts   # Port
├── useCase/
│   └── art-topic-classifier.ts        # LLM wrapper (fail-open)
└── adapters/secondary/
    └── artKeyword.repository.typeorm.ts    # PG adapter
```

### Frontend
```
features/art-keywords/
├── application/
│   ├── useArtKeywordsClassifier.ts    # NFD-normalized token matching
│   └── useArtKeywordsSync.ts          # 24h background sync
├── domain/
│   └── contracts.ts                   # OpenAPI-typed DTOs
└── infrastructure/
    ├── artKeywordsApi.ts              # HTTP client
    └── artKeywordsStore.ts            # Zustand + persist
```

### Data flow
```
user message
  ↓
[Frontend] useArtKeywordsClassifier (cheap local check)
  ↓ preClassified: 'art' (if match)
[Backend] chat.service.postMessage
  ↓
[Backend] art-topic-guardrail (keyword + LLM fallback via ArtTopicClassifier)
  ↓
LLM orchestrator
```

## Pourquoi la mémoire est obsolète

3 raisons :
1. **Haiku/Anthropic SDK abandonné** — refactor vers les 3 providers existants (OpenAI/Google/Deepseek), élimine dépendance tiers, réutilise les clés API déjà en place
2. **Modules déplacés** — hexagonal strict respecté : `adapters/secondary/` pour les PG impls, `useCase/` pour les services applicatifs
3. **Frontend extrait du `chat/` vers son propre module** — `features/art-keywords/` reflète la responsabilité isolée (offline sync + classification pure) — fait entre mars et avril

## Action mémoire

La mémoire `project_smart_art_keywords_wip.md` est caduque (title "COMPLETED" mais inventaire obsolète). À supprimer après cette session pour éviter confusion future.

## Métriques

| Mesure | Status |
|---|---|
| BE fichiers R15 | ✓ 4 fichiers + 2 migrations |
| FE fichiers R15 | ✓ 5 fichiers dans module dédié |
| Tests BE | 79 passants (3 suites) |
| Tests FE | 3 suites passantes |
| Hexagonal compliance | ✓ strict (domain + useCase + adapters séparés) |
| Coverage | OK dans le périmètre (BE global 91.45% maintenu) |

## Done When ✅

- [x] Structure hexagonale vérifiée end-to-end
- [x] Tests BE (79) passent
- [x] Tests FE passent
- [x] Classifier LLM opérationnel (fail-open safe)
- [x] Sync 24h wired dans app/_layout.tsx
- [x] Discrepancy mémoire vs code documentée
- [x] Rapport de clôture produit

**Plan P10 CLOSED — no action required.**
