# AGG6 — Synthèse shipped P0.F + falsifiés P0.G + NOW V1.0.x + NEXT/V2/LATER/KILLED

> **Agent d'AGRÉGATION READ-ONLY** (fresh-context, UFR-022). Consolide les feuilles pass-2 (`L23`–`L29`) + contexte pass-1 (`A8`, `A9`). **Aucune re-vérif code** — synthèse des verdicts de feuilles.
> **Sources** : `leaf/L23-shipped-C1-C5.md`, `L24-shipped-C6-W1.md`, `L25-shipped-W2-W7-falsified.md`, `L26-now-v10x.md`, `L27-new-smalls.md`, `L28-cresid-next.md`, `L29-v2-later-killed.md` ; `phase-a-roadmap/A8-shipped.md`, `A9-now-smalls.md`.
> **HEAD audité** : pass-2 toutes feuilles @ `1fb32f5ba` ; pass-1 (A8/A9) @ `89852f2a1` (2 commits applicatifs antérieurs : #298 a11y + de-flake e2e). Divergence pass-1↔pass-2 notée §5.

---

## 1. Clusters shippés P0.F — confirmés vs PARTIAL/ORPHAN/DEAD

### 1.1 SHIPPED-CONFIRMED (wired end-to-end, aucun faux "shipped")

| Cluster | Verdict | Feuille |
|---|---|---|
| C1.2 LLM cache (v2 key + Prom + Grafana) | ✅ wired E2E | L23, A8 |
| C2.x image enrichment (fan-out + Wikimedia + catalogue + Zod + Prom + Langfuse) | ✅ 6/6 sub-claims | L23 |
| C3.1 SigLIP ONNX normalize [-1,1] mean=std=0.5 | ✅ | L23, A8 |
| C3.2 pgvector halfvec(768) HNSW + museum_id scope | ✅ | L23, A8 |
| C3.4 chat-compare 5-stages + CompareResult (endpoint) | ✅ | L23, A8 |
| C4.1 KnowledgeRouter cascade (AbortSignal.any budgets) | ✅ | L23 |
| C4.4 citation Zod sources[] v2 + FE (wired, contraste C3.5) | ✅ | L23, A8 |
| C5.x Wikidata KB (opossum breaker + WriteThrough + dump 48 termes + 4 alerts + dashboard) | ✅ 4/4 | L23 |
| C6.1-C6.4 paywall/quota/tier/admin override (BE atomic gate → 402 → FE interceptor → modal → tier flip) | ✅ E2E | L24, A8 |
| C7.1 smoke:api (8+ endpoints, vraies assertions) | ✅ | L24 |
| C9 voiceMode 80w / TTS Opus / SigLIP-2 / audio-desc / consent / AI badge | ✅ (échantillon) | L24, A8 |
| C10 UX components (Composer, ArtworkHero, bubbles, citations, carnet, resumption, proactive) | ✅ montés | L24, A8 |
| W1.4 museum picker / W1.5 geofence postgis+jsonb-bbox / W1.6 QR-deeplink + [CURRENT ARTWORK] | ✅ | L24, A8 |
| W2.1 museum onboarding admin web | ✅ | L25 |
| W3.1-W3.4 RBAC×15 / stats / moderation / CSV export (BOM) | ✅ | L25 |
| W4.1-W4.3 landing / beta signup / B2B page (forms wired BE `/api/leads/{beta,b2b}`) | ✅ | L25 |
| W6.9 FE↔BE distributed tracing | ✅ | L25, L28 |
| W6.10 guardrail fairness dashboard (10 panels, métrique émise) | ✅ | L25, L28 |
| W7.4 STT prompt biasing (câblé bout-en-bout) | ✅ | L25 |
| Personnalisation Spec C voice (route + FE monté `settings.tsx:217`) | ✅ | L25 |

**Aucun FALSE-CLAIM "shipped" détecté.** Tout le code coché ✅ en P0.F existe et correspond.

### 1.2 PARTIAL / ORPHAN / DEAD — confirmés (roadmap les flagge déjà honnêtement)

| Item | Verdict | Nature du gap | Feuille |
|---|---|---|---|
| **C3.5 `useCompareImage` hook** | **ORPHAN** | Hook + carrousel + skeleton + tests existent ; **zéro caller prod** ; `metadata.compareResults` jamais peuplé FE (set uniquement en tests). BE ne l'injecte pas dans le stream chat (seulement réponse de `/chat/compare`). Wire "user envoie image → compareResults rendu" sévéré. | L23, L26 |
| **C3.7 `fallbackVisualThreshold` score-floor** | **DEAD** | Parsé (`env.ts:345`, default 0.4) mais **zéro read** ; non passé à `VisualSimilarityService`. Pas de floor de score → kNN renvoie qualité arbitraire post-seed. `MIN_TOP_N=20` = candidate-pool floor, PAS score floor. | L23, L26 |
| **C4.3 promptfoo halluc assertions** | **DEAD-ON-ARRIVAL** | `quoteInFacts`/`citeRealUrl` définies + **unit-testées** (fixtures synthétiques) mais **jamais câblées via `type:javascript`** dans le corpus eval. Corpus = 60 `icontains-any` + 5 `not-contains` + 43 `not-icontains`, zéro `javascript`. La gate CI diffe le score corpus mais n'exerce pas les 2 assertions citation sur vrais outputs LLM. (Les seuls `type:javascript` du dossier = `c2-enrichment.yaml`, config différente.) | L23, A8 |
| **W2.2 branding** | **write-to-void** | Admin web écrit `museum.config.branding` (blob jsonb opaque, **aucun shape Zod `branding`** côté BE). **ZÉRO consumer FE mobile** : `BrandMark.tsx:12` hard-code le logo Musaium ; les 2 `primaryColor` FE = thème app, pas branding musée. | L25, L26, A8 |
| **W2.3 stats per-museum** | **museumId NO-OP** | `getStats.useCase.ts:24` ignore `_input` ; repo `getStats()` sans param → agrégat global cross-tenant. Scoping RBAC réel au route (museumId forcé pour museum_manager), scoping data no-op. Bug P0.C8 documenté. | L25, A8 |
| **C10 ChooseAnother** | **PARTIAL** | `ProactiveMuseumBanner` a `onChooseAnother` ; `home.tsx:96-109` ne le passe pas → fallback silent `onDismiss` au lieu de router vers picker. Picker route `museums-picker.tsx` existe inutilisée → fix = 1 prop. | L24, L26 |

---

## 2. P0.G — 8 claims falsifiés : toujours faux ? → **OUI, 8/8 confirmés FAUX**

À ne PLUS retenter. Verdict L25 (re-dérivé from scratch) :

| # | Claim falsifié | Pourquoi FAUX |
|---|---|---|
| 1 | Sentinel S1.2 SigLIP `embedding_model_version` homogeneity | N'existe pas — 21 sentinels, aucun embedding/SigLIP. Les 4 hits = repo/entity/migration métier. |
| 2 | C9.16 SSE résidus absent | FAUX au moment du claim (≈434 LOC FE dormants existaient) — **depuis enterrés** par PR#299 (`134abe293`, `sseParser.ts`+`stream.ts` supprimés). HEAD : 0 hit hors coverage. |
| 3 | Sentinel `museum-frontend-version-sync.mjs` | Jamais existé sous ce nom — réel = `fe-version-sync.mjs`. |
| 4 | DPO obligation Art.37 V1 | N/A — <250 employés (`art5-audit.md:139`, `AI_ACT_CONFORMITY_MATRIX.md:131`). DPIA shippé, DPO non-requis au volume. |
| 5 | C9.13 Reranker −15%/−25% failed retrievals | V1 scaffold disabled — default `NullRerankerAdapter` throw toujours `RerankerUnavailableError`. Aucun gain livré. |
| 6 | Hexagonal POJO 23 entities 3-5j | Non fait — 23 fichiers portent encore `@Entity` TypeORM, découplage POJO non réalisé. |
| 7 | Chat éclatement 4 sous-modules V1 | Jamais éclaté — 44 dossiers intacts, `chat-module.ts` ≈941 LOC composition root unique. |
| 8 | 5 alerts manquantes (llm-cost.yml) | FAUX — les 5 `- alert:` sont présentes (`cache_hit_rate_too_low/_critical`, `llm_cost_breaker_open`, `llm_guard_breaker_open`, `guardrail_budget_redis_fail_closed`). |

Cohérent avec KILLED (§4) : items 6/7 = aussi marqués KILLED (refactor non appliqué, jamais entré).

---

## 3. NOW V1.0.x post-launch (hotfix window)

### 3.1 À COCHER [x] — DONE-UNCHECKED (correction confirmée, action faite)

| Item | Preuve | Source |
|---|---|---|
| **C6.5** amend "503 fail-open" wording | `AI_VISUAL_SIMILARITY.md:54,73,118,155` décrit déjà "contractual 503 envelope" / fail-closed. Seul reste à cocher l'item. ⚠️ **divergence pass-1↔pass-2** : A9 disait STILL-OPEN ; L26 (pass-2, code re-lu) dit DONE-UNCHECKED — **L26 fait foi (HEAD plus récent + re-lecture doc).** | L26 |
| **C10 race expo-speech + server TTS** (`Speech.stop()` + content-type partition) | `useChatSession.ts:123-155`, shippé `e62b93f75` (#298 I-CMP3), test 301 LOC. | A9 |
| **C10 Switch accessibilityLabel** (`SettingsAccessibilityCard.tsx:36-38`) | Role/Label/State présents, WCAG 4.1.2 + EN 9.4.1.2. Shippé `e62b93f75`. | A9 |
| **C10 5 WCAG/EN 301 549 violations audio-desc path** | I-CMP3 5/5 (`e62b93f75`), reviewer APPROVED 91.2. | A9 |
| **C1.1 Grafana per-stage STT/LLM/TTS p50/p95/p99** | `chat-stages-latency.json` + `chat_phase_duration_seconds` (`f6335fe52`). | A9, L28 |
| **AUDIT_AUTH_LOGIN_FAILED** raw email → domain-only | `login-handler.helpers.ts:63-68` `emailDomain` only. PR #294. | L27, A9 |
| **EXPORT_PSEUDONYM_SALT** mandatory prod | `env.production-validation.ts:170-171` `required` + `assertSecretLength≥32`, fail-fast boot. PR #293 I-SEC5. | L27, A9 |
| **Sentry `event.tags` scrubbed by `scrubEvent`** (sécu hardening, NEXT) | `packages/musaium-shared/src/observability/sentry-scrubber.ts:212-232` walke `event.tags` (R2 2026-05-21), consommé `sentry.ts:69`. Claim "currently bypassed" **FAUX → cocher [x] ou retirer**. | L28 |

### 3.2 STILL-OPEN — corrections de WORDING (item reste ouvert mais libellé périmé)

| Item | Correction de wording requise | Source |
|---|---|---|
| **C9.8 Activate Presidio adapter** | Libellé "manque sidecar Dockerfile + docker-compose" **PÉRIMÉ** : `docker-compose.presidio.yml` existe (images officielles MS, pas de Dockerfile custom), adapter wiré conditionnel (`chat-module.ts:443-454`), env câblé (`env.ts:433-443`). Item reste légitimement non-activé (décision V1.1, regex couvre 95% RGPD) mais recadrer **« infra prête, activation env-only différée V1.1 »**. **+ header du compose (L10-14) STALE** (prétend l'adapter non-wiré). | L28, A9 |
| **C1.1** (en cochant) | Backend = **Prometheus** (`chat_phase_duration_seconds`), PAS Langfuse comme l'item spéculait. Corriger "Langfuse-backed" → "Prometheus-backed". | A9 |
| **W2.2 branding doc** | Prose roadmap déjà correcte (`:184`, `:84` P0-FA6, KR1) ; item **décision** `:301` non tranché (ship consumer Q3 via M1.3 vs retirer claim). Doc-only quick decision. Corriger toute citation BE `branding` schema (n'existe pas). | L26, A8 |
| **C10 ChooseAnother / reviews.userName** | Paths roadmap STALE (bouton dans `ProactiveMuseumBanner.tsx` pas `home.tsx` ; `useReviews.ts:17,93-94,98,110-111`). | A9, L26 |

### 3.3 STILL-OPEN — bugs réels / dette (pass-2 confirme tous OPEN)

- **Bugs >1h** : C3.5 (wire compare FE), C3.7 (score floor), C10 ChooseAnother (router picker), C10 FE→BE write `audioDescriptionMode` (PATCH on toggle, sync cross-device uni-directionnel cassé).
- **Quick-wins ≤1h** : voir §5.
- **NEW small (L27) — 12 STILL-OPEN** : #1 SUPPORTED_LOCALES dedup, #2 hashEmail shared, #3 Brevo unsubscribe (promesse dict non-backée — UFR-013), #4 RTL borders, #5 audit-factory-coverage orphan, #6 metric-naming dup, #7 workspace-links CI mirror, #8 reportUnusedDisableDirectives, #11 DeleteUser hard-delete (Art.17 admin incomplet), #12 AUDIT_ACCOUNT_DELETED ordering, #13 promtail PII, #14 shouldDropBreadcrumb (3 paths verify-email/magic-link/confirm-email-change manquants — scrubUrl déjà fait par effet de bord R2, mais item composite reste OPEN, **PAS** de crédit-DONE partiel).
- **Manuel/ops** : C7.5 device TTS smoke (TestFlight non soumis), C8.1-C8.6 VDP/CRA, C1.3/C4.2 (tuning data-driven post-bake ≥7j by-design).
- **C9.18 deep-link artworkId canonique** : NOT done, fallback `/museum-detail` shippé, TD V1.1.

---

## 4. NEXT / V2 / LATER / KILLED

### 4.1 Secrètement DONE (à cocher ou retirer le caveat)

- **Sentry `event.tags`** (sécu hardening NEXT) — déjà détaillé §3.1. `scrubEvent` walke `event.tags` depuis R2 (2026-05-21). **Seule anomalie "secrètement done" du périmètre NEXT.**

### 4.2 Correctement déféré (NOT done by-design, confirmé)

- **V2 Walk hors-musée = ZÉRO code** ✅ (confirmé absent) : pas de `features/walk/`, pas de migrations `museum_pois`/`walk_routes`/`tour_step_audio_cache`, pas de module BE walk (OSRM/directions/polyline), TTS port toujours `Buffer` (pas `Readable`), pas de `LineLayer`/`ShapeSource` MapLibre, `expo-task-manager` même pas en dép. Fondation `UIBackgroundModes:['audio']` (`app.config.ts:178`) = legit TTS chat V1, PAS du walk caché.
- **W6 NEXT** : W6.2/W6.3/W6.4 (pas de `@langchain/anthropic`)/W6.5/W6.6/W6.7/W6.8/W6.11/W6.12 = tous NOT done correctement. W6.9/W6.10 correctement `[x]`.
- **W7 NEXT** : W7.1/W7.2 (WelcomeCard toujours 3 boutons fixes)/W7.3 = NOT done.
- **LATER F/M** : F3 backups `[x]` correct ; F2 (S3 adapter prêt, honnête, item `[ ]` = IaC offload) ; F5 limits NOT done ; M1.1/M1.3-consumer-FE/M1.4 AR/M1.5 LSF/M1.6/M2.x/M3.x = tous ABSENT. **Nuance M1.3** : admin-branding web pré-existe (P0.C8), mais le M1.3 *consumer-FE mobile* reste bien à faire — roadmap ne sur-claime pas.
- **B2B polish** : multi-tenant scoping, NPS, hard-delete, dead 409/userName, Brevo rate-limit, B2B i18n = NOT done. **OpenAPI `/leads/*` paths missing** confirmé (code sans spec).
- **Sécu hardening** (hors Sentry-tags) : HMAC-IP at-write, zero-width strip user-message, confusables homoglyph, locale re-validation, history re-sanitization, cross-museum QR replay, audit chain Merkle (ADR-054 V1.2), super_admin promotion guard = tous NOT done correctement.

### 4.3 KILLED — aucun ré-introduit ✅

SSE streaming (vestiges morts documentés D1, transport live = sync only) · Garak orchestrator (workflow supprimé) · Realtime API V1 walk-mode (gpt-realtime/WebRTC absent) · Voice clone DIY artistes (absent) · Hexagonal POJO 23 entities / Chat éclatement 4 sous-modules (non appliqué = cohérent P0.G #6/#7).

---

## 5. Quick-wins priorisés (≤1h, fort ratio correctness/effort)

1. **Maestro stale sur shard CI** ⚠️ pire que décrit — `audio-recording-flow.yaml:51,74,85` réfère des labels inexistants ("Hold to talk"/"Play assistant response") ET **est listé `shards.json:34`** (tourne en CI ; commentaire "not run on CI" STALE). Le remplaçant source-vérifié `museum-frontend/maestro/voice-record-and-tts.yaml` existe hors `.maestro/`. Fix : `git mv` → `.maestro/` + swap `shards.json:34` + supprimer le flow cassé.
2. **AUDIT_ACCOUNT_DELETED ordering** (#12 L27) — 1-ligne : déplacer `auditService.log` APRÈS `await deleteAccountUseCase.execute` (`auth-profile.route.ts:151-160`). Audit-integrity (log fantôme si execute throw).
3. **RTL borders** (#4 L27) — 2-lignes : `borderTopRightRadius`/`borderBottomRightRadius` → logical `borderStartEndRadius`/`borderEndEndRadius` (`SwipeableConversationCard.tsx:121-122`). Conforme gotcha RTL CLAUDE.md.
4. **Accept-Language fr-FR** — `parseAcceptLanguageHeader` ne normalise pas (`locale.ts:39-49`) → `"fr-FR" === 'fr'` false → fallback EN, users FR reçoivent rationale en anglais. Fix : passer par `extractLangCode` OU `.toLowerCase().startsWith('fr')` au site `chat-compare.route.ts:80`. ⚠️ vérifier les 3 autres consumers `req.clientLocale` (chat-message/session/media route). Sous-item : Nominatim hardcodé `accept-language=fr` (`:117`).
5. **reviews.userName ghost + dead 409** (L26) — UFR-016 burial : retirer `userName` du FE `submitReview` + branche `409 already_reviewed` (`useReviews.ts:94,110-111`) que le BE n'émet jamais.
6. **TTS cache `.mp3` post-Opus** — BE émet opus/ogg (`text-to-speech.openai.ts:46,148`), FE cache `<messageId>.mp3` (`useTextToSpeech.ts:61,78`). Renommer `.opus`/`.ogg` OU clé schema-version (évite servir des `.mp3` pré-Opus sans invalidation).
7. **workspace-links CI mirror** (#7 L27) — ajouter 1 gate à `sentinel-mirror.yml` (script `workspace-links.mjs` existe déjà). Comble trou anti-bypass UFR-020.
8. **C10 ChooseAnother** — 1-prop : `onChooseAnother={() => router.push('/(stack)/museums-picker')}` dans `home.tsx` (picker route existe).

---

## 6. Divergences pass-1 (A8/A9 @ `89852f2a1`) ↔ pass-2 (L23-29 @ `1fb32f5ba`)

- **C6.5** : A9 = STILL-OPEN ; L26 = DONE-UNCHECKED (doc cible amendée). **L26 fait foi** (HEAD plus récent, re-lecture doc `AI_VISUAL_SIMILARITY.md`). → **cochable**.
- **shouldDropBreadcrumb (#14)** : A9 = PARTIAL (scrubUrl done par R2) ; L27 = STILL-OPEN (scrubUrl R2 touche `request.url`/tags, PAS `breadcrumb.data.url` ; les 3 paths jamais ajoutés). **L27 plus précis** — verdict net STILL-OPEN, pas de crédit partiel.
- **Sentry `event.tags`** : non couvert par A9 (sécu hardening = périmètre L28). L28 = SECRÈTEMENT DONE.
- Pour tout le reste, A8/A9 et L23-29 **concordent** (mêmes verdicts shipped/orphan/dead/open).
