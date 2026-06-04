# Tech Debt — Musaium

> **Source de vérité unique** pour les dettes techniques identifiées et non encore résolues.
> Mise à jour à chaque sprint via `/team` skill.
> Items résolus → cocher `[x]` et garder 1 sprint avant de purger.
> **Différent des roadmaps** : la roadmap décrit les features à shipper, ce fichier décrit les compromis pris qui devront être nettoyés.
> **Dernière consolidation : 2026-05-21** — application des 10 verdicts read-only du refresh lib-docs 2026-05-20 (95 libs). Voir `lib-docs/.refresh-2026-05-20/td-verdicts/`.

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

## Bumps recommandés (refresh 2026-05-20)

> Issu du verdict `deps-versions` (refresh lib-docs 2026-05-20/21). Classés SECURITY (bumper pre-V1) | ROUTINE (Renovate) | LOCKED (ne PAS bumper). `pinned` = valeur `package.json` à l'audit ; `latest` = npm latest.

### 🔒 SECURITY — bumper pre-V1

| lib | app | pinned → latest | raison |
|---|---|---|---|
| **pg** | BE | 8.20.0 → **8.21.0** | Fix prototype-pollution (PR #3656) sur les noms de colonnes server-supplied (`__proto__` row-builder) + `scramMaxIterations` DOS defuse + SASLprep. Pas de CVE enregistrée, risque réel via proxy untrusted. Pas d'API change → single-line bump. |
| **axios** | FE | 1.16.0 → **1.16.1** | Prototype-pollution (CVE-2026-42033/42035/42264) + CRLF/header-injection (CVE-2026-42037) corrigés 1.15.1→1.16.1, classe applicable au path XHR RN. `^1.16.0` permet le patch. (SSRF/proxy CVEs NON applicables — RN n'a pas l'adapter http/proxy Node.) `npm update axios`. |

### ROUTINE — fenêtre Renovate

| lib | app | pinned → latest | note |
|---|---|---|---|
| @sentry/react-native | FE | ^8.9.1 → 8.11.1 | iOS AVAsset crash fix (HLS offline, non utilisé). GHSA-68c2-4mpx-qh95 auth-token leak : range 8.9.1 indéterminée, env-only token mitige → **re-classer SECURITY si la range confirme 8.9.1**. |
| react-native-webview | FE | 13.16.0 → 13.16.1 | iOS SIGABRT fix (= TD-RNWV-03). |
| maplibre-react-native | FE | 11.0.0 → 11.2.1 | 11.0.1 Android GeoJSONSource memory fix (pertinent : GeoJSON clustered all-museums). Pas de CVE. |
| @expo/vector-icons | FE | ^15.0.3 → **15.1.1** | **15.1.0 burned upstream → pin 15.1.1** (skip 15.1.0). |
| typeorm | BE | 0.3.28 → 0.3.30 | 0.3.29 `limit()` validation Update/SoftDelete (expo Musaium LOW) + 0.3.30 `JsonContains` array fix. **Rester 0.3.x jusqu'à V1 ; 1.0.0 (2026-05-19) → Q3 2026.** |
| i18next | FE | 26.0.6 → 26.2.0 | **Paire** : react-i18next 17.0.8 peer-requires i18next ≥ 26.2.0. NE PAS descendre sous 26.0.6 (release sécu ReDoS/log-forge). |
| react-i18next | FE | 17.0.4 → 17.0.8 | **Paire** : bumper ENSEMBLE avec i18next ≥ 26.2.0 (hazard fresh-install si bumpé seul). |
| @shopify/flash-list | FE | 2.0.2 → 2.3.1 | 2.2.1 fixe sticky-header disparaissant sur **RN 0.83** (version exacte Musaium, PR #2069) ; 2.3.1 ajoute MVCP (unblock TD-FL-02). |
| recharts | WEB | (patch) | patch routine. |
| uuid | FE/BE | → 11.1.1 | GHSA-w5hq-g745-h8pq backporté à 11.1.1 → déjà patché au pin. v14 inutile. |
| @opentelemetry/api · resources · semantic-conventions | BE | patches | **semantic-conventions : skip 1.41.0 (YANKED) → 1.41.1.** REJETER toute PR 1.41.0. |

### LOCKED — NE PAS bumper

| lib | raison |
|---|---|
| @react-native-async-storage/async-storage | v3.x = scoped-storage breaking + NON compatible Expo SDK 54+ + Android 16 KB page-size failure. 2.2.0 = pin maximal correct Expo SDK 55. |
| @react-native-community/netinfo | v12.0.0 BREAKING (iOS 14+/RN 0.76+ min + entitlement Access Wi-Fi Information → Apple portal). Defer post-launch. |
| p-limit | ESM lock — rester v3 (évite le break ESM-only en surface CJS). |
| motion | `13.0.0-alpha.0` = pre-release, NE PAS adopter. Rester ≥12.37.0 (12.39.0 actuel). |
| @opentelemetry/sdk-node · exporter-trace-otlp-http · auto-instrumentations-node | track expérimental 0.x ; 0.218.0 = serializer rewrite → smoke-test Tempo requis (DEFERRED). |

---

## Tech debts ouverts

- ~~TD-1 (fermé 2026-05-15)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-1--userprofileapits-utilise-httprequest-raw-au-lieu-de-openapirequest)

---

- ~~TD-2 (fermé 2026-05-15)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-2--bootstrapprofile-cross-device-hydration-manquante)

---

- ~~TD-3 (fermé 2026-05-15)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-3--maplibre-offline_style_url-pointe-vers-demotiles-au-lieu-dun-self-hosted-cartodb)
- ~~TD-5 (fermé 2026-05-16)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-5--bake-chat_enrichment_v2_enabled-puis-flip-default-code)
- ~~TD-4 (fermé 2026-05-15)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-4--pas-de-test-dintégration-real-pg-sur-les-3-prune-retention-use-cases)
- ~~TD-6 (fermé 2026-05-15)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-6--chaos-circuit-breakere2e-half_openclosed-test-cannot-run-without-orchestrator-stub-swap)

---

- ~~TD-7 (fermé 2026-05-20)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-7--eslint-version-skew-résolu-all-v9--v10-upgrade-deferred-upstream)
- ~~TD-8 (fermé 2026-05-15)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-8--cull-3-remaining-single-impl-chat-ports-image-processor-knowledge-router-llm-judge)
- ~~TD-9 (fermé 2026-05-15)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-9--mobile-test-chat-session-deeptesttsx--togglerecordingplayrecordedaudio-failing-on-main)

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

- ~~TD-11 (fermé 2026-05-15, archivé 2026-05-21)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-11--types-express-serve-static-core-pin-à-506-param-widening-51x)

---

### TD-12 — `audit-ip-anonymizer` job sans integration test real-PG

- [ ] **Statut** : ouvert (créé 2026-05-16, audit Pattern 3 post-TD-4)
- **Référence code** :
  ```
  museum-backend/src/shared/audit/audit-ip-anonymizer.job.ts:72-86
    const result = await manager.query<UpdateResult>(`UPDATE "audit_logs" SET "ip" = CASE ...`, [ids]);
    // reads result[1] via Array.isArray && typeof result[1] === 'number' guard (L86)
  museum-backend/tests/unit/audit/audit-ip-anonymizer.test.ts   # unit-only, mock faithful but pas vraie PG
  ```
- **Symptôme** : le job consomme le tuple pg-driver `[rows, rowCount]` côté `result[1]` (même archetype que l'incident retention 2026-05-08 fixé par TD-4). MAIS le caller `audit-cron.registrar.ts:107` (BullMQ worker) est single-shot par tick — **pas de `while` drain loop** — donc une régression du shape ne peut pas busy-loop. Worst-case = un tick under-count, pas une outage. Le job est défendu par `SET LOCAL app.audit_anonymization_allowed` + trigger `prevent_audit_log_mutation`.
- **Sprint d'origine** : audit Pattern 3 (post-TD-4 retention integration), 2026-05-16.
- **Pourquoi c'est important** : la métrique `anonymized` est le **signal d'audit CNIL/RGPD** (combien d'audit logs ont eu leur IP anonymisée après 13 mois). Une régression silencieuse (count drift) compromet la conformité reportée, même sans outage.
- **Effort estimé** : ~30 minutes (réutiliser pattern TD-4 retention integration tests).
- **Comment fermer** :
  1. Créer `museum-backend/tests/integration/audit/audit-ip-anonymizer.integration.test.ts` avec `createIntegrationHarness()`.
  2. Fixture : ~1k audit_logs avec `created_at < NOW() - INTERVAL '13 months' AND ip IS NOT NULL`.
  3. Run job, assert `anonymized` matches actual mutated count + idempotent re-run yields 0.
  4. Vérifier que les rows avec `created_at < 13 months` ont `ip` = `NULL` post-run.
  5. Cocher TD-12 ici.

---

### TD-13 — Compléter migration `httpRequest` → `openApiRequest` (4 callsites résiduels)

- [ ] **Statut** : ouvert (créé 2026-05-16, audit Pattern 4 post-TD-1)
- **Référence code** :
  ```
  # Migratable now (endpoint déjà déclaré dans openapi.json)
  museum-frontend/features/chat/infrastructure/chatApi/audio.ts:80   # postAudioMessage → openapi.json:3802
  museum-frontend/features/chat/infrastructure/chatApi/send.ts:143   # postMessage    → openapi.json:3674
  
  # BE-blocked (endpoint pas déclaré OU type binary non supporté)
  museum-frontend/features/museum/infrastructure/museumApi.ts:151,166  # getEnrichment + getEnrichmentStatus, openapi.json ABSENT
  museum-frontend/features/chat/infrastructure/chatApi/audio.ts:94   # synthesizeSpeech, openapi.json:4014 mais return audio/mpeg binary que openApiRequest ne type pas
  ```
- **Symptôme** : TD-1 a migré `userProfileApi.ts` mais la doctrine type-safe API client n'est pas codebase-wide. 4 callsites consomment encore `httpRequest` brut, drift potentiel entre BE response shape et FE consumers non détectable au tsc.
- **Sprint d'origine** : audit Pattern 4 (post-TD-1 / TD-2 BE work), 2026-05-16.
- **Effort estimé** : 
  - **Phase 1 (migratable now)** : ~30 minutes pour les 2 callsites chat (pattern = `authApi.ts:1-19`).
  - **Phase 2 (BE-blocked)** : ~2 heures — déclarer 2 paths museum/enrichment dans `museum-backend/openapi/openapi.json` (template = `/auth/tts-voice` ligne 3113), regen FE types, migrate. Pour `synthesizeSpeech` binary : étendre `openApiRequest` avec option `responseType: 'arraybuffer'` OU documenter comme exception permanente.
- **Comment fermer** :
  1. **Phase 1** : migrer `postAudioMessage` + `postMessage` vers `openApiRequest` (FormData support déjà OK via short-circuit `Content-Type` dans `httpRequest.ts:38`).
  2. **Phase 2.1** : déclarer `GET /api/museums/{id}/enrichment` + `/enrichment/status` dans `openapi.json` (template `/auth/tts-voice`).
  3. **Phase 2.2** : regenerate FE types via `npm run generate:openapi-types`, migrer `museumApi.ts:151,166`, supprimer le typage manuel `MuseumEnrichmentResponse`.
  4. **Phase 2.3** : trancher pour `synthesizeSpeech` — soit étendre `openApiRequest` (`responseType: 'arraybuffer'` + return type non-JSON) soit l'exception permanente documentée.
  5. Cocher TD-13 ici.

---

### TD-14 — Offline mode coverage gaps (banner non-global, no airplane e2e, dataModeStore race)

- [ ] **Statut** : PARTIELLEMENT FERMÉ 2026-05-21 (run `2026-05-21-connectivity-offline-first`, ADR-059) — steps 1, 2, 3 + 5 (= TD-OM-01) DONE. Step 4 (créer le doc `OFFLINE_CONTRACT.md` sous `docs/`) volontairement NON fait : design.md/STORY.md + ADR-059 suffisent (décision user). Reste ouvert tant que step 4 n'est pas tranché ; sinon contenu livré. Step 1 = `GlobalOfflineBannerHost` mounté `_layout.tsx:217` ; step 2 = `dataModeStore` `_hydrated`+`onRehydrateStorage` ; step 3 = `.maestro/connectivity-offline-banner.yaml`.
- [ ] ~~ouvert (créé 2026-05-16, audit Pattern 6 post-TD-2/TD-3)~~
- **Référence code** :
  ```
  museum-frontend/features/chat/ui/OfflineBanner.tsx                # chat-only, importé seulement dans app/(stack)/chat/[sessionId].tsx
  museum-frontend/features/settings/dataModeStore.ts                # manque _hydrated flag + onRehydrateStorage callback (drift vs userProfile/runtimeSettings/audioDescription stores)
  .github/workflows/ci-cd-mobile.yml                                # Matrix Maestro existe mais 0 scenario airplane-mode pour offline pack tiles
  docs/<absent>                                                     # Aucun contrat offline centralisé (mentions éparses dans TD-2/TD-3 + CLAUDE.md § Voice V1)
  ```
- **Symptôme** : Le mode offline est **réel** (5 features fonctionnelles : 4 stores persist, chat queue 50 msg, chatLocalCache 200 entries, MapLibre OfflineManager + geofence pre-cache, AuthContext token preservation), mais :
  - L'utilisateur sur museum/settings/home n'a aucun feedback visuel quand offline (banner chat-only).
  - `dataModeStore.read()` avant rehydration retourne le default `'auto'` (race possible au boot).
  - Aucun test e2e airplane-mode pour valider end-to-end que les tuiles MapLibre downloaded sont effectivement servies offline.
  - Le contrat offline n'est documenté nulle part centralement → maintenance difficile.
- **Sprint d'origine** : audit Pattern 6 (post-TD-2 bootstrapProfile + TD-3 MapLibre style), 2026-05-16.
- **Effort estimé** : ~1 jour total décomposable.
- **Comment fermer** :
  1. Extraire `OfflineBanner` du chat-only scope → composant `GlobalOfflineBanner` mounté dans `app/_layout.tsx` (probablement sous `ConnectivityProvider`). Couvre museum/settings/home/chat uniformément. Vérifier que le banner chat-only `pendingCount` reste fonctionnel (queue source distinct).
  2. Aligner `dataModeStore` sur le pattern `_hydrated` + `onRehydrateStorage` (cf. `userProfileStore` lignes 29/91 + `audioDescriptionStore` lignes 26/57 comme reference).
  3. Ajouter scenario Maestro `flows/offline-pack-airplane.yaml` : (a) telecharger pack pour une ville, (b) toggle airplane mode (Maestro `runFlow` avec adb shell), (c) ouvrir map, assert tiles raster visibles, (d) toggle off airplane. Brancher dans `ci-cd-mobile.yml` quality job.
  4. Créer le doc `OFFLINE_CONTRACT.md` (sous `docs/`) qui list : (a) stores qui hydratent depuis storage local, (b) chat queue + cache TTL, (c) MapLibre offline packs (CartoDB raster style), (d) features qui nécessitent réseau (Voice STT/TTS, chat LLM call, image enrichment, knowledge router). Liens depuis TD-2, TD-3 closure notes.
  5. **Wire `onlineManager` à NetInfo (= TD-OM-01, ajouté 2026-05-21, MEDIUM-HIGH pre-V1)** — le sous-gap le plus à fort levier, non couvert par les steps 1-4 : `onlineManager.setEventListener(...)` au bootstrap pour que `refetchOnReconnect`/`networkMode:'online'` self-heal sur device. Évidence consommateur : `DataModeProvider.tsx:80-82` (pas de gate `_hydrated`), `queryClient.ts:54-55`. Voir TD-OM-01 pour le détail.
  6. Cocher TD-14 + TD-OM-01 ici.

---

- ~~TD-15 (fermé 2026-05-17, option a)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-15--low-data-mode-user-facing-copy-ment-ufr-013-violation)
- ~~TD-16 (fermé 2026-05-17)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-16--dead-code-sse-residuals-adr-001-retired-2026-05-03--fermé-2026-05-17)

---

- ~~TD-17 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-18 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-19 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
### ~~TD-20 — Langfuse generations résiduelles sur les 4 paths non-LangChain (per-tenant cost attribution)~~ — RÉSOLU 2026-05-21 (cluster PARTIEL : TD-20a + TD-20b restent OUVERTS)

> **⚠️ Re-confirmé 2026-05-25 (audit D8)** : le tronc TD-20 est bien résolu, mais le **cluster n'est PAS entièrement fermé** — les 2 follow-up **TD-20a** (`museumId` absent sur les paths guardrail) et **TD-20b** (STT unit interim `BYTES`) ci-dessous **restent ouverts** (`[ ]`). Ne pas archiver le cluster comme totalement clos.

> **Résolu 2026-05-21** (`/team` run `2026-05-21-td20-langfuse-llm-paths`, review APPROVED 9.4/10, security PASS, verify PASS — 2146 tests, tsc clean). Les 4 paths LLM non-LangChain émettent désormais `generation()`/`event()` Langfuse via `safeTrace` + `getLangfuse()` fail-open : judge `llm-judge-guardrail.ts` (`generation` model + `metadata.inputLength/estimatedCostCents`, PAS de token usage fabriqué — UFR-013), TTS `text-to-speech.openai.ts` (`generation` `usageDetails:{input:text.length}` + `unit:'CHARACTERS'`), STT `audio-transcriber.openai.ts` (`generation` `usage:{input:byteLength}` + interim `unit:'BYTES'` en metadata, cf TD-20a ci-dessous), LLM-Guard `llm-guard.adapter.ts` (`event` `guardrail.llm-guard.scan` émis APRÈS le verdict — ADR-047 fail-CLOSED structurellement préservé). Helper DRY `src/shared/observability/derive-tier.ts` (parité verbatim avec `langchain.orchestrator.ts`). Plumbing per-tenant `{museumId,tier,requestId}` optionnel ajouté sur 4 ports (spread-omit idiom → backward-compat, aucune fixture cassée). Chat path déjà couvert depuis C9.4/TD-LF-02 (2026-05-18), hors scope ici (UFR-016, non re-touché).

- [x] **Statut** : résolu 2026-05-21 (créé 2026-05-17, audit NORTHSTAR Agent G + B T1-B.1 ; re-scopé 2026-05-21 ; clos par run TD-20)
- **Référence code (post-résolution)** :
  ```
  museum-backend/src/shared/observability/derive-tier.ts                                          # helper tier DRY (nouveau)
  museum-backend/src/modules/chat/useCase/llm/llm-judge-guardrail.ts                              # generation judge
  museum-backend/src/modules/chat/adapters/secondary/audio/text-to-speech.openai.ts              # generation TTS (CHARACTERS)
  museum-backend/src/modules/chat/adapters/secondary/audio/audio-transcriber.openai.ts           # generation STT (BYTES interim)
  museum-backend/src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts             # event guardrail.scan
  museum-backend/src/shared/observability/safeTrace.ts                                            # fail-open helper (réutilisé)
  ```
- **Sprint d'origine** : audit /team 360° 2026-05-16 (G + B Gap-9).
- **Effort réel** : 1 run `/team` (spec→plan→red→green→verify→security→review→documenter), inclus une boucle `BLOCK-TEST-WRONG` (red re-spawn). Estimé 1-2j, réalisé en un run.
- **Suivi** : 2 follow-up honnêtes découverts pendant le run → **TD-20a** + **TD-20b** ci-dessous.

#### TD-20a — `museumId` absent sur les paths guardrail (suivi TD-20)

