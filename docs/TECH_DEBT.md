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

- [x] **Statut** : fermé 2026-05-15
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
- **Closure note (2026-05-15)** :
  - PATH `PATCH /api/auth/content-preferences` ajouté à `museum-backend/openapi/openapi.json` (peer de `/api/auth/tts-voice`).
  - `museum-frontend/features/settings/infrastructure/userProfileApi.ts` migré vers `openApiRequest` (atomic swap, pas de fallback).
  - **Finding obsolète :** la note "museum/daily-art/lowDataPack using raw httpRequest" est obsolète — vérifié 2026-05-15, `museum-frontend/features/museum/infrastructure/lowDataPackApi.ts:1` importe DÉJÀ `openApiRequest`. Pas de dette résiduelle.
  - **Finding obsolète :** la mention "Mettre à jour les tests `userProfileApi.test.ts`" était basée sur une supposition — il n'existe pas de fichier `userProfileApi.test.ts` (le coverage passe par `useContentPreferences.test.ts` qui mocke le module au niveau public). Pas de test à éditer.

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

### TD-6 — `chaos-circuit-breaker.e2e` HALF_OPEN→CLOSED test cannot run without orchestrator stub-swap

- [x] **Statut** : CLOSED 2026-05-15 (run `2026-05-15-td6-chaos-circuit-breaker-half-open`). HALF_OPEN→CLOSED transition now verified end-to-end via `harness.orchestratorReset` swap-proxy (option b). Failing + success orchestrators share the same `LLMCircuitBreaker` instance so the post-swap state observed by the new model is the real post-trip OPEN state. Zero production-surface change. See `museum-backend/tests/helpers/e2e/e2e-app-harness.ts` (`createSwappableOrchestrator` + `orchestratorReset`) and `museum-backend/tests/e2e/chaos-circuit-breaker.e2e.test.ts` (test `after openDurationMs, breaker → HALF_OPEN; success closes it`).
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
  3. Cocher TD-6 ici.

---

### TD-7 — ESLint v10 major drift (BE on v10, FE+Web on v9) — blocked by upstream

- [ ] **Statut** : ouvert (créé 2026-05-13, audit P1-8)
- **Référence code** :
  ```
  museum-backend/package.json     "eslint": "^10.2.0"   (also @eslint/js@^10.0.1, eslint-plugin-jsdoc@^62.9.0 — v10-only)
  museum-frontend/package.json    "eslint": "^9.39.4"
  museum-web/package.json         "eslint": "^9.39.4"
  ```
- **Symptôme** : deux versions majeures d'ESLint en parallèle entre les 3 apps. Pas de bug runtime, mais double effort de configuration et risque de drift sur la sémantique des règles.
- **Pourquoi non résolu en P1-8** : `eslint-plugin-react@7.37.5` (latest, publié 2025-04-03) est **runtime-incompatible** avec ESLint 10 — appelle `context.getFilename()` qui a été retiré en v10. Reproduit sur FE et Web :
  ```
  TypeError: contextOrFilename.getFilename is not a function
    at resolveBasedir (eslint-plugin-react/lib/util/version.js:31:100)
  ```
  Upstream tracking : `eslint-plugin-react` issue #3977 (OPEN), PR #3979 (OPEN, non-mergée). `eslint-plugin-react-native@5.0.0` et `eslint-plugin-jsx-a11y@6.10.2` peer-cap sur `^9` également.
