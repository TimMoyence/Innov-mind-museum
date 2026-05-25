# L25 — Audit fine-grain : clusters P0.F shippés (W2–W7 + voice/perso) + P0.G falsified

- **Run** : fresh-context READ-ONLY (UFR-022), `dev` @ HEAD `1fb32f5ba` (vérifié `git rev-parse HEAD`).
- **Méthode** : aucun "shipped" antérieur cru sur parole ; chaque claim re-dérivé from scratch via `Read`/`Grep`, confirmé par `path:line`.
- **Source claims** : `docs/ROADMAP_PRODUCT.md` §P0.F (l.184-189) + §P0.G (l.194-201).

---

## A) Clusters P0.F — shippés ?

### W2.1 — Museum onboarding admin web
**VERDICT : ✅ SHIPPED (vrai).**
- `museum-web/src/app/[locale]/admin/museums/new/page.tsx:131` — formulaire admin POST `/api/museums` (name/slug/type/lat/lng/description/config.kbLocale), validation Zod-miroir (SLUG_RE, lat/lng ranges).
- BE route gated : `museum-backend/src/modules/museum/adapters/primary/http/routes/museum.route.ts:222-224` POST `isAuthenticated + requireRole('admin') + validateBody(createMuseumSchema)`.
- Redirige vers `{id}/branding` au succès (page.tsx:132).