- [ ] **Statut** : ouvert (découvert 2026-05-21, run TD-20)
- **Symptôme** : la propagation per-tenant `{museumId,tier,requestId}` est complète sur judge/TTS/STT mais **partielle côté guardrail** : `GuardrailAuditContext` ne porte pas `museumId`, donc l'`event()` LLM-Guard ne peut pas l'attacher. L'ajouter = changement de contrat **route-level** (threading `museumId` depuis la route chat jusqu'au contexte guardrail), hors scope d'un run telemetry-only.
- **Comment fermer** : étendre `GuardrailAuditContext` avec `museumId?` + propager depuis la route chat (point d'entrée où le museum est résolu) jusqu'à `llm-guard.adapter.ts`. Vérifier qu'aucun autre consommateur du contexte ne régresse.

#### TD-20b — STT unit interim `BYTES` (suivi TD-20, D-Q1 deferred)

- [ ] **Statut** : ouvert (découvert 2026-05-21, run TD-20 ; décision D-Q1 deferred)
- **Symptôme** : la `generation()` STT émet `usage:{input:byteLength}` avec `unit:'BYTES'` rangé en **metadata** (free-form) — `BYTES` n'est PAS un membre valide de `ModelUsageUnit` (`CHARACTERS|TOKENS|MILLISECONDS|SECONDS|IMAGES|REQUESTS`, cf. LESSONS.md LF-V3-14). Sans durée audio, on ne peut pas émettre la vraie unité de pricing Whisper (`SECONDS`, `$0.0001/sec`). L'octet-count est un proxy interim ; aucun catalog `gpt-4o-mini-transcribe` n'existe encore donc pas de coût inféré trompeur.
- **Comment fermer** : calculer la durée audio (`getAudioDurationSeconds`) côté adapter STT → émettre `usageDetails:{input:durationSeconds}` + `unit:'SECONDS'` + ajouter `gpt-4o-mini-transcribe` au catalog Langfuse (`inputPrice: 0.0001`, `unit: 'SECONDS'`).

---

- ~~TD-21 (fermé 2026-05-17)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-21--ssehelpersts-résiduel-post-sse-cull--closed-2026-05-17)

---

### TD-22 — 14 chat ports single-impl à inliner (suite TD-8)

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-2026-05-12 P1-3)
- **Référence code** :
  ```
  museum-backend/src/modules/chat/domain/ports/audio-storage.port.ts
  museum-backend/src/modules/chat/domain/ports/audio-transcriber.port.ts
  museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts
  museum-backend/src/modules/chat/domain/ports/embeddings.port.ts
  museum-backend/src/modules/chat/domain/ports/guardrail-provider.port.ts
  museum-backend/src/modules/chat/domain/ports/image-source.port.ts
  museum-backend/src/modules/chat/domain/ports/image-storage.port.ts
  museum-backend/src/modules/chat/domain/ports/ocr.port.ts
  museum-backend/src/modules/chat/domain/ports/pii-sanitizer.port.ts
  museum-backend/src/modules/chat/domain/ports/tts.port.ts
  museum-backend/src/modules/chat/domain/ports/wikidata-kb-dump.port.ts
  museum-backend/src/modules/chat/domain/ports/knowledge-base.port.ts
  museum-backend/src/modules/chat/domain/ports/reranker.port.ts
  museum-backend/src/modules/chat/domain/ports/web-search.port.ts
  ```
- **Sprint d'origine** : audit-2026-05-12 P1-3 (TD-8 closed 3 ports). **Compte corrigé 2026-05-21 (sweep multi-agent)** : 14 ports `*.port.ts` réels sur disque (les 11 historiques + knowledge-base + reranker + web-search), pas 13.
- **Effort estimé** : 1-2 jours sélectifs. ~700 LOC d'indirection à supprimer.
- **Comment fermer** : appliquer policy ADR-058 (selective hexagonal ports) — pour chaque port single-impl sans valeur swap (prod-vs-test), inliner dans le sole consumer. Garder uniquement ceux ayant un fake/stub utile en test (ex: `audio-transcriber.port.ts` si OpenAI Whisper est mocké via fake in-memory).

---

### ✅ TD-23 — `@musaium/shared` sentry-scrubber : ratifier la divergence hash-algo (ADR-045) (RÉSOLU INFO 2026-05-21)

> **Re-scopé 2026-05-21 (observability verdict, INFO)** : **l'extraction est largement FAITE.** Le package `packages/musaium-shared/src/observability/sentry-scrubber.ts` (+ `.test.ts`) existe ; les 3 fichiers app sont désormais des **thin re-exports** qui importent la logique de scrub depuis `@musaium/shared/observability` et n'injectent que le `hashEmail` runtime-specific (`museum-backend/src/shared/observability/sentry-scrubber.ts:8-16`, `museum-web/src/lib/sentry-scrubber.ts:13-43`, `museum-frontend/shared/observability/sentry-scrubber.ts`). Le drift "sync manuelle" est résolu, gardé par `scripts/sentinels/sentry-scrubber-parity.mjs`. **Résiduel = la divergence d'algo email-hash est désormais INTENTIONNELLE** (BE = SHA-256-8hex via `node:crypto` ; FE+Web = fold 32-bit runtime-agnostic, pas de polyfill `crypto`), documentée in-file (`museum-web/src/lib/sentry-scrubber.ts:6-9,22-27`). Le close-goal original ("aligner sur sha256-8hex, BE source de vérité") n'a PAS été exécuté ; à la place la divergence a été rendue intentionnelle. Reste à ratifier dans ADR-045. Plus un P0.

- [x] **Statut** : résolu INFO 2026-05-21 (créé 2026-05-17, audit-2026-05-12-raw F9 G3 ; re-scopé 2026-05-21 — extraction faite ; fermé via amendement ADR-045 « Amendment 2026-05-21 » qui ratifie la divergence hash-algo comme intentionnelle, pas de code)
- **Référence code** :
  ```
  packages/musaium-shared/src/observability/sentry-scrubber.ts        # source partagée
  museum-backend/src/shared/observability/sentry-scrubber.ts:8-16     # thin re-export + SHA-256 hashEmail
  museum-web/src/lib/sentry-scrubber.ts:13-43                         # thin re-export + 32-bit fold hashEmail
  museum-frontend/shared/observability/sentry-scrubber.ts             # même pattern
  ```
- **Symptôme** : ~~3 fichiers manuellement synchronisés~~ (résolu — package partagé + sentinel parity). Résiduel : email-hash inconsistency BE = sha256-8hex vs FE+Web = 32-bit fold-8hex, désormais by-design.
- **Sprint d'origine** : audit-2026-05-12-raw F9 G3.
- **Effort estimé** : INFO — amendment ADR-045 (ratifier la divergence comme intentionnelle), pas de code.
- **Comment fermer** : amender ADR-045 pour documenter que la divergence hash-algo BE↔FE/Web est intentionnelle (runtime-agnostic côté client, pas de polyfill `crypto`), OU fermer comme INFO. L'extraction `packages/musaium-shared/` est faite.

---

- ~~TD-24 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-25 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
### TD-26 — 15 Sentry alerts non-provisionnées

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-2026-05-12-raw F9 G6)
- **Référence code** : 15 alerts référencées dans `docs/AI_VISUAL_SIMILARITY.md`, `docs/adr/ADR-011-rate-limit-fail-closed.md`, `docs/incidents/BREACH_PLAYBOOK.md`, `docs/RUNBOOKS/CERT_ROTATION.md`.
- **Symptôme** : docs prescrivent des alertes Sentry mais aucune n'est actuellement provisionnée côté Sentry UI.
- **Sprint d'origine** : audit-2026-05-12-raw F9 G6.
- **Effort estimé** : 0.5 jour.
- **Comment fermer** : provisioning manuel UI Sentry ou via sentry-terraform. Cross-check chaque alert mentionnée dans les 4 docs sources.

---

### TD-27 — Audit chain post-restore verification manquante

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-2026-05-12-raw R25 §1)
- **Référence code** : R25 §1 audit-2026-05-12-raw. Monthly drill workflow only runs `count(audit_logs)` smoke, no `audit-chain verify`.
- **Symptôme** : RPO bounded at 24h (no WAL archiving). Restore drill ne vérifie pas l'intégrité de la chaîne hash post-restore.
- **Sprint d'origine** : audit-2026-05-12-raw R25.
- **Effort estimé** : 1h ajouter `audit-chain verify` step au drill workflow.
- **Comment fermer** : éditer le drill workflow (`.github/workflows/restore-drill.yml` ou équivalent) pour ajouter step `node scripts/audit-chain-verify.cjs` après restore.

---

- ~~TD-28 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
### TD-29 — bcrypt → argon2 migration

- [ ] **Statut** : ouvert — **plan rédigé 2026-05-20** : [`docs/PASSWORD_HASH_MIGRATION.md`](PASSWORD_HASH_MIGRATION.md). Execution reste DEFER-POST-LAUNCH (V1 ships bcrypt-12, OWASP-acceptable). bcrypt cost floor désormais gardé par `museum-backend/tests/unit/auth/bcrypt-cost-factor.test.ts` (≥12, ≤15).
- **Référence code** : 7 use sites dans `museum-backend` (énumérés dans le plan §2).
- **Symptôme** : bcrypt abandonné upstream. argon2id = OWASP recommended (memory-hard, side-channel resistant). Verdict audit : "DEFER-POST-LAUNCH high".
- **Sprint d'origine** : team-report 2026-05-15-renovate-audit.
- **Effort estimé** : 1-2 sprints (design + migration + rehash on next login window).
- **Comment fermer** : suivre `docs/PASSWORD_HASH_MIGRATION.md` — Phase A (dual-hash facade, write argon2id + verify-both + rehash-on-login, ferme aussi TD-BC-02), Phase B (cold-tail), Phase C (drop bcrypt, probablement jamais). Post-launch V1.

---

- ~~TD-30 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
### TD-31 — `prom-client` → `@opentelemetry/exporter-prometheus`

- [ ] **Statut** : ouvert (créé 2026-05-17, team-report 2026-05-15-renovate-audit)
- **Référence code** : `museum-backend/` prom-client.
- **Symptôme** : prom-client abandonné. Swap security-positive (OTel exporter mieux maintenu, aligné avec stack OTel existante).
- **Sprint d'origine** : team-report 2026-05-15-renovate-audit.
- **Effort estimé** : 1 jour.
- **Comment fermer** : migrer chaque metric (counters, gauges, histograms) vers OTel API. Tester scrape Prometheus rendu identique.

---

### TD-32 — `swagger-ui-express` → Scalar

- [ ] **Statut** : ouvert (créé 2026-05-17, team-report 2026-05-15-renovate-audit)
- **Référence code** : `museum-backend/` swagger-ui-express.
- **Symptôme** : swagger-ui-express abandonné. Scalar = alternative moderne (better UX, OpenAPI 3.1 native).
- **Sprint d'origine** : team-report 2026-05-15-renovate-audit.
- **Effort estimé** : 0.5 jour.
- **Comment fermer** : swap dep + remplacer middleware mount dans `app.ts`. Vérifier `/api/docs` rendu OK.

---

### TD-33 — `@mozilla/readability` → Defuddle

- [ ] **Statut** : ouvert (créé 2026-05-17, team-report 2026-05-15-renovate-audit)
- **Référence code** : `museum-backend/` scraper layer.
- **Symptôme** : `@mozilla/readability` abandonné. Defuddle = drop-in moderne mieux maintenu.
- **Sprint d'origine** : team-report 2026-05-15-renovate-audit.
- **Effort estimé** : 0.5 jour.
- **Comment fermer** : swap dep + adapter le call site. Tester sur ~10 URLs réf que la qualité extraction soit équivalente.

---

### TD-34 — Maestro path discrepancy

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 S3 follow-up #1 ; compte corrigé 4→6 le 2026-05-21, mobile verdict)
- **Référence code** : `museum-frontend/maestro/` (sans dot) contient **6** flows (`capture-screens.yaml`, `login-and-capture.yaml`, `paywall-quota-exhaustion.yaml`, `rtl-switch-ar.yaml`, `screenshots.yaml`, `voice-record-and-tts.yaml`) — aucun n'apparaît dans `museum-frontend/.maestro/shards.json:1-49` (avec dot), que lit la CI.
- **Symptôme** : flows ajoutés à `maestro/` (sans dot) ne sont jamais picked up par CI qui lit `.maestro/shards.json`. Silent skip = false sense of coverage.
- **Sprint d'origine** : audit-360 S3 follow-up #1.
- **Effort estimé** : 30 min.
- **Comment fermer** : relocate les **6** flows vers `.maestro/` + ajouter au shard manifest. Triage : `paywall-quota-exhaustion`/`rtl-switch-ar`/`voice-record-and-tts` = coverage réelle intentionnelle ; `screenshots`/`capture-screens`/`login-and-capture` = potentiellement utilitaires screenshot dev-only (juger avant de promouvoir). Vérifier la sentinelle CI `shard-manifest`.

---

### TD-35 — Stale `.maestro/audio-recording-flow.yaml`

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 S3 follow-up #2)
- **Référence code** : `museum-frontend/.maestro/audio-recording-flow.yaml` — référence label "Hold to talk" + env hook `MAESTRO_AUDIO_FIXTURE` jamais wired.
- **Symptôme** : flow Maestro pointe vers UI label obsolète + env hook fantôme. UFR-016 burial candidate ("il est mort on l'enterre").
- **Sprint d'origine** : audit-360 S3 follow-up #2.
- **Effort estimé** : 15 min.
- **Comment fermer** : `git rm` le flow si dead, sinon rewire avec label actuel + env hook fonctionnel.

---

### TD-36 — `QuotaUpsellModal` manque testIDs

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 S3 follow-up #3)
- **Référence code** : `museum-frontend/features/paywall/ui/QuotaUpsellModal.tsx`.
- **Symptôme** : modal sans testIDs → Maestro flows ne peuvent pas asserter ses éléments avec précision (fallback texte → fragile i18n).
- **Sprint d'origine** : audit-360 S3 follow-up #3.
- **Effort estimé** : 30 min V1.1.
- **Comment fermer** : add testIDs `paywall-modal-{root,email,consent,submit,dismiss,reset-meta}` sur les nodes correspondants. Mettre à jour les flows Maestro pour utiliser ces ids.

---

- ~~TD-37 (fermé 2026-05-17)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-37--ratchet-checksh-cap-mutationscore-formula-refactor-timeout-as-kill-doctrine)
- ~~TD-38 (fermé 2026-05-17)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-38--ratchet-checksh-repo_root-hardcoded)

---

### TD-39 — `module-auth` umbrella Stryker wrapper manquant

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 S3 follow-up #7)
- **Référence code** : seuls 3 sub-wrappers (`login-handler`, `mfa-route`, `totp`) existent dans Stryker scope `module-auth`.
- **Symptôme** : pas d'umbrella wrapper qui agrège — impossible de run Stryker sur l'ensemble module-auth en une commande, fragmentation des rapports.
- **Sprint d'origine** : audit-360 S3 follow-up #7.
- **Effort estimé** : 30 min.
- **Comment fermer** : ajouter wrapper umbrella `module-auth` qui inclut les 3 sub-scopes + n'importe quel additional file `src/modules/auth/**/*.ts` non couvert.
### TD-40 — `noUncheckedIndexedAccess` absent côté backend (drift vs FE/Web)

- [ ] **Statut** : ouvert (créé 2026-05-16, audit-360 S1 § 4.2 ; renumber TD-16→TD-40 au merge 2026-05-17 car S3 avait pris TD-16 entre temps)
- **Référence code** :
  ```
  museum-backend/tsconfig.json:1-35   # compilerOptions.noUncheckedIndexedAccess ABSENT
  museum-frontend/tsconfig.json       # noUncheckedIndexedAccess: true (cf audit § 4.1)
  museum-web/tsconfig.json            # noUncheckedIndexedAccess: true (cf audit § 4.1)
  ```
- **Symptôme** : drift tsconfig entre les 3 apps. FE + Web ont `noUncheckedIndexedAccess: true` (cf audit S1 § 4.1), BE non. Conséquence : `array[i]` est typé `T` au lieu de `T | undefined`, masquant potentiellement des `TypeError: Cannot read property of undefined` runtime sur les optional indexes (top-K, pagination, validators arrays).
- **Pourquoi non résolu pré-launch** : 35-50 sites estimés à patcher (per audit Subagent A — array indexing : `topK[0]`, pagination, validators arrays dans `similarity.service.ts`, `chat-repository-queries.ts`, `chat.repository.typeorm.ts`, `jsonb-validator.ts`, `sources-validator.ts`). Effort 8-12h. Pré-launch J-16, on a P0 langfuse v3 EOL (T1.1) + P0-8 JWKS Zod casts (T1.2) plus prioritaires. ROI MEDIUM — le pattern existant `?.` est suffisamment défensif per audit 05-12.
- **Sprint d'origine** : audit 2026-05-16 (S1 § 4.2).
- **Effort estimé** : 8-12h.
- **Trigger** : toute mention `noUncheckedIndexedAccess` en code review, OU lecture audit 2026-05-16 § 4.2, OU détection d'un `TypeError: Cannot read property X of undefined` runtime sur un index array BE.
- **Deadline** : post-V1 sprint 1 (fenêtre 2026-06-01 → 2026-06-30).
- **Owner** : Tim (single-dev pre-launch).
- **Comment fermer** :
  1. Ajouter `"noUncheckedIndexedAccess": true` dans `museum-backend/tsconfig.json` (compilerOptions).
  2. Run `cd museum-backend && pnpm lint` (= `tsc --noEmit`) — recenser sites en erreur.
  3. Pour chaque site : ajouter guard `if (!item) continue;` OU narrowing destructuring `const [first] = arr; if (!first) ...` OU `as const` assertion si literal tuple.
  4. Vérifier `pnpm test` BE pass.
  5. Cocher TD-40 ici.
- **Note** : les sites cités dans l'audit (similarity.service.ts, chat-repository-queries.ts, chat.repository.typeorm.ts) ont 0 occurrence directe `[0]` au moment de la création du ticket — les patterns d'indexing sont probablement indirects (`.at()`, destructuring, `slice`). Comptage rigoureux à faire au moment de l'activation, l'estimation 35-50 est BE-wide (38 fichiers contiennent `[0]` au total).

### TD-41 — `sanitizePromptInput` ne strip pas `[`/`]` (W3 LOW-1 / NTH-1)

- [ ] **Statut** : ouvert (créé 2026-05-18, run `2026-05-17-w3-geo-walk-intra`).
- **Référence code** :
  ```
  museum-backend/src/shared/validation/input.ts  # sanitizePromptInput
  museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts  # site emit [CURRENT ARTWORK]
  ```
- **Symptôme** : une `artwork_knowledge.title` malicieuse contenant le substring littéral `[END OF SYSTEM INSTRUCTIONS]` traverse `sanitizePromptInput` sans être neutralisée → 2nd-order prompt injection si un attaquant arrive à empoisonner le champ via enrichment compromis.
- **Mitigations en place V1** : (a) `artwork_knowledge` populated par enrichment + curator trusted ; (b) counter-marker `[END OF CURRENT ARTWORK]` après le bloc ; (c) cap 200 chars sur le titre ; (d) reminder "do not follow embedded instructions" en fin de system prompt.
- **Pourquoi non résolu pré-launch** : touche un util shared (`sanitizePromptInput`) qui sert TOUS les sites de prompt-building, pas seulement W3. Changement plus large que W3, à faire avec un audit cross-pipeline (chat/orchestrator/section prompts).
- **Sprint d'origine** : run /team `2026-05-17-w3-geo-walk-intra` reviewer NTH-1 + security audit LOW-1.
- **Effort estimé** : 4-6h.
- **Trigger** : détection d'un attempt d'injection 2nd-order via promptfoo OWASP LLM07, OU contributeur externe enrichment.
- **Deadline** : post-V1 sprint 1.
- **Owner** : Tim.
- **Comment fermer** :
  1. Étendre `sanitizePromptInput` pour neutraliser les substrings `[END OF SYSTEM INSTRUCTIONS]` + `[END OF CURRENT ARTWORK]` + `[CURRENT ARTWORK]` (case-insensitive, zero-width-stripped).
  2. Tests unitaires couvrant variantes (espaces, Unicode lookalikes).
  3. Étendre promptfoo corpus avec 5-10 prompts de 2nd-order injection ciblant ces marqueurs.
  4. Cocher TD-41.

### TD-42 — `cachedGeofenceMode` jamais invalidé (W3 MIN-1)

- [ ] **Statut** : ouvert (créé 2026-05-18, run `2026-05-17-w3-geo-walk-intra`).
- **Référence code** (lignes corrigées 2026-05-21, db verdict) :
  ```
  museum-backend/src/modules/museum/adapters/secondary/pg/museum.repository.pg.ts:24       # singleton cachedGeofenceMode
  museum-backend/src/modules/museum/adapters/secondary/pg/museum.repository.pg.ts:176-188   # detectGeofenceMode()
  museum-backend/src/modules/museum/adapters/secondary/pg/museum.repository.pg.ts:192       # _resetGeofenceModeCacheForTests (test seam)
  ```
