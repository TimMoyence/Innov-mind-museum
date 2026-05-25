# DOMAINE 7a — P0.F "shipped & cochés" re-vérification ZÉRO-HASARD

> Ref vérifiée : `dev` (HEAD `9aff378b0`). Méthode : grep symbole/fichier clé + lecture ciblée prouvant EXISTENCE + correspondance. UFR-013 : chaque verdict cite path:line lu.
> Date : 2026-05-25. Agent fresh-context read-only.

**Résumé chiffré** : 16 clusters re-vérifiés. **13 CONFIRMÉS shipped (DONE-DEV)**, **3 PARTIAL** (les 3 ⚠️ gaps connus C4.3 / W2.2 / W2.3 — TOUS confirmés TOUJOURS VRAIS). **0 FALSE-CLAIM** (aucun faux "shipped" — tout le code claimé existe réellement sur `dev`). Les 3 PARTIAL ne sont pas des faux ✅ : le harnais existe, mais un sous-gap documenté demeure.

---

## C1.2 — LLM cache wired v2 key + Prom counters + Grafana
- **Verdict** : DONE-DEV
- **Preuve** : `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:119` clé `llm:v2:{contextClass}:{museumId|none}:{userId|anon}:{sha256}` ; `:129` `sha256OfCanonicalInput` ; `:4` import + `:64/68/70` `.inc()` des counters `llmCacheHitsTotal`/`llmCacheMissesTotal` définis `src/shared/observability/prometheus-metrics.ts:39,46`. Grafana : `infra/grafana/dashboards/chat-latency.json` référence `llm_cache_hits_total`.
- **Ref** : dev
- **Action roadmap** : ✅ confirmé
- **Confiance** : haute

## C2.1-C2.5 — image enrichment Promise.all fan-out + Wikimedia + catalogue + Zod v2 + Prom + Langfuse
- **Verdict** : DONE-DEV
- **Preuve** : `museum-backend/src/modules/chat/useCase/image/image-enrichment.service.ts:130` `Promise.all(tasks)` (fan-out) ; `:64` commentaire "v2 (C2 2026-05): adds Wikimedia Commons + Musaium curated catalogue clients" ; `:115` fail-open par paire ; `:214/216` `getLangfuse().trace(...)` ; `:253` `chatEnrichmentSourceCallsTotal.inc({source,outcome})`. Clients adaptateurs présents : `src/modules/chat/adapters/secondary/search/wikimedia-commons.client.ts` + `musaium-catalogue.client.ts`. Schéma jsonb enrichment : `src/shared/db/jsonb-schemas/museum-enrichment.schemas.ts`.
- **Ref** : dev
- **Action roadmap** : ✅ confirmé. Note : la validation Zod fine de l'output enrichment vit dans les clients/schemas ; existence pipeline solide.
- **Confiance** : haute (détail Zod-per-source = moyenne, non ré-audité ligne à ligne)

## C3.1 — SigLIP ONNX adapter normalize [-1,1] mean=std=0.5
- **Verdict** : DONE-DEV
- **Preuve** : `museum-backend/src/modules/chat/adapters/secondary/embeddings/image-preprocess.ts:21` `SIGLIP_MEAN = 0.5`, `:22` `SIGLIP_STD = 0.5`, `:18` normalise `((x/255)-0.5)/0.5` → [-1,1] (ADR-037, NOT ImageNet). Adapter `siglip-onnx.adapter.ts:120` appelle `preprocessForSiglip`, `:299` `l2Normalise`.
- **Ref** : dev
- **Action roadmap** : ✅ confirmé
- **Confiance** : haute

## C3.2 — pgvector halfvec(768) + HNSW + halfvec_ip_ops + scope museum_id
- **Verdict** : DONE-DEV
- **Preuve** : `museum-backend/src/data/db/migrations/1778406339944-AddArtworkEmbeddings.ts:53` `"embedding" halfvec(768) NOT NULL` ; `:78` `CREATE INDEX ... USING hnsw ("embedding" halfvec_ip_ops) WITH (m=16, ef_construction=64)`. Scope tenant via migration séparée `1778622760826-AddMuseumIdScopeToArtworkEmbeddings.ts:55` (ADD COLUMN museum_id) + `:58` FK museums(id) + `:69` btree index.
- **Ref** : dev
- **Action roadmap** : ✅ confirmé
- **Confiance** : haute

