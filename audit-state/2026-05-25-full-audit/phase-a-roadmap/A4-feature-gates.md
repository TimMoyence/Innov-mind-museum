# A4 — Feature gates launch-critical (P0.C1..C9) + Correctness/coût (I-FIX1..3)

> Audit READ-ONLY fresh-context (UFR-022) — réalité du code vs roadmap.
> Branche `dev` @ HEAD `89852f2a16ae4d8af3a5687f65325aa3bddd6269` (vérifié `git rev-parse`).
> Périmètre : `docs/ROADMAP_PRODUCT.md` §P0.C (l.112-126) + §P0.I.D (l.248-254).
> Tous chemins/lignes lus via Read/Grep au HEAD `dev` (UFR-013 / UFR-024).
> Contexte : LOT 3 feature-gates (branche `origin/p0/feature-gates`, vérifiée par
> `findings/D2-lot3-feature-gates.md`) a été **MERGÉ sur dev** via #295 (`811fd501c`).
> Cet audit re-vérifie l'état RÉEL sur dev (pas la branche).

---

### P0.C1 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV LOT 3 `811fd501c` #295)
- État réel vérifié : SigLIP provisioning livré sur dev. `museum-backend/scripts/fetch-models.sh` (101 lignes) présent ; runbook `museum-backend/docs/operations/SIGLIP_PROVISIONING.md` (6 KB) présent ; test d'intégration `tests/integration/scripts/fetch-models.sh.test.ts` présent. Le 404 silencieux n'est toléré que quand `SIGLIP_ONNX_SHA256` unset (fallback documenté), fail-loud sinon (cohérent avec D2 findings).
- CHECKBOX-FLIP : non — déjà ✅, conforme au code.
- Amélioration/debt : risque résiduel = OPS-HUMAN (vérifier `/chat/compare` retourne contenu réel en prod après provisioning GCS ou bake Docker). Non vérifiable par code.

### P0.C2 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV #295)
- État réel vérifié : mapping URI→slug livré. `scripts/catalog-ingest.helpers.ts:53` table `WIKIDATA_LICENSE_URI_TO_SLUG` (Object.freeze) + `mapLicenseUriToSlug()` `:110-116`. Appliqué avant classification dans `scripts/catalog-ingest.ts:287` (`mapLicenseUriToSlug(licenseValue) ?? licenseValue` → `classifyLicense :186`). Bug "100% reject silent" fermé.
- CHECKBOX-FLIP : non — déjà ✅, conforme.
- Amélioration/debt : doc-anchor `c2-license-uris.md` référencé dans les commentaires code mais NON committé sur dev (`git ls-files` vide). Gap UFR-024 mineur.

### P0.C3 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV #295, migration mergée)
- État réel vérifié : migration `src/data/db/migrations/1779381393403-AddWikidataQidToMuseums.ts` présente. CLI flag `--museum-id=` parsé `scripts/catalog-ingest.ts:411-415` ; fallback lookup UUID via `museums.wikidata_qid` (`:508-514` `.where('m.wikidataQid = :qid')`) ; seed écrit `museumId ?? null` avec hint `:522,528`. Cross-tenant leak fermé structurellement.
- CHECKBOX-FLIP : non — déjà ✅, conforme.
- Amélioration/debt : "no-drift" non exécuté (pas de `migration:run`+`generate Check` ; READ-ONLY) → NOT-VERIFIABLE-BY-CODE pour le drift exact. Migration présente + testée structurellement.

