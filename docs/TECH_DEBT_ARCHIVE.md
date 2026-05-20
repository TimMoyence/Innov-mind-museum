# TECH_DEBT_ARCHIVE — items fermés

> Moved from `docs/TECH_DEBT.md` 2026-05-20 to reduce noise. Read-only history. Open debt → `docs/TECH_DEBT.md`.

---

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

### TD-7 — ESLint version skew résolu (all v9) ; v10 upgrade deferred upstream

- [x] **Statut** : fermé 2026-05-20 — le drift de versions est éliminé : les **3 apps sont alignées sur `eslint@^9.39.4`** (vérifié package.json ×3, 2026-05-20). BE avait été downgradé de v10→v9 par T1.4 (2026-05-16) ; le titre/statut "BE on v10" était stale. La seule partie résiduelle (bump des 3 apps vers v10) reste **deferred** car bloquée upstream `jsx-eslint/eslint-plugin-react#3979` — c'est un upgrade volontairement différé, plus une dette de drift. Re-tracker comme item d'upgrade séparé si V1.x re-priorise v10.
- **Référence code** :
  ```
  museum-backend/package.json     "eslint": "^9.39.4"   (downgradé de ^10.2.0 par T1.4 2026-05-16)
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
  - **Downgrade BE → v9** : faisable (vérifié 2026-05-16 — `eslint-plugin-jsdoc@62.9` peer = `^7..^10`, aucune cascade nécessaire), mais perd les améliorations v10 sur BE pour devoir re-bumper dans quelques mois quand upstream fix. **Retenu et appliqué 2026-05-16 par T1.4** (audit-360-S1) après ré-évaluation J-16 launch.
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

### TD-15 — Low-data mode user-facing copy ment (UFR-013 violation)

- [x] **Statut** : option (a) fermée 2026-05-17 — copy mensonge supprimé (FR + EN `lowDataDetails:552`). Option (b) image compression upload reportée post-launch V1 dans ROADMAP_PRODUCT C9.x.
- **Closure note 2026-05-17** : Edit `museum-frontend/shared/locales/{fr,en}/translation.json:552` :
  - FR : `"Mode data économe : TTS désactivé, réponses plus courtes, prefetch wifi uniquement"`
  - EN : `"Data saver on — TTS disabled, shorter replies, prefetch on Wi-Fi only"`
  - Verifie via `grep -rn "images compress" museum-frontend/shared/locales/` → 0 résultat.
  - UFR-013 compliance immediate, sans attendre l'implémentation option (b).
  - Option (b) image compression upload via `expo-image-manipulator` reste backlog post-launch (1-2j).
- **Statut historique** : ouvert (créé 2026-05-16, audit Pattern 7 — **PRIORITAIRE UFR-013**)
- **Référence code** :
  ```
  # User-facing copy qui ment
  museum-frontend/shared/locales/fr/translation.json:471             # "TTS désactivé, images compressées"
  museum-frontend/shared/locales/en/translation.json:<même clé>      # equivalent EN
  
  # Branches data-mode RÉELLES (3 + 1 partiel)
  museum-frontend/features/chat/application/useTextToSpeech.ts:152-156         # TTS skip OK
  museum-frontend/features/museum/application/useMuseumPrefetch.ts:41          # prefetch skip on cellular OK
  museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts:129-133    # "100-150 words max" OK
  museum-frontend/features/chat/application/chatSessionStrategies.pure.ts:51-58 # cache-first first-turn museum text-only (narrow)
  
  # Branches PROMISES par le banner mais ABSENTES
  museum-frontend/features/<various>                # ZERO image compression upload (multipart full-res reste)
  museum-frontend/features/<map>                    # ZERO MapLibre maxZoom cap quand isLowData
  museum-frontend/features/<animations>             # ZERO reduction animation basé isLowData (seul useReducedMotion OS-level)
  museum-backend/src/modules/chat/useCase/.../message-commit.ts:91-96  # enrichedImages path ignore lowDataMode
  ```
- **Symptôme** : Le banner FR "Mode économie de données actif — TTS désactivé, **images compressées**" est **un mensonge codebase-wide** :
  - **Aucun code path** côté FE ou BE ne compresse les images quand `lowDataMode=true`. Les uploads multipart partent en pleine résolution caméra (2-5 MB typiquement), les images BE retournées ne sont pas demandées en variant low-res.
  - Coverage réel : 3/10 features data-affecting gatées (~30 %).
  - **Violation directe UFR-013** (memory `feedback_honesty_no_pretense`) : "FORBIDDEN: lying or fabricating any fact / number / citation / file path / line / function / command output / test result / source". Le user-facing copy est dans cette catégorie.
- **Sprint d'origine** : audit Pattern 7 (post-TD-2 + TD-1 BE/FE expansion), 2026-05-16.
- **Effort estimé** :
  - **Option (a) fix copy honest** : **5 minutes** — retirer "images compressées" du label, remplacer par vérité : "TTS désactivé, réponses plus courtes, prefetch wifi uniquement". UFR-013 immediate compliance.
  - **Option (b) implémenter les branches manquantes** : **1-2 jours** — `expo-image-manipulator` pour compress uploads ≥1MB à 70% quality / 1920px max ; image variants daily-art/museum (BE serve `?w=512` resized via Sharp middleware ou S3+CloudFront resizer) ; MapLibre `maxZoom` cap à 14 quand isLowData (vs default 19) ; integration tests jest+msw pour chaque gate.
- **Comment fermer (priorité décroissante)** :
  1. **IMMÉDIAT (option a — 5 min)** : edit `translation.json` FR + EN, retirer le mensonge "images compressées", reformuler avec ce qui est vraiment implémenté. Cocher partiellement TD-15.
  2. **POST-LAUNCH V1 (option b — 1-2j)** : implémenter en priorité l'image compression upload (`expo-image-manipulator` resize si >1MB, 70% JPEG quality) — c'est le plus gros data saver effectivement manquant. Puis MapLibre maxZoom cap. Puis BE image variants.
  3. Tests : 1 test integration par real gate (jest + msw, toggle `low`, assert `useTextToSpeech` ne call pas `chatApi.synthesizeSpeech` ; assert `useMuseumPrefetch` ne call pas `fetchLowDataPack` on cellular).
  4. Cocher TD-15 ici.
- **Note UFR-013** : tant que l'option (a) n'est pas faite, on viole "ne pas mentir au user". À traiter avant le 2026-06-01 launch V1.

---

### TD-16 — Dead code SSE residuals (ADR-001 retired 2026-05-03) — FERMÉ 2026-05-17

- [x] **Statut** : FERMÉ 2026-05-17 via kill cascade complet sur cleanup/comment-purge.
- **Closed via** : commit suivant sur `cleanup/comment-purge` (kill cascade post-revue stream-buffer.ts décision = enterrer). Réf orchestrateur SHA dans message commit.
- **Items fermés (cleanup/comment-purge 2026-05-17)** :
  ```
  ✅ sse.helpers.ts (38 LOC) — git rm + test associé (TD-21 closed en parallèle)
  ✅ chat-message.route.ts L94 + L185 — commentaires mensongers sse-dormant.ts supprimés (UFR-013)
  ✅ chat-message.service.ts:postMessageStream + awaitDrainWithTimeout helper supprimés
  ✅ chat.service.ts:postMessageStream wrapper + eslint-disable supprimés
  ✅ stream-buffer.ts (257 LOC) — git rm
  ✅ tests/unit/chat/stream-buffer.test.ts (358 LOC) — git rm cascade
  ✅ tests/unit/chat/chat-service-stream.test.ts (156 LOC) — git rm
  ✅ chat-orchestrator.port.ts — generateStream supprimé de l'interface
  ✅ langchain.orchestrator.ts — generateStream method + streamSection + _executeGuarded supprimés
  ✅ langchain-orchestrator-stream.ts — buildFirstSectionMessages + createStreamTimeout supprimés (buildRunnerOptions conservé, utilisé par generate())
  ✅ langchain-orchestrator-assembly.ts — buildStreamSuccessResponse supprimé
  ✅ message-commit.ts — JSDoc "Shared by postMessage + postMessageStream" mise à jour
  ✅ 14 fichiers de tests nettoyés des stubs generateStream/postMessageStream (chat-message-service, chat-service, chat-media-route, chat-phase-spans*, chat-pipeline-phase, langchain-orchestrator*, llm-judge*, walk-intent, orchestrator-walk-section, orchestrator-router-threading, e2e-app-harness, chat-citations, knowledge-router)
  ```
- **LOC removed total** : ~720L source + ~514L tests = ~1234L net.
- **Sprint d'origine** : audit /team 360° chat backend 2026-05-16 (Agent A §3.2 + §3.4).

---

### TD-21 — `sse.helpers.ts` résiduel post-SSE-cull ✅ CLOSED 2026-05-17

- [x] **Statut** : closed 2026-05-17 (cleanup/comment-purge branch).
- **Résolution** : zero production importers confirmés (seul test `tests/unit/chat/sse-helpers.test.ts` consommait). `git rm` des deux fichiers (38 LOC source + test associé). TD-16 reste séparé (StreamBuffer dans `chat-message.service.ts:postMessageStream` toujours wired via `chat.service.ts`).

---

### TD-37 — `ratchet-check.sh` cap mutationScore formula refactor (Timeout-as-kill doctrine)

- [x] **Statut** : fermé 2026-05-17 (fix pérein + evolutif 10 ans, pas un dial-back temporaire)
- **Référence code** :
  ```
  .claude/quality-ratchet.json     "mutationScore": 95  (nouveau)
  .claude/hooks/ratchet-check.sh:120-128   nouvelle formula
  ```
- **Symptôme initial** : cap=35 vs killed-only score 30.71% → next commit FAIL. Root cause = formula `Killed / Denom` ne reflète pas la réalité : les 4594 Timeout sont en majorité des kills masqués par open-handles BullMQ/ioredis (CLAUDE.md § Pièges connus, validé 2026-05-16 5/5 sample).
- **Fix appliqué** : formula refactor pérein. Nouvelle métrique enforcée = `(Killed + Timeout) / Denom` = 95.77% (cap 95, headroom 0.77). Killed-only score = 30.71% logué en diagnostic (NOT enforced, sinon on pénaliserait le codebase pour un leak d'open-handles non lié à la qualité des tests). Survived (287) = vrai signal de test-gap, toute hausse = régression.
- **Pourquoi pérein 10 ans** :
  - Évolution naturelle : si T3.1/T3.2 fix les open-handles → Timeout shrinks vers Killed → effective score reste ≥95, killed-only monte vers 95 — les 2 convergent.
  - Cap monte graduellement : 95 → 97 (quand survived<200) → 98+ (enterprise).
  - Doctrine encodée dans le formula, pas dans un commentaire.
  - Aucun bypass env-var (UFR-020 respecté).
- **Sprint d'origine** : audit-360 S3 Phase 4 + clean docs 2026-05-17.

---

### TD-38 — `ratchet-check.sh` REPO_ROOT hardcoded

- [x] **Statut** : fermé 2026-05-17
- **Référence code** : `.claude/hooks/ratchet-check.sh:22`.
- **Fix appliqué** : `REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "/Users/Tim/Desktop/all/dev/Pro/InnovMind")"`. Fallback hardcodé conservé pour fresh-checkout scenarios où git non encore initialisé (rare mais safe). Le gate s'aligne maintenant sur le worktree courant — plus de skip silencieux.
- **Sprint d'origine** : audit-360 S3 follow-up #5.