## C3.4 — chat-compare endpoint 5-stages + CompareResult + i18n 8 locales
- **Verdict** : DONE-DEV
- **Preuve** : route `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-compare.route.ts:216` POST `/compare` (monté `/chat` via chat-module.ts:197) ; Zod `schemas/compare.schemas.ts` ; type `domain/visual-similarity/compare-result.types.ts:86` `CompareResult` ; use-case `compare.use-case.ts:87` process→similarity→persist (les 5 stages détaillés vivent dans `similarity.service.ts`). i18n : clés `compare*` présentes dans les 8 locales FE (`museum-frontend/shared/locales/{en,fr,de,es,it,ja,zh,ar}/translation.json`).
- **Ref** : dev
- **Action roadmap** : ✅ confirmé (C3.5 hook orphan reste V1.0.x — hors 7a)
- **Confiance** : haute

## C4.1 — KnowledgeRouter cascade KB→judge→WS via AbortSignal.any + per-leg budgets
- **Verdict** : DONE-DEV
- **Preuve** : `museum-backend/src/modules/chat/useCase/knowledge/knowledge-router.service.ts:2-3` "cascades KB → judge → WebSearch with per-leg AbortSignal.any budgets (D4 — Node ≥22.3). Fail-open (ADR-035)" ; `:87-93` `AbortSignal.any([timeoutSignal, parentSignal])` (NOT Promise.race, évite loser leak) ; `:63` `judgeTimeoutMs` ; `:145` enforce per-leg budget côté KB leg.
- **Ref** : dev
- **Action roadmap** : ✅ confirmé
- **Confiance** : haute

## C4.3 — promptfoo halluc-eval CI workflow ⚠️ (quoteInFacts+citeRealUrl NOT wired → dead-on-arrival)
- **Verdict** : **PARTIAL** — workflow + fonctions assertions EXISTENT, mais ⚠️ **TOUJOURS VRAI** : assertions JS non câblées dans le pipeline promptfoo (dead-on-arrival).
- **Preuve** :
  - Workflow + corpus présents : `.github/workflows/ci-cd-backend.yml` (job halluc-eval), config `museum-backend/security/promptfoo/halluc.config.yaml`, corpus `halluc-corpus.json` (60 entrées).
  - Fonctions `quoteInFacts`/`citeRealUrl` existent ET sont unit-testées : `museum-backend/security/promptfoo/lib/halluc-assertions.ts` + `tests/unit/promptfoo/halluc-assertions.spec.ts`.
  - **MAIS jamais wirées** : `halluc.config.yaml:62-74` `defaultTest.assert` ne contient QUE 3 assertions `not-contains`/`not-icontains` ([END OF SYSTEM INSTRUCTIONS], etc.). Le corpus `halluc-corpus.json` a **0** assertion `type:javascript` (grep `javascript|quoteInFacts|citeRealUrl` = 0 ; types présents : 60 `icontains-any`, 5 `not-contains`, 43 `not-icontains`). Hors lib + spec + `dist/`, la seule mention de ces fonctions est un **exemple de docstring** montrant comment on les *brancherait* (`lib/halluc-assertions.d.ts:101-102`), jamais exécuté.
- **Ref** : dev
- **Action roadmap** : ⚠️ MAINTENIR le warning. Les 2 assertions sémantiques de citation (quote-in-facts, real-url) ne sont PAS exercées par la CI halluc-eval. La gate ne valide que des heuristiques `(not-)contains`. Reste un gap réel à câbler (`type:javascript`/`file://lib/halluc-assertions`) ou à reporter explicitement V1.0.x.
- **Confiance** : haute

