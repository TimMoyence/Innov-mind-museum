# Tech Debt — Musaium

> **Source de vérité unique** pour les dettes techniques identifiées et non encore résolues.
> Mise à jour à chaque sprint via `/team` skill.
> Items résolus → cocher `[x]` et garder 1 sprint avant de purger.
> **Différent des roadmaps** : la roadmap décrit les features à shipper, ce fichier décrit les compromis pris qui devront être nettoyés.

---

## Convention

Chaque ligne décrit une dette avec :

- **ID** unique (`TD-<num>`).
- **Description** courte de la dette.
- **Référence code** : chemin + ligne où la dette est visible (commentaire `TODO`, structure provisoire, etc.).
- **Sprint d'origine** : quand on a accepté la dette.
- **Effort estimé** : ordre de grandeur pour fermer.
- **Statut** : `[ ]` ouvert, `[x]` fermé.

Une dette doit être **prouvable par le code** : si le grep ne retourne rien, on retire l'entrée.

---

## Tech debts ouverts

### TD-1 — `userProfileApi.ts` utilise `httpRequest` raw au lieu de `openApiRequest`

- [ ] **Statut** : ouvert (vérifié 2026-05-07)
- **Référence code** :
  ```
  museum-frontend/features/settings/infrastructure/userProfileApi.ts:1
    import { httpRequest } from '@/shared/api/httpRequest';
  museum-frontend/features/settings/infrastructure/userProfileApi.ts:15-19
    /**
     * **TODO(openapi-regen):** migrate from raw `httpRequest` to `openApiRequest`
     * museum/daily-art/lowDataPack using raw httpRequest — this file joins that
     * pattern and should be migrated together when OpenAPI is regenerated.
     */
  ```
- **Sprint d'origine** : 2026-04-15 (Sprint F migration vers `openApiRequest`).
- **Pourquoi pas fait dans le sprint d'origine** : l'endpoint PATCH n'était pas dans la spec OpenAPI générée à ce moment-là.
- **Effort estimé** : 1 heure (regen OpenAPI types côté FE + remplacer 1 call site + tests).
- **Comment fermer** :
  1. `cd museum-frontend && npm run generate:openapi-types`
  2. Vérifier que le PATCH endpoint apparaît dans `shared/api/generated/openapi.ts`.
  3. Remplacer `httpRequest` par `openApiRequest` dans `userProfileApi.ts`.
  4. Mettre à jour les tests `userProfileApi.test.ts`.
  5. Cocher TD-1 ici.

---

### TD-2 — `bootstrapProfile()` cross-device hydration manquante

- [ ] **Statut** : ouvert (vérifié 2026-05-07, `grep bootstrapProfile museum-frontend/` → aucun résultat).
- **Référence code** :
  ```
  museum-frontend/features/settings/infrastructure/userProfileStore.ts (JSDoc top)
    "Future refactor should introduce a unified bootstrapProfile()
     call hydrating all local-first stores from /me."
  ```
- **Symptôme** : un user qui change ses préférences sur l'app mobile A et ouvre l'app mobile B (autre device, même compte) ne voit pas ses préférences. Stores affectés : `userProfileStore`, `runtimeSettingsStore`, `dataModeStore`, store audio description.
- **Sprint d'origine** : 2026-04-15.
- **Effort estimé** : 1 jour (créer `shared/infrastructure/bootstrapProfile.ts` qui hydrate les 4 stores depuis `/auth/me`, hooker dans `app/_layout.tsx` après login, gérer le merge avec valeurs locales).
- **Comment fermer** :
  1. Créer `shared/infrastructure/bootstrapProfile.ts` exposant `bootstrapProfile(userId): Promise<void>`.
  2. Appeler depuis le hook `useMe` (ou équivalent) au boot post-login.
  3. Tests : 4 stores doivent être hydratés depuis `/me` sans écraser les changements locaux pending.
  4. Cocher TD-2 ici.

---

### TD-3 — MapLibre `OFFLINE_STYLE_URL` pointe vers demotiles au lieu d'un self-hosted CartoDB

