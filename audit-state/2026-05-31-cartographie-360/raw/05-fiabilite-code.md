# Audit Fiabilité & Qualité du Code — Musaium (2026-05-31)

Dimension : résilience, gestion d'erreurs, architecture hexagonale, dette technique, qualité frontend.
Échantillon : ~20 fichiers source critiques (backend + frontend). Toutes les affirmations vérifiées par `Read`/`Grep` (UFR-013).

## 1. Architecture hexagonale — la séparation tient

La discipline de couches est **réelle, pas cosmétique** :

- **Zéro fuite domain→adapters.** `grep "import.*adapters"` dans tous les `modules/*/domain/` ne retourne aucune ligne d'import effectif (les matches du grep large étaient des occurrences du mot « adapters » dans des commentaires de ports, ex. `chat/domain/ports/guardrail-provider.port.ts`). Le domaine reste pur.
- **Zéro import relatif 4-niveaux** (`from '../../../../'`) dans `museum-backend/src` — le codemod alias `@modules/@shared/@data` du 2026-05-05 est respecté à 100 %.
- Le pattern port/adapter est propre : `RedisAccessTokenDenylist` (`redis-access-token-denylist.ts:44`) implémente `IAccessTokenDenylist` ; l'adapter BullMQ reçoit `ConnectionOptions` injectées par le composition-root (`bullmq-museum-enrichment-queue.adapter.ts:25`) plutôt que d'instancier sa propre connexion.

## 2. Gestion d'erreurs — centralisée et robuste

`AppError` (`shared/errors/app.error.ts:1`) est la source unique, avec sous-classes (`ValidationError`) et factories (`badRequest`/`notFound`/`conflict`). 62 fichiers backend l'utilisent.

Le middleware `error.middleware.ts` est de **qualité production** :
- `isAppErrorLike` (ligne 23) est **duck-typé** délibérément : `instanceof AppError` casse sous `jest.resetModules()` (deux identités de classe coexistent) → dégraderait en 500. Le commentaire documente le piège réel.
- Mapping Multer → 413/400 selon sémantique taille-vs-forme (ligne 38-72, cf. TD-MUL-02).
- Logging scopé : `logAuth4xx` (ligne 108) évite de flooder les logs avec chaque mauvais mot de passe ; `logServerError` capture Sentry + structured log.
- Header propagation (`Retry-After` sur 429) via `applyResponseHeaders`.

**Spans try/finally (gotcha phase-span-dual-path)** : confirmé respecté. `llm-guard.adapter.ts:303-311` émet `llmGuardScanDurationSeconds.observe` + `emitScanEvent` dans un `finally`, donc sur succès ET échec, avec un commentaire explicite : la télémétrie est émise *hors* du calcul du verdict pour qu'un throw Langfuse ne puisse jamais inverser le verdict fail-CLOSED.

## 3. Fail-open vs fail-closed — cohérents et intentionnels

La dichotomie est **doctrinalement correcte** :
- **Fail-OPEN** là où la couche est défense-en-profondeur : denylist token access (`redis-access-token-denylist.ts:82-85`, `has()` retourne `false` sur panne Redis car JWT exp + refresh rotation restent la barrière primaire). Justifié spec §R9/D9. Warn rate-limité 1/min (token bucket in-memory) pour éviter le flood en reconnect storm.
- **Fail-CLOSED** là où la sécurité ne peut être déterminée : LLM Guard sidecar (`llm-guard.adapter.ts`) — non-200 (ligne 384), `is_valid` malformé (ligne 389), timeout/abort (ligne 397), overflow sémaphore (ligne 271), breaker OPEN (ligne 256) → tous retournent `failClosed('error')`. ADR-047.

## 4. Résilience — circuit breaker, sémaphore, retry, hash-chain