## C4.4 — citation enforce Zod sources[] v2 + FE SourceCitation + i18n 8
- **Verdict** : DONE-DEV
- **Preuve** : BE Zod/validation `museum-backend/src/modules/chat/useCase/orchestration/sources-validator.ts` + `main-assistant-output.schema.ts` + `citation-chip-models.ts`. FE `museum-frontend/features/chat/ui/SourceCitation.tsx` (+ tests dismiss/backdrop). i18n : clé `sourceCitation`/`citation` présente dans les 8 locales (1 par locale).
- **Ref** : dev
- **Action roadmap** : ✅ confirmé
- **Confiance** : haute

## C5.1-C5.4 — Wikidata KB (breaker + WriteThrough + dump + alerts + dashboard)
- **Verdict** : DONE-DEV
- **Preuve** : breaker `museum-backend/src/modules/chat/adapters/secondary/search/wikidata-breaker.ts` ; write-through `wikidata-write-through.provider.ts` ; dump entity `domain/wikidata-kb-dump.entity.ts` + repo `wikidata-kb-dump.repository.typeorm.ts` + migration `1778504875210-AddWikidataKbDump.ts` ; KB service `useCase/knowledge/knowledge-base.service.ts` + seed `seed-kb-canon.ts`. Alerts `infra/grafana/alerting/wikidata-resilience.yml` + dashboard `infra/grafana/dashboards/wikidata-resilience.json`. Prom counters `wikidata_cache_hits/misses_total` (prometheus-metrics.ts:186,192).
- **Ref** : dev
- **Action roadmap** : ✅ confirmé. (Cross-ref : breaker dispose() = TD-OP-01 OUVERT, traité DOMAINE 4 — non re-jugé ici.)
- **Confiance** : haute

## C6.1-C6.4 — paywall stub + quota + tier + admin override
- **Verdict** : DONE-DEV
- **Preuve** : stub/lead `museum-backend/src/modules/leads/useCase/submitPaywallInterest.useCase.ts` ; quota `src/shared/middleware/monthly-session-quota.middleware.ts` + `.repo.pg.ts` ; tier migration `1778900000000-AddUserTier.ts` + domaine `auth/domain/user/user-tier.ts` ; admin override `admin/useCase/users/changeUserTier.useCase.ts`. FE : `museum-frontend/features/paywall/ui/QuotaUpsellModal.tsx` + `application/PaywallProvider.tsx`.
- **Ref** : dev
- **Action roadmap** : ✅ confirmé
- **Confiance** : haute