- [ ] **Statut** : ouvert (vérifié 2026-05-07).
- **Référence code** :
  ```ts
  // museum-frontend/features/museum/infrastructure/mapStyleUrl.ts:6-11
  /**
   * MapLibre's OfflineManager requires a hosted style JSON URL — it downloads
   * the style, walks its sources and caches tiles inside the requested bbox.
   * Our runtime `buildOsmRasterStyle` is an inline style object that is not
   * reachable by URL, so for the offline pack download we reference the
   * MapLibre demotiles style which is API-key-free and close enough to our
   * raster flow (vector sources but same OSM geography). A follow-up ticket
   * will replace this with a self-hosted style that mirrors the exact CartoDB
   * raster layers rendered online.
   */
  export const OFFLINE_STYLE_URL = 'https://demotiles.maplibre.org/style.json';
  ```
- **Symptôme** : la carte en ligne rend des tuiles raster CartoDB, mais l'offline pack télécharge des tuiles vector demotiles. **Les tuiles cachées ne sont pas celles rendues en ligne.** Le flow download/gestion fonctionne mais l'utilisateur voit des tuiles différentes en mode offline.
- **Sprint d'origine** : NL-5 S1 (2026-04-19, `feat/nl5-s1-map-native`).
- **Effort estimé** : 2 jours (héberger un style.json CartoDB-équivalent sur S3 ou Cloudflare, mettre à jour `OFFLINE_STYLE_URL`, tester offline pack download + render).
- **Comment fermer** :
  1. Créer un fichier `style.json` qui mirror exactement `buildOsmRasterStyle` (raster CartoDB Positron).
  2. Héberger statiquement (S3 + CloudFront ou bucket Cloudflare R2).
  3. Mettre à jour `OFFLINE_STYLE_URL = '<URL self-hosted>'`.
  4. Test e2e : download pack ville → mode avion → vérifier tuiles identiques en/offline.
  5. Cocher TD-3 ici.

### TD-5 — Bake `CHAT_ENRICHMENT_V2_ENABLED` puis flip default code

- [ ] **Statut** : ouvert (créé 2026-05-10 post-implémentation C2 v2 image-chat-finition)
- **Référence code** :
  ```
  museum-backend/src/config/env.ts:imageEnrichment.v2Enabled
  museum-backend/src/modules/chat/chat-module.ts:buildImageEnrichment
  museum-backend/src/modules/chat/useCase/enrichment/enrichment-fetcher.ts:fetchImages
  ```
- **Sprint d'origine** : 2026-05-10 (run `/team 2026-05-10-c2-image-chat-finition`).
- **Pourquoi pas fait dans le sprint d'origine** : memory `project_no_staging_v1` impose un bake ≥7j avant flip default ; l'env var permet rollback instantané sans code revert.
- **Pourquoi c'est important** : v2 ajoute 2 sources externes (Wikimedia Commons + Musaium catalogue) + un fan-out parallèle qui multiplie le RPS sortant ; un canary à `CHAT_ENRICHMENT_V2_ENABLED=true` doit valider le NFR p95 ≤500ms total + l'absence de régression sur le `chat_request_duration_seconds` avant qu'on flippe le default code.
- **Effort estimé** : 0 jour de dev (operator action).
- **Comment fermer** :
  1. Set `CHAT_ENRICHMENT_V2_ENABLED=true` en prod (env update only, pas de redeploy code).
  2. Observer `chat_enrichment_source_calls_total{outcome}` + `chat_enrichment_source_latency_seconds{source}` sur Grafana ≥7 jours pleins.
  3. Vérifier `chat_request_duration_seconds` p95 stable (pas de régression > +100ms vs 7 jours pré-flip).
  4. Si OK : promouvoir le default code de `false` à `true` dans `env.ts:282` (literal flip, PR + bake encore 7j).
  5. Cocher TD-5 ici.

---

### TD-4 — Pas de test d'intégration real-PG sur les 3 prune retention use cases