- **Circuit breaker 3-états** (`guardrail-circuit-breaker.ts`) extrait en FSM réutilisable (`ThreeStateCircuit` + `SlidingWindowFailureStrategy`), avec `halfOpenMaxProbes` pour éviter le hammering concurrent en HALF_OPEN, parsing défensif des env (`parsePositiveNumber` ligne 42 : NaN/≤0/non-finite → fallback), logs préservés byte-identiques pour les requêtes Loki opérateur.
- **Sémaphore inflight** + **chaos injection** (rate ∈[0,1]) qui exerce le *même* chemin fail-CLOSED que les pannes réelles (pas une branche parallèle) — bonne pratique de test de résilience.
- **Retry optimistic-lock** (`shared/db/optimistic-lock-retry.ts`) : backoff exponentiel jitté, refetch entre tentatives, rethrow non-optimistic immédiat, 409 après épuisement. Propre.
- **Hash-chain audit** (`audit.repository.pg.ts`) : `pg_advisory_xact_lock` transaction-scoped sérialise les appends (PgBouncer txn-mode compatible). INSERT-only, DSAR read-only n'altère pas la chaîne. Limite throughput 50-200/s honnêtement documentée + ADR-054 Merkle batch planifié 100k MAU.
- **Open handles BullMQ/ioredis** : `index.ts:83-84` (`maxRetriesPerRequest: null`, `enableOfflineQueue: false` pour la connexion BullMQ) et `:109` (`maxRetriesPerRequest: 1` cache). Les adapters BullMQ exposent `close()` (`bullmq-museum-enrichment-queue.adapter.ts:74`). Le gotcha Stryker `EXTRACTION_WORKER_ENABLED=false` est géré au niveau test-env, pas en patchant le code prod.

## 5. Dette technique — tracée honnêtement

`docs/TECH_DEBT.md` (1504 lignes) impose une **convention vérifiable** : « Une dette doit être prouvable par le code : si le grep ne retourne rien, on retire l'entrée. » Items avec ID/référence-code/sprint/effort/statut. Section « Bumps recommandés » classée SECURITY/ROUTINE/LOCKED avec CVE citées. C'est de la dette suivie sérieusement, pas un dépotoir.

Marqueurs dans le code :
- **TODO/FIXME** : 1 backend, 3 frontend. Quasi-inexistants.
- **`as any`** : **0** dans `museum-backend/src`, 1 dans le frontend. Excellent.
- **`@ts-ignore`/`@ts-expect-error`** : **0** dans les deux apps.
- **eslint-disable** : 128 backend / 58 frontend. **125/128 backend portent une justification** (`-- reason`), conforme à LINT_DISCIPLINE.

## 6. Frontend — hooks, RTL, offline

- **Closure-cell cancellation** (`useSessionLoader.ts:40-103`) : implémentation manuelle du contrat TD-REACT-01 — `tick` capturé par invocation, flip `cancelled=true` au cleanup/changement sessionId, gardé devant chaque setState post-await. Sentry + hydratation cache restent inconditionnels (correct). Référence du pattern récurrent B1/B2/B6.
- **State-machine react key** : présent dans `BottomSheetRouter.tsx` (gotcha key-remount).
- **RTL** : **0 violation** `marginLeft/Right`/`paddingLeft/Right` sous `features/` ; suite de tests dédiée (`__tests__/rtl/` : audit + chat/discover/home/Composer).
- **Offline** : pile complète — `useOfflineQueue`, `offlineQueue`, `useOfflineSync`, `OfflineBanner`, `DataModeProvider`.

## Verdict

Code applicatif de **maturité élevée pour un solo dev assisté-IA**. Architecture hexagonale étanche, gestion d'erreurs centralisée et défensive, résilience pensée (CB/sémaphore/chaos/retry/hash-chain), fail-open/closed cohérents et documentés, dette honnêtement tracée et minuscule (0 `as any` BE, 0 `@ts-ignore`). Les rares faiblesses sont opérationnelles (densité eslint-disable backend, complexité accumulée dans le pipeline guardrails) plutôt que structurelles.