---

### TD-44 — `docker-compose.dev.yml` divergence vs prod sur Redis AUTH (bruit BullMQ/ioredis)

- [x] **Statut** : fermé 2026-05-18 — fix appliqué dans le même run d'audit qui l'a ouvert (`2026-05-18-audit-dev-backend-bullmq-noise`).
- **Référence code** :
  ```
  museum-backend/docker-compose.dev.yml § redis   # avant fix : pas de --requirepass
  museum-backend/deploy/docker-compose.prod.yml:328-349   # source de vérité (force --requirepass)
  museum-backend/src/index.ts:65-72   # createRedisConnectionOptions(maxRetriesPerRequest:null, enableOfflineQueue:false)
  ```
- **Symptôme observable (avant fix)** : `docker logs dev-backend` produisait 143 erreurs / 24h `Error: Stream isn't writeable and enableOfflineQueue options is false` + 263 warnings `[WARN] This Redis server's 'default' user does not require a password, but a password was supplied`. Container répondait toujours à `/api/health` mais le bruit masquait les vraies erreurs Redis (défaut anti-enterprise-grade).
- **Root cause** :
  1. `.env` modifié post-container-start (drift 15h) → container live avait `NODE_ENV=production` + `REDIS_*` set, alors que `.env` actuel ne les contenait plus. Jamais `--force-recreate`.
  2. Compose dev n'avait pas `--requirepass`, alors que prod le force. ioredis envoyait AUTH → Redis 7+ répondait avec un warn (AUTH-without-requirepass).
  3. `Stream isn't writeable` = transient ioredis reconnect avec `enableOfflineQueue:false` (BullMQ-recommended Worker setting, donc correct côté code).