### W2.2 — Branding
**VERDICT : ✅ admin-web write SHIPPED · ❌ ZÉRO FE consumer mobile (claim roadmap exact).**
- Admin web : `museum-web/src/app/[locale]/admin/museums/[id]/branding/page.tsx` — éditeur primary/secondary/accent + logoUrl, PUT `/api/museums/:id` écrivant `museum.config.branding` (page.tsx:124-130). Logo = URL stub (TD-50, pas d'upload), preview only.
- BE : schema = `museum.schemas.ts:12,23` `config: z.record(z.string(), z.unknown()).optional()` — **record opaque, AUCUN sous-shape typé `branding`** ; stockage JSON arbitraire. PUT gated `requireRole('admin')` (museum.route.ts:236-238).
- **FE consumer mobile = INEXISTANT** : `museum-frontend/shared/ui/BrandMark.tsx:12` hard-code `require('../../assets/images/logo.png')` + `accessibilityLabel="Musaium logo"` (BrandMark.tsx:52) — zéro lecture de `museum.config.branding`. Grep `config.branding|MuseumBranding|primaryColor` sous `museum-frontend/{app,features,shared}` (hors tests) → seuls 2 hits dans `MuseumMapView.tsx:281`/`MuseumMapMarkers.tsx:63` = `primaryColor={theme.primary}` (thème **app**, PAS branding musée).
- **Conclusion** : "branding (mais ZÉRO FE consumer mobile)" = **claim roadmap ACCURATE**. Le branding est écrit dans un blob config opaque côté admin, jamais consommé par le consumer mobile.

### W2.3 — Stats per-museum
**VERDICT : ✅ SHIPPED avec museumId NO-OP (claim roadmap "P0.C8 leak / no-op documenté" exact).**
- Use-case : `museum-backend/src/modules/admin/useCase/analytics/getStats.useCase.ts:24-32` — `execute(_input)` **ignore `_input`** (param renommé `_input`), appelle `repository.getStats()` sans scope. Docstring l.5-15 admet : "repository implementation may treat it as a no-op until the rest of the schema lands tenant scope" + l.28-30 "aggregate returned is the global cross-tenant snapshot".
- Route : `admin.route.ts:249-263` — museumId threadé + **forcé** pour `museum_manager` (`req.user.museumId`, BOLA-safe au niveau route), mais le use-case le jette → données cross-tenant. Le scoping RBAC est réel ; le scoping data est no-op.
- **Conclusion** : claim accurate (stats per-museum présent en signature, mais agrégat = global ; bug multi-tenant P0.C8 = no-op documenté côté use-case).

### W3.1–W3.4 — RBAC + stats + moderation + CSV export
**VERDICT : ✅ SHIPPED (vrai).**
- W3.1 RBAC : `admin.route.ts` — `requireRole('admin'|'moderator'|'super_admin'|'museum_manager')` sur ~15 routes (l.65,89,102,126,149,167,186,204,249,272,299,326,345,359,374,393,422,440). Middleware `@shared/middleware/require-role.middleware`.
- W3.2 stats : route `admin.route.ts:249` (cf W2.3 — shippé, museumId no-op au use-case).
- W3.3 moderation : `admin.route.ts` + `admin/useCase/facades/admin-review.facade.ts` + `admin-ke.route.ts`.
- W3.4 CSV export : `admin-export.route.ts:123-125` GET `/export/:kind.csv` gated `requireRole('admin','museum_manager')` ; `Content-Type: text/csv` (l.63) + `Content-Disposition: attachment` (l.64) + BOM (`@shared/csv/csv-writer` writeBomHeader) ; use-cases `exportReviews/exportSupportTickets/exportChatSessions.useCase.ts`.

### W4.1–W4.3 — Landing + beta signup + B2B page
**VERDICT : ✅ SHIPPED (vrai), forms wired BE.**
- W4.1 landing : `museum-web/src/app/[locale]/page.tsx` (StorySection, FAQSection, BetaSignupSection importé l.17, monté l.71).
- W4.2 beta : `BetaSignupSection.tsx:76` POST `/api/leads/beta` (ENDPOINT l.37) → BE `museum-backend/src/modules/leads/adapters/primary/http/routes/leads.route.ts:79`.
- W4.3 B2B : `b2b/page.tsx` + `b2b/B2bContactForm.tsx:54` POST `/api/leads/b2b` → BE `leads.route.ts:46`. Module BE complet (`modules/leads/` : useCase submitB2bLead, notifier email b2b-lead, schemas).

### W6.9 — FE↔BE distributed tracing
**VERDICT : ✅ SHIPPED (vrai).**
- FE : `museum-frontend/shared/observability/sentry-init.ts:15` commentaire "W6.9 distributed tracing", `tracePropagationTargets` (l.21,40) + `reactNativeTracingIntegration()` (l.41) + `enableAutoPerformanceTracing:true` (l.42) → stamp `sentry-trace`+`baggage`.
- BE : `trace-propagation.middleware.ts` (`tracePropagationMiddleware`) monté `museum-backend/src/app.ts:135`.
- Cohérent gotcha CLAUDE.md (header-based, pas SDK bridge).

### W6.10 — Guardrail fairness dashboard
**VERDICT : ✅ SHIPPED (vrai), métrique réellement émise.**
- Dashboard : `infra/grafana/dashboards/guardrail-fairness.json` uid `guardrail-fairness`, PromQL réelles per-locale & per-layer sur `musaium_guardrail_decisions_total{decision="block"}` (l.84,108,139).
- Métrique : définie `museum-backend/src/shared/observability/prometheus-metrics.ts` (`guardrailDecisionsTotal`) + **émise** `museum-backend/src/modules/chat/useCase/guardrail/eval/bias-metrics.helper.ts:49` `guardrailDecisionsTotal.inc({...})`. Dashboard non-vide.

### W7.4 — STT prompt biasing
**VERDICT : ✅ SHIPPED (vrai), réellement câblé bout-en-bout.**
- Builder : `museum-backend/src/modules/chat/useCase/audio/stt-prompt-bias.ts:64` `buildSttPromptBias` (+ `buildSttPromptBiasFromVisitContext` l.99), garde PII (hasPii l.31), cap 896 chars.
- Caller : `chat-message.service.ts:6` import + `:381` `buildSttPromptBiasFromVisitContext(session.visitContext)`.
- Consommé : `audio-transcriber.openai.ts:85-86` `if (input.prompt)` → passe au param `prompt` OpenAI `/audio/transcriptions`.
- (Roadmap notait `[ ]` mais effectivement shippé — accurate.)

### Personnalisation Spec C voice
**VERDICT : ✅ SHIPPED (vrai), route + FE mount confirmés.**
- BE : `auth-profile.route.ts:84` PATCH `/tts-voice` + `validateBody(updateTtsVoiceSchema)` (l.86) + `updateTtsVoiceUseCase.execute(jwtUser.id, voice)` (l.90), `null` reset env default (l.82). Use-case `auth/useCase/consent/updateTtsVoice.useCase.ts`. Champ `user.ttsVoice` exposé getProfile (l.49).
- FE : `museum-frontend/features/settings/ui/VoicePreferenceSection.tsx` + hook `useUpdateTtsVoice.ts` ; **monté** `museum-frontend/app/(stack)/settings.tsx:217` `<VoicePreferenceSection currentVoice={profile?.user.ttsVoice ?? null} />` (import l.18).

---

## B) P0.G — 8 claims falsifiés : restent-ils FAUX ?

> Question : ces claims antérieurs sont-ils toujours bien FAUX (donc à ne pas retenter) ? Réponse : **OUI pour les 8.**

1. **"Sentinel S1.2 SigLIP `embedding_model_version` homogeneity"** → **FAUX (n'existe pas).** `ls scripts/sentinels/` (21 fichiers) → aucun sentinel embedding/SigLIP/S1.2. Les 4 hits `embedding_model_version` = repo/entity/migration métier (`artwork-embedding.repository.pg.ts`, `artworkEmbedding.entity.ts`, migration `1778406339944`), zéro sentinel. CONFIRMÉ FAUX.

2. **"C9.16 SSE résidus absent"** → **FAUX (résidus existaient).** Au moment du claim, ~434 LOC FE dormants existaient derrière `EXPO_PUBLIC_CHAT_STREAMING=false`. Commit `134abe293` (PR#299, "bury dormant SSE streaming path") les a **supprimés** : `sseParser.ts` (81 LOC) + `chatApi/stream.ts` (214 LOC) deleted (vu `git show --stat`). Aujourd'hui @HEAD : grep `EventSource|event-stream|sseParser` sous source FE (hors coverage/test) = **0 hit** (les hits restants ne sont QUE des artefacts `coverage/lcov-report/`). → Claim "absent" était FAUX (D6 amendment exact) ; les résidus sont depuis enterrés. CONFIRMÉ FAUX.

3. **"Sentinel `museum-frontend-version-sync.mjs`"** → **FAUX (jamais existé sous ce nom).** Le fichier réel est `scripts/sentinels/fe-version-sync.mjs`. Aucun `museum-frontend-version-sync.mjs`. CONFIRMÉ FAUX.

4. **"DPO obligation Art.37 V1"** → **FAUX (non applicable).** `docs/compliance/art5-audit.md:139` + `AI_ACT_CONFORMITY_MATRIX.md:131` : `| DPO | N/A — < 250 employees |`. Aucune assertion d'obligation V1 ; DPIA shippé mais DPO = TBD/non-requis au volume. CONFIRMÉ FAUX.

5. **"C9.13 Reranker −15% à −25% failed retrievals"** → **FAUX (V1 scaffold disabled).** Default prod = `NullRerankerAdapter` (`reranker.factory.ts:28`, RERANK_PROVIDER `'null'`) qui **throw toujours** `RerankerUnavailableError('reranker disabled by configuration')` (`null-reranker.adapter.ts:24`). `BgeRerankerV2M3Adapter` = scaffold non-default. Aucun gain de retrieval livré V1. CONFIRMÉ FAUX (V2-deferred-honest).

6. **"Hexagonal POJO 23 entities 3-5j"** → **FAUX (infaisable/non fait).** `grep '@Entity(' museum-backend/src/modules` (hors test) = **23 fichiers** (chiffre exact du claim), tous portent encore le décorateur TypeORM `@Entity` — le découplage POJO domain↔ORM **n'a pas été fait**. CONFIRMÉ FAUX (le refactor reste fiction V1).

7. **"Chat éclatement 4 sous-modules V1"** → **FAUX (jamais éclaté).** `find museum-backend/src/modules/chat -type d` = **44 dossiers** (= "44 dossiers" du claim, intact, zéro réduction). `chat-module.ts` = **941 LOC** (composition root unique, proche du "909 LOC" cité). L'éclatement 44→22 en 4 sous-modules n'a pas eu lieu. CONFIRMÉ FAUX (fiction).

8. **"5 alerts manquantes" (llm-cost.yml)** → **FAUX (5 alerts shippées).** `infra/grafana/alerting/llm-cost.yml` contient exactement **5 `- alert:`** : `cache_hit_rate_too_low` (l.28), `cache_hit_rate_critical` (l.64), `llm_cost_breaker_open` (l.96), `llm_guard_breaker_open` (l.130), `guardrail_budget_redis_fail_closed` (l.166). Rien ne manque. CONFIRMÉ FAUX.

---

## Synthèse

| Cluster | Verdict | Preuve clé |
|---|---|---|
| W2.1 onboarding | ✅ shipped | `new/page.tsx:131` + `museum.route.ts:222-224` |
| W2.2 branding | ✅ admin-web · ❌ zéro FE consumer mobile | `branding/page.tsx:128` write opaque config ; `BrandMark.tsx:12,52` hard-code logo Musaium |
| W2.3 stats per-museum | ✅ shipped · museumId NO-OP | `getStats.useCase.ts:24-31` ignore `_input` |
| W3.1-3.4 RBAC/stats/mod/CSV | ✅ shipped | `admin.route.ts` requireRole×15 ; `admin-export.route.ts:123-125` |
| W4.1-4.3 landing/beta/b2b | ✅ shipped, forms wired BE | `page.tsx:71` ; `/api/leads/{beta,b2b}` `leads.route.ts:46,79` |
| W6.9 distributed tracing | ✅ shipped | `sentry-init.ts:40` + `app.ts:135` |
| W6.10 fairness dashboard | ✅ shipped, métrique émise | dashboard json + `bias-metrics.helper.ts:49` |
| W7.4 STT prompt biasing | ✅ shipped, câblé | `stt-prompt-bias.ts:64` → `chat-message.service.ts:381` → `audio-transcriber.openai.ts:85` |
| Voice perso | ✅ shipped, monté | `auth-profile.route.ts:84` + `settings.tsx:217` |

**P0.G — les 8 claims falsifiés restent TOUS FAUX** (à ne plus retenter) : (1) sentinel SigLIP absent · (2) SSE résidus existaient [depuis enterrés PR#299] · (3) `museum-frontend-version-sync.mjs` jamais existé (réel `fe-version-sync.mjs`) · (4) DPO Art.37 N/A <250 employés · (5) Reranker NullAdapter throws / scaffold · (6) 23 entities portent encore `@Entity`, refactor non fait · (7) 44 dossiers chat intacts, pas d'éclatement · (8) 5 alerts présentes dans llm-cost.yml.

Aucune divergence trouvée vs roadmap §P0.F/§P0.G : tous les verdicts roadmap sont reproduits par le code.