### P0.C4 — VERDICT: DONE (code/migration) ; exec seed = OPS-HUMAN
- Marqueur roadmap actuel : ✅🧑‍🔧 (code DONE-DEV #295 ; exec seed = ops)
- État réel vérifié : `scripts/seed-museums.ts` — Q-codes Bordeaux corrects : Aquitaine `Q3329534` (:114), CAPC `Q2945071` (:124), Cité du Vin `Q16964634` (:134) ; monument Pont de Pierre `Q1773424` (:151). Backfill idempotent `wikidataQid ?? null :260`. **NUANCE sur "retirer Q-codes Paris"** : les rows Paris/Lyon (Louvre/Orsay/Pompidou/Orangerie/Rodin/Petit Palais/Lyon) existent toujours dans le seed (`:28-99`) MAIS n'ont AUCUN `wikidataQid` → pas de Q-code à retirer là. La seule réf `Q19675` (Louvre) résiduelle = un exemple JSDoc `@param` dans `catalog-ingest.helpers.ts:163` (inerte, pas de la config). Donc le claim "Paris Q-codes à retirer" est résolu : aucun Q-code Paris actif.
- CHECKBOX-FLIP : non — ✅🧑‍🔧 reste correct (exec seed prod = OPS-HUMAN).
- Amélioration/debt : envisager de retirer la réf JSDoc `Q19675`/Louvre de `catalog-ingest.helpers.ts:163` pour zéro ambiguïté future (cosmétique).

### P0.C4b — VERDICT: DONE (décision tranchée)
- Marqueur roadmap actuel : ✅ (décision tranchée 2026-05-25, code DONE-DEV #295)
- État réel vérifié : décision documentée en commentaire `scripts/seed-museums.ts:101-105` — « Only Musée d'Aquitaine has Wikidata-ingest-viable artwork data (133 rows P195+P18). CAPC + Cité du Vin keep their Q-code for cards/maps/geoloc but no auto-ingest (D-SCOPE-WAVEA decision) ». C3 image-compare promis sur Aquitaine uniquement.
- CHECKBOX-FLIP : non — ✅ conforme.
- Amélioration/debt : **GAP UFR-024 confirmé sur dev** — les doc-anchors `c4b-sparql-counts.md` + `c2-license-uris.md` référencés dans le code NE sont PAS committés (`git ls-files` vide pour les deux). Le comptage 133 rows vit dans le commentaire code seulement → anchor cassé. À committer OU retirer la réf. Roadmap l.120 le note déjà.

### P0.C5 — VERDICT: DONE (telemetry implémentée)
- Marqueur roadmap actuel : ✅ (CLAIM STALE corrigé 2026-05-25, D2)
- État réel vérifié : **Plausible câblé sur dev — l'ancien claim « grep posthog/plausible = 0 » est FAUX** (Grep 2026-05-25 : 17 fichiers BE+FE matchent).
  - BE module `museum-backend/src/modules/telemetry/` complet (hexagonal : `domain/telemetry.port.ts`, `adapters/secondary/plausible.adapter.ts`, `adapters/primary/http/routes/funnel.route.ts`, `schemas/funnel.schemas.ts`, `composition/telemetry.module.ts`). Monté `api.router.ts:405` `router.use('/telemetry', telemetryRouter)`.
  - Event `quota_exceeded` émis `monthly-session-quota.middleware.ts:102` (via `getTelemetryPort` :1, fail-safe :115).
  - FE `shared/analytics/plausible.ts` (`trackFunnelEvent` :102, consent gate fail-closed AVANT fetch :107) + `useAnalyticsConsent.ts:27` (opt-in GDPR Art.7, storage `musaium.analytics.consent`) + `ConsentBanner.tsx`.
  - Events `paywall_modal_shown` (`PaywallProvider.tsx:82`), `paywall_cta_clicked` (`QuotaUpsellModal.tsx:143`), `paywall_email_captured` (`QuotaUpsellModal.tsx`).
- CHECKBOX-FLIP : non — déjà ✅ (claim corrigé). Conforme.
- Amélioration/debt : reste un dashboard Plausible simple à finaliser (OPS-HUMAN / config externe, non vérifiable par code).

### P0.C6 — VERDICT: DONE (.env.example) ; application prod = OPS-HUMAN
- Marqueur roadmap actuel : ✅🧑‍🔧 (corrections `.env.example` DONE-DEV #295 ; appli `.env` prod = ops)
- État réel vérifié : `museum-backend/.env.example` — dead vars retirées avec commentaire de retrait : `TTS_ENABLED` (:8), `SMTP_BREVO` (:173) ; `GOOGLE_CSE_*`/`SEARXNG_INSTANCES`/`ANTHROPIC_API_KEY` absents (grep 0 match). Additions présentes : `APP_VERSION=1.0.0` (:7), `CORS_ORIGINS=https://musaium.com,...` (:78), `GOOGLE_OAUTH_CLIENT_ID=…` (:94), `BREVO_API_KEY=` (:172), `PLAUSIBLE_DOMAIN`/`PLAUSIBLE_ENDPOINT_URL` (:268-269). Mirror `.env.production.example` présent.
- CHECKBOX-FLIP : non — ✅🧑‍🔧 reste correct (appli `.env` prod = OPS-HUMAN).
- Amélioration/debt : `GOOGLE_OAUTH_CLIENT_ID` committé avec valeur réelle (`498339023976-...`) dans `.env.example`. Un client ID OAuth est public par nature (côté FE de toute façon) → non-secret, acceptable, mais à confirmer qu'aucun client *secret* n'est dans `.env.example` (hors périmètre A4 — flag pour A1/A-sécurité).

### P0.C7 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV #295, migration mergée)
- État réel vérifié : migrations `1779401558315-AddMuseumIdToReviews.ts` + `1779401558316-AddMuseumIdToSupportTickets.ts` présentes. Entités : `review.entity.ts:40 museumId?: number | null`, `supportTicket.entity.ts:46 museumId?: number | null`. Scope read `review.repository.pg.ts:57-58` (`andWhere('r.museumId = :museumId')`). NPS per-museum `:88-95` (`aggregateNps(museumId)`, promoters `rating >= 9 AND <= 10`, scope `WHERE r.museumId`). NPS 0-10 widening confirmé (décision user IMPLÉMENTER respectée).
- CHECKBOX-FLIP : non — déjà ✅, conforme.
- Amélioration/debt : "no-drift" migration non exécuté (READ-ONLY) → NOT-VERIFIABLE-BY-CODE pour le drift exact. Note D2 : "tickets" et "support_tickets" du claim désignent la même table.

### P0.C8 — VERDICT: PARTIAL
- Marqueur roadmap actuel : ⚠️ (PARTIAL 2026-05-25, D2)
- État réel vérifié : conforme au marqueur ⚠️.
  - ✅ Faille RBAC/BOLA FERMÉE au niveau route : `admin.route.ts:249` `requireRole('admin','moderator','museum_manager')` sur `/stats` + scope FORCÉ `scopedMuseumId = req.user.museumId` pour museum_manager (`:256-258`) — un `?museumId=99` forgé ne peut exfiltrer un autre tenant. Schéma Zod `admin.schemas.ts` museumId optional. Test BOLA `tests/integration/admin/analytics-scope.test.ts` présent.
  - ❌ `WHERE museum_id` sur stats users/sessions/messages reste un **no-op DOCUMENTÉ** : `getStats.useCase.ts:24-31` retourne `this.repository.getStats()` (snapshot global cross-tenant) ; commentaire `:11-15` + `:25-30` admet explicitement « users/chat sessions are NOT museum-scoped in V1 ... may treat it as a no-op until the rest of the schema lands tenant scope ».
  - **OBSERVATION SUPPLÉMENTAIRE** : les routes `/analytics/usage|content|engagement` (`admin.route.ts:324,343,357`) sont `requireRole('admin')` seulement — n'acceptent PAS museum_manager et n'ont AUCUN scope museumId. C'est cohérent V1 (réservé staff plateforme) mais à tracker si museum_manager doit y accéder post-B2B.
- CHECKBOX-FLIP : non — ⚠️ reste exact (RBAC fermé / stats museum_id = no-op assumé).
- Amélioration/debt : résiduel V1.0.x = ajouter colonnes museum_id sur users/sessions/messages OU descope KR2 stats per-museum à reviews/tickets only (qui SONT scopés). Tracker comme dette explicite.

### P0.C9 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV #295)
- État réel vérifié : `museum-web/src/components/admin/AdminShell.tsx:195` `<RoleGuard allowedRoles={['admin','moderator','super_admin','museum_manager']}>` — museum_manager ajouté à l'allow-list (commentaire "Wave B C9 / R-C9" :189). E2e `museum-web/e2e/admin/museum-manager-access.spec.ts` présent. Entrée admin débloquée (plus de 403).
- CHECKBOX-FLIP : non — déjà ✅, conforme.
- Amélioration/debt : RAS.

---

### I-FIX1 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV #295, re-vérifié D2)
- État réel vérifié : `llm-cache.service.ts:93-100` `invalidateMuseum(museumId)` itère `['museum-mode','personalized']` (:96) et construit le BON namespace `${KEY_PREFIX}:${KEY_VERSION}:${ctxClass}:${museumId}:` = `llm:v2:...` (`KEY_VERSION='v2'` :14, `KEY_PREFIX='llm'` :15) via `delByPrefix` (:100). Câblé : `cache-purge.route.ts:60` `await llmCacheService.invalidateMuseum(museumIdInt)` (commentaire :15-31 documente le remplacement de l'ancien `delByPrefix('chat:llm:${museumId}:')` qui matchait 0 clé + sort `invalidateMuseum` du dead-code, UFR-016 R-IFIX1b).
- CHECKBOX-FLIP : non — déjà ✅, conforme.
- Amélioration/debt : RAS.

### I-FIX2 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV #295, re-vérifié D2)
- État réel vérifié : `currentArtworkKey` inclus dans la clé canonique : `llm-cache.service.ts:164-165` (`if (input.currentArtworkKey) canonical.currentArtworkKey = input.currentArtworkKey` — truthy-only, mirror legacy). Type `llm-cache.types.ts:45 readonly currentArtworkKey?: string`. Population `chat-message.service.ts:464` `currentArtworkKey: prep.session.currentArtworkId ?? prep.currentArtwork?.title ?? undefined`. 2 œuvres différentes → clés distinctes ; cross-artwork mis-serve fermé.
- CHECKBOX-FLIP : non — déjà ✅, conforme.
- Amélioration/debt : RAS.

### I-FIX3 — VERDICT: OPEN
- Marqueur roadmap actuel : ❌
- État réel vérifié : les 4 sous-claims du marqueur ❌ tiennent TOUS sur dev :
  1. **STT/TTS non-métrés dans le cost counter** : `grep LlmCostGuard|assertAllowed|llmCostCounter|recordCharge` sur `src/modules/chat/adapters/secondary/audio/` = 0 match. Le TTS `text-to-speech.openai.ts:104-108` n'émet QUE une `usage`/`usageDetails` Langfuse (observabilité/attribution coût Langfuse), JAMAIS le `LlmCostCounter` Redis. STT `audio-transcriber.openai.ts` idem (non wiré).
  2. **Cap = $0.002 fixe par requête HTTP, PAS par call fan-out** : `llm-cost-guard.middleware.ts:14 FLAT_COST_PER_CALL_USD = 0.002` ; un SEUL `assertAllowed(userId, FLAT_COST_PER_CALL_USD)` par requête (`:70`). Une requête chat qui fan-out en interne (judge + image enrichment + multimodal) ne charge que $0.002 une fois. Le cost-guard est un cap journalier par-user (`dailyCapUsd` `llm-cost-guard.ts:93,123`), pas un compteur de coût réel par call.
  3. **Anon bypass le cap per-user** : `llm-cost-guard.ts:103-105` `if (userId === null) return;` (kill-switch reste actif, mais cap per-user contourné). Confirmé `middleware:67` `userId = req.user?.id ... : null`.
  4. **Judge $5/jour fail-OPEN à épuisement** : `llm-judge-guardrail.ts:117-119` `if (await getBudgetExhausted()) { logger.warn('guardrail_judge_budget_exceeded', { cap_cents: ... }); return null }` → `:112` "Fail-open: returns null on any failure". C'est une régression sécu déguisée en cap coût (le judge se désactive silencieusement quand le budget s'épuise) — exactement le risque décrit.
- CHECKBOX-FLIP : non — ❌ reste correct, l'item N'EST PAS traité.
- Amélioration/debt : **VRAI P0/V1.0.x ouvert**. Options : (a) métrer le coût réel par call fan-out (estimer par modèle/tokens) au lieu du flat $0.002 ; (b) wirer STT/TTS dans le cost counter (pas seulement Langfuse) ; (c) gérer le cap pour anon (rate-limit volume ≠ cap coût $) ; (d) décider du comportement judge à budget épuisé (fail-closed vers V1 keyword vs fail-open assumé). Confidence ◇ (le marqueur roadmap reflète une finition résiduelle, pas un blocker dur).

---

## Synthèse comptage (12 items)

| Verdict | Items |
|---|---|
| DONE | C1, C2, C3, C4b, C5, C7, C9, I-FIX1, I-FIX2 (9) |
| DONE + OPS-HUMAN résiduel | C4 (code DONE / exec seed ops), C6 (code DONE / appli prod ops) — comptés DONE côté code |
| PARTIAL | C8 (1) |
| OPEN | I-FIX3 (1) |
| FALSE-CLAIM | 0 |

CHECKBOX-FLIPS recommandés : **AUCUN**. Tous les marqueurs roadmap (✅ / ✅🧑‍🔧 / ⚠️ / ❌) sont conformes à la réalité du code sur dev.

Gaps/debt notables (non-flip) :
- C4b + C2 : doc-anchors `c4b-sparql-counts.md` / `c2-license-uris.md` NON committés sur dev → anchor cassé (UFR-024). Committer OU retirer la réf.
- C8 : `WHERE museum_id` stats users/sessions/messages = no-op documenté ; routes `/analytics/usage|content|engagement` = admin-only sans scope museumId.
- I-FIX3 : seul item OPEN du périmètre — STT/TTS hors cost counter, cap $0.002/HTTP non par fan-out, anon bypass, judge fail-OPEN.