- **Sprint d'origine** : `2026-05-18-audit-dev-backend-bullmq-noise` (audit /team architect-only).
- **Effort estimé / réel** : 20 min estimé (UFR-019 corrigé) / 25 min réel (incl. compose + TD entry + RUN_LOCAL note).
- **Comment fix a été appliqué** :
  1. `museum-backend/docker-compose.dev.yml § redis` : ajout `command: [redis-server, --requirepass, ${REDIS_PASSWORD:-dev-redis-password}]` + healthcheck `redis-cli -a ... PING`.
  2. `museum-backend/docker-compose.dev.yml § backend` : ajout `environment: { REDIS_HOST: redis, REDIS_PORT: 6379, REDIS_PASSWORD: ${REDIS_PASSWORD:-dev-redis-password}, REDIS_URL: redis://:...@redis:6379 }` + `depends_on: redis: service_healthy`.
  3. Force-recreate : `docker compose -f museum-backend/docker-compose.dev.yml up -d --force-recreate redis backend`.
  4. Verify : `docker logs dev-backend --since 5m 2>&1 | grep -cE "(Stream isn't writeable|password was supplied)"` → 0.
- **Sentinel coverage ajoutée** (closing-the-loop défense en profondeur) :
  - `scripts/sentinels/compose-parity.mjs` : vérifie que les flags critiques (`--requirepass`, `--appendonly`) présents en prod le sont aussi en dev pour chaque service partagé. Wired pre-commit Gate 7 + CI quality gate.
  - `scripts/sentinels/dev-container-env-drift.sh` : compare `docker exec dev-backend printenv` vs `.env` actuel. Intégré dans `scripts/morning-check.sh`.