- [ ] **Statut** : ouvert (créé 2026-05-08 post-incident `2026-05-08-prune-hardening`)
- **Référence code** :
  ```
  museum-backend/src/modules/support/useCase/retention/prune-support-tickets.ts
  museum-backend/src/modules/chat/useCase/retention/prune-stale-art-keywords.ts
  museum-backend/src/modules/review/useCase/moderation/prune-reviews.ts
  museum-backend/tests/unit/{support,chat,review}/prune-*.test.ts   # mock-only, pas de vraie PG
  ```
- **Sprint d'origine** : 2026-05-08 (incident retention busy-loop — commit `8a32293f5` + run `/team 2026-05-08-prune-hardening`).
- **Pourquoi pas fait dans le sprint d'origine** : l'incident avait déjà couté ~11h de prod ; la priorité était de stopper la saignée + ajouter les régressions unit + variant analysis. Un harness real-PG sur les 3 prunes demande 2-3h d'infra (testcontainers + factories + setup teardown sur tables avec CASCADE FK) — hors scope du hotfix.
- **Pourquoi c'est important** : le bug d'origine (lecture `result.length` sur tuple `[rows, rowCount]`) est passé à travers la suite unit existante car le mock retournait un array de rows direct, pas le tuple driver réel. Un test integration sur vraie PG aurait attrapé ça avant prod.
- **Effort estimé** : 2-3 heures (réutiliser `tests/integration/db/migration-round-trip.test.ts` pour le setup harness ; ajouter des fixtures qui insèrent N rows éligibles, exécutent le prune, assertent rowsAffected + DB state ; vérifier que le tuple driver shape est bien consommée).
- **Comment fermer** :
  1. Créer `tests/integration/retention/prune-support-tickets.integration.test.ts` (et 2 frères pour chat/review).
  2. Réutiliser `createIntegrationHarness()` (cf. `migration-round-trip.test.ts`).
  3. Insérer ~50 rows éligibles via factory + ~50 non-éligibles, exécuter le prune, vérifier `rowsAffected === 50` et que les non-éligibles restent.
  4. Exécuter au minimum sur la pipeline `integration` du workflow CI.
  5. Cocher TD-4 ici.

---

### TD-5 — `chaos-circuit-breaker.e2e` HALF_OPEN→CLOSED test cannot run without orchestrator stub-swap

- [ ] **Statut** : ouvert (créé 2026-05-12, sprint audit-cleanup-2026-05-12 / D.4)
- **Référence code** :
  ```
  museum-backend/tests/e2e/chaos-circuit-breaker.e2e.test.ts:100
    it.todo('after openDurationMs, breaker → HALF_OPEN; success closes it')
  ```
- **Sprint d'origine** : 2026-04 (Phase 6 chaos resilience). The test was skipped at creation time because `LangChainChatOrchestrator` holds the failing model by reference; mid-run swap to a success model is not supported.
- **Effort estimé** : 1-2 heures. Either (a) extend the orchestrator with a `setModel()` / reset hook, or (b) extend `createE2EHarness` with an `orchestratorReset(newOverride)` option that rebuilds the orchestrator container after the breaker opens. Option (b) is preferred (no production-surface change).
- **Comment fermer** :
  1. Add `harness.orchestratorReset(newOrchestrator)` in `tests/helpers/e2e/`.
  2. Replace the `it.todo` at chaos-circuit-breaker.e2e.test.ts:100 with a real `it(...)` that: trips breaker → swaps to success orchestrator → waits openDurationMs → asserts CLOSED on next call.
  3. Cocher TD-5 ici.

---

## Tech debts fermés (gardés 1 sprint avant purge)

(Aucun pour le moment — premier sprint avec ce tracker.)

---

## Comment ce fichier est consommé

- **Avant chaque sprint** : `/team` skill lit `TECH_DEBT.md` et propose éventuellement de fermer un TD si le sprint a la bandwidth.
- **Au merge d'un fix de TD** : la PR doit cocher la ligne `[x]` correspondante dans le même commit.
- **Fin de sprint** : `/team roadmap:rotate` purge les TDs `[x]` plus vieux qu'un sprint.

Référence dans `ROADMAP_TEAM.md` § T1.7 et `CLAUDE.md`.