## C7.1 / C9.2-C9.17 — smoke:api e2e + chat C9.x (audio-desc autoplay, granular consent, AI Act badge, voiceMode, TTS Opus, cache key v2)
- **Verdict** : DONE-DEV
- **Preuve** : C7.1 `museum-backend/package.json:26` `"smoke:api": "node ./scripts/smoke-api.cjs"` + `scripts/smoke-api.cjs`. C9.x : voiceMode dans schemas/helpers chat (`chat.shared-types.ts`, `schemas/chat-session.schemas.ts`, `helpers/chat-route.helpers.ts`) ; TTS Opus `adapters/secondary/audio/text-to-speech.openai.ts:46` `response_format: 'opus'` ; audioDescriptionMode dans pipeline + cache types (`llm-cache.types.ts:37`) + `describe.service.ts`. AI Act badge/disclosure FE : `features/chat/ui/AiDisclosureSheetContent.tsx` + `AiDisclosureFooter.tsx` + `AiConsentSheetContent.tsx` + `useAiConsent.ts`. Cache key v2 inclut voiceMode/audioDescriptionMode (cf C1.2).
- **Ref** : dev
- **Action roadmap** : ✅ confirmé (cluster). Sous-items non ré-audités ligne à ligne : C9.13 Reranker (V1 throws RerankerUnavailableError → P0.G, hors 7a).
- **Confiance** : haute (verdict cluster ; chaque sous-C9 individuel = moyenne faute d'audit exhaustif)

## C10.A1-A6 + B1-B6 — chat UX refonte (composer/hero/bubble/carnet/resumption/ask-more/QR/proactive)
- **Verdict** : DONE-DEV
- **Preuve** : `museum-frontend/features/chat/ui/` contient `Composer.tsx`, `ChatInput.tsx`, `ArtworkHeroModal.tsx`/`ArtworkHeroCard.tsx` (hero), `ChatMessageBubble.tsx` (bubble), `ConversationResumptionBanner.tsx` (resumption), `AskMoreChip.tsx` (ask-more), `CartelScannerSheetContent.tsx` (QR scan), `ProactiveMuseumBanner.tsx` (proactive). Carnet : `CarnetSessionCard.tsx` + `application/useVisitCarnet.ts` + `domain/carnet.ts`.
- **Ref** : dev
- **Action roadmap** : ✅ confirmé
- **Confiance** : haute

## W1.4-W1.6 — UX choix musée ; geofence hybrid ; QR-deeplink + [CURRENT ARTWORK]
- **Verdict** : DONE-DEV
- **Preuve** : geofence FE `museum-frontend/features/museum/application/useGeofencePreCache.ts` + BE migrations `1779051738966-AddMuseumGeofence.ts` + `1779051850000-SeedPilotMuseumGeofences.ts`. [CURRENT ARTWORK] BE `museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts:75` rend `[CURRENT ARTWORK]...[END OF CURRENT ARTWORK]` ; résolu pipeline `prepare-message.pipeline.ts:317`. QR/deeplink FE `CartelScannerSheetContent.tsx` + route `app/(stack)/chat/[sessionId].tsx`.
- **Ref** : dev
- **Action roadmap** : ✅ confirmé. NOTE corrélée I-FIX2 (LOT3/D2) : `[CURRENT ARTWORK]` est désormais référencé dans `llm-cache.types.ts:37` (clé cache) — suggère I-FIX2 traité/en cours sur feature-gates ; à confirmer par DOMAINE 2 (hors mon scope).
- **Confiance** : haute

## W2.1-W2.4 — onboarding admin web ; branding (⚠️ ZÉRO consumer FE mobile) ; stats per-museum (⚠️ bug C8) ; seed pilots
- **Verdict** : **PARTIAL** (W2.1 ✅, W2.4 ✅ ; W2.2 ⚠️ et W2.3 ⚠️ TOUS DEUX confirmés TOUJOURS VRAIS)
- **Preuve** :
  - **W2.1 onboarding admin** ✅ : `museum-web/src/app/[locale]/admin/museums/new/page.tsx` (flux création musée) + `museums/page.tsx`.
  - **W2.2 branding** ⚠️ TOUJOURS VRAI : éditeur web `admin/museums/[id]/branding/page.tsx` écrit `museum.config.branding` (schéma BE `src/shared/db/jsonb-schemas/museum-config.schema.ts`). **MAIS aucun consumer FE mobile** : `ChatHeader.tsx:60` utilise `useTheme()` de `shared/ui/ThemeContext.tsx` qui n'expose qu'un `mode` light/dark global (zéro param museum/tenant/branding) ; `features/museum/infrastructure/museumApi.ts` n'expose PAS branding/config ; grep `MuseumBranding|config.branding|.branding` sur `features/`+`app/`+`shared/` mobile (hors tests) = **0 fichier** (la seule occurrence `home.tsx:34` est un commentaire JSDoc, pas un consumer). → branding write-only admin, jamais rendu mobile.
  - **W2.3 stats per-museum / bug C8** ⚠️ TOUJOURS VRAI : `museum-backend/src/modules/admin/useCase/analytics/getStats.useCase.ts:25-29` documente explicitement "the underlying repository does not yet scope stats by museumId... global cross-tenant snapshot until users/sessions/messages gain museum_id columns (out-of-scope this lot)". Le repo `admin.repository.pg.ts:213` `getStats()` ne prend AUCUN museumId et fait des `COUNT(*)` non scopés. Le `museumId?` est threadé dans la signature use-case mais no-op au niveau repo. → users/sessions/messages stats restent cross-tenant.
  - **W2.4 seed pilots** ✅ : `scripts/seed-museums.ts` + `scripts/seed-pilot-artwork-knowledge.ts` + fixtures `pilot-artworks*.csv` (Bordeaux aquitaine/citevin/capc).
- **Ref** : dev
- **Action roadmap** : ⚠️ MAINTENIR les 2 warnings. W2.2 = branding non consommé côté mobile (gap réel, recoupe NOW W2.2 doc fix). W2.3 = scoping per-museum partiel (reviews/support_tickets scopés via Wave B M2/M3, mais users/sessions/messages NON → bug C8 latent ; cross-ref C8 DOMAINE 2).
- **Confiance** : haute

## W3.1-W3.4 / W4.1-W4.3 — RBAC+stats+moderation+CSV ; Landing+beta+B2B
- **Verdict** : DONE-DEV
- **Preuve** : RBAC `museum-backend/src/modules/admin/adapters/primary/http/routes/admin.route.ts:65,89,102,126` `requireRole('admin'/'moderator'/'super_admin')`. Admin pages web : `admin/{users,analytics,reports,audit-logs,tickets,support,mfa}/page.tsx`. CSV export BE : `admin/useCase/export/{exportChatSessions,exportReviews,exportSupportTickets}.useCase.ts` + `domain/export/csv-export.types.ts`. Landing/beta/B2B web : `app/[locale]/page.tsx` (landing) + `b2b/page.tsx` + `BetaSignupSection.tsx`.
- **Ref** : dev
- **Action roadmap** : ✅ confirmé
- **Confiance** : haute

## W6.9 / W6.10 / W7.4 / Spec C voice
- **Verdict** : DONE-DEV
- **Preuve** :
  - **W6.9 distributed tracing** : `museum-backend/src/shared/observability/sentry.ts:59` `tracePropagationTargets: [/^https:\/\/api\.musaium\.com($|\/)/, /^http:\/\/localhost:3000($|\/)/]` ; middleware `trace-propagation.middleware.ts` monté `app.ts:135` `app.use(tracePropagationMiddleware)`.
  - **W6.10 fairness dashboard** : `infra/grafana/dashboards/guardrail-fairness.json`.
  - **W7.4 STT prompt biasing** : `src/modules/chat/useCase/audio/stt-prompt-bias.ts` + adapter `audio-transcriber.openai.ts:85-88` (append `prompt` capé 896 chars au FormData Whisper).
  - **Spec C voice** : route PATCH `auth-profile.route.ts:84` `/tts-voice` → use-case `updateTtsVoice.useCase.ts` → repo `user.repository.pg.ts:192`. FE `museum-frontend/features/settings/ui/VoicePreferenceSection.tsx` + `application/useUpdateTtsVoice.ts`.
- **Ref** : dev
- **Action roadmap** : ✅ confirmé
- **Confiance** : haute

---

## Synthèse 7a

| Verdict | Count | Clusters |
|---|---|---|
| DONE-DEV | 13 | C1.2, C2, C3.1, C3.2, C3.4, C4.1, C4.4, C5, C6, C7.1/C9, C10, W1, W3/W4, W6.9/W6.10/W7.4/SpecC |
| PARTIAL (⚠️ gap maintenu) | 3 | C4.3 (assertions JS dead-on-arrival), W2.2 (zéro consumer FE mobile), W2.3 (stats non scopées museumId / bug C8) |
| FALSE-CLAIM | 0 | — |

**Aucun faux "shipped".** Tout le code coché ✅ existe réellement sur `dev`. Les 3 PARTIAL ne sont PAS des fabrications : le harnais/feature existe (workflow halluc, éditeur branding, use-case stats) mais un sous-gap précis et déjà documenté dans la roadmap demeure — les 3 ⚠️ sont à GARDER tels quels (pas de FALSE-CLAIM, pas de recoche pleine ✅).

**Cross-refs notés (hors mon scope, à coordonner)** : C8 multi-tenant stats (DOMAINE 2) ; I-FIX2 [CURRENT ARTWORK] en clé cache (DOMAINE 2, indices qu'il est traité sur feature-gates) ; TD-OP-01 wikidata breaker dispose (DOMAINE 4) ; C9.13 Reranker throws / C9.16 SSE résidus (P0.G, DOMAINE 7c).