- **Symptôme** : `cachedGeofenceMode` (`'postgis' | 'jsonb-bbox' | 'absent'`) résolu au premier appel `findByCoords` et persiste pour la vie du process. Si l'opérateur applique `AddMuseumGeofence` après boot (rolling deploy avec migration in-flight), le cache reste sur `'absent'` indéfiniment.
- **Mitigations V1** : déploiement Musaium = migration pre-boot via script (pas de rolling migration in-flight). Restart service après hot-migration au pire des cas.
- **Sprint d'origine** : run /team `2026-05-17-w3-geo-walk-intra` reviewer MIN-1.
- **Effort estimé** : 1h.
- **Trigger** : migration de geofence appliquée en hot sans restart, OU passage à un mode de déploiement zero-downtime avec migrations rolling.
- **Deadline** : V2 (zero-downtime deploy).
- **Owner** : Tim.
- **Comment fermer** :
  1. Soit ajouter TTL 30s sur `cachedGeofenceMode`.
  2. Soit ajouter docstring warning "requires service restart after geofence migration applies" + check au boot.
  3. Cocher TD-42.

### TD-43 — `geo_detect_museum_total{outcome="miss"}` confond "no match" et "throw" (W3 NTH-2)

- [ ] **Statut** : ouvert (créé 2026-05-18, run `2026-05-17-w3-geo-walk-intra`).
- **Référence code** :
  ```
  museum-backend/src/modules/museum/useCase/detect/detect-museum.useCase.ts:84-91  # catch path, geoDetectMuseumTotal.labels('miss').inc() au :89 (lignes corrigées 2026-05-21, db verdict)
  ```
- **Symptôme** : sur exception, le use-case incrémente `geoDetectMuseumTotal.labels('miss').inc()` après avoir mis à jour le span existant avec `{error}`. Le label `miss` reçoit donc 2 sémantiques distinctes : "no museum within 50 km" (légitime) + "use case threw" (alarme opé). Grafana ne peut pas distinguer.
- **Mitigations V1** : Langfuse span porte le `error` field → debugging possible par trace.
- **Sprint d'origine** : run /team `2026-05-17-w3-geo-walk-intra` reviewer NTH-2.
- **Effort estimé** : 30 min.
- **Trigger** : sprint observability dédié, OU faux positif alerting Grafana sur `miss` rate.
- **Deadline** : sprint observability post-V1.
- **Owner** : Tim.
- **Comment fermer** :
  1. Ajouter un 4ème label value `'error'` à `geoDetectMuseumTotal` (ou créer un counter parallèle `geo_detect_museum_errors_total`).
  2. Mettre à jour `tests/unit/museum/detect-museum.useCase.test.ts` pour asserter la nouvelle séparation.
  3. Cocher TD-43.

---

- ~~TD-44 (fermé 2026-05-18)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-44--docker-composedevyml-divergence-vs-prod-sur-redis-auth-bruit-bullmqioredis)

---

### TD-56 — Contraste AI badge (light + dark, 8 locales)

> **Renuméroté 2026-05-20** (ex-TD-41, collision avec TD-41 W3 `sanitizePromptInput`). Distinct debt — ID dédupliqué.

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 W4 cluster A TA6 / `docs/legal/AI_DISCLOSURE_AUDIT.md` §6.2 ; référence tokens corrigée 2026-05-21, disclosure verdict)
- **Référence code** : `museum-frontend/features/chat/ui/ChatHeader.tsx:78-92` (badge AI). **Correction 2026-05-21** : le badge utilise les tokens de thème `theme.primaryTint` (background) + `theme.primary` (bordure `:83` + texte `:89`), **PAS** les tokens nommés `chat.badge.aiBg`/`chat.badge.aiFg` (qui n'existent pas). La surface d'ajustement réelle = `primary` / `primaryTint`.
- **Symptôme** : aucune mesure WCAG 2.2 4.1 (contraste ≥ 4.5:1) sur le badge AI vs le fond du `ChatHeader` en thèmes clair + sombre — confirmé : aucun artefact de mesure axe-contrast localisé. Risque : badge invisible pour un sous-ensemble d'utilisateurs → Art. 50 §1 "clear and distinguishable" partiellement compromis. (a11y labelling OK : `accessibilityRole="button"` + i18n `accessibilityLabel` `:85-86` ; l'item ouvert = uniquement le ratio de contraste couleur.)
- **Sprint d'origine** : audit-360 W4 (`2026-05-17-w4-compliance-ops-release`).
- **Effort estimé** : 1-2 h (mesure axe-contrast + ajustement tokens si needed).
- **Comment fermer** : run axe-contrast sur le screen `Chat` dans les 2 thèmes ; si fail, ajuster `primary` / `primaryTint` dans `design-system/` puis `pnpm -C design-system build`.

---

### TD-57 — `AiDisclosureModal` "Learn more" link pointe in-app au lieu du marketing

> **Renuméroté 2026-05-20** (ex-TD-42, collision avec TD-42 W3 `cachedGeofenceMode`). Distinct debt — ID dédupliqué.

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 W4 cluster A TA6 / `docs/legal/AI_DISCLOSURE_AUDIT.md` §2.4 ; chemin corrigé 2026-05-21, disclosure verdict)
- **Référence code** (corrigé 2026-05-21) : `AiDisclosureModal.tsx` **n'existe plus** — refactoré dans le pattern bottom-sheet-router en `museum-frontend/features/chat/ui/AiDisclosureSheetContent.tsx` (route `ai-disclosure`, `bottom-sheet-router/routes.ts:54,150`). "Learn more" = callback `onLearnMore` (`AiDisclosureSheetContent.tsx:11-15,49-56`) wiré dans `app/(stack)/chat/[sessionId].tsx:367-370` → `router.push('/(stack)/privacy')` (donc in-app). Page marketing `museum-web/src/app/[locale]/ai-disclosure/` **absente**.
- **Symptôme** : tant que le site marketing public n'expose pas `/{locale}/ai-disclosure`, le lien renvoie vers la page Privacy embarquée. Cohérent mais sous-optimal pour l'auditeur tiers (CNIL / notified body) qui voudrait une URL stable hors-application. (Symptôme toujours vrai — seule la référence de fichier était stale.)
- **Sprint d'origine** : V1 launch (carry-over).
- **Effort estimé** : 30 min (changer la constante d'URL après que `museum-web/src/app/[locale]/ai-disclosure/page.tsx` soit shippée).
- **Comment fermer** : créer `museum-web/src/app/[locale]/ai-disclosure/page.tsx` (mirror du copy AiDisclosureSheetContent) + bump le `onLearnMore` dans `app/(stack)/chat/[sessionId].tsx:368-370`.

---

### TD-58 — Disclosure AI sur admin web `museum-web/admin/*` (si surface end-user un jour)

> **Renuméroté 2026-05-20** (ex-TD-43, collision avec TD-43 W3 `geo_detect_museum_total`). Distinct debt — ID dédupliqué.

- [ ] **Statut** : ouvert dormant (créé 2026-05-17, audit-360 W4 cluster A TA6 §3)
- **Référence code** : `museum-web/src/app/[locale]/admin/**` (aucune surface AI exposée à un end-user aujourd'hui).
- **Symptôme** : zéro disclosure aujourd'hui = OK (admin = operator, hors scope Art. 50). Si une feature future ajoute du chat/AI à l'admin destiné à un end-user (B2B partner self-serve par ex.), il faudra y rajouter le triple-surface (badge + modal + footer) avant ship.
- **Sprint d'origine** : V1 launch (dormant, trigger=feature).
- **Effort estimé** : 4-6 h le jour où c'est trigger (porting des composants `museum-frontend` vers la web).
- **Comment fermer** : marquer fermé si une décision archi tranche "admin restera opérateur-only", OU implémenter la disclosure côté web.

---

### TD-59 — Disclosure AI sur templates email transactionnels (si email summary V1.1)

> **Renuméroté 2026-05-20** (ex-TD-44, collision avec TD-44 W3 docker-compose redis AUTH). Distinct debt — ID dédupliqué.

- [ ] **Statut** : ouvert dormant (créé 2026-05-17, audit-360 W4 cluster A TA6 §3)
- **Référence code** : `museum-backend/src/modules/notification/` (Brevo templates aujourd'hui purement transactionnels).
- **Symptôme** : V1 ne ship aucun email AI-summarisé. Mais une "session recap email" V1.1 a été évoquée — un tel email doit porter un footer "This summary was generated by AI from your session" sous peine de violation Art. 50 §1.
- **Sprint d'origine** : V1.1 backlog (dormant, trigger=feature).
- **Effort estimé** : 1 h (footer i18n × 8 locales).
- **Comment fermer** : marquer fermé si la roadmap n'introduit pas d'email AI-gen, OU shipper le footer au scope de la feature email-summary.

---

### TD-45 — FPR guardrail "vraie" (besoin de labelled prod data)

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 W4 cluster B TB4 / `infra/grafana/dashboards/guardrail-fairness.json` panel 8)
- **Référence code** : `infra/grafana/dashboards/guardrail-fairness.json` panel "FPR estimate — promptfoo smoke recall delta" — utilise `musaium_guardrail_smoke_pass_rate` comme **proxy** (10 prompts de référence non-adversariaux).
- **Symptôme** : le proxy capture l'over-blocking mais pas le false-positive rate vrai (qui nécessite des labels humains "this was a legit art question that got blocked"). AI Act Art. 10 §3 demande une evidence de fairness "appropriée"; le proxy passera un audit léger, pas un audit notified-body strict.
- **Sprint d'origine** : audit-360 W4 (cluster B).
- **Effort estimé** : 5-10 h (mise en place d'un labelling protocol + dashboard panel sur la donnée labellée).
- **Comment fermer** : V1.1 — process de labelling humain (founder + 1 stagiaire ?) sur les blocks de la semaine ; derive le vrai FPR ; ajouter panel et alerte.

---

### TD-46 — Post-launch operational cadence Sentry P0 (manque section dans VDP_RUNBOOK)

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 W4 cluster C TC2 / `docs/operations/SENTRY_P0_TRIAGE_2026-05-20.md` §7)
- **Référence code** : `docs/operations/VDP_RUNBOOK.md` (aucune section "Post-launch operational cadence" aujourd'hui).
- **Symptôme** : le triage Sentry P0 pré-launch est documenté (cluster C TC2), mais le **rythme post-launch** (daily 09:00 UTC J+1..J+7, weekly Mon 09:00 UTC ensuite, per-release dans les 24 h) n'est pas codifié dans le runbook canonical.
- **Sprint d'origine** : audit-360 W4.
- **Effort estimé** : 30 min (rédaction).
- **Comment fermer** : ajouter une §"Post-launch operational cadence" au VDP_RUNBOOK avec la cadence + responsable + canal d'audit trail.

---

### TD-47 — RSC `api.ts` happy-path ne forward pas les trace headers (museum-web)

> **Re-scopé 2026-05-21 (web + observability verdicts, P2 informational)** : le symptôme original "museum-web ne dispose pas d'init Sentry avec tracePropagationTargets" est **FAUX en code** — `museum-web/instrumentation-client.ts:12`, `sentry.server.config.ts:12` et `sentry.edge.config.ts:12` portent tous `tracePropagationTargets: [/^https:\/\/api\.musaium\.com/, /^http:\/\/localhost:3000/]` ; `museum-web/src/instrumentation.ts` existe. Fixé par le run `2026-05-19-sentry-otel-cleanup` (TD-SNXT-01..04 fermés). **Résiduel réel (plus étroit)** : le SDK auto-instrumente les error paths + le `fetch` global patché, MAIS le wrapper `fetch` écrit à la main dans `api.ts` (+ le `apiPut` local, cf. gotcha CLAUDE.md "apiPut n'existe pas") ne forward PAS `sentry-trace`/`baggage` pour la corrélation **happy-path** dans les RSC server-rendered.

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 W4 cluster B TB3 ; re-scopé 2026-05-21 — init shippé, résiduel = RSC happy-path)
- **Référence code** : `museum-web/src/lib/api.ts` (wrapper fetch RSC + `apiPut` local dans `admin/museums/[id]/branding/page.tsx`) — ne forward pas `sentry-trace`/`baggage`. Init Sentry vérifié shippé : `instrumentation-client.ts:12`, `sentry.server.config.ts:12`.
- **Symptôme** : sur le happy path (pas d'erreur), les requêtes admin web RSC vers le backend via le wrapper `api.ts` n'apparaissent pas dans la trace corrélée. Les error paths + le `fetch` global patché sont déjà couverts.
- **Sprint d'origine** : audit-360 W4 (cluster B).
- **Effort estimé** : P2 — injecter `Sentry.getTraceData()` (helper v10) dans les helpers de mutation de `api.ts` + le `apiPut` local.
- **Comment fermer** : forward `sentry-trace`/`baggage` (via `Sentry.getTraceData()`) dans le wrapper `api.ts` ; cross-ref nettoyage `apiPut` (gotcha CLAUDE.md).

---

### TD-48 — Baggage header validation (BE trace-propagation middleware accepte raw)

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 W4 cluster B TB3 / `docs/observability/DISTRIBUTED_TRACING.md` §7)
- **Référence code** : `museum-backend/src/shared/observability/trace-propagation.middleware.ts` (attache `baggage` raw, tronqué 1 KB).
- **Symptôme** : un FE compromis ou un client malveillant peut injecter un baggage W3C-invalide. Cardinality bornée (1 KB), mais l'attribut span pollué peut tromper un dashboard.
- **Sprint d'origine** : audit-360 W4 (cluster B).
- **Effort estimé** : 1-2 h (validator regex W3C + rejet silencieux des entrées invalides).
- **Comment fermer** : ajouter un parser W3C-baggage (`key=value[;props],...` ASCII subset) ; rejeter silencieusement si la regex ne matche pas ; tester avec 3 cas (vide, valide, invalide).

---

### TD-49 — Admin web FR i18n parity pour les 3 nouvelles pages museums (W4 W2.1/2.2/2.3)

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 W4 cluster D — décision pragmatique cluster D)
- **Référence code** :
  ```
  museum-web/src/app/[locale]/admin/museums/page.tsx                   (STRINGS const EN-only)
  museum-web/src/app/[locale]/admin/museums/new/page.tsx               (STRINGS const EN-only)
  museum-web/src/app/[locale]/admin/museums/[id]/branding/page.tsx     (STRINGS const EN-only)
  ```
- **Symptôme** : les 3 pages admin museums embarquent un objet `STRINGS` local en anglais seulement, alors que toutes les autres pages admin utilisent `useAdminDict()`. L'opérateur (founder) est bilingue, donc OK pour V1, mais la convention codebase est rompue.
- **Sprint d'origine** : audit-360 W4 (cluster D, décision time-budget).
- **Effort estimé** : 2-3 h (extraire 3 sous-arbres `museumsPage` / `newMuseumPage` / `museumBrandingPage` dans `museum-web/src/dictionaries/{en,fr}.json` + le type dans `museum-web/src/lib/i18n.ts` + faire passer `npm run check:i18n` si ce script existe côté web).
- **Comment fermer** : extraire les STRINGS dans la dict, supprimer les const locales, exécuter `pnpm lint` + `pnpm test` + `pnpm build` pour valider.

---

### TD-50 — Upload réel de logo branding museum (V1 = URL HTTPS uniquement)

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 W4 cluster D / `museum-web/src/app/[locale]/admin/museums/[id]/branding/page.tsx`)
- **Référence code** : `museum-web/src/app/[locale]/admin/museums/[id]/branding/page.tsx` (logo via `<input type="url">` HTTPS).
- **Symptôme** : pas d'upload S3 réel — l'opérateur doit héberger le logo ailleurs (CDN, Imgur, etc.) puis coller l'URL. Pas idéal pour une future expérience B2B ; sans impact V1 (3 musées de démo, assets de démo pré-existants — aucun pilote B2B contracté).
- **Sprint d'origine** : audit-360 W4 (cluster D, décision MVP V1).
- **Effort estimé** : 6-10 h (endpoint BE `POST /api/admin/museums/:id/logo` multipart → S3 ou OVH Object Storage ; FE drop-zone ; quota + virus scan).
- **Comment fermer** : implémenter le pipeline; le `<input type="url">` reste en fallback si l'upload échoue.

---

### TD-51 — Spec axe-core Playwright pour `/admin/museums/[id]/branding` (besoin fixture)

- [ ] **Statut** : ouvert (créé 2026-05-17, audit-360 W4 cluster D TD4 / `docs/operations/LIGHTHOUSE_AUDIT.md` §2.2)
- **Référence code** : `museum-web/e2e/a11y/admin-museums.a11y.spec.ts` (spec à créer ; cluster D propose le scaffold mais sans fixture seed museum).
- **Symptôme** : impossible d'écrire un spec axe pour `/admin/museums/[id]/branding` sans une fixture E2E qui crée un museum ID stable en BDD de test.
- **Sprint d'origine** : audit-360 W4 (cluster D).
- **Effort estimé** : 2 h (fixture seed museum dans `museum-web/e2e/_helpers.ts` + spec axe-core sur les 3 routes admin museums).
- **Comment fermer** : ajouter `seedMuseumForA11y(page)` helper qui POSTe un museum via l'API admin pré-test ; écrire les specs ; cleanup post-test.

---

- ~~TD-52 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
### TD-53 — Anonymous volume `dev-backend` node_modules drift après modif `package.json` host

- [ ] **Statut** : ouvert (créé 2026-05-19, découvert en Phase B post-merge W3+W4 quand `@opentelemetry/api` a été ajouté en deps)
- **Référence code** : `museum-backend/docker-compose.dev.yml:48` (anonymous volume `/app/museum-backend/node_modules`).
- **Symptôme** : quand `package.json` change côté host (ajout d'une dep par un merge / un install), le container `dev-backend` continue d'utiliser le `node_modules` baked dans l'image (préservé via anonymous volume). nodemon crash en boucle sur `Cannot find module 'X'`. Fix manuel actuel : `docker exec -e CI=true dev-backend sh -c 'cd /app/museum-backend && pnpm install --prefer-offline'` (puis restart container).
- **Workaround actuel** : `docker exec -e CI=true dev-backend sh -c 'cd /app/museum-backend && pnpm install --prefer-offline'` puis restart container (documenté cette session 2026-05-19). Acceptable pour dev, mais friction visible.
- **Sprint d'origine** : N/A (infra dev compose, existant depuis l'introduction des anonymous volumes).
- **Effort estimé** : 1 h — option A : script `pnpm bootstrap-dev-container` qui detect drift package.json → run install dans le container automatiquement ; option B : hook nodemon pre-start qui check `package.json mtime > pnpm-lock.yaml mtime container` et run install ; option C : rebuild image à chaque `up -d` (lent mais déterministe).
- **Comment fermer** : choisir l'option (A recommandée — explicite, opt-in), implémenter, documenter dans un doc `DEV_SETUP.md` (sous `docs/`, ou équivalent).

---

### TD-54 — `cachedGeofenceMode` singleton module-level peut fuiter entre tests