- **Owner** : Tim (closed within the audit run).
- **Liens** :
  - Audit diagnostic : `.claude/skills/team/team-state/2026-05-18-audit-dev-backend-bullmq-noise/diagnostic.md` (482 lignes).
  - Memory `feedback_zero_bypass` (case study 2026-05-17 S4-P0-02 dev-backend cassé).
  - Adjacent TDs : TD-41/42/43 (W3 follow-ups commit `35c43988`).

---

### TD-11 — `@types/express-serve-static-core` pin à 5.0.6 (param widening 5.1.x)

- [x] **Statut** : fermé 2026-05-15 — archivé 2026-05-21 (db verdict : RESOLVED, déjà coché, vérifié vs `museum-backend/package.json:91` `@types/express-serve-static-core: ^5.1.1` en devDependency directe, plus de clé dans `pnpm.overrides`).
- **Localisation** :
  ```
  museum-backend/package.json:pnpm.overrides.@types/express-serve-static-core = "5.0.6"  (retiré)
  ```
- **Symptôme** : la version 5.1.0 / 5.1.1 a élargi `req.params[key]` de `string` à `string | string[]` → 27+ erreurs `TS2322` / `TS2345` sur les `*.route.ts` BE. Pin à 5.0.6 conservait la sémantique 5.0.x.
- **Sprint d'origine** : 2026-05-14 (rollback Renovate PR #277 absorbé puis neutralisé via override pin).
- **Closure 2026-05-15** :
  1. Suppression de la clé `pnpm.overrides."@types/express-serve-static-core"` (doctrine bury-dead-code) + ajout explicite de `@types/express-serve-static-core: ^5.1.1` en `devDependencies` pour forcer le lockfile à re-résoudre.
  2. Helper `parseStringParam(req, key): string | undefined` créé dans `museum-backend/src/shared/middleware/parseStringParam.ts` (16 lignes, rejette `string[]` et `''`).
  3. Codemod sur 11 fichiers route, 22 call sites narrowed + 1 helper interne (`bySession` dans `rate-limit.middleware.ts`).
  4. tsc final : 0 erreurs (28 erreurs réelles mesurées, pas 27+). Lint : 0 warnings. BE test suite : 5404 passed / 5497 total (93 skipped, 0 fail).

---

### TD-EX-01 — Rate-limiter ordering : reads `req.body` BEFORE Zod validator

- [x] **Statut** : RESOLVED 2026-05-19 — archivé 2026-05-21 (db verdict : déjà marqué RESOLVED, vérifié vs code).
- **Run** : 2026-05-19-cluster5-jwt-ratelimit.
- **Diff scope** : 6 route sites réordonnés — `/login`, `/refresh`, `/social-login`, `/social-redeem` (`auth-session.route.ts`), `/mfa/challenge`, `/mfa/recovery` (`mfa.route.ts`). Chat routes (`chat-message`, `chat-media`, `chat-compare`) confirmées already-correct via R10 regression guard. Vérifié 2026-05-21 : `auth-session.route.ts:102-106` chaîne `/login` = `loginLimiter → validateBody(loginSchema) → loginByAccountLimiter` ; `mfa.route.ts:156-159` `/challenge` = `validateBody(challengeSchema) → challengeLimiter`.
- **CVE coverage** : DoS account-bucket fermé — `validateBody` (Zod 400) short-circuit avant tout counter body-keyed.
- **Regression guard** : `tools/ast-grep-rules/body-keyed-rate-limit-after-validate-body.yml` (severity: error) wired in `sgconfig.yml:11-12` (`ruleDirs: [tools/ast-grep-rules]`, root) + `.husky/pre-push` Gate 14.
- **Tests** : `middleware-ordering.test.ts` (10 unit), `rate-limit-zod-400-no-bump.integration.test.ts` (8 integration), `/metrics` cardinality guard R9.G.
- **Context** : 7 call sites plaçaient des rate-limiters MUTANT le counter AVANT le validator Zod → counter inflation sur invalid bodies (funnel corruption OU account-targeted DoS via spam de bodies login malformés).
- **Evidence** : `auth-session.route.ts:102-106`, `mfa.route.ts:156-159`.

---
