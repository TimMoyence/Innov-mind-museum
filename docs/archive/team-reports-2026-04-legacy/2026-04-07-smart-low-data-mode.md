# Smart Low-Data Mode — Team Report

**Date** : 2026-04-07
**Pipeline** : Enterprise
**Mode** : Feature
**Verdict** : PASS

---

## Executive Summary

**Score global : 9/10**

Feature fullstack livrée en un seul run : cache LLM partagé Redis (backend) + cache local Zustand (frontend) + pré-fetch contextuel par musée + dégradation gracieuse auto-détectée + adaptive prompts. 20 commits atomiques, 82 nouveaux tests, 0 régressions.

---

## Métriques

| Métrique | Valeur |
|----------|--------|
| Commits | 20 |
| Fichiers modifiés | ~40 |
| Lignes changées | ~3600 |
| Tests ajoutés | +82 (43 backend + 39 frontend) |
| Tests total backend | 2374 (baseline 2331) |
| Tests total frontend | 1091 (baseline 1052) |
| Agents spawned | 10 |
| Boucles correctives | 1 (EP-001: CacheService mocks, EP-002: ESLint complexity) |
| tsc errors | 0 backend, 0 frontend |
| ESLint errors | 0 |
| Durée | ~45 min d'exécution effective |

---

## Composants livrés

### Backend (12 commits)

| Composant | Fichiers | Description |
|-----------|----------|-------------|
| CacheService extension | 3 MOD | `zadd`/`ztop` pour sorted sets Redis |
| Cache key utility | 1 NEW + 1 fixture | Hash déterministe `sha256(text\|locale\|guideLevel\|audioMode)` |
| CachingChatOrchestrator | 1 NEW + 1 TEST | Decorator transparent sur ChatOrchestrator, 16 tests |
| Env config | 1 MOD | `llmTtlSeconds`, `llmPopularityTtlSeconds`, `lowDataPackMaxEntries` |
| ChatModule wiring | 1 MOD | Wrap conditionnel quand `cache` est fourni |
| X-Data-Mode header | 4 MOD | Parse header, propagation, adaptive prompts (max 150 tokens) |
| MuseumQaSeed entity | 1 NEW + migration | Table `museum_qa_seed` pour FAQ seedées |
| LowDataPackService | 4 NEW + 1 TEST | Endpoint `GET /museums/:id/low-data-pack` |
| Admin purge route | 1 NEW | `POST /admin/museums/:id/cache/purge` avec audit log |
| Feedback invalidation | 1 MOD | Le 👎 invalide la clé cache correspondante |
| KnowledgeBase Redis | 1 MOD + 1 TEST | Migration Map in-memory → Redis (`kb:wikidata:` prefix) |

### Frontend (8 commits)

| Composant | Fichiers | Description |
|-----------|----------|-------------|
| computeLocalCacheKey | 1 NEW + 1 TEST | Parité hash avec backend (10 tests) |
| DataModeProvider | 2 NEW + 1 TEST | Context NetInfo auto-detect + toggle utilisateur (13 tests) |
| chatLocalCache | 1 NEW + 1 TEST | Zustand persist, 200 max, TTL 7j, LRU eviction (12 tests) |
| lowDataPackApi | 1 NEW | API function pour pré-fetch |
| useMuseumPrefetch | 1 NEW + 1 TEST | Hook avec cooldown 6h, wifi-only en low-data |
| useChatSession | 1 MOD + 1 TEST | Cache-first logic + X-Data-Mode header |
| Settings UI | 1 NEW + 8 locale files | DataModeSettingsSection (Auto/Économie/Désactivée) en 8 langues |
| Chat UI | 2 MOD | Badge "réponse cachée" + banner low-data |

---

## Erreurs et corrections

| ID | Type | Description | Résolution |
|----|------|-------------|------------|
| EP-001 | type-mismatch | CacheService mocks sans zadd/ztop cassent 7 suites | Fix agent dédié : 4 fichiers corrigés |
| EP-002 | lint-violation | Complexity > 15 dans setMessageFeedback | Extraction `invalidateCacheForFeedback()` |

---

## Décisions architecturales

1. **Decorator pattern** sur `ChatOrchestrator` (pas middleware, pas inline) — hexagonal pur
2. **Pas d'expo-sqlite** — AsyncStorage + Zustand persist suffit pour 200 entrées (~500KB)
3. **Hash parity via fixture JSON** — contract test CI gate backend↔frontend
4. **PII gate** : `piiSanitizer.sanitize().detectedPiiCount` (pas `containsPii()` qui n'existe pas)
5. **museumId** ajouté directement sur `OrchestratorInput` (pas d'extraction depuis visitContext)
6. **Fail-open partout** : aucune erreur cache ne bloque l'app

---

## Recommandations prochain run

1. **Seeder les FAQ musée** — la table `museum_qa_seed` est vide, ajouter 5-10 Q&A par musée via SQL
2. **OpenAPI spec** — ajouter les nouvelles routes au spec OpenAPI et régénérer les types frontend
3. **Monitoring** — créer un dashboard Sentry/Grafana pour le cache hit rate par musée
4. **E2E** — ajouter un scénario Maestro pour le flow cache-first (settings → musée → chat → badge)
5. **Cache stampede** — si la concurrence augmente, ajouter un `setNx` lock dans CachingChatOrchestrator