- [ ] **Statut** : ouvert (créé 2026-05-19, /review PR #290 finding MEDIUM)
- **Référence code** : `museum-backend/src/modules/museum/adapters/secondary/pg/museum.repository.pg.ts:24` (singleton) + `:192 _resetGeofenceModeCacheForTests()` (test seam existant) — lignes corrigées 2026-05-21 (db verdict).
- **Symptôme** : `cachedGeofenceMode` est lazy-init au premier query + jamais ré-évalué. Le commentaire dit "immuable at runtime" — vrai en prod, mais en CI/integration tests qui drop/recreate la column geofence (transitions postgis ↔ jsonb via migrations rejouées dans le même worker Jest), le cache survit et le repo query la mauvaise branche. Flaky tests possible.
- **Sprint d'origine** : W3 (audit-360 geo-walk-intra).
- **Effort estimé** : 30 min — option A : appeler `_resetGeofenceModeCacheForTests()` en `beforeEach` de tous les tests integration touchant geofence (discipline ; risque de l'oublier) ; option B : ESLint rule `musaium-test-discipline/reset-geofence-cache-in-beforeach` qui force le pattern ; option C : drop le cache (re-detect à chaque query, surcoût 1 SELECT system_columns par appel).
- **Comment fermer** : décider A/B/C avec le owner W3, implémenter, documenter dans le JSDoc du singleton.

---

### TD-55 — `MuseumRepository.findByCoords` jsonb path = N+1 query

- [ ] **Statut** : ouvert (créé 2026-05-19, /review PR #290 finding LOW)
- **Référence code** : `museum-backend/src/modules/museum/adapters/secondary/pg/museum.repository.pg.ts:158-167` (jsonb-bbox branch ; bbox SELECT `:158-160`, boucle `findById(row.id)` au `:165`) — lignes corrigées 2026-05-21 (db verdict).
- **Symptôme** : la query full-scan retourne juste les IDs matchés, puis le code boucle pour `findById(id)` chacun → N+1. À <100 museums (V1 prod = 19 museums seedés) c'est imperceptible ; au-delà de 1k museums (B2B scale) la latence explose linéairement (1 + N round-trips PG).
- **Sprint d'origine** : W3 (fallback jsonb introduit quand pgvector/PostGIS absent).
- **Effort estimé** : 1 h — inline le `SELECT museum.*` dans la query bbox au lieu de re-fetcher (`SELECT id, name, slug, ..., geofence_bbox FROM museums WHERE bbox_match($1)`). Ajouter test perf bench fixture 1k museums pour catch toute régression future.
- **Comment fermer** : refacto + bench + documenter dans le JSDoc l'invariant "1 round-trip pour la branche jsonb-bbox".

---

### TD-60 — `eslint-disable` sans `Approved-by` dans `similarity-service.rerank-fail-open.test.ts`

> **Renuméroté 2026-05-20** (ex-TD-41, troisième collision sur l'ID TD-41 avec W3 `sanitizePromptInput` + W4 AI badge). Distinct debt — ID dédupliqué.

- [ ] **Statut** : ouvert (créé 2026-05-18, /team C9.13 reviewer cycle 2 audit)
- **Référence code** :
  ```
  museum-backend/tests/unit/chat/visual-similarity/similarity-service.rerank-fail-open.test.ts:83
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load gives a useful "Cannot find module" RED in Phase 3 before Phase 4 lands the service constructor signature change
  ```
- **Symptôme** : le disable a une `Justification:` (≥20 chars) mais manque la ligne `Approved-by: <reviewer/SHA>` que CLAUDE.md `§ ESLint Discipline` exige pour tout nouveau `eslint-disable`. Le pattern correct est déjà appliqué sur les 2 disables des adapters rerank V1 (cf. `bge-reranker-v2-m3.adapter.ts:58`, `null-reranker.adapter.ts:22`) qui portent `Approved-by: dispatcher 6c2da855`. Ce site précède la corrective loop, donc le reviewer cycle 2 l'a flagué hors scope.
- **Sprint d'origine** : C9.13 GREEN cycle (commit `6c2da855` 2026-05-18) ; flagué par /team reviewer cycle 2 (`code-review-cycle-2.json`) comme "minor non-blocker, residual from GREEN".
- **Effort estimé** : 1 minute (1-line append).
- **Comment fermer** : ajouter sous la ligne 83 un commentaire `// Approved-by: dispatcher 6c2da855 (C9.13 RED — dynamic SUT load required to surface "Cannot find module" before Phase 4 lands)` et cocher TD-60 ici.

---

### TD-OBS-DENYLIST — Wire 3 Prometheus counters auth + alert `access_token_denylist_unavailable[5m]` (post-V1)

- [ ] **Statut** : ouvert (créé 2026-05-21, /team run `2026-05-21-p0-c3-auth-crypto` reviewer F6 + run `2026-05-21-p0-c4-infra` documenter sweep)
- **Référence code** :
  - `museum-backend/src/shared/observability/prometheus-metrics.ts` (cible — fichier registry existant, ajouter 3 counters)
  - **Counters spécifiés C3 design §10** (`team-state/2026-05-21-p0-c3-auth-crypto/design.md` §10, lignes 354-365 — spec team-state archivée/élaguée, récupérable via git history) :
    1. `totp_replay_blocked_total{user_role}` — incrémenté dans `challengeMfa` + `verifyMfa` à chaque rejet pour `step <= lastUsedStep` (I-SEC7a, ferme RFC 6238 §5.2 replay window).
    2. `access_token_revoked_total{source="logout"|"admin"}` — incrémenté à chaque `denylist.add` réussi (I-SEC7b, ADR-064 denylist fail-OPEN).
    3. `art_keywords_rate_limited_total{role}` — incrémenté quand `taxonomyWriteLimiter` rejette (via custom keyGenerator wrapping ou hook `onLimitReached`, I-SEC3).
  - **Sites d'incrément** :
    - `museum-backend/src/modules/auth/useCase/totp/challengeMfa.useCase.ts:55-63` + `verifyMfa.useCase.ts:41-50`
    - `museum-backend/src/modules/auth/useCase/session/authSession.service.ts:201-213` (logout) + admin denylist path TBD
    - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-message.route.ts:184` (art-keywords route)
- **Symptôme** : C3 design §10 spécifiait explicitement les 3 counters (avec `art_keywords_rate_limited` aussi listé "via hook `onLimitReached`") mais l'editor green a deferred post-V1 (reviewer F6 INFO non-bloquant + verifier WARN scope minor). Conséquence : (a) pas de visibilité Prometheus/Grafana sur le taux de TOTP replay (signal d'attaque), (b) pas de visibilité sur le taux de access-token revocation (signal d'incident response), (c) pas de visibilité sur taxonomy abuse art-keywords. Les events sont **émis en logs Sentry breadcrumbs** (cf. C3 design §10 ligne "Logs (b)(c)") donc l'incident response a un fallback, mais aucune métrique time-series ne permet d'alerter sur des spikes ou de dashboarder le baseline. **Pas de régression security V1** : les rejets sont effectifs (401/403/429), seule l'observabilité agrégée manque.
- **Alert manquante (C3 design §10 ligne "Alerts")** : `rate(access_token_denylist_unavailable[5m]) > 0` → page on-call. Aujourd'hui le warn log `access_token_denylist_unavailable` (rate-limité 1/min adapter-side, cf. ADR-064 `Consequences/Positive`) part dans Sentry mais sans alert Prometheus → si Redis se dégrade silencieusement, l'opérateur ne le voit pas avant un audit log Sentry.
- **Dashboards manquants** : 3 panels Grafana auth-security (totp_replay_blocked rate, access_token_revoked rate, art_keywords_rate_limited rate) — C3 design §10 ligne "Dashboards" planifiait "post-merge via doc handoff", jamais exécuté.
- **Sprint d'origine** : team-report `2026-05-21-p0-c3-auth-crypto` (reviewer F6 INFO + verifier scope WARN). Re-validé dans `2026-05-21-p0-c4-infra` documenter sweep (le TD était promis dans la STORY C3 ligne 137 "Open follow-ups (créés) : TD-OBS-DENYLIST" mais jamais écrit dans `TECH_DEBT.md` jusqu'ici — réparation honesty UFR-013).
- **Effort estimé** : 2-4 heures.
  - 1h — 3 counters dans `prometheus-metrics.ts` + 3 sites d'incrément (1 ligne `metric.inc({...labels})` chacun, post-validation Zod / post-rate-limit hook).
  - 1h — alert PromQL dans `infra/prometheus/alerts/auth.yml` (créer si absent) + lien on-call.
  - 1h — 3 panels Grafana via `infra/grafana/dashboards/auth-security.json` (créer si absent — vérifier UID stable cf. CLAUDE.md "UID immutable").
  - 30 min — tests unit per metric increment (`tests/unit/shared/observability/prometheus-counters-auth.test.ts`).
- **Comment fermer** : (a) ajouter les 3 counters au registry Prometheus existant, (b) wiring 3 sites d'incrément, (c) tests unit qui assert `metric.inc` appelé une fois par rejet, (d) alert PromQL + dashboard JSON, (e) re-tester smoke `/api/metrics` rend les 3 nouveaux counters, (f) cocher TD-OBS-DENYLIST ici + cross-ref dans ADR-064 §Consequences/Positive note observability.
- **Priorité** : LOW pre-V1 (security correct, observability seulement). MEDIUM post-V1 (avant 1er pilote B2B où compliance audit demandera des métriques auth).

---

## Tech debts fermés (gardés 1 sprint avant purge)

(Aucun pour le moment — premier sprint avec ce tracker.)

---

## Comment ce fichier est consommé

- **Avant chaque sprint** : `/team` skill lit `TECH_DEBT.md` et propose éventuellement de fermer un TD si le sprint a la bandwidth.
- **Au merge d'un fix de TD** : la PR doit cocher la ligne `[x]` correspondante dans le même commit.
- **Fin de sprint** : `/team roadmap:rotate` purge les TDs `[x]` plus vieux qu'un sprint.

Référence dans `ROADMAP_TEAM.md` § T1.7 et `CLAUDE.md`.

---

# Audit lib-docs enterprise 2026-05-18 (UFR-022 batch)

> Generated by enterprise-grade audit running reviewer.md fresh-context per lib, 54 libs covered, against curated PATTERNS.md + CLAUDE.md gotchas.
> ~85+ entries below. Each has : Context (what's wrong), Remediation (how to fix), Evidence (file:line), Blast radius, Pre-V1 relevance.
> Source: `/tmp/tech-debt-accumulator.md` (full text moved here for permanence).

> Append into `docs/TECH_DEBT.md` at end of audit pass.

---

## TD-TO-01 — User/ChatSession soft-delete should use `@DeleteDateColumn` (MEDIUM, NICE_TO_HAVE pre-V1)

**Context** : `User.deletedAt` + `ChatSession.purgedAt` are plain `@Column` (not `@DeleteDateColumn`). TypeORM `find*` does NOT auto-filter soft-deleted rows ; every caller must remember `WHERE deletedAt IS NULL`. Only one site (`admin.repository.pg.ts:113`) does so explicitly. Future `userRepo.find()` callsite forgetting the filter = leak.

**Remediation** : Migrate to `@DeleteDateColumn` + `softRemove()`. Switch `admin.softDeleteUser` to `repo.softRemove(entity)`. Drop hand-rolled `deleted_at IS NULL` filters. Add ESLint sentinel or migrate fully.

**Evidence** : `museum-backend/src/modules/auth/domain/user/user.entity.ts:140`, `museum-backend/src/modules/chat/domain/session/chatSession.entity.ts:72`, `museum-backend/src/modules/admin/adapters/secondary/pg/admin.repository.pg.ts:113,176`.

**Blast radius** : 2 entities + ~6 repository call sites + 1 ESLint sentinel ; ~120 lines.

---

## TD-TO-02 — `s3-orphan-purge.job.ts` reuses `:refs` param in `.where` AND `.orWhere` (LOW, NON_BLOCKER)

**Context** : Lines 98-99 chain `.where('msg.imageRef IN (:...refs)', { refs })` then `.orWhere('msg.audioUrl IN (:...refs)', { refs })`. PATTERNS.md §4.2 explicitly forbids parameter-name reuse in a single query.

**Remediation** : Rename second param (`refsAudio`), or rewrite as `Brackets` subquery.

**Evidence** : `museum-backend/src/modules/chat/jobs/s3-orphan-purge.job.ts:98-99`.

**Blast radius** : 1 file, 2-4 lines.

---

## TD-TO-03 — `chat-purge.job.ts` interpolates retentionDays into SQL via template literal (LOW, NON_BLOCKER)

**Context** : Line 177 ``andWhere(`session.updatedAt < NOW() - INTERVAL '${String(retentionDays)} days'`)``. Even though `retentionDays` is config-controlled, deviates from PATTERNS.md §3.4 (always parameterize via `:name`). Injection-prone if later wired from request input.

**Remediation** : `.andWhere('session.updatedAt < NOW() - make_interval(days => :retentionDays)', { retentionDays })` or `.andWhere('session.updatedAt < :cutoff', { cutoff: new Date(...) })`.

**Evidence** : `museum-backend/src/modules/chat/jobs/chat-purge.job.ts:177`.

**Blast radius** : 1 file, 1 line.

---

## TD-TO-04 — `admin-export.repository.pg.ts` uses `.offset/.limit` on joined+grouped query (LOW, NON_BLOCKER)

**Context** : `streamChatSessions` (lines 50-67) does leftJoin on `s.user`/`s.messages` + GROUP BY, then paginates with `.offset(skip).limit(CHUNK_SIZE)`. PATTERNS.md §3.4 recommends `.take/.skip` for complex/joined queries — adds DISTINCT for correct pagination with one-to-many.

**Remediation** : Switch to `.take(CHUNK_SIZE).skip(skip)`. Verify pagination under load.

**Evidence** : `museum-backend/src/modules/admin/adapters/secondary/pg/admin-export.repository.pg.ts:50,66`.

---

## TD-TO-05 — ChatMessage + MuseumEnrichment declare both `@ManyToOne(Entity)` AND `@Column` scalar FK (LOW, NON_BLOCKER)

**Context** : `ChatMessage.session: Relation<ChatSession>` + `ChatMessage.sessionId: string`. Two sources of truth — can diverge on entity mutation. Save authority implementation-dependent.

**Remediation** : Drop scalar `sessionId` (use `msg.session.id`) OR drop relation decorator + manage joins via QueryBuilder.

**Evidence** : `chatMessage.entity.ts:24,29`, `museum-enrichment.entity.ts:35,40`.

**Blast radius** : ~20 call sites — needs runtime verification.

---

- ~~TD-EX-01 (RESOLVED 2026-05-19, archivé 2026-05-21)~~ → [archive](TECH_DEBT_ARCHIVE.md#td-ex-01--rate-limiter-ordering--reads-reqbody-before-zod-validator)

---

## ⏸️ TD-LC-01 — Migration `ChatGoogleGenerativeAI` → `ChatGoogle` (HIGH, NICE_TO_HAVE pre-V1) — DEFERRED

> **Disposition 2026-05-20** : **DEFERRED, not done this pass.** The migration target `ChatGoogle` lives in `@langchain/google-gauth` / `@langchain/google-common` — **neither is installed** (only the deprecated `@langchain/google-genai` is present). `lib-docs/langchain/PATTERNS.md` §5.c + Coverage warnings explicitly state the **`ChatGoogle` migration recipe is absent** (constructor parity / env var / package origin not yet fetched). Swapping the primary Gemini LLM constructor blind — without a verified migration recipe, and adding a new package — is too risky for an autonomous pass. `ChatGoogleGenerativeAI` is **deprecated, not removed** — it still works. **To close** : (1) doc-fetcher on `ChatGoogle` upstream, (2) `pnpm add @langchain/google-gauth`, (3) migrate `langchain-orchestrator-support.ts:1,241` with a dedicated /team run + Gemini smoke test.

**Context** : `@langchain/google-genai` v2.1.26 is DEPRECATED in v1. Migration target `ChatGoogle` not yet documented in snapshot. Current usage works but on deprecation track.

**Remediation** :
1. Run doc-fetcher on `ChatGoogle` upstream docs ;
2. Update `lib-docs/langchain/PATTERNS.md` with `ChatGoogle` patterns ;
3. Migrate `langchain-orchestrator-support.ts:1,241` ;
4. Bundle with TD-LC-02 (`openAIApiKey` → `apiKey`) since same files.

**Evidence (post-W1 merge 2026-05-19)** : `museum-backend/src/modules/chat/adapters/secondary/llm/langchain-orchestrator-support.ts:1,241`. `art-topic-classifier.ts` reference removed — file deleted by W1 commit `33a9d4d5` (C9.9 UFR-016 burial).

---

- ~~TD-LC-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-LC-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## ⚠️ TD-LC-04 — content-classifier `z.record(z.string(), z.unknown())` violates PATTERNS.md DON'T #4 (MEDIUM, NON_BLOCKER)

> **Disposition corrigée 2026-05-21 (3 verdicts indépendants : ai, zod, state-sweep)** : **PAS une vraie clôture code.** Statut réel = **ACCEPTED (decision, no code change)**, PAS ✅ done — l'ancien ✅ était trompeur (3 agents l'ont signalé : "marked ✅ but code still violates"). Le `z.record` est TOUJOURS dans `content-classifier.service.ts:26-31` (5 champs `z.record(z.string(), z.unknown()).nullable()` : openingHours, admissionFees, collections, currentExhibitions, accessibility) fed à `withStructuredOutput(classificationSchema)` au `:75` (non-strict). **Opératoire aujourd'hui** (OpenAI non-strict accepte `z.record`) MAIS viole PATTERNS.md DON'T #4 dans le code SANS marqueur `strict:false` explicite ; landmine latente l'instant où le classifier passe à Gemini ou strict mode. L'agent zod note le structured output comme silently-broken-risk HIGH. Une clôture "decision-only" sur un schéma encore-violant n'est PAS une vraie clôture sous le rubric verifier. Si on garde `z.record`, la décision DOIT être encodée en code (marqueur non-strict explicite + JSDoc citant la contrainte OpenAI-only) ET le risque zod HIGH adressé (ex. `z.string().nullable()` raw JSON + `JSON.parse` downstream + validation `z.record`).

- [ ] **Statut** : **REOPENED 2026-05-21 — ACCEPTED (decision, no code change), pas une clôture code.** Le `z.record` reste en code (`content-classifier.service.ts:26-31` → `withStructuredOutput` `:75`). Opératoire today (OpenAI non-strict) mais viole PATTERNS.md DON'T #4 ; landmine latente Gemini/strict. Décision antérieure (fermé 2026-05-20) jugée trompeuse par 3 verdicts indépendants → re-ouvert.

**Context** : 6 fields use unbounded `z.record` shape. Gemini-incompatible. OpenAI strict-mode incompatible. Currently classifier only uses OpenAI non-strict, so silent.

**Remediation** : Enumerate the 6 dictionary fields with explicit keys, OR mark `strict: false` explicitly + document why.

**Evidence** : `content-classifier.service.ts:25-32`.

---

- ~~TD-LC-05 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-RN-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-RN-02 — 5 fichiers utilisent RN `Image` au lieu d'expo-image (MEDIUM, NON_BLOCKER)

**Context** : RN `Image` pour network URIs perd cache disk/memory + blurhash + transition + SVG. Project standardisé sur expo-image (6 fichiers OK, 5 résiduels). Sites haute-fréquence UX (artwork hero, daily-art card).

**Remediation** : Replace `import { Image, ... } from 'react-native'` → `import { Image } from 'expo-image'`. Replace `resizeMode` → `contentFit`. Add `placeholder={{ blurhash }}` + `transition={150}`.

**Evidence** : `features/chat/ui/ArtworkHeroModal.tsx:25,115`, `features/chat/ui/ArtworkHeroCard.tsx:26,93`, `features/daily-art/ui/DailyArtCard.tsx:2,87`, `features/chat/ui/VisitSummarySheetContent.tsx:2`, `app/(stack)/carnet/[sessionId].tsx:13`.

**Blast radius** : 5 files, ~15 lines, possible visual diff si resizeMode→contentFit mapping mismatches.

> **Dédupliqué 2026-05-20** : l'ancien header `TD-EXPO-01` (plus bas) était un pur pointeur "voir TD-RN-02" sans contenu propre — collapsé ici. TD-RN-02 est la seule entrée canonique pour cette dette (RN `Image` → expo-image).

---

- ~~TD-RN-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-REACT-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-REACT-02 — 8 providers `<Context.Provider value={…}>` legacy → codemod v19 `<Context value={…}>` (MEDIUM, NON_BLOCKER)

**Context** : React 19 préfère `<Context value={…}>{children}</Context>` (Provider drop). Codemod upstream disponible.

**Remediation** : Codemod mécanique : `<X.Provider value={...}>` → `<X value={...}>`. 8 sites identifiés.

**Evidence** : `features/auth/application/AuthContext.tsx:333`, `features/paywall/application/PaywallProvider.tsx:95`, `features/chat/application/DataModeProvider.tsx:94`, `shared/ui/ThemeContext.tsx:56`, `shared/i18n/I18nContext.tsx:101`, `shared/infrastructure/connectivity/ConnectivityProvider.tsx:34`, `museum-web/src/lib/admin-dictionary.tsx:36`, `museum-web/src/lib/auth.tsx:189`.

**Blast radius** : 8 files, 1 line each.

---

## TD-REACT-03 — Admin user page : migration `useActionState` + `useOptimistic` (MEDIUM, NON_BLOCKER)

**Context** : `museum-web/src/app/[locale]/admin/users/[id]/page.tsx:131-239` manual `useState(busy)` + try/finally pour suspend/unsuspend/delete/role mutations. React 19 Actions conçus pour ça. Pas de `useOptimistic` → user voit row stale jusqu'au network roundtrip.

**Remediation** : Migrate to `useActionState((prev, formData) => ...)` per mutation OR `startTransition(async () => ...)` + `isPending`. Add `useOptimistic` autour de `user` pour toggle instantané.

**Evidence** : `museum-web/src/app/[locale]/admin/users/[id]/page.tsx:131-239`.

**Blast radius** : 1 file, ~80 lines refactor.

---

- ~~TD-TQ-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-TQ-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-NEXT-01 — Missing `error.tsx` / `loading.tsx` / `not-found.tsx` everywhere in app/ (MEDIUM, NICE_TO_HAVE pre-V1)

**Context** : 0 fichiers error.tsx/loading.tsx/not-found.tsx dans museum-web/src/app. Errors thrown in async Server Components bubble to Next default error UI (générique, anglais). Pas de streaming UX pour pages lentes. 404 fall to default.

**Remediation** : Minimum :
- `app/[locale]/not-found.tsx` (404 localisée FR/EN)
- `app/[locale]/admin/error.tsx` (admin error boundary)
- `app/[locale]/admin/loading.tsx` (streaming skeleton)

**Evidence** : `find museum-web/src/app -name 'error.tsx' -o -name 'loading.tsx' -o -name 'not-found.tsx'` → empty.

**Blast radius** : 3 new files, ~50 lines each.

---

- ~~TD-NEXT-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SN-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SN-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SN-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SN-04 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-JWT-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-JWT-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-BC-01 — bcrypt 72-byte cap NOT enforced at validation (MEDIUM, decide pre-V1)

**Context** : `shared/validation/password.ts:22` caps length at 128 CHARS but bcrypt silently truncates to 72 BYTES. FR-locale = accents likely → real silent-truncation risk.

**Remediation** : Choisir (a) reject inputs >72 bytes au validation level, OR (b) document explicitly truncation behavior.

**Evidence** : `museum-backend/src/shared/validation/password.ts:22`.

**Blast radius** : 1 file, validation rule + (optionally) error message update.

---

## TD-BC-02 — No rehash-on-login when BCRYPT_ROUNDS bumped (LOW, post-V1)

> **Design folded into TD-29 2026-05-20** : the rehash-on-login mechanism is now specified in [`docs/PASSWORD_HASH_MIGRATION.md`](PASSWORD_HASH_MIGRATION.md) §3 Phase A step 4 (`needsRehash(stored)` after a successful verify → opportunistic re-hash with no user friction). Implemented together with the argon2id swap. Still post-V1.

**Context** : 0 hits for `getRounds`/`rehash` in src/. PATTERNS.md §3 bullet 5 recommends `getRounds(hash)` post-compare + rehash if cost-drift.

**Remediation** : Add rehash-on-login mechanism (low priority pre-launch, blocks smooth cost ramp post-V1).

**Evidence** : grep auth use cases — 0 rehash mechanism.

---

- ~~TD-BC-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SEC-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SEC-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-BMQ-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-BMQ-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-IO-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-IO-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-IO-03 — `enableReadyCheck: false` missing sur BullMQ conn factory (LOW, NON_BLOCKER)

**Context** : PATTERNS.md L223 'commonly required by BullMQ'. Latent (CI = unrestricted redis:7-alpine). Surface sur Redis Enterprise / ACL hardening.

**Remediation** : Add `enableReadyCheck: false` to `createRedisConnectionOptions` return.

**Evidence** : `museum-backend/src/index.ts:65-72`.

---

## TD-IO-04 — `createSocialOtcStore` factory défini MAIS jamais wiré (UFR-016 candidate) (INFO, decide)

**Context** : `social-otc-store.ts:149` define factory. Grep src/ shows ZERO callers (only `setSocialNonceStore` wired).

**Remediation** : Vérifier wire-site auth composition root OR enterrer per UFR-016.

**Evidence** : `museum-backend/src/modules/auth/adapters/secondary/social/social-otc-store.ts:149` + grep src/ → 0 callers.


---

- ~~TD-HEL-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-HEL-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-HEL-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-MUL-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-MUL-02 — MulterError code discrimination : granularité optionnelle (LOW, NON_BLOCKER)

> **Reformulé 2026-05-21 (sweep multi-agent)** : ce n'était PAS un oubli. `error.middleware.ts` discrimine déjà **intentionnellement** — `LIMIT_FIELD_COUNT`/`LIMIT_PART_COUNT`/`LIMIT_FIELD_KEY`/`LIMIT_FIELD_VALUE` → 413 PAYLOAD_TOO_LARGE (DoS-bound) ; `LIMIT_FILE_COUNT`/`LIMIT_UNEXPECTED_FILE` restent en 400 générique **par décision documentée** (`error.middleware.ts:31-36` : "semantic request shape errors, not size overruns"). Le résiduel = nicety optionnelle, pas un trou.

**Remediation (optionnelle)** : si on veut une granularité client-facing plus fine, ajouter des codes dédiés `LIMIT_UNEXPECTED_FILE` → 400 `UNEXPECTED_FILE_FIELD` + `LIMIT_FILE_COUNT` → 400 `TOO_MANY_FILES`. Sinon fermer comme WONTFIX.

**Evidence** : `museum-backend/src/shared/middleware/error.middleware.ts:31-45` (discrimination intentionnelle confirmée vs code 2026-05-21).

---

- ~~TD-SSL-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SSL-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SSL-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SSL-04 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SSL-05 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-SSL-06 — Maestro `cert-pinning-smoke.yaml` ne prouve PAS le pinning-applied sous V1 OFF default (MEDIUM, follow-up post-activation)

**Context** : Sous V1 (ADR-031 doctrine, `EXPO_PUBLIC_CERT_PINNING_ENABLED` non set), `initCertPinning` short-circuit `kind:'skipped' reason:'env-disabled'` avant tout call à `initializeSslPinning`. Le flow `cert-pinning-smoke.yaml` exerce un cold-start auth round-trip qui PASSE même quand le pinning est OFF (TLS via OS trust store) — donc le flow est opérationnellement un launch+login smoke, NON un pinning-applied proof. Devient meaningful uniquement après bascule activation ON.

**Remediation** : surface `initOutcome.kind` (literal: `"initialized"` | `"skipped"`) à un debug-only `testID` (e.g. `<View testID="cert-pinning-state" {…}>{initOutcome.kind}</View>` derrière `__DEV__`). Maestro flow assert sur ce `testID` valeur attendue selon build profile (preview iOS ON → `initialized` ; dev local OFF → `skipped`). Fail-loud quand init était attendu ON mais a été skipped silencieusement.

**Evidence** : `museum-frontend/.maestro/cert-pinning-smoke.yaml` ; reviewer code-review.json finding 1 (severity:medium, axis:testability) ; spec.md §8 Q1 (V1 activation déférée).

**Effort estimé** : 1-2 heures (1 small testID + 1 Maestro assertion + 1 conditional wire depuis `_layout.tsx`).

**Comment fermer** :
1. Surface `initOutcome.kind` côté `cert-pinning-init.ts` (déjà retourné par `initCertPinning`).
2. Stocker dans state module-scoped + render debug-only View avec `testID="cert-pinning-state"` dans `_layout.tsx`.
3. Étendre `cert-pinning-smoke.yaml` avec `- assertVisible: id: cert-pinning-state\n    text: "initialized"` (or `"skipped"` selon profile).
4. Update `museum-frontend/docs/CERT_PINNING_RUNBOOK.md` Smoke test section.

**Sprint d'origine** : 2026-05-19 Cluster 9 cert pinning hardening (run `2026-05-19-cluster-9-cert-pinning-hardening`).

---

## TD-SSL-07 — `initCertPinning` in-flight init/dispose race (MEDIUM, follow-up theoretical)

**Context** : `initCertPinning` est async, await `resolveKillSwitchState` AVANT d'assigner `activeListener` (cert-pinning-init.ts:155 approx). Un appel concurrent à `disposeCertPinning()` entre les deux points de suspension observe `activeListener === null`, no-op, puis init resume et assigne le listener que dispose voulait empêcher. Race symétrique pour deux init concurrents → leak d'une subscription. Pas un launch blocker sous V1 OFF default (single eager call site, `dispose` non encore wiré côté HMR), mais ergonomiquement fragile dès qu'on wirera `dispose` côté Fast Refresh `__DEV__` hook.

**Remediation** : sérialisation via promesse module-scoped pending (e.g. `let pendingInit: Promise<CertPinningInitOutcome> | null = null` + `if (pendingInit) return pendingInit; pendingInit = (async () => {…})(); return pendingInit;`). OU boolean re-entry guard. Réviser le contract `initCertPinning` : doit-il être idempotent ? Pre-empté par un dispose en-vol ?

**Evidence** : `museum-frontend/shared/infrastructure/cert-pinning-init.ts:104-149` ; reviewer code-review.json finding 2 (severity:medium, axis:correctness).

**Effort estimé** : 2-4 heures (1 pending-promise serialiser + 2-3 nouveaux tests R3+ pour init/dispose race + race-test pattern doc dans JSDoc).

**Comment fermer** :
1. Ajouter `let pendingInit: Promise<CertPinningInitOutcome> | null = null;` module-scoped.
2. Wrap `initCertPinning` body : si `pendingInit` non-null → return it ; sinon assigner `pendingInit = (async () => {…})()` puis `.finally(() => pendingInit = null)`.
3. `disposeCertPinning` : si `pendingInit` non-null, await-le AVANT le `activeListener.remove()` (ou cancel — choix de contract à documenter dans JSDoc).
4. 2-3 nouveaux tests `cert-pinning-init.test.ts` exercisant l'init/dispose race (`Promise.all([initCertPinning(opts), disposeCertPinning()])`).
5. JSDoc sur `initCertPinning` : "idempotent + dispose-safe".

**Sprint d'origine** : 2026-05-19 Cluster 9 cert pinning hardening (run `2026-05-19-cluster-9-cert-pinning-hardening`).

---

## TD-OTEL-01 — No sampler configured → 100% trace volume (MEDIUM, NICE_TO_HAVE pre-V1)

**Context** : Default AlwaysOnSampler. At 100k MAU target → collector cost saturate.

**Remediation** : Set `OTEL_TRACES_SAMPLER=parentbased_traceidratio` + `OTEL_TRACES_SAMPLER_ARG=0.1` ops env OR pass sampler explicitly to NodeSDK. Document ADR.

**Evidence** : `museum-backend/src/shared/observability/opentelemetry.ts:36-51`.

---

- ~~TD-SRN-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## ⚠️ TD-SHARP-01 — sharp .resize() cap missing in EXIF pipeline (MEDIUM, NICE_TO_HAVE pre-V1)

**Context** : 24Mpx images full-resolution re-encoded → S3+LLM+mobile eat full payload.
**Fix** : Add `.resize(4096, 4096, {fit:'inside', withoutEnlargement:true})` in each branch.
**Evidence** : `museum-backend/src/modules/chat/adapters/secondary/image/image-processing.service.ts:50-82`.

## ⚠️ TD-SHARP-02 — sharp .timeout() missing on user uploads (MEDIUM, NICE_TO_HAVE pre-V1)

**Context** : Default indefinite → slowloris-style decode DoS.
**Fix** : `.timeout({seconds:10})` on user-facing ; `.timeout({seconds:5})` on internal.
**Evidence** : `image-processing.service.ts` (no .timeout in any chain).

## TD-SHARP-03 — sharp.concurrency + UV_THREADPOOL_SIZE not pinned (LOW, NICE_TO_HAVE)

**Fix** : `sharp.concurrency(2)` in bootstrap + `UV_THREADPOOL_SIZE=8` in Dockerfile.

---

## ✅ TD-OP-01 — opossum: breaker.shutdown() wired (RÉSOLU 2026-05-25, branch p0/stability)

**Résolu** : `WikidataBreakerClient.dispose()` (idempotent, appelle `breaker.shutdown()`) ajouté + lifté dans la composition chat + wiré au graceful-shutdown (`index.ts` `drainAsyncResources` via `safeTeardown`). `--detectOpenHandles` confirme le timer opossum libéré. Voir RUN C lot P0 stabilité (`/team` 2026-05-25).
**Reliquat (NIT, non-bloquant)** : `afterEach(() => client.dispose())` non ajouté aux suites breaker pré-existantes — vérifié inoffensif (detectOpenHandles clean, opossum v9 `unref()` l'intervalle). Test-tidy follow-up.
**Evidence** : `museum-backend/src/modules/chat/adapters/secondary/search/wikidata-breaker.ts` (dispose), `src/index.ts` (graceful-shutdown wiring).

## ⚠️ TD-OP-02 — opossum: missing AbortController + autoRenewAbortController (MEDIUM, NON_BLOCKER)

**Context** : 5s timeout rejects opossum, underlying SPARQL fetch continues.
**Fix** : `{ abortController, autoRenewAbortController: true }` + propagate signal.
**Evidence** : `wikidata-breaker.ts:84-91`.

- ~~TD-OP-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-LF-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-LF-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-LF-04 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-ONNX-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-ONNX-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-ONNX-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-LINK-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## ⚠️ TD-LINK-02 — html-scraper response.text() unbounded → OOM risk (MEDIUM, NICE_TO_HAVE pre-V1)

**Context** : `maxContentBytes` cap OUTPUT not INPUT. Malicious server peut stream 10GB.
**Fix** : check Content-Length header + reject OR stream-read avec hard byte cap 5-10MB via getReader().
**Evidence** : `html-scraper.ts:299`.

## TD-LINK-03 — Missing isProbablyReaderable gate (LOW, NON_BLOCKER)

**Fix** : add pre-parse gate, skip ~30-40% non-article pages.

## TD-OBS-PII-METADATA-ALLOWLIST — Langfuse `metadata` non couverte par le mask central (LOW, NON_BLOCKER)

- [ ] **Statut** : ouvert (créé 2026-05-21, security phase /team `2026-05-21-p0-c1-pii-egress` — LOW out-of-scope C1)
- **Référence code** :
  ```
  museum-backend/src/shared/observability/strip-free-text.ts:83-147   # mask scrub des champs free-text (input.messages, output.text, …) — NE touche PAS data.metadata
  museum-backend/src/shared/observability/langfuse.client.ts:68       # mask: stripFreeText câblé au ctor
  museum-backend/src/shared/observability/withLangfuseTrace.ts        # principal caller émettant `metadata` (museumId, intent, locale, tier, requestId — déjà PII-safe à la source)
  museum-backend/src/modules/chat/adapters/secondary/llm/langchain-orchestrator-tracing.ts
  museum-backend/src/modules/chat/useCase/llm/llm-judge-guardrail.ts
  museum-backend/src/modules/chat/adapters/secondary/audio/text-to-speech.openai.ts
  museum-backend/src/modules/chat/adapters/secondary/audio/audio-transcriber.openai.ts
  museum-backend/src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts
  ```
- **Symptôme** : `stripFreeText` (R6 du run C1) **préserve volontairement** `data.metadata` byte-pour-byte — l'assumption design (cf. `spec.md` §2 in-scope item A4-5 ; `design.md` D6) étant que les callers Musaium n'écrivent dans `metadata` que des champs déjà PII-safe (`museumId`, `intent`, `locale`, `tier`, `requestId`, `inputLength`, `estimatedCostCents`, etc.). Cette assumption n'est **pas enforced** par sentinel ou type system : un futur caller peut ajouter accidentellement une PII dans `metadata` (ex `metadata.userEmail`, `metadata.rawMessage`), elle traverserait le mask intacte vers `cloud.langfuse.com`.
- **Pourquoi non résolu en C1** : le triage `team-state/2026-05-21-p0-security/triage.md` cluster C1 ciblait les vecteurs `input.messages[*].content` / `output.text` auto-capturés par `langfuse-langchain.CallbackHandler` (P0). `metadata` est aujourd'hui correctement contraint à la source — pas de PII observée. La fermeture du gap est de la **defense-in-depth**, pas une fermeture de vecteur PII actif.
- **Sprint d'origine** : security phase /team `2026-05-21-p0-c1-pii-egress`, finding LOW × 1.
- **Effort estimé** : ~1 heure.
- **Comment fermer** :
  1. Définir une `METADATA_ALLOWED_KEYS` allow-list dans `museum-backend/src/shared/observability/` (ex `{museumId, intent, locale, tier, requestId, inputLength, estimatedCostCents, model, usage, usageDetails, ...}`).
  2. Ajouter une assertion légère côté caller (helper `assertMetadataAllowlist(metadata)`) à appeler depuis `withLangfuseTrace` + chaque `safeTrace` non-LangChain (les 5 callers cités ci-dessus). En dev : `throw` si clé inconnue ; en prod : `logger.warn` + filter out la clé.
  3. **OU** sentinel `scripts/sentinels/langfuse-metadata-allowlist.mjs` qui scan AST les callers `withLangfuseTrace|generation|event|span|trace.update` et bloque tout `metadata: { … }` literal avec une clé hors allow-list.
  4. Cocher TD-OBS-PII-METADATA-ALLOWLIST ici.

## TD-OBS-SCRUBRECORD-CYCLE-HARDENING — `scrubRecord` recursion sans cycle/depth cap (LOW, NON_BLOCKER)

- [ ] **Statut** : ouvert (créé 2026-05-21, security phase /team `2026-05-21-p0-c1-pii-egress` — LOW out-of-scope C1)
- **Référence code** :
  ```
  packages/musaium-shared/src/observability/sentry-scrubber.ts        # scrubRecord — recursion sur Record<string, unknown> sans seen-guard ni MAX_DEPTH
  museum-backend/src/shared/observability/sentry-scrubber.ts:8-16     # BE re-export
  museum-frontend/shared/observability/sentry-scrubber.ts             # FE wrapper
  museum-web/src/lib/sentry-scrubber.ts:13-43                         # Web wrapper
  ```
- **Symptôme** : `scrubRecord` parcourt récursivement les champs nested d'un Sentry event (`request`, `user`, `extra`, et désormais `tags` après R2 du run C1). La récursion n'a **ni seen-guard `WeakSet`** (cycle detection), **ni cap `MAX_DEPTH`**. Aujourd'hui inoffensif car les Sentry event bodies sont JSON-serializable (`beforeSend` est appelé sur des objets déjà sérialisables, le SDK les `JSON.stringify` avant transport), donc cycles ou nesting infini sont structurellement impossibles. La fermeture du gap est **defense-in-depth**, pas une fermeture d'incident actif.
- **Pourquoi non résolu en C1** : le triage cluster C1 ciblait des vecteurs PII observables. Cycle/depth est un risque **DoS théorique** (stack overflow → `beforeSend` throw → event drop) non observé en prod et structurellement bloqué par le contrat JSON Sentry.
- **Sprint d'origine** : security phase /team `2026-05-21-p0-c1-pii-egress`, finding LOW × 1.
- **Effort estimé** : ~30 minutes.
- **Comment fermer** :
  1. Ajouter `WeakSet` seen-guard dans `scrubRecord` (canonical, `packages/musaium-shared/src/observability/sentry-scrubber.ts`) : si l'objet a déjà été visité, retourner `'[circular]'` au lieu de récurser. Idem pour `scrubEvent` traversal sur `tags`.
  2. Ajouter `MAX_DEPTH=10` constant + tracker `depth` param récursif ; au-delà, retourner `'[too-deep]'`.
  3. Bumper `CANONICAL_HASH` dans `scripts/sentinels/sentry-scrubber-parity.mjs:65` en lockstep avec le diff canonical + golden test fixture.
  4. Ajouter golden tests : (a) `{a: obj}` où `obj.self = obj` → no stack overflow + scrub clean ; (b) nesting 12-deep → top 10 levels scrubbés, levels 11+ replaced par `'[too-deep]'`.
  5. Cocher TD-OBS-SCRUBRECORD-CYCLE-HARDENING ici.


---

- ~~TD-AX-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-AX-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-RHF-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-RHF-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-ZOD-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-ZOD-02 — No .brand<>() for numeric IDs (LOW, V1.1)
**Context** : userId vs museumId both `number` — cross-pass not prevented by type system.

- ~~TD-ZOD-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-ZUS-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-ZUS-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-I18N-01 — intl-pluralrules polyfill loaded TOO LATE → AR collapse silencieux (V1.1, NICE_TO_HAVE)
**Context** : Polyfill in `shared/i18n/i18n.ts:1` but `index.js:1` doesn't import it. Loads only when _layout.tsx eval. ANY future module importing i18next first → Hermes missing Intl.PluralRules. AR = CLDR Category 6 silently collapses.
**Fix** : Move `import 'intl-pluralrules';` to `museum-frontend/index.js:1` BEFORE `import 'expo-router/entry'`.
**Evidence** : `museum-frontend/shared/i18n/i18n.ts:1`, `museum-frontend/index.js:1`.

## TD-I18N-02 — Arabic plural keys MISSING (V1.1, NICE_TO_HAVE)
**Context** : `ar/translation.json:1156-1157` only `_zero` for minutesShort, only `_other` for chat.report. AR requires _one/_two/_few/_many/_other.
**Fix** : Author AR forms before AR launch. Add ESLint sentinel : `*_zero` requires `_one/_other` siblings ; AR requires all 6.

## TD-I18N-03 — Hand-rolled `_zero` ternary bypasses i18next (V1.1, NICE_TO_HAVE)
**Context** : `carnet/[sessionId].tsx:160-162` ternary. Bypasses plural resolution for AR.
**Fix** : `t('carnet.minutesShort', { count: Number(detail.durationLabel) })`. Requires TD-I18N-01 first.

## TD-I18N-04 — Pre-formatted dates interpolated as opaque strings (V1.1, NICE_TO_HAVE)
**Context** : RTL/AR can't reorder date vs surrounding text. v26 built-in `datetime` formatter ignored.
**Fix** : `"Granted on {{date, datetime(dateStyle: medium)}}"` + `t(..., {date: new Date(iso)})`.

## TD-I18N-05 — i18n.init missing supportedLngs (V1.1, NICE_TO_HAVE)
**Fix** : add `supportedLngs: SUPPORTED_LOCALES` + `defaultNS: 'translation'` + `ns: ['translation']`.


---

## TD-REA-01 — babel.config.js missing explicit react-native-worklets/plugin (LOW)
**Fix** : add `'react-native-worklets/plugin'` LAST in plugins array.

- ~~TD-REA-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-RNGH-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-RNGH-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-RNGH-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-RNGH-04 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## ✅ TD-RNAV-01 — Universal Links / App Links pour musaium.com (RÉSOLU 2026-05-21)
**Context** : Marketing email magic-links + Apple Smart App Banners + Android Chrome intent fallback ALL BREAK without `associatedDomains` (iOS) + `intentFilters with autoVerify` (Android).
**Résolution end-to-end en 2 cycles** : (1) plumbing d'association de domaine, (2) routage deep-link IN-APP lien→écran. La feature est désormais **complète côté code** ; seul reste le gate opérateur post-deploy (non automatisable en CI).

### Cycle 1 — plumbing d'association de domaine (run `/team` `2026-05-21-universal-links-td-rnav-01`, APPROVED weightedMean 92.95)

Fichiers livrés (6) :
- `museum-frontend/app.config.ts` — `ios.associatedDomains = ['applinks:musaium.com']` + `android.intentFilters` (`autoVerify` `https`/`musaium.com`), **prod-only** (`variant === 'production'` guard).
- `museum-frontend/__tests__/app-config-universal-links.test.ts` — Jest, 9 tests (R1-R4 × variants).
- `museum-web/public/.well-known/apple-app-site-association` (NOUVEAU, extensionless) — appID `RB3F9L6GUD.com.musaium.mobile`, 6 `components` scopés aux magic-links FR/EN (verify-email / reset-password / confirm-email-change) avec matcher `?token`, pas de `*` aveugle.
- `museum-web/public/.well-known/assetlinks.json` (NOUVEAU) — package `com.musaium.mobile`, SHA256 App Signing `38:97:AA:FF:…:34`.
- `museum-web/next.config.ts` — règle `headers()` forçant `Content-Type: application/json` sur le path AASA (NFR-1 / risque #1 : Next sert un fichier `public/` extensionless en `application/octet-stream`, qu'Apple invalide silencieusement).
- `museum-web/src/lib/well-known-association.test.ts` — Vitest, 10 tests.

### Cycle 2 — routage deep-link IN-APP (run `/team` `2026-05-21-universal-links-inapp-routing`, APPROVED weightedMean 90.9)

Ferme le gap explicitement laissé par le cycle 1 (cycle-1 spec §8 Q1) : une fois l'association OS↔app établie, l'OS remettait `https://musaium.com/fr/verify-email?token=…` à l'app, mais sans `+native-intent.tsx` Expo Router résolvait sur `+not-found` → le token one-time n'était jamais POSTé → verify-email / reset-password / confirm-email-change échouaient silencieusement pour les users app. Frontend-only, aucun changement backend / OpenAPI / migration.

Fichiers livrés (9) :
- `museum-frontend/app/+native-intent.tsx` (NOUVEAU) — `redirectSystemPath` : strip préfixe `/fr|/en`, mappe vers `/(stack)/{verify-email,reset-password,confirm-email-change}`, **préserve `?token` byte-for-byte** (string-slice, pas de round-trip `URLSearchParams`), passthrough `musaium://` et tout autre path inchangé, try/catch (retourne `event.path` sur erreur).
- `museum-frontend/features/auth/lib/magicLinkPath.ts` (NOUVEAU) — mapper pur (testable hors device, React/expo-free).
- `museum-frontend/features/auth/infrastructure/authApi.ts` (M) — ajout `verifyEmail(token)` → `POST /api/auth/verify-email` (méthode manquante ; `confirmEmailChange`/`resetPassword` existaient déjà).
- `museum-frontend/features/auth/ui/TokenExchangeFlow.tsx` (NOUVEAU) — composant 4-états auto-submit partagé (`loading|success|invalidToken|error`) pour verify-email + confirm-email-change.
- `museum-frontend/app/(stack)/{verify-email,confirm-email-change,reset-password}.tsx` (3 NOUVEAUX) + `app/_layout.tsx` (M, 3 routes enregistrées).
- `museum-frontend/shared/locales/{en,fr,es,de,it,ja,zh,ar}/translation.json` (M) — clés `verify_email.*` / `confirm_email_change.*` / `reset_password.*` (FR/EN traduites, autres EN-fallback).
- `museum-frontend/.maestro/magic-link-{verify-email,confirm-email-change,reset-password}.yaml` (3 NOUVEAUX) + `.maestro/shards.json` (M) — couverture happy-path UFR-021 / R12 (Maestro ne tourne PAS en CI cloud ici ; ces flows existent pour `sentinel:screen-test-coverage` + run on-device).

Tests : 5 suites Jest / 29 tests verts (`magicLinkPath`, `verifyEmail.api`, 3 écrans). Token jamais loggé (R13, testé + grep clean). Décisions D1-D8 dans le design du run (pas de nouvel ADR). Un cycle BLOCK-TEST-WRONG (bug de mock `expo-router` dans les tests d'écran) résolu par un red frais, sans toucher aux tests gelés (UFR-022).

**Reste à faire = gate opérateur post-deploy (NON automatisable en CI ; ne PAS prétendre vérifié — UFR-013)** :
- Pré-deploy iOS : confirmer que le profil de provisioning EAS **production** porte la capability **Associated Domains** (l'édition `app.config.ts` est inerte sans elle).
- Deploy gate : les 2 `.well-known` DOIVENT shipper en prod ET être placeholder-free (miroir du gate PGP-key, CLAUDE.md).
- Post-deploy iOS/Android : checks device réels (`curl` AASA/assetlinks + Apple CDN + `adb pm verify-app-links`/`get-app-links`).
- Post-deploy in-app (cycle 2) : avec l'app installée, taper un magic-link réel (verify-email / reset-password / confirm-email-change) DOIT ouvrir l'écran correspondant et consommer le token (PAS `+not-found`). Cf. runbook §3.1.

Runbook : [`docs/operations/UNIVERSAL_LINKS_VERIFICATION.md`](operations/UNIVERSAL_LINKS_VERIFICATION.md). Décisions cycle 1 (D1-D5) + cycle 2 (D1-D8) dans le design de chaque run (pas de nouvel ADR).

---

## TD-FL-01 — FlashList ListEmptyComponent/Header/Footer inline JSX (MINOR x4)
**Sites** : reviews.tsx:255,257 ; ticket-detail.tsx:219-223 ; ChatMessageList.tsx:255+ ; TicketsListView.tsx:178+.
**Fix** : hoist OR useMemo the JSX elements.

## TD-FL-02 — Chat lists should use maintainVisibleContentPosition v2 (INFO, V1.1)
**Fix** : replace manual `onContentSizeChange→scrollToEnd` with v2 native prop.

## TD-FLATLIST-01 — ~2 FlatList fixed-height sans getItemLayout (LOW, NICE_TO_HAVE)

> **NOUVEAU 2026-05-21 (fe-rn verdict).** ⚠️ **Ne PAS surévaluer** : le verdict fe-rn a corrigé la claim "11 sites" du finding en **3 FlatList + 8 FlashList** (FlashList calcule le layout automatiquement → pas de `getItemLayout` requis). Gap réel = uniquement les FlatList fixed-height.

- [ ] **Statut** : ouvert (créé 2026-05-21, refresh lib-docs 2026-05-20)
- **Référence code** : 3 sites `FlatList` en scope (`app/(stack)/onboarding.tsx`, `features/chat/ui/ImageCompareCarousel.tsx`, `features/museum/ui/MuseumPickerScreen.tsx`). Seul `onboarding.tsx` set déjà `getItemLayout` → **~2 sites résiduels** (dont `MuseumPickerScreen`). Re-vérifier chaque site (composant list réel) avant d'agir.
- **Symptôme** : perf latente (pas un bug). Listes courtes (museum picker, slides onboarding).
- **Severity** : LOW.
- **Comment fermer** : pour les FlatList genuinement fixed-height SEULEMENT, ajouter `getItemLayout` + `React.memo` row + `renderItem` stable. NE PAS blanket-apply aux FlashList.

---

## TD-SVG-01 — lib-docs version drift 15.13.0 vs resolved 15.15.4 (LOW)
**Fix** : re-fetch lib-docs OR pin package.json exact.

- ~~TD-SVG-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-SAFE-01 — 28 screens overuse useSafeAreaInsets → re-render churn (compte corrigé de 23/25, sweep 2026-05-21) (MEDIUM, NICE_TO_HAVE)
**Fix** : audit + swap straight padding usages à `<SafeAreaView edges={['top']}>`. Keep hook only pour conditional math.

## TD-SAFE-02 — Hand-rolled Jest mock (LOW)
**Fix** : `require('react-native-safe-area-context/jest/mock')` in test-utils.tsx:72-79.

---

## TD-RNWV-01 — webview originWhitelist broad → residual phishing (MEDIUM, NICE_TO_HAVE pre-V1)
**Context** : `originWhitelist: ['http://*','https://*']` accept ANY HTTPS. Mitigated par scheme filter MAIS pas arbitrary phishing.
**Fix** : restrict à domain list OR caller-side allowlist + document trust model.
**Evidence** : `museum-frontend/shared/ui/InAppBrowserSheetContent.tsx:154`.

## TD-RNWV-02 — onRenderProcessGone handler absent (LOW)
**Fix** : `onRenderProcessGone={() => setLoadError(true)}` per PATTERNS L144.

## TD-RNWV-03 — bump react-native-webview 13.16.0 → 13.16.1 (MEDIUM, pre-V1 stability)

> **NOUVEAU 2026-05-21 (mobile verdict, dérivé du snapshot react-native-webview 2026-05-20 ; pas de findings file dédié).**

- [ ] **Statut** : ouvert (créé 2026-05-21, refresh lib-docs 2026-05-20)
- **Référence code** : `museum-frontend/package.json` `"react-native-webview": "13.16.0"` (latest = 13.16.1, 2026-02-27, un patch behind).
- **Symptôme** : 13.16.1 = fix iOS — conversion nil `NSString`→`std::string` ne trigger plus `SIGABRT` dans le bridge C++ WebView. Même classe de crash que le `SIGABRT` `expo-web-browser` TestFlight (CLAUDE.md § Pièges connus, PR #258, hotfix `f7ec92f7`). Aucun breaking change.
- **Severity** : MEDIUM (pre-V1 stability), effort LOW.
- **Comment fermer** : `npx expo install react-native-webview` (→ 13.16.1) + `pod install` + `git add -f ios/Pods/...` (gotcha iOS Xcode-Cloud Pods committés). 1 seul consumer WebView, blast radius bas.

---

## ✅ TD-AS-01 — async-storage key namespacing inconsistent 11 prefixes (HIGH, NICE_TO_HAVE pre-V1) — RESOLVED 2026-05-25
**Context** : 24 keys across 11 prefix families (compte corrigé de 16/10, sweep 2026-05-21). getAllKeys cannot be cleanly filtered. Cross-app collision risk.
**Fix** : codemod to `musaium.<feature>.<key>` convention avec migration reader.
**RESOLVED 2026-05-25** (/team run `2026-05-25-p0-cleanup`, commit `feat(storage): namespace 10 AsyncStorage keys + one-shot legacy migration reader (TD-AS-01)`) :
- **10 clés non-conformes** re-préfixées `musaium.<feature>.<key>` à travers 6 fichiers : `app.themeMode`→`musaium.theme.mode` (`ThemeContext.tsx`) ; `runtime.{defaultLocale,defaultMuseumMode,guideLevel,apiBaseUrl,apiEnvironment}`→`musaium.runtime.*` (`runtimeSettings.ts`, `defaultLocale` aussi consommé par `I18nContext.tsx`) ; `settings.resumption_banner_dismissed_until`→`musaium.settings.resumptionBannerDismissedUntil` (`useResumableSession.ts`) ; `museum.lastCameraView.v1`→`musaium.museum.lastCameraView.v1` (`mapCameraCache.ts`) ; `@musaium/saved_artworks`→`musaium.dailyArt.savedArtworks` + `@musaium/daily_art_dismissed`→`musaium.dailyArt.dismissed` (`useDailyArt.ts`).
- **Reader one-shot legacy→new** : `museum-frontend/shared/infrastructure/migrateStorageKey.ts` — idempotent, no-overwrite (short-circuit si la nouvelle clé porte déjà des données), no-op si legacy absente, copie la valeur en opaque-string (pas de re-parse), best-effort (toute erreur AsyncStorage avalée). Câblé sur les 6 read call-sites. Test : `__tests__/infrastructure/migrateStorageKey.test.ts`.
- **Clés déjà conformes `musaium.*` NON touchées** (`shared/state`, `features/dataMode`, `queryClient.ts` — diff vide). Le compte "24 keys" du Context d'origine incluait ces conformes + les redéfinitions de mock test (cf. TD-AS-04) ; seules les **10 non-conformes** côté runtime étaient à corriger.
- Reste ouvert : **TD-AS-02** (wrapper `storage.ts` sans try/catch — compensé localement par le try/catch interne de `migrateStorageKey`), **TD-AS-03**, **TD-AS-04**.

## TD-AS-02 — storage.ts wrapper missing try/catch setItem/removeItem (MEDIUM, NICE_TO_HAVE)
**Fix** : try/catch in wrapper OR enforce at call sites avec ESLint rule.

## TD-AS-03 — musaium.query.cache no size monitoring → Android 2MB cap risk (INFO, V1.1)
**Fix** : periodic size check + bust at 1.5MB OR migrate to MMKV.

## TD-AS-04 — 24 test files redefine inline jest.mock async-storage (compte corrigé de "10+", sweep 2026-05-21) (INFO, codemod)
**Fix** : create `museum-frontend/__mocks__/@react-native-async-storage/async-storage.js` re-export bundled mock.


---

- ~~TD-MGL-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-MGL-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-FM-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-FM-02 — 4 fichiers landing utilisent useScroll/useTransform/whileInView sans useReducedMotion (MEDIUM, a11y WCAG 2.3.3)

> **NOUVEAU 2026-05-21 (web-next verdict, 4 fichiers vérifiés grep `useReducedMotion` = 0 dans chacun). Follow-up de TD-FM-01 (rename), pas un gap de rename.**

- [ ] **Statut** : ouvert (créé 2026-05-21, refresh lib-docs 2026-05-20)
- **Référence code** : `src/components/shared/Header.tsx` (`useScroll`+`useTransform` :7,21,33,38,43), `src/components/marketing/PhoneMockup.tsx` (parallax `useScroll`/`useTransform` :4,41,46), `src/components/marketing/StorySection.tsx` (`whileInView` :108,117,130,142), `src/components/marketing/BentoFeatureGrid.tsx` (`whileInView` :40) — **0** `useReducedMotion` dans chacun.
- **Symptôme** : la media query CSS `@media (prefers-reduced-motion)` (`globals.css:364`) ne couvre PAS le motion JS-driven (`useTransform`/`whileInView`). Parallax = cas-école motion-sickness. WCAG 2.3.3 (Animation from Interactions). Baseline positive : 6/11 importers motion guardent déjà reduced-motion.
- **Severity** : MEDIUM a11y, pre-launch nice-to-have.
- **Comment fermer** : `<MotionConfig reducedMotion="user">` au layout root web (1-file, couvre les 11) OU `useReducedMotion()` short-circuits sur les 4 fichiers non-gardés.

---

## TD-RECH-01 — recharts isAnimationActive={false} missing in tests (MEDIUM)
**Fix** : set on Line/Bar in tests OR stub ResizeObserver.

## TD-RECH-02 — recharts per-component generics missing (LOW)
**Fix** : `<Line<UsageChartPoint, number> dataKey='sessions' />`.

## TD-RECH-03 — Chart container missing aria-label (LOW)
**Fix** : `role='img' + aria-label={dict}` on ResponsiveContainer parent.

---

- ~~TD-SNXT-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SNXT-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SNXT-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SNXT-04 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-NI-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-NI-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-NI-03 — Missing iOS AppState refresh (LOW)
**Fix** : useEffect listen AppState → NetInfo.refresh().

## TD-NI-04 — 8x inline jest.mock netinfo (compte corrigé de 5x, sweep 2026-05-21) (LOW)
**Fix** : use bundled `netinfo-mock.js` in jest.setup.ts.

---

- ~~TD-OM-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-QR-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-QR-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-MD-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-MD-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-MD-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-MD-04 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-PC-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-PC-02 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-PC-03 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-SW-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
- ~~TD-QRW-01 (fermé, archivé 2026-05-21 sweep multi-agent)~~ → [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)
## TD-UUID-01 — uuid deps vs pnpm.overrides version inconsistency (LOW)
**Fix** : align `museum-backend/package.json:88 ^11.1.1` (pnpm.overrides) OR drop override.

## TD-MID-01 — reflect-metadata test imports consolidate to setupFiles (LOW)
**Fix** : single Jest setupFiles entry instead of 4 ad-hoc.

## TD-MID-02 — p-limit ^3 too loose (Renovate cap risk) (LOW)
**Fix** : tighten `museum-backend/package.json:172` to `^3.1.0`.

---

## TD-CB-PARSE-NULL-WEDGE — Walk path `narrowWalkStructuredResult` throws hors try/catch wedge le breaker HALF_OPEN (LOW, V1.1)

- [ ] **Statut** : ouvert (créé 2026-05-21, /team run `2026-05-21-p0-c2-cost-breaker`, reviewer IMPORTANT downgrade LOW backlog).
- **Référence code** :
  ```
  museum-backend/src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts:570 (narrowWalkStructuredResult call, post try/catch)
  museum-backend/src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts:478-498 (invokeWalkStructured try/catch — n'enveloppe QUE structured.invoke)
  ```
- **Symptôme** : sur le walk path, `invokeWalkStructured` enveloppe `structured.invoke()` dans un try/catch qui appelle `costBreaker.recordFailure()` sur exception (R9 cost-breaker run C2). MAIS `narrowWalkStructuredResult()` (appelée à `:570`, APRÈS le try/catch) peut throw `Error('walk structured output parse failure — parsed: null')` quand le LLM retourne un parsed:null (strict-schema drift). Dans ce cas le probe HALF_OPEN a consommé son slot (`probeInFlight=true` via `canAttempt()`) MAIS `recordFailure()` n'est PAS appelé → breaker wedged HALF_OPEN → requêtes suivantes passent sans gate jusqu'à expiration `openDurationMs` (default 60s).
- **Pourquoi non résolu en V1** : (a) out-of-spec-R9 scope (R9 contract = throws de `structured.invoke` seulement, design.md §3 D3 « try/catch around structured.invoke ») ; (b) impact pre-launch LOW (parsed:null = strict-schema edge case, pas adversary-controlled, BE-controlled prompt shape) ; (c) auto-recovery 60s borne le blast radius — pas de wedge permanent ; (d) fail-CLOSED protection conservée tant que le breaker était OPEN avant le probe (le wedge n'élargit pas la surface coût, il retarde simplement la re-trip).
- **Sprint d'origine** : 2026-05-21.
- **Effort estimé** : ~30 min — deux options :
  - (a) **Étendre `invokeWalkStructured`** pour englober `narrowWalkStructuredResult` dans le même try/catch (plus chirurgical, préserve la sémantique « probe failure = recordFailure »).
  - (b) **`recordFailure()` défensif** au site `narrowWalkStructuredResult` throw — moins propre mais 1 ligne.
- **Référence run** : `team-state/2026-05-21-p0-c2-cost-breaker/` (review.json `findings.important[0]`, security agent LOW finding STORY.md horodaté 2026-05-21T18:25:22Z) — *run de travail élagué (rétention 30j)*.

---

## TD-MIG-DRIFT-HOUSEKEEPING — Pre-existing TypeORM schema drift détecté en C3, refusé du scope (LOW/MEDIUM, NICE_TO_HAVE pre-V1)

- [ ] **Statut** : ouvert (créé 2026-05-21, `/team` run `2026-05-21-p0-c3-auth-crypto`).
- **Origine** : le générateur `node scripts/migration-cli.cjs generate --name=AddTotpLastUsedStep` (lancé par l'editor green pour matérialiser `last_used_step bigint NULL` sur `totp_secrets`) a émis un diff entity↔DB beaucoup plus large que la seule colonne ajoutée — la dev DB locale du worktree n'était pas pleinement migrée vs `main`. **Per design §4** la migration body a été restreinte à la colonne `last_used_step` (cf disclosure JSDoc du fichier `1779391176767-AddTotpLastUsedStep.ts:17-22` : *"The raw generator output included unrelated drift (...) Per design §4 the migration body is restricted to the intended scope ; the unrelated drift is tracked separately under TD-MIG-* (out of scope for this run, see docs/TECH_DEBT.md)."*). Cette entrée TD tient le registre des items à traiter dans un cycle housekeeping dédié, pas bundlé avec un fix sécurité scopé.
- **Items détectés (refusés du scope C3)** :
  - **FK renames** sur `user_consents` (FK column ou constraint name désynchronisée vs entity metadata) — TypeORM voulait `DROP CONSTRAINT` + `ADD CONSTRAINT` avec un nom canonique différent.
  - **FK renames** sur `totp_secrets` (idem — uniquement le rename de constraint, pas la colonne ajoutée par C3).
  - **`museums.wikidata_qid` drop** — la colonne existe en DB mais n'est plus dans l'entity (legacy d'une refonte Wikidata).
  - **`artwork_embeddings.embedding halfvec → text`** — TypeORM voulait revert le type `halfvec(768)` introduit en C3 vers `text` car aucune `@Column` type custom ne décrit `halfvec` (cf CLAUDE.md gotcha `halfvec(N)` PG extension). À ne PAS appliquer en prod (perdrait l'index HNSW `halfvec_ip_ops`).
  - **`art_keywords` UNIQUE** — contrainte UNIQUE manquante côté DB que TypeORM voulait `ADD`.
  - **Dropped indexes** — quelques `IDX_*` que TypeORM ne reconnaît plus comme dérivables de l'entity metadata (probablement créés par une ancienne migration que TypeORM ne retrouve pas dans le diff entity).
  - **`chat_sessions.version` DEFAULT removal** — TypeORM voulait `ALTER COLUMN version DROP DEFAULT` (col `@VersionColumn` qui n'accepte pas de DEFAULT côté entity).
- **Pourquoi non résolu en V1** : (a) hors-scope du fix sécurité C3 (R1..R12 = I-SEC5/I-SEC7/I-SEC3, aucun n'implique ces items) ; (b) tous ces items requièrent une revue indépendante — certains sont des faux positifs TypeORM (le `halfvec→text` revert est **dangereux** en prod), d'autres sont du nettoyage propre (`museums.wikidata_qid` drop, FK renames) ; (c) bundler ce drift dans la migration C3 violerait migration-governance + scope discipline + cacherait l'origine de chaque item.
- **Impact runtime V1** : NUL aujourd'hui — la DB prod tourne, `chat`/`auth` ne dépendent pas de ces items. Le risque est principalement :
  - Une future migration `migration-cli.cjs generate` re-générera ce drift à chaque appel tant qu'il n'est pas résolu (bruit + risque qu'un dev applique par erreur le revert `halfvec→text`).
  - Le check `migration:run && migration-cli.cjs generate --name=Check` (cité §9 spec, run acceptance criterion) n'est PAS clean tant que le drift existe — donc on perd cette sentinelle.
- **Sprint d'origine** : 2026-05-21.
- **Effort estimé** : ~2-4h — pour chaque item, classer (a) faux positif TypeORM (ex `halfvec → text`, à fixer côté entity via `@Column({ type: 'halfvec' as any })` ou type custom) vs (b) nettoyage légitime (FK renames, `wikidata_qid` drop) → générer migration ciblée par groupe + ADR si besoin pour les choix non triviaux.
- **Référence run** : `team-state/2026-05-21-p0-c3-auth-crypto/` (STORY.md L24 disclosure, migration JSDoc `1779391176767-AddTotpLastUsedStep.ts:17-22`).

---

## TD-A11Y-COMPOSER-CREATEELEMENT — Composer.tsx `React.createElement('View')` string crashait au runtime (RÉSOLU 2026-05-24)

- [x] **Statut** : RÉSOLU (hotfix `c6bf75e8e` 2026-05-24). Corrige aussi une affirmation FAUSSE de la version initiale de cette TD (voir ci-dessous, UFR-013).
- **CORRECTION FACTUELLE (UFR-013)** : la version initiale de cette TD (créée 2026-05-23 par le documenter du run `2026-05-23-chat-composer-buttons-modal-dismiss`) affirmait *« RN-runtime-équivalent (...), pas de différence runtime »*. **C'était faux.** `React.createElement('View', ...)` avec la string `'View'` lève au runtime `Invariant Violation: View config getter callback for component 'View' must be a function (received undefined)` — la string n'a pas de `viewConfigGetter` enregistré ; seul le composite `View` importé de `react-native` résout vers `ViewNativeComponent`. Le mock Jest de RN enregistre `'View'` comme host string → tests verts → crash masqué. Signalé par l'utilisateur au premier `npm run dev:local` après commit `68e620648`.
- **Fix appliqué** : `Composer.tsx` réécrit en JSX standard `<View><Pressable testID=...>…</Pressable></View>`. `createElement` supprimé entièrement, `iconButtonInner 0×0` style supprimé, block-comment supprimé. `Composer.layout.test.tsx` : assertions assouplies (`findAncestor` column puis row au lieu de `lca.parent` strict ; dedupe testID hits). Sémantique vérifiée inchangée : mic AVANT attach DANS column DANS row. 3282/3282 tests FE pass + typecheck pass.
- **Leçon** : voir `TD-PIPELINE-RT-SMOKE-GAP` (ci-dessous) — le gap systémique qui a permis le crash de passer 3 garde-fous (Jest, reviewer, documenter).
- **Référence run** : `team-state/2026-05-23-chat-composer-buttons-modal-dismiss/` (review loop 2 `findings.info[1]`). Hotfix : commit `c6bf75e8e`.

---

## TD-PIPELINE-RT-SMOKE-GAP — /team Verify n'a aucun boot runtime RN → Jest mock masque les crashes host-primitive (MEDIUM, V1.1)

- [ ] **Statut** : ouvert (créé 2026-05-24, post-mortem du crash `TD-A11Y-COMPOSER-CREATEELEMENT`).
- **Symptôme** : un crash runtime RN (`Invariant Violation` sur `createElement('View')` string) a traversé TROIS garde-fous sans être détecté :
  1. **Jest** (`npm test`, 3282/3282 vert) — le mock RN enregistre `'View'` comme host string valide, donc `createElement('View')` passe. Le runtime réel ne l'enregistre pas.
  2. **Reviewer fresh-context loop 2** — APPROVED (89.9/100) sur typecheck + lint + jest, sans booter l'app.
  3. **Documenter** — a classé la dette « pas de différence runtime » (faux).
  L'utilisateur l'a vu au premier `npm run dev:local`.
- **Cause racine** : le pipeline `/team` (Spec→Plan→Red→Green→Verify→Security→Review→Documenter) n'a **aucune phase qui exécute le runtime RN réel**. La phase Verify = `jest` + `tsc` + `lint`, tous aveugles à la résolution `ViewNativeComponent`. Le seul gate runtime du repo est Maestro (`ci-cd-mobile.yml`) qui tourne **après** push, pas pendant `/team` ni en local pre-commit.
- **Pourquoi UFR-021 ne l'a pas couvert** : la sentinel `scripts/sentinels/screen-test-coverage.mjs:87` scope `app/**/*.tsx` + `features/**/ui/*Screen.tsx`. `Composer.tsx` est un sous-composant (pas `*Screen.tsx`) → explicitement hors scope (CLAUDE.md UFR-021 « Out of scope : sub-composants présentationnels »). Le crash se manifeste pourtant sur l'écran hôte `app/(stack)/chat/[sessionId].tsx` qui, lui, EST dans le scope Maestro — mais Maestro ne tourne qu'en CI.
- **Pistes de remédiation (à arbitrer)** :
  - (a) Ajouter une lint rule ast-grep `tools/ast-grep-rules/no-createelement-host-string.yml` qui bannit `React.createElement('<lowercase-or-View/Text/...>', …)` — cheap, déterministe, attrape ce pattern précis. **Recommandé en premier** (effort ~30 min).
  - (b) Phase Verify `/team` : pour tout diff touchant `museum-frontend/{app,features}/**/*.tsx`, exiger un smoke runtime — soit un test `react-test-renderer` SANS le mock host-string (env dédié), soit un Maestro flow local headless. Effort ~1 jour, friction non-triviale.
  - (c) Étendre UFR-021 aux sous-composants `features/**/ui/*.tsx` (pas seulement `*Screen.tsx`) quand ils sont importés par un écran in-scope. Risque : explosion du nombre de flows Maestro requis.
- **Priorité MEDIUM** : un crash mount-time sur l'écran chat (écran principal) = P0 si shippé en prod. La piste (a) ferme le pattern exact à coût quasi-nul ; (b)/(c) sont des durcissements pipeline plus lourds à arbitrer post-launch.
- **Référence** : crash `TD-A11Y-COMPOSER-CREATEELEMENT`, hotfix `c6bf75e8e`, run `2026-05-23-chat-composer-buttons-modal-dismiss`.

---

## TD-BACKDROP-DISMISS-R6 — backdrop-dismiss.test.tsx parametrize sur 4/6 routes non-bloquantes (LOW, V1.1)

- [ ] **Statut** : ouvert (créé 2026-05-23, `/team` run `2026-05-23-chat-composer-buttons-modal-dismiss`, reviewer loop 2 INFO + tech-debt D-R6-01).
- **Référence code** :
  ```
  museum-frontend/__tests__/features/chat/bottom-sheet-router/backdrop-dismiss.test.tsx:163-211 (cases array)
  team-state/2026-05-23-chat-composer-buttons-modal-dismiss/spec.md (R6 §48 wording "every non-blocking route" → 6 routes — spec team-state archivée/élaguée, voir git history)
  ```
- **Symptôme** : la spec R6 demande la parameterisation sur 6 routes non-bloquantes (`attachment-picker`, `browser`, `context-menu`, `summary`, `ai-disclosure`, `cartel-scanner`). Le test couvre 4/6 (`attachment-picker`, `browser`, `context-menu`, `summary`) ; manque `ai-disclosure` + `cartel-scanner`.
- **Pourquoi non résolu en V1** : (a) test frozen per UFR-022 red-test-manifest ; (b) le fix container-level (`pointerEvents="box-none"` sur `<BottomSheetContainer>`) est *uniforme* sur toutes les routes C4 — un seul `BottomSheetContainer` les héberge → la couverture 4/6 est *fonctionnellement complète proof* que les 6 routes fonctionnent ; (c) re-spawn red phase juste pour étendre l'array `cases` (2-line change) = disproportionné vs le bénéfice ; (d) reviewer loop 2 a explicitement accepté comme INFO non-blocking.
- **Effort estimé** : ~30 min — extend `cases` array dans une fresh red phase :
  ```ts
  { id: 'ai-disclosure', params: {} },
  { id: 'cartel-scanner', params: {} },
  ```
  Mock content + routes déjà installés par `installAllMockRoutes()`.
- **Référence run** : `team-state/2026-05-23-chat-composer-buttons-modal-dismiss/` (review loop 2 `findings.info[0]`, `carryForwardToDocumenter.techDebt[1]`, ADR-066 §Risques).

---

## TD-LINT-FROZEN-COMPOSER — 2 warnings `@typescript-eslint/require-await` dans backdrop-dismiss.test.tsx frozen (LOW, V1.1)

- [ ] **Statut** : ouvert (créé 2026-05-23, `/team` run `2026-05-23-chat-composer-buttons-modal-dismiss`, verifier finding F1).
- **Référence code** :
  ```
  museum-frontend/__tests__/features/chat/bottom-sheet-router/backdrop-dismiss.test.tsx:46-47
  ```
- **Symptôme** : 2 warnings `@typescript-eslint/require-await` sur les stubs async `toggleRecording`/`playRecordedAudio` (déclarés `async` sans `await` dans le corps). Test frozen → editor green ne peut pas modifier le body. Verifier `npm run lint` exit 1 (warnings, pas errors) — dispatcher brief accepte explicitement.
- **Pourquoi non résolu en V1** : (a) frozen-test contract per UFR-022 ; (b) warnings (pas errors), gate-passing ; (c) BLOCK-TEST-WRONG aurait re-spawn red phase pour 2 lint warnings = disproportionné.
- **Effort estimé** : ~10 min — au prochain touch du fichier (post-frozen), choix entre :
  - (a) refactor stubs vers non-async (drop `async`, return `undefined` direct) — préférable per LINT_DISCIPLINE.md "fix code first" ;
  - (b) inline `eslint-disable-next-line @typescript-eslint/require-await` avec `Justification:` + `Approved-by:`.
- **Référence run** : `team-state/2026-05-23-chat-composer-buttons-modal-dismiss/STORY.md` (verifier section F1 "WARN, not FAIL").

---

## TD-CMP6-SBOM-ATTEST — Décision I-CMP6 ("Tout faire") + gap résiduel attestation binaire mobile (EU CRA Art. 13 / 2027)

- [ ] **Statut** : ouvert (créé 2026-05-25, `/team` run `2026-05-25-p0-a11y-compliance`, R11 / I-CMP6 ; partiellement adressé ce run, gap mobile résiduel).
- **Décision Q3 = "Tout faire"** (validée user, design §D5-D7 du run) :
  - **Backend** — `cosign attest --type cyclonedx --predicate museum-backend/sbom.json` ajouté dans `ci-cd-backend.yml` deploy-prod, sur `steps.push.outputs.digest`, APRÈS la SLSA `attest-build-provenance@v2`. ADDITIF + `continue-on-error: true` (advisory, ne gate jamais le deploy déjà vérifié). Steps `cosign sign`/`attest-build-provenance`/`cosign verify`/`gh attestation verify` existants inchangés.
  - **Web** — `ci-cd-web.yml` deploy : `id-token: write` + `attestations: write` ajoutés ; setup pnpm/Node + install + SBOM CycloneDX + `cosign attest --type cyclonedx` sur le digest du push (`id: push`). ADDITIF + `continue-on-error: true`.
  - **Mobile** — `ci-cd-mobile.yml` quality : SBOM CycloneDX du graphe de deps JS généré + uploadé en artefact CI (`sbom-mobile`). PAS d'attestation sigstore.
- **Gap résiduel (mobile)** : le binaire store (App Store / Google Play) n'a **pas** d'attestation SBOM signée liée à son digest. Cause : EAS `eas build --no-wait` (`ci-cd-mobile.yml`) construit l'app à distance et n'expose **aucun digest OCI local** atteignable depuis la CI — il n'y a donc rien à quoi lier un prédicat signé. Le SBOM est shippé en artefact CI, mais pas signé/lié au binaire.
- **Référence code** :
  ```
  .github/workflows/ci-cd-backend.yml   (step "Cosign attest SBOM (CycloneDX)")
  .github/workflows/ci-cd-web.yml        (step "Cosign attest SBOM (CycloneDX)")
  .github/workflows/ci-cd-mobile.yml     (step "Generate mobile SBOM (CycloneDX)" + "Upload mobile SBOM artifact")
  scripts/sentinels/sbom-attest-check.mjs (contrat des 3 workflows)
  ```
- **Échéance contraignante** : **EU CRA Art. 13 (2027)** — pas un blocker V1 (2026-06-07). Le SBOM mobile en artefact suffit à l'audit ; l'attestation signée du binaire store est le delta à fermer avant 2027.
- **Effort estimé** : 4-8 h — investiguer le tooling EAS-side (export SBOM/attestation depuis le pipeline EAS, ou `eas build --json` + récupération du digest de l'artefact store) ; lier un prédicat CycloneDX au binaire via l'API attestation Expo si disponible.
- **Comment fermer** : EAS expose un digest/identifiant stable du binaire → générer + signer l'attestation côté EAS hook ; sinon attendre le support natif Expo/EAS de l'attestation SBOM.
- **Décision formalisée** : [`docs/adr/ADR-068-sbom-attestation-strategy-mobile-gap.md`](adr/ADR-068-sbom-attestation-strategy-mobile-gap.md) (digest-bound where possible ; gap mobile = ce TD).
- **Référence run** : `team-state/2026-05-25-p0-a11y-compliance/` (spec.md §2 I-CMP6, design.md §D5-D7).

---

## TD-FE-CHAT-BURY-SSE — Enterrer le code mort onToken/onDone/onGuardrail + streamText plumbing dans la stratégie chat + réaligner 3 tests fake-world (MEDIUM, V1.1)

- [ ] **Statut** : ouvert (créé 2026-05-25, `/team` run `2026-05-25-p0-fa1-empty-bubble-text-only`, décision plan D2 / review NIT ; burial différé hors du scope P0).
- **Référence code** :
  ```
  # Code mort — callbacks jamais appelés (sendMessageSmart sync-only)
  museum-frontend/features/chat/infrastructure/chatApi/send.ts:169-172              # sendMessageSmart = async (params) => deps.postMessage(params) — ignore onToken/onDone/onGuardrail/signal
  museum-frontend/features/chat/application/sendStrategies/sendMessageStreaming.ts:77-114  # bloc onToken/onDone/onGuardrail passé à sendMessageSmart, jamais invoqué
  museum-frontend/features/chat/application/useStreamingState.ts:18,22,29,42,54,57,58  # streamTextRef / flushStreamText / scheduleFlush — seuls consommateurs = onToken/onGuardrail morts
  museum-frontend/features/chat/application/sendStrategies/sendStrategy.types.ts:83-86     # champs streamTextRef/scheduleFlush/flushStreamText du context-bag SendMessageContext
  # Commentaire stale (review NIT)
  museum-frontend/features/chat/application/sendStrategies/sendMessageStreaming.ts:116     # « Non-streaming fallback (image messages or streaming not available) » — le bloc sert désormais texte + image
  # Tests fake-world à réaligner (pilotent un monde que le transport live ne produit jamais)
  museum-frontend/__tests__/hooks/useChatSession.test.ts:774   # "invokes onToken and onDone to build assistant message" (fire onToken+onDone, return null)
  museum-frontend/__tests__/hooks/useChatSession.test.ts:817   # "invokes onGuardrail to set guardrail text" (fire onGuardrail+onDone, return null)
  museum-frontend/__tests__/hooks/useChatSession.test.ts:935   # "onDone with empty final text still replaces streaming placeholder" (fire onDone, return null)
  ```
- **Symptôme** : la voie SSE a été enterrée (D1, ADR-001 SSE deprecated) mais ses callbacks survivent en code mort. `sendMessageSmart` est **toujours synchrone** (`send.ts:169-172` = `=> deps.postMessage(params)`) et **ignore** `onToken`/`onDone`/`onGuardrail`/`signal` ; `sendMessageStreaming.ts:77-114` les passe pourtant encore, et `streamTextRef`/`scheduleFlush`/`flushStreamText` (`useStreamingState.ts`) n'ont plus que ces callbacks morts comme consommateurs. Ce code mort a **directement causé le bug P0-FA1** (bulle assistant vide en texte-seul) : la garde `sendMessageStreaming.ts:117` dépendait de `onDone` pour resetter `streamingIdRef.current`, ce qui ne se produit jamais en live → le bloc finalize était sauté hors path image. **Le fix P0 (1 ligne, garde élargie) a été shippé sans enterrer le code mort** (scope discipline hotfix). En outre, 3 tests `useChatSession.test.ts:774/817/935` mockent `onToken`/`onDone`/`onGuardrail` — exactement les callbacks que le transport live n'appelle jamais → ils passaient au vert tout en couvrant un monde fictif (anti-pattern CLAUDE.md UFR-021 « Jest mocks the very interaction that breaks »), ce qui explique que le bug a shippé vert.
- **Pourquoi non résolu en V1 (P0-FA1)** : burial = refacto à blast radius large (touche `useStreamingState.ts`, le type `SendMessageContext` dans `sendStrategy.types.ts`, l'index des stratégies qui câble le context-bag, et l'affordance streaming de `ChatMessageBubble`), et force la réécriture/suppression des 3 tests fake-world. Hors scope d'un hotfix P0 launch-blocker : la priorité était la regression-safety du fix 1-ligne, pas un refacto. Déclaré comme **déviation UFR-016** (le code mort viole l'esprit « il est mort on l'enterre » ; trade-off = sécurité de non-régression sur un blocker, assumé honnêtement). Caveat : le fix P0 ne dépend PAS de ce code mort et ne le ravive pas.
- **Sprint d'origine** : run `/team` `2026-05-25-p0-fa1-empty-bubble-text-only` (plan D2/D5, review NIT commentaire `:116`).
- **Effort estimé** : ~2-4 h.
- **Comment fermer** :
  1. Supprimer le bloc `onToken`/`onDone`/`onGuardrail` (`sendMessageStreaming.ts:77-114`) et la garde télémétrie morte associée — confirmer via grep qu'aucun autre consommateur live ne reste (`onToken`/`onDone`/`onGuardrail` n'apparaissent que dans `send.ts` (type + impl qui ignore) et `sendMessageStreaming.ts` au moment de la création de ce TD).
  2. Enlever `streamTextRef`/`flushStreamText`/`scheduleFlush` de `useStreamingState.ts` + des champs du context-bag `SendMessageContext` (`sendStrategy.types.ts:83-86`) + de l'index des stratégies qui les câble. Vérifier l'affordance streaming de `ChatMessageBubble` (retirer si plus alimentée).
  3. Simplifier la signature `SendMessageSmartParams` (`send.ts`) en retirant les callbacks ignorés (ou documenter qu'on les garde si une voie streaming V1.1+ est planifiée — sinon enterrer).
  4. **Réaligner les 3 tests fake-world** `useChatSession.test.ts:774/817/935` : les supprimer (le monde onDone/onGuardrail n'existe plus) OU les réécrire pour piloter le vrai path sync (mock `mockResolvedValue(PostMessageResponseDTO)` sans firer de callback, comme les tests P0-FA1 TR.1-TR.6 du describe `text-only sync finalize`). Ne pas laisser de test qui couvre un monde mort.
  5. Toiletter le commentaire stale `sendMessageStreaming.ts:116` « Non-streaming fallback (image messages or streaming not available) » → le bloc sert désormais texte + image en path sync unique (review NIT).
  6. `npm run lint` + `npx jest __tests__/hooks/useChatSession.test.ts` + `gitnexus_detect_changes` ; cocher TD-FE-CHAT-BURY-SSE ici.
- **Références** : ADR-001 (SSE deprecated, burial D1) ; `team-state/2026-05-25-p0-fa1-empty-bubble-text-only/{spec.md,design.md (§D2/D5),STORY.md}` ; CLAUDE.md § UFR-016 (« il est mort on l'enterre ») + UFR-021 (anti-pattern fake-world tests).
- **Note de citation (UFR-013)** : le brief documenter pointait `useChatSession.test.ts:773/816/934` ; vérification `grep` (cf. STORY.md documenter) → les `it(` réels sont à `:774`/`:817`/`:935` (off-by-one — ligne `describe`/commentaire juste au-dessus). Lignes ci-dessus = vérifiées par lecture, source de vérité.

## TD-OPAQUE-ANIMATED-VALUE-SKELETON — test introspecte `Animated.Value._value` (API privée RN) dans un test RED gelé (LOW, V1.1)

- [ ] **Statut** : ouvert (créé 2026-05-26, audit doc-cleanup §5 V1 ; tracé ici avant burial du triage).
- **Référence code** : `museum-frontend/__tests__/features/chat/ui/ImageCompareCardSkeleton.test.tsx` (L63,67 — *fichier supprimé depuis ; réf historique*) — commentaire « Allow Animated objects too (they expose `_value` in tests) » + accès `(flat.opacity as { _value?: number } | undefined)?._value`.
- **Symptôme** : viole la doctrine `feedback_opaque_animated_value_test_contract` (« Tests MUST NOT introspect `Animated.Value._value` — use observable reducer state »). Le test pilote l'animation via un champ privé RN au lieu de l'état observable. Violation **dormante** : c'est un test RED pour `ImageCompareCardSkeleton` (feature ImageCompare C3.5, SUT non construit / différé) — inerte tant que le composant n'existe pas, active à la phase Green.
- **Pourquoi non résolu** : (a) frozen-test contract UFR-022 — modifier le test hors re-spawn red phase est interdit ; (b) feature ImageCompare non priorisée V1 ; (c) corriger maintenant = `BLOCK-TEST-WRONG` + re-spawn red disproportionné pour un test dormant. Même classe que [[TD-LINT-FROZEN-COMPOSER]].
- **Comment fermer** : lors du build réel d'ImageCompare (phase red/green `/team`), réécrire l'assertion pour lire l'état observable (reducer/prop) au lieu de `_value`. Cf. doctrine `feedback_opaque_animated_value_test_contract`.
- **Références** : audit doc-cleanup 2026-05-26 (triage §5 V1, conservé en historique git commit `ea389d13e`) ; CLAUDE.md (frozen-test UFR-022) ; mémoire `feedback_opaque_animated_value_test_contract`.

---

## Audit contrôle qualité 360° — 2026-06-04

> Source : workflow multi-agents (22 agents, 127 findings, 6 HIGH re-vérifiés 6/6 confirmés). Artefacts : `audit-state/2026-06-04-controle-qualite-360/` (ALL-FINDINGS.md = 127 findings path:line) + `artifacts/2026-06-04-controle-qualite-360.html`. Verdict global **79/100 (B+)**.
> Niveau de vérification noté par dette : **✔ re-lu à la main** (orchestrateur) vs **○ rapporté-agent** (preuve path:line de l'agent, fichier confirmé, non re-lu ligne-à-ligne). Honnêteté UFR-013.
> **Les dettes code passent par `/team` (UFR-022 fresh-context).** Les dettes gate/CI sont des modifs workflow.

### TD-61 — `audit-chain.computeRowHash` exclut le contenu imbriqué du hash (collision) — ✔ re-lu — **RÉSOLU (pending merge)**

- [x] **Statut** : **résolu (pending merge)** — /team run `2026-06-04-audit-chain-nested-hash` (UFR-022 fresh-context), reviewer APPROVED weightedMean 92.3. Cf. **[ADR-070](adr/ADR-070-audit-chain-canonical-deep-serializer-hash-version.md)**. Commit à venir (working tree non committé à l'écriture de cette entrée). **AUDIT-02 (oracles de test buggés) corrigé dans le même lot.** *(historique d'origine conservé ci-dessous.)*
- **Sévérité (origine)** : HIGH, candidat CRITICAL (chemin notification CNIL, légalement opposable).
- **Référence code (origine, créé 2026-06-04 — audit 360 AUDIT-01)** :
  ```
  museum-backend/src/shared/audit/audit-chain.ts:43-46   # JSON.stringify(metadata, Object.keys(metadata).sort())
  museum-backend/src/shared/audit/audit.service.ts:207-219
  # + payload guardrail/breach nested (provider:{}, breach:{})
  ```
- **Symptôme (vérifié, origine)** : le 2ᵉ argument de `JSON.stringify` est un **replacer-allowlist appliqué récursivement** ; `Object.keys(metadata)` ne liste que le 1ᵉʳ niveau → tout objet imbriqué est sérialisé sans ses sous-clés (`{"breach":{}}`). Deux payloads forensiques nested différents → **même hash**. Collision reproduite par l'agent (`COLLISION=true`) ET confirmée par lecture directe du code. La migration `AddAuditLogHashChain` utilise un vrai sérialiseur récursif → **diverge du runtime**, parité non testée. Les tests hardcodent le sérialiseur buggé comme oracle (AUDIT-02) → bug structurellement invisible.
- **Résolution livrée** :
  - Sérialiseur canonique deep-recursif `canonicalStringify` (clés triées à tous les niveaux, comparateur **code-unit** déterministe, PAS `localeCompare`) — **source unique** partagée runtime (`audit-chain.ts`) + migration `AddAuditLogHashChain` (import partagé, parité verrouillée par snapshot de sortie).
  - Dispatch versionné par **colonne `hash_version` hors-payload** (option A, migration `1780564269011-AddAuditLogHashVersion`, `DEFAULT 1`) : lignes legacy vérifiées sous v1 figé → **zéro faux BREAK**, **aucun recompute** (valeur forensique préservée, pas de sign-off DPO). Nouvelles écritures = v2.
  - **AUDIT-02** : oracles de test indépendants (`oracleCanonical`/`oracleRowDigest` écrits à la main, byte-comparés à la sortie prod) + cas nested + tableau d'objets + chaîne mixte v1/v2 + mutation imbriquée qui casse la chaîne. Plus aucun test ne réutilise `computeRowHash` ni le sérialiseur buggé comme oracle.
  - **Invariant à maintenir** : `AuditMetadataSchema` doit continuer d'imposer des clés **lowercase-first** (cf. ADR-070 INVARIANT — `localeCompare`→code-unit diverge sur clés de casse mixte, no-op sur les clés camelCase actuelles).
- **Backlog résiduel (LOW)** : `canonicalStringify` émet un token littéral `undefined` pour une valeur d'objet imbriquée `undefined` (non atteignable — breach/guardrail utilisent `?? null`, Zod interdit `undefined`). Durcir ou documenter l'invariant `?? null` (cf. ADR-070 § Backlog).

### TD-62 — `eslint-plugin-boundaries` no-op (enforcement hexagonal BE mort) + 1 fuite réelle — ✔ re-lu

- [ ] **Statut** : ouvert (créé 2026-06-04, audit 360 ARCH-01/ARCH-02). Sévérité HIGH.
- **Référence code** :
  ```
  museum-backend/eslint.config.mjs:64-160   # bloc boundaries SANS settings['import/resolver']
  museum-backend/eslint.config.mjs:115-118  # commentaire affirmant à tort que l'enforcement marche
  museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts:9  # fuite domain->useCase (ARCH-02)
  ```
- **Symptôme (vérifié)** : le bloc boundaries n'a aucun `import/resolver` dans son `settings` (seul `import-x/resolver` existe dans un bloc séparé) → `@modules/*` résout en `external` (path:null) → la règle ne classe rien et ne fire jamais. Reproduit par l'agent (import domain→infra = 0 erreur ; ajouter le resolver fait fire), confirmé par lecture. Le commentaire l.115-118 (« migration v6 a restauré l'enforcement ») est faux. Une vraie fuite existe déjà non détectée (ARCH-02).
- **Comment fermer** : (a) `settings['import/resolver'].typescript` DANS le bloc boundaries ; (b) fixture-garde CI (domain importe un adapter → lint fail attendu) ; (c) corriger ARCH-02 ; (d) **filet indépendant** : sentinel fs-based BE (modèle FE `no-shared-api-import`) qui walk `src/modules/*/domain` et fail si un import résout vers `/adapters/` ou `/useCase/` — survit à une re-régression de la config ESLint.

### TD-63 — Garantie fail-CLOSED V2 (ADR-047) non gardée en CI — ○ rapporté-agent

- [ ] **Statut** : ouvert (créé 2026-06-04, audit 360 TQ-01). Sévérité HIGH.
- **Référence code** : `.github/workflows/ci-cd-backend.yml:524-565` (ai-tests `continue-on-error:true` l.564, aucun `services:`/sidecar) ; `tests/ai/guardrail-v2-live*`.
- **Symptôme** : sans sidecar, `guardrail-v2-live` throw en `beforeAll` → avalé par `continue-on-error`. Les invariants déterministes (dead-port/dead-URL/budget/fail-soft) sont co-localisés avec des asserts LLM non-déterministes → tombent ensemble. Aucun gate bloquant ne valide fail-CLOSED. `ci-cd-llm-guard.yml` ne fait que build+health-smoke.
- **Comment fermer** : sortir les tests fail-CLOSED déterministes du `describe` live-sidecar → job bloquant sans sidecar ; laisser les asserts LLM en advisory.

### TD-64 — `artKeyword.upsert` lit le tuple RETURNING comme une ligne (4ᵉ clone du bug RETURNING) — ✔ re-lu

- [ ] **Statut** : ouvert (créé 2026-06-04, audit 360 SYS-01). Sévérité MEDIUM. **Même classe que [[TD-12]] + bug quota `f74ce7de` + gotcha CLAUDE.md « TypeORM query RETURNING renvoie [rows,count] ».**
- **Référence code** : `museum-backend/src/modules/chat/adapters/secondary/persistence/artKeyword.repository.typeorm.ts:35-44` (`const rows = await this.repo.query('INSERT … RETURNING *'); return (rows as ArtKeyword[])[0]`).
- **Symptôme (vérifié)** : `query('…RETURNING')` renvoie `[rows[], count]` ; `rows[0]` est donc le **tableau** de lignes, pas l'entité. Le cast `as ArtKeyword[]` masque le bug au compilateur. Le test associé mocke le mauvais shape (cimente le bug).
- **Réponse à « une dette est-elle partout »** : OUI. Auditer les autres `query('…RETURNING')` raw (lead.repository.pg, prune-* use-cases) au même titre.
- **Comment fermer** : garde `const r = Array.isArray(rows[0]) ? rows[0] : rows;` puis `r[0]` ; réécrire le mock test au tuple PG réel `[[row],1]`.

### TD-65 — Soft-delete `deletedAt` non filtré hors login (tokens reset + email-squat) — ○ corroboré (grep)

- [ ] **Statut** : ouvert (créé 2026-06-04, audit 360 SYS-02). Sévérité HIGH (sécurité).
- **Référence code** : `museum-backend/src/modules/auth/useCase/session/authSession.service.ts:116,198` (seuls sites filtrant `deletedAt`, vérifié grep) ; chemins `forgotPassword`/`registerUser`/`changeEmail` (auth) non re-lus ligne-à-ligne.
- **Symptôme (corroboré)** : `grep` confirme que `deletedAt` n'est filtré QUE dans les chemins login. L'agent rapporte que `forgotPassword` émet des tokens de reset à des comptes soft-deleted et que `registerUser`/`changeEmail` laissent un compte supprimé squatter l'email (unicité non exclue des soft-deleted). À re-lire/reproduire avant fix.
- **Comment fermer** : filtrer `deletedAt` dans `forgotPassword` (pas de token à un compte supprimé) + exclure les soft-deleted des checks d'unicité email (ou migrer vers `@DeleteDateColumn`).

### TD-66 — Snippet d'audit BLOCKED garde 64 chars user bruts avant le sanitizer PII — ○ rapporté-agent

- [ ] **Statut** : ouvert (créé 2026-06-04, audit 360 AISAN-01). Sévérité MEDIUM (PII/rétention).
- **Référence code** : `museum-backend/src/.../guardrail-snippet.ts:36-40` (slice(0,64) du texte user AVANT `RegexPiiSanitizer`, rétention 13 mois ; contredit le commentaire LLM02 du fichier).
- **Comment fermer** : passer `fullText` au sanitizer PII avant `slice(0,64)` (comme l'entrée REDACTED) ; garder un fingerprint sha256 du texte intégral pour le dédup.

### TD-67 — `ThreeStateCircuit` : probe HALF_OPEN sans timeout → lock-out permanent possible — ○ rapporté-agent

- [ ] **Statut** : ouvert (créé 2026-06-04, audit 360 CIRCUIT-01). Sévérité MEDIUM.
- **Référence code** : `museum-backend/src/shared/circuit-breaker/three-state-circuit.ts`.
- **Symptôme** : si une exception survient entre `canAttempt` et `recordOutcome`, la probe HALF_OPEN fuit → le circuit peut rester bloqué indéfiniment.
- **Comment fermer** : timeout/garde try-finally sur la probe HALF_OPEN pour relâcher le slot.

### TD-68 — `sentry-scrubber` ne scrub pas les URL (token query-string) dans `extra`/`data` — ○ rapporté-agent

- [ ] **Statut** : ouvert (créé 2026-06-04, audit 360 SCRUB-01). Sévérité MEDIUM (fuite obs).
- **Référence code** : scrubber Sentry canonical (cf. sentinel `sentry-scrubber-parity`).
- **Symptôme** : une URL avec token en query-string sous une clé `extra`/`data` non-sensible échappe au scrub.
- **Comment fermer** : étendre le scrubber aux valeurs URL (strip query-string sensible) ; mettre à jour le hash de parité.

### TD-69 — Dead-code / scaling B2B prématuré à enterrer (UFR-016) — ○ rapporté-agent

- [ ] **Statut** : ouvert (créé 2026-06-04, audit 360 KISS-01/RMAP-01). Sévérité LOW (mais incohérence narrative B2B).
- **Référence code** : `TenantRateLimiter` (instancié, `.acquire()` jamais appelé) + getter + bloc env + métrique ; `scripts/seed-pilot-museums.sh` (cible Louvre/Orsay/Pompidou — QID jamais seedés — avec vocabulaire « pilot », contredit North Star « 0 musée démarché »).
- **Comment fermer** : enterrer le code mort (UFR-016 « il est mort on l'enterre ») ; renommer/supprimer le script seed avec son vocabulaire « pilot ».

### TD-70 — Stryker désarmé absent de la posture de risque produit — process

- [ ] **Statut** : ouvert (créé 2026-06-04, audit 360 PILLAR-01). Le mutation gate est `if:false` (`ci-cd-backend.yml:411`, depuis 2026-05-09) — **honnête dans le code** mais non surfacé dans `ROADMAP_PRODUCT.md` (verdict GO_WITH_RISKS).
- **Décision à trancher** : re-armer (plan `ci-cd-backend.yml:405-410`, décision D3) OU acter formellement dans la roadmap que la force des tests n'est mesurée que par couverture — et ne jamais citer Stryker comme garde actif.
- **Note** : `TD-39` (wrapper Stryker module-auth) et `TD-40` (`noUncheckedIndexedAccess` BE absent) sont **re-confirmés** par cet audit (actions #8). Ne pas dupliquer ; les fermer dans le même lot.

