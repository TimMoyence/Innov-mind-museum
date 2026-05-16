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

- [x] **Statut** : fermé 2026-05-15 — Option B full scope BE + FE shippé (run `2026-05-15-td2-bootstrap-profile-cross-device`).
- **Closure note 2026-05-15** :
  - **BE** : migration `1778869480178-AddProfilePreferencesToUsers.ts` ajoute 5 colonnes scalar à `users` (`default_locale varchar(8) NOT NULL DEFAULT 'en-US'`, `default_museum_mode bool NOT NULL DEFAULT true`, `guide_level varchar(16) NOT NULL DEFAULT 'beginner'`, `data_mode varchar(8) NOT NULL DEFAULT 'auto'`, `audio_description_mode bool NOT NULL DEFAULT false`). `/auth/me` réponse étendue avec les 5 prefs + 2 existantes (`contentPreferences` + `ttsVoice`). Nouveau endpoint batch `PATCH /api/auth/me/preferences` (Zod partial body avec `.refine` non-empty, audit log `AUDIT_AUTH_PROFILE_PREFERENCES_UPDATED` sans PII, owner-only via JWT `req.user.id`). OpenAPI spec étendu (74 paths/83 ops, validate PASS). Mitigation `feedback_typeorm_set_undefined_repo_update` : handler pré-filtre `undefined` avant `repo.update`. BE tests 703/703 PASS.
  - **FE** : `useAudioDescriptionMode.ts` refactor `useState`+storage → Zustand store `audioDescriptionStore.ts` (64 LoC) + compat shim (27 LoC) préserve les 4 call sites existants (`SettingsAccessibilityCard`, `useChatSession`, `chat/[sessionId]`, jest.mock). `mergeFromServer` ajouté à 3 autres stores (`userProfileStore` +13, `runtimeSettingsStore` +29 avec 3-field independent guards atomic, `dataModeStore` +13 avec whitelist `VALID_DATA_MODES`). `shared/infrastructure/bootstrapProfile.ts` 113 LoC : fail-open, idempotent (`hasBootstrappedThisSession` + `inFlight` promise dedup), breadcrumbs Sentry (`bootstrap_profile.{start,done,failed,skipped_already_done}` + métrique `bootstrap_profile_completed_ms`). Wiré dans `AuthContext` à 3 sites (`loginWithSession`, `bootstrap()` IIFE, `logout`) + `setUnauthorizedHandler`. 6 fichiers tests, 50/50 PASS verbatim (broader sweep 156/156 PASS, 16 suites verts).
  - **Cross-stack** : FE OpenAPI types regenerated, drift check PASS, tsc FE clean, lint FE clean, 1 corrective loop (require-await sur async shim).
  - **Audit /team enterprise** : architect PLAN-READY (Option B.1 + PATCH.1), editor BE TD2-BE-DONE-STAGED (17 files), editor FE TD2-FE-DONE-STAGED (14 files, 50/50 tests + 156/156 broader), verifier en cours, security SECURITY-CLEAR (9/9, 0 HIGH), reviewer APPROVED après tick correction (weightedMean 87.3 cross-stack avec correctness×2).
- **Référence code** :
  ```
  museum-backend/src/data/db/migrations/1778869480178-AddProfilePreferencesToUsers.ts
  museum-backend/src/modules/auth/domain/user/User.entity.ts (5 new cols)
  museum-backend/src/modules/auth/.../auth-profile.route.ts (GET /me + new PATCH /me/preferences)
  museum-frontend/shared/infrastructure/bootstrapProfile.ts (new)
  museum-frontend/features/settings/infrastructure/audioDescriptionStore.ts (new Zustand)
  museum-frontend/features/settings/infrastructure/{userProfileStore,runtimeSettingsStore,dataModeStore}.ts (mergeFromServer added)
  museum-frontend/features/auth/context/AuthContext.tsx (wired at 3 sites)
  ```

---

### TD-3 — MapLibre `OFFLINE_STYLE_URL` pointe vers demotiles au lieu d'un self-hosted CartoDB

- [x] **Statut** : fermé 2026-05-15 — RUN_ID `2026-05-15-td3-maplibre-self-hosted-style`. Mirror at `docs/maplibre/cartodb-raster-style.json` (861 bytes, raster CartoDB Positron, 4 subdomains, structurally equivalent to `buildOsmRasterStyle(false)`), served by GitHub Pages via `.github/workflows/deploy-privacy-policy.yml` (Pages workflow extended to copy the maplibre dir into `_site/maplibre/`). `OFFLINE_STYLE_URL` now points at `https://timmoyence.github.io/Innov-mind-museum/maplibre/cartodb-raster-style.json`. Drift guard in `museum-frontend/__tests__/features/museum/mapStyleUrl.test.ts` (5 assertions : URL shape, version, first tile URL, tileSize/minzoom/maxzoom/attribution, layer count, subdomain order). CI syntactic guard added to `.github/workflows/ci-cd-mobile.yml` quality job. Option A (GH Pages, zero new infra) retained over CartoDB direct (rejected — official style is vector, would not fix the raster mismatch). Manual airplane-mode smoke documented in spec.md § Tests.
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

