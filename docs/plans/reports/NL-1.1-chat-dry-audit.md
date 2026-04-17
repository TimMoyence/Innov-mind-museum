# NL-1.1 — P08 Mobile Chat DRY Audit Report

**Date** : 2026-04-17
**Sprint** : NL-1 Phase 2 Closure
**Effort réel** : ~1h

## Scope

Audit DRY de `useChatSession` et ses 3 sub-hooks (`useSessionLoader`, `useStreamingState`, `useOfflineSync`) pour traquer duplication résiduelle dans l'esprit de P04 (buildOrchestratorInput + commitResponse).

## Findings — 4 duplications réelles

### 1. `buildOptimisticMessage` défini mais non utilisé en production

Le helper pur existait dans `chatSessionLogic.pure.ts` (lignes 143-155) avec tests dédiés, mais les 3 call-sites de création de message optimiste dans `useChatSession.ts` dupliquaient la logique inline :
- Ligne 113-127 : cached assistant case (user msg inline)
- Ligne 136-142 : offline queued case (avec bug potentiel sur empty text + imageUri)
- Ligne 149-160 : offline regular case (même bug)
- Ligne 162-174 : optimistic regular case (gère audio en plus)

### 2. `mapApiMessageToUiMessage` défini mais non utilisé en production

Le helper pur existait aussi, mais `useSessionLoader.ts` (lignes 41-50) et `useOfflineSync.ts` (lignes 66-75) dupliquaient le mapping inline avec eslint-disable.

### 3. `locationString` calculé 3×

Même formule GPS `lat:X,lng:Y` :
- Ligne 68-71 (top du hook, pour useOfflineSync)
- Ligne 191-194 (payload audio)
- Ligne 257-260 (payload text/image)

### 4. Increment + review threshold check dupliqué 2×

```ts
successfulSendsRef.current += 1;
if (successfulSendsRef.current === 3) {
  void incrementCompletedSessions();
}
```
Présent lignes 224-227 (audio path) et 341-344 (streaming path).

## Fix

### chatSessionLogic.pure.ts — 3 nouveaux helpers

1. **`buildOptimisticMessage` étendu** vers options object
   - Nouveaux params : `hasAudio?: boolean`, `id?: string`
   - Fix bug : utilise `||` au lieu de `??` pour fallback empty→label (pre: whitespace trimmé passait, post: toujours remplacé par '[Image sent]' / '[Voice message]')
2. **`bumpSuccessfulSend(ref, threshold=3)`** — mutation + trigger atomique, retourne true exactement une fois au franchissement
3. **`formatLocation(lat, lng)`** — formatter GPS pur, retourne undefined si coord manquante
4. **`ApiMessage.text`** : `string` → `string | null` — aligné sur runtime OpenAPI (fix typecheck secondaire de la migration)

### useChatSession.ts

- 3 optimistic message creations → `buildOptimisticMessage({...})`
- 2 inline location computations → `locationString` mémoïsé via `useMemo([latitude, longitude])`
- 2 increment blocks → `if (bumpSuccessfulSend(ref)) { ... }`
- Deps useCallback : `latitude, longitude` → `locationString` (stable via useMemo)

### useOfflineSync.ts & useSessionLoader.ts

- Mapping inline → `response.messages.map(mapApiMessageToUiMessage)`
- Supprime 2 eslint-disable no-unnecessary-condition

## Métriques

| Mesure | Avant | Après | Delta |
|---|---|---|---|
| Tests node | 277 | 291 | +14 |
| Tests jest | 1120 | 1120 | 0 (non affectés) |
| Lint errors | 0 | 0 | 0 |
| Lint warnings | 20 | 20 | 0 |
| Lines code production (5 fichiers) | ~700 | ~663 | -37 |
| Lines tests | ~440 | ~530 | +90 (couverture nouveaux helpers) |

## Bug fixes collatéraux

1. **Offline + image only → `text: ''`** (pre-fix: trimmedText `??` fallback retournait `''` car `??` n'intervient pas sur empty string). Post-fix: helper utilise `||` pour retourner `[Image sent]`.
2. **TypeScript `text: string | null`** aligné sur OpenAPI runtime (pre-fix: cast implicite).

## Pourquoi PAS splitter davantage

Comme démontré session 2026-04-17, `useChatSession` est déjà une facade composant 3 sub-hooks + 1 pure module. Splitter davantage violerait UFR-004 (no code piling). Les 442 → 414 lignes reflètent la responsabilité légitime d'orchestration multi-modalité (text/image/audio + offline + cache low-data + guardrail pré-classif + streaming + retry).

## Done When ✅

- [x] Audit terminé + rapport écrit
- [x] DRY réel extrait dans pure module
- [x] Tests ajoutés (+14)
- [x] Lint 0 error
- [x] Aucune régression (1120 jest, 291 node)