- **Sprint d'origine** : audit 2026-05-12 (P1-8).
- **Effort estimé** : 1 h une fois le blocker upstream résolu (bump 2 fichiers + lint). Pas de chemin viable aujourd'hui sans patch-package ou fork.
- **Comment fermer** :
  1. Surveiller la fermeture de `jsx-eslint/eslint-plugin-react#3977` (Renovate / GitHub Security Advisory subscription).
  2. Quand un release `eslint-plugin-react` ≥ 7.38 (ou ce qu'ils publient comme v10-compat) est dispo : bump FE et Web sur `eslint@^10.x` + `eslint-plugin-react@^7.38+` + tout autre plugin react peer-cap.
  3. Lint vert sur les 3 apps.
  4. Cocher TD-7 ici.
- **Alternatives considérées et rejetées** :
  - **Downgrade BE → v9** : faisable (forcerait aussi `eslint-plugin-jsdoc` < 62.7), mais perd les améliorations v10 sur BE pour devoir re-bumper dans quelques mois quand upstream fix.
  - **`patch-package` sur eslint-plugin-react** : maintenance overhead + risque de breakage à chaque release. Non justifié.

---

### TD-8 — Cull 3 remaining single-impl chat ports (image-processor, knowledge-router, llm-judge)

- [ ] **Statut** : ouvert (créé 2026-05-13, audit P1-3 partial deferral)
- **Référence code** :
  ```
  museum-backend/src/modules/chat/domain/ports/image-processor.port.ts
  museum-backend/src/modules/chat/domain/ports/knowledge-router.port.ts
  museum-backend/src/modules/chat/domain/ports/llm-judge.port.ts
  ```
- **Symptôme** : 3 ports d'interface avec une seule implémentation chacun (hexagonal cosplay per audit P1-3). ~150 LOC d'indirection sans valeur de test/prod swap.
- **Pourquoi non résolu en P1-3** : le sub-agent a culled ces 3 + `AdvancedGuardrail` localement (commit `448973b5` sur la branche `backup-p1-night-pre-rebase`). Quand j'ai rebasé sur `origin/main` avant push, conflict 7-fichiers dans le surface guardrail/chat : `origin/main` était en train de refactorer la même zone (commits `5e0a4bd2`, `89b116f8`, etc. — renommage `advanced-guardrail.port` → `guardrail-provider.port`, fixes des 49 tests BE). Conflict resolution cost > value pour cette nuit. Le commit a été skippé pendant le rebase.
- **Sprint d'origine** : audit 2026-05-12 (P1-3 partial).
- **Effort estimé** : 30-60 min sur un jour calme — pattern bien établi par P1-3 sub-agent.
- **Comment fermer** :
  1. Récupérer le patch depuis `git show backup-p1-night-pre-rebase:<file>` pour les 3 ports + leurs sites d'usage (5-11 fichiers par port).
  2. Réappliquer manuellement (les conflicts d'origin/main sur AdvancedGuardrail sont absorbés — leur rename `guardrail-provider.port` est le canonique maintenant ; ne pas le toucher).
  3. tsc + lint verts sur BE.
  4. Cocher TD-8 ici.
- **Note** : la branche `backup-p1-night-pre-rebase` doit être préservée jusqu'à fermeture de TD-8.

---

### TD-9 — Mobile test `chat-session-deep.test.tsx > toggleRecording/playRecordedAudio` failing on `main`

- [x] **Statut** : fermé 2026-05-15 — déjà fixé en amont, ticket stale.
- **Cause racine** : commit `59296c75e` (2026-05-12, Art.50 voice disclosure gate) a wrappé `toggleRecording` d'un early-return jusqu'à acknowledge user → le test prop-forwarding line 1044 tombait sur ce wrapper et recevait 0 call au lieu de 1.
- **Fix** : commit `f795ed4dc` (2026-05-13 16:23, `test(mobile): mock useVoiceDisclosure in chat-session-deep prop-forwarding test`) ajoute `jest.mock('@/features/chat/hooks/useVoiceDisclosure')` retournant `isAcknowledged: true` dans le test, bypass le gate, contract prop-forwarding redevient vérifiable.
- **Vérification 2026-05-15** : `cd museum-frontend && npx jest __tests__/screens/chat-session-deep.test.tsx` → `Tests: 50 passed, 50 total` en 1.353 s. Zero `act()` warning. (TD-9 mentionnait 52 tests — chiffre stale, le fichier en a 50 aujourd'hui.)
- **Pourquoi pas coché à l'époque** : le fix `f795ed4dc` est landé pendant la phase d'audit P1 ; le ticket TD-9 a été créé en parallèle (2026-05-13) sans synchronisation avec ce commit. Erreur de coordination, pas un vrai bug ouvert.
- **Référence code** :
  ```
  museum-frontend/__tests__/screens/chat-session-deep.test.tsx (ligne du mock useVoiceDisclosure)
  museum-frontend/app/(stack)/chat/[sessionId].tsx (Art.50 wrapper, intact)
  ```

---

### TD-10 — PII redaction non rétroactive sur l'history pré-fix (LLM02)

- [ ] **Statut** : ouvert (créé 2026-05-14, lié au /team `2026-05-14-pii-redaction-llm02`)
- **Référence code** :
  ```
  museum-backend/src/modules/chat/useCase/message/chat-message.service.ts:283-287 (substitution sur NEW message uniquement)
  museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts:244 (history hydration sans rescan)
  ```
- **Symptôme** : depuis le fix LLM02 (2026-05-14), tout NEW message chat est scrubbé via le sidecar Anonymize avant le LLM call. MAIS les `ChatMessage.text` persistés AVANT le commit du fix restent en clair en BDD. À chaque tour suivant, `PrepareMessagePipeline.prepare()` re-hydrate cet history non scrubbé via `repository.listSessionHistory(sessionId, env.llm.maxHistoryMessages)` (line 244) et le LLM le reçoit tel quel.
- **Pourquoi non résolu en V1** : coût latency p95 inacceptable si on rescan chaque message d'history côté sidecar à chaque tour (× ~20 messages d'history typique). Décision design D2 dans `team-state/2026-05-14-pii-redaction-llm02/design.md`. RGPD Right-to-erasure intact via cascade delete session.
- **Sprint d'origine** : 2026-05-14.
- **Effort estimé** : 1 jour, dépend de la stratégie choisie :
  - (a) Migration one-shot rétro qui rescanne tout `ChatMessage.text` user en BDD via le sidecar Anonymize, remplace par redactedText, append audit row par row migré.
  - (b) Rescan lazy à l'hydration : moins d'overhead total mais hot path impacté.
  - (c) Doctrine "accept tail risk" : si compliance ne demande pas, ne rien faire (les messages "où je suis dans le musée maintenant" perdent leur valeur en quelques minutes).
- **Comment fermer** :
  1. Trancher (a) vs (b) vs (c) avec DPO. Si (a), produire un script `scripts/backfill-pii-redaction.cjs`.
  2. Implémenter, mesurer p95 sur un échantillon (1k messages).
  3. Rapporter dans audit chain le nombre de rows migrées + le delta de placeholders observés.
  4. Cocher TD-10 ici.

---

### TD-11 — `@types/express-serve-static-core` pin à 5.0.6 (param widening 5.1.x)

- **Localisation** :
  ```
  museum-backend/package.json:pnpm.overrides.@types/express-serve-static-core = "5.0.6"
  ```
- **Symptôme** : la version 5.1.0 / 5.1.1 a élargi `req.params[key]` de `string` à `string | string[]` (pour refléter des cas légitimes de paramètres multi-segments). Cette upcasting déclenche 27+ erreurs `TS2322` / `TS2345` sur l'ensemble des `*.route.ts` BE qui font `useCase.execute({ id: req.params.id })` ou `\`bucket:${req.params.id}\`` template literal.
- **Pourquoi non résolu en V1** : élargissement TYPE-only (pas de runtime change), pin à 5.0.6 conserve la sémantique observée 2026-05-13. Migration ~30 fichiers route, non-trivial.
- **Sprint d'origine** : 2026-05-14 (rollback Renovate PR #277 absorbé puis neutralisé via override pin).
- **Effort estimé** : 0.5 jour si on bumpe l'override + narrowing systématique au callsite (`typeof X === 'string' ? X : undefined`). Mieux : helper `parseStringParam(req, key): string | undefined` réutilisable.
- **Comment fermer** :
  1. Créer helper `parseStringParam(req, key): string | undefined` dans `src/shared/middleware/`.
  2. Codemod sur les 27 callsites.
  3. Bumper l'override à `5.1.x` (ou retirer pour laisser pnpm pick latest compatible).
  4. Re-tester full BE suite + e2e.
  5. Cocher TD-11.

---

## Tech debts fermés (gardés 1 sprint avant purge)

(Aucun pour le moment — premier sprint avec ce tracker.)

---

## Comment ce fichier est consommé

- **Avant chaque sprint** : `/team` skill lit `TECH_DEBT.md` et propose éventuellement de fermer un TD si le sprint a la bandwidth.
- **Au merge d'un fix de TD** : la PR doit cocher la ligne `[x]` correspondante dans le même commit.
- **Fin de sprint** : `/team roadmap:rotate` purge les TDs `[x]` plus vieux qu'un sprint.

Référence dans `ROADMAP_TEAM.md` § T1.7 et `CLAUDE.md`.