- [x] **Statut** : fermé 2026-05-16 — déjà fixé en amont, ticket stale.
- **Cause racine** : doctrine `feedback_no_feature_flags_prelaunch` (zero `*_ENABLED` flag pre-launch V1, "Live or revert"). Le kill-switch `CHAT_ENRICHMENT_V2_ENABLED` violait cette doctrine — il était documenté dans TD-5 mais son retrait était la bonne action, pas le bake-then-flip décrit dans l'entrée.
- **Fix** : commit `fa4048a0a` (2026-05-10 19:33, `refactor(C2): remove CHAT_ENRICHMENT_V2_ENABLED kill-switch`) — **same day** que la création de TD-5. `chat-module.ts:buildImageEnrichment` wire toujours `WikimediaCommonsClient` + `MusaiumCatalogueClient` (plus de ternaire `v2Enabled ? : undefined`). `enrichment-fetcher.fetchImages` prend toujours la v2 fan-out branche. Env var `CHAT_ENRICHMENT_V2_ENABLED` n'est plus lue nulle part. Le commit message cite explicitement `feedback_no_feature_flags_prelaunch` comme rationale.
- **Vérification 2026-05-16** :
  - `grep -rn "CHAT_ENRICHMENT_V2\|v2Enabled\|isV2Enabled" museum-backend/src/` → 0 résultat (seul résidu : commentaire dans `security/promptfoo/c2-enrichment.yaml:3` "Run locally (BE up with CHAT_ENRICHMENT_V2_ENABLED=true):" — orphelin de test fixture, pas du code prod).
  - `grep -n "imageEnrichment" museum-backend/src/config/env.ts` → bloc présent (lignes 339-345) avec `cacheTtlMs`, `cacheMaxEntries`, `fetchTimeoutMs`, `maxImagesPerResponse`, `unsplashAccessKey` — pas de `v2Enabled`.
- **Pourquoi pas coché à l'époque** : TD-5 a été créé le 2026-05-10 (post run `/team 2026-05-10-c2-image-chat-finition`) basé sur le plan initial "bake 7j puis flip". Le refactor `fa4048a0a` le même jour (19:33) a invalidé ce plan via la doctrine, mais TECH_DEBT.md n'a pas été synchronisé. Erreur de coordination, pas un vrai bug ouvert. (Pattern identique à TD-9.)
- **Référence code (post-fix)** :
  ```
  museum-backend/src/modules/chat/chat-module.ts:540-553 (buildImageEnrichment — sources hardcoded, no flag)
  museum-backend/src/modules/chat/useCase/enrichment/enrichment-fetcher.ts (fetchImages — v2 fan-out toujours actif)
  museum-backend/src/config/env.ts:339-345 (imageEnrichment block — no v2Enabled field)
  ```
- **Doctrine confirmée 2026-05-16** : pour Musaium pre-launch V1, **Live or revert**. Pas de kill-switch. Si V2 doit être annulé, c'est un code revert (`git revert ff5d107ff` ou équivalent), pas un toggle env. La doctrine inverse post-B2B revenue.

---

### TD-4 — Pas de test d'intégration real-PG sur les 3 prune retention use cases

- [x] **Statut** : CLOSED 2026-05-15 (run `2026-05-15-td4-prune-retention-integration-tests`). Trois fichiers `tests/integration/retention/prune-{support-tickets,stale-art-keywords,reviews}.integration.test.ts` exercent les 3 prune use cases contre une vraie testcontainer Postgres via `createIntegrationHarness`. Chaque fichier couvre 3 scénarios : (a) 50 eligible + 50 non-eligible mix, (b) empty-table `rowsAffected === 0` + sub-1s terminate guard contre l'infinite-loop incident-2026-05-08, (c) multi-chunk `batchLimit=20` forçant la consommation du tuple `[rows, rowCount]` driver-level. Factory `tests/helpers/chat/artKeyword.fixtures.ts` créée (`makeArtKeyword`). Aucun changement au code prod (`museum-backend/src/`) ni au CI (`.github/workflows/`).
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
- **Upstream check 2026-05-15** (vérifié via `gh issue/pr view`) :
  - Issue [`jsx-eslint/eslint-plugin-react#3977`](https://github.com/jsx-eslint/eslint-plugin-react/issues/3977) "ESLint v10 compatibility" — **STILL OPEN**, pas de `closedAt`.
  - PR [`jsx-eslint/eslint-plugin-react#3979`](https://github.com/jsx-eslint/eslint-plugin-react/pull/3979) "Fix ESLint v10 RuleContext API removal (follow-up to #3972)" — **STILL OPEN**, pas de `mergedAt`.
  - Verdict : reste bloqué upstream. Prochain check : 2026-06-01 (avant launch V1). Si toujours OPEN à 2026-06-15, ré-évaluer alternatives (downgrade BE v9 ou patch-package).
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

- [x] **Statut** : fermé 2026-05-15
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
- **Closure note (2026-05-15)** : Pattern récupéré depuis dangling commit `448973b5` (P1-3 sub-agent, 2026-05-13) — la branche `backup-p1-night-pre-rebase` ayant été perdue entre-temps. 3 ports inlinés dans leurs sole consumers (`SharpImageProcessor` / `KnowledgeRouterService` / `LlmJudgeGuardrail`) ; 14 importers redirigés (production + tests) ; `AdvancedGuardrail` non touché (déjà absorbé par `GuardrailProvider` via `5e0a4bd2`). Reverse-domain import de `KnowledgeRouterSource` dans `chat-orchestrator.port.ts` redirigé vers le service. `tsc` + `lint` verts, chat unit suite 2009/2011 passed (2 skipped, unchanged baseline). `compare.use-case.ts` `ImageProcessorPort` (signature `process` ≠ `stripExif`) conservé OUT-OF-SCOPE.

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
- **Decision brief 2026-05-15** (Tim est solo founder + DPO, décision interne) :

  | Option | Coût dev | Coût latency p95 | RGPD risk | Recommandation |
  |---|---|---|---|---|
  | **(a) one-shot migration rétro** | 1 jour script `scripts/backfill-pii-redaction.cjs` + 1 h test sur fixture 1k messages | Zéro impact runtime post-migration (history persisted déjà scrubbé) | Compliance complète. Reset deltas auditables. | **Recommandée si compliance audit prévu < 6 mois** |
  | **(b) rescan lazy à l'hydration** | 0.5 jour wire dans `PrepareMessagePipeline.prepare()` + cache LRU des messages déjà scrubbés (eviter rescan répété) | +50-150 ms p95 sur premier hydration session legacy (~20 messages × sidecar latency). Cache LRU absorbe les calls suivants. | Compliance graduelle. Audit chain inexistant. | **Pire des deux mondes : impact runtime + complexité** |
  | **(c) accept tail risk** | 0 dev | 0 latency | Tail risk : messages user pré-2026-05-14 (probablement < 50k rows sur la lifetime pré-launch) restent en clair en BDD. Mitigation existante = cascade delete session via Right-to-erasure RGPD. La nature des messages ("où je suis dans le musée maintenant") = valeur expirée en quelques minutes. | **Recommandée pour pre-launch V1**, à reconsidérer post-B2B revenue quand un DPO externe sera commissioned |

  **Décision retenue 2026-05-15 (Tim)** : **OPTION (c) accept tail risk** jusqu'à la première demande compliance/audit B2B. Tracker reste OPEN comme reminder. Cascade delete session via Right-to-erasure RGPD couvre le cas legal. À ré-évaluer **2026-09-01** (1er trimestre post-launch) ou plus tôt si un audit B2B compliance arrive.

---

### TD-11 — `@types/express-serve-static-core` pin à 5.0.6 (param widening 5.1.x) [x]

- **Localisation** :
  ```
  museum-backend/package.json:pnpm.overrides.@types/express-serve-static-core = "5.0.6"
  ```
- **Symptôme** : la version 5.1.0 / 5.1.1 a élargi `req.params[key]` de `string` à `string | string[]` (pour refléter des cas légitimes de paramètres multi-segments). Cette upcasting déclenche 27+ erreurs `TS2322` / `TS2345` sur l'ensemble des `*.route.ts` BE qui font `useCase.execute({ id: req.params.id })` ou `\`bucket:${req.params.id}\`` template literal.
- **Pourquoi non résolu en V1** : élargissement TYPE-only (pas de runtime change), pin à 5.0.6 conserve la sémantique observée 2026-05-13. Migration ~30 fichiers route, non-trivial.
- **Sprint d'origine** : 2026-05-14 (rollback Renovate PR #277 absorbé puis neutralisé via override pin).
- **Effort estimé** : 0.5 jour si on bumpe l'override + narrowing systématique au callsite (`typeof X === 'string' ? X : undefined`). Mieux : helper `parseStringParam(req, key): string | undefined` réutilisable.
- **Closure 2026-05-15** :
  1. Suppression de la clé `pnpm.overrides."@types/express-serve-static-core"` (doctrine bury-dead-code : pas de bump-puis-pin obsolète, override retiré net) + ajout explicite de `@types/express-serve-static-core: ^5.1.1` en `devDependencies` pour forcer le lockfile à re-résoudre (sinon `@types/express@5.0.1` re-pinne la transitive à 5.0.6).
  2. Helper `parseStringParam(req, key): string | undefined` créé dans `museum-backend/src/shared/middleware/parseStringParam.ts` (16 lignes, rejette `string[]` et `''`).
  3. Codemod sur 11 fichiers route, 22 call sites narrowed (admin-ke, admin, cache-purge, auth-api-keys, consent, chat-media, chat-message, chat-session, low-data-pack, museum, support) + 1 helper interne (`bySession` dans `rate-limit.middleware.ts` qui consommait `req.params.id` dans un template literal).
  4. tsc final : 0 erreurs (28 erreurs `TS2322`/`TS2345` réelles mesurées sur HEAD, pas 27+ comme estimé).
  5. Lint final : 0 warnings (3 warnings sonarjs introduits par les nouveaux strings dupliqués → factorisés via `MESSAGE_ID_REQUIRED` et `INVALID_MUSEUM_ID` constants).
  6. BE test suite : 5404 passed / 5497 total (93 skipped pré-existants, 0 fail).

---

### TD-12 — `monthlySessionQuota.loggedHits` Set never-evicted cache (R1 / ultrareview F4)

- [ ] **Statut** : ouvert (créé 2026-05-16, ultrareview bug_013 nit-severity) — *renumbered from TD-11 post-merge collision with main's `@types/express-serve-static-core` pin TD-11*
- **Référence code** :
  ```
  museum-backend/src/shared/middleware/monthly-session-quota.middleware.ts:62-72 (module-level Set<string>, docblock acknowledges la trade-off)
  museum-backend/src/shared/middleware/monthly-session-quota.middleware.ts:147 (loggedHits.add — only write site)
  museum-backend/src/shared/middleware/monthly-session-quota.middleware.ts:66-68 (setMonthlyQuotaRepo(null) — only clear path, test-only)
  ```
- **Symptôme** : `loggedHits = new Set<string>()` accumule une entrée `${userId}:${YYYY-MM}` la première fois qu'un user `tier='free'` hit la limite. Après rollover de mois (juin), les entrées de mai restent pinned indéfiniment. Croissance monotone bornée par `users × months` sur la lifetime du process.
- **Pourquoi non résolu en V1** : impact négligeable au scale launch (~100 beta users × 12 mois × ~50 bytes/entrée = **6 KB/an**). Modern container/k8s deploy cadence recycle le process bien avant. Le docblock du code acknowledges l'invariant explicitement. Reviewer ultrareview classé `nit` severity (« worth tracking », pas « worth shipping un fix overkill »). Au hypothetical 100k MAU × 5% × 36 months = ~9 MB après 3 ans uninterrupted — toujours small relatif aux budgets heap Node.
- **Sprint d'origine** : 2026-05-15 (R1 ship) → 2026-05-16 (ultrareview r0wykavnv bug_013).
- **Effort estimé** : ~30 minutes. Pattern (a) recommandé par reviewer :
  - (a) **`Map<userId, lastLoggedMonth>`** — at-most-one entrée per user. Memory : O(users) vs O(users×months). Behaviour byte-équivalent. 4-line diff. Replace `Set<string>` par `Map<number, string>`. Update `loggedHits.has(dedupKey)` → `loggedHits.get(actorId) !== currentMonth`. Update `loggedHits.add(dedupKey)` → `loggedHits.set(actorId, currentMonth)`.
  - (b) Stale-month sweep on rollover — O(N) par session-create.
  - (c) LRU cap (lru-cache lib) — non recommandé (ajoute dep pour petit problème).
- **Comment fermer** :
  1. Implémenter pattern (a) : 4-line diff dans `monthly-session-quota.middleware.ts`.
  2. Test : `loggedHits.size` ne croît pas après 2 mois consécutifs pour le même user.
  3. Update docblock lines 62-65 (retirer la note « bounded by users × months »).
  4. Cocher TD-12 ici.

---

## Tech debts fermés (gardés 1 sprint avant purge)

(Aucun pour le moment — premier sprint avec ce tracker.)

---

## Comment ce fichier est consommé

- **Avant chaque sprint** : `/team` skill lit `TECH_DEBT.md` et propose éventuellement de fermer un TD si le sprint a la bandwidth.
- **Au merge d'un fix de TD** : la PR doit cocher la ligne `[x]` correspondante dans le même commit.
- **Fin de sprint** : `/team roadmap:rotate` purge les TDs `[x]` plus vieux qu'un sprint.

Référence dans `ROADMAP_TEAM.md` § T1.7 et `CLAUDE.md`.
