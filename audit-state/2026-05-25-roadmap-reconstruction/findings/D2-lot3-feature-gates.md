# DOMAINE 2 — LOT 3 : Feature gates / data integrity @ `origin/p0/feature-gates`

> Agent fresh-context read-only (2026-05-25). Ref vérifiée = `origin/p0/feature-gates`
> (HEAD `c963b188` oasdiff, parent `49f16d8` "close P0 feature-gates + data-integrity #295").
> Tous les chemins/lignes cités sont lus via `git show origin/p0/feature-gates:<path>` (UFR-013).
> Les 2 commits uniques de la branche vs dev = `49f16d8` (feature) + `c963b188` (oasdiff rating widening 1-5→0-10).

---

- **P0.C1** — Verdict: DONE-BRANCH:origin/p0/feature-gates
  - Preuve: `museum-backend/scripts/fetch-models.sh:42-97` — `set -euo pipefail` + `curl --fail` ; le 404/échec download n'est skippé (exit 0 + WARNING) QUE quand `SIGLIP_ONNX_SHA256` est unset (tolérance bucket-non-provisionné, fallback `EMBEDDINGS_PROVIDER=replicate`), et redevient fail-loud dès que le SHA est pinné. Le commit unique `49f16d8` ajoute le runbook `museum-backend/docs/operations/SIGLIP_PROVISIONING.md` + le test d'intégration `tests/integration/scripts/fetch-models.sh.test.ts:88-115` pinnant les 3 branches (a) SHA set+404→exit≠0, (b) SHA unset+404→exit 0+WARN, (c) drift→exit≠0.
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ✅ — le risque "503 cold" est transformé en contrat documenté (replicate fallback). Reste P0 jusqu'au merge.
  - Confiance: haute

- **P0.C2** — Verdict: DONE-BRANCH:origin/p0/feature-gates
  - Preuve: `museum-backend/scripts/catalog-ingest.helpers.ts:53-105` — table `WIKIDATA_LICENSE_URI_TO_SLUG` (Q19652→public-domain, Q6938433→cc-0, etc.) + `mapLicenseUriToSlug()` qui résout l'URI Wikidata vers le slug avant `classifyLicense` (`catalog-ingest.ts:186,287`). La fixture trompeuse est corrigée : le test `tests/unit/chat/visual-similarity/catalog-ingest.helpers.test.ts:42-44,126-129` utilise désormais des URIs (`http://www.wikidata.org/entity/Qxxx`) au lieu de slugs et commente explicitement le bug C2 (slug⊂slug → 100% reject).
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ✅ — bug "100% licenseRejected" fermé. Reste P0 jusqu'au merge.
  - Confiance: haute

- **P0.C3** — Verdict: DONE-BRANCH:origin/p0/feature-gates
  - Preuve: migration `museum-backend/src/data/db/migrations/1779381393403-AddWikidataQidToMuseums.ts:33-35` crée `museums.wikidata_qid varchar(16) NULL` + contrainte UNIQUE `UQ_museums_wikidata_qid`. Le flag CLI `--museum-id=<int>` est parsé (`catalog-ingest.ts:411`) et, à défaut, `main()` résout le museumId par lookup `museums.wikidata_qid` pour un `--museum=` unique (`catalog-ingest.ts:500-522` : `museumRepo.createQueryBuilder().where('m.wikidataQid = :qid')`, fallback museum_id=NULL+hint). Le seed écrit `museumId: opts.museumId ?? null` (`catalog-ingest.ts:328,355`).
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ✅ — colonne + flag + lookup UUID livrés. Reste P0 jusqu'au merge.
  - Confiance: moyenne — migration présente et testée structurellement (`tests/integration/migrations/wikidata-qid.migration.test.ts:76-92`), mais je n'ai PAS pu exécuter `migration:run` + `generate Check` pour prouver "zéro drift". Aucune note de "Check vide" dans la branche.

- **P0.C4** — Verdict: DONE-BRANCH:origin/p0/feature-gates
  - Preuve: `museum-backend/scripts/seed-museums.ts:105-149` — les 3 Q-codes Bordeaux corrects : Musée d'Aquitaine `Q3329534` (l.112), CAPC `Q2945071` (l.122), Cité du Vin `Q16964634` (l.132) — conformes à la memory `reference_bordeaux_museum_qcodes.md`. Monument hors-musée Pont de Pierre ajouté avec `Q1773424` (l.149). Backfill idempotent via `.orUpdate(['wikidata_qid'], 'slug')` (l.259). Aucun Q-code Paris résiduel (seed = trio Bordeaux + monument).
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ✅ — seed Bordeaux + monument livré. Reste P0 jusqu'au merge.
  - Confiance: haute

- **P0.C4b** — Verdict: DONE-BRANCH:origin/p0/feature-gates (décision tranchée)
  - Preuve: `museum-backend/scripts/seed-museums.ts:100-104` documente le comptage SPARQL : « Only Musée d'Aquitaine has Wikidata-ingest-viable artwork data (133 rows P195+P18). CAPC + Cité du Vin keep their Q-code for cards/maps/geoloc but no auto-ingest (D-SCOPE-WAVEA decision) ». Décision lockée = seul Aquitaine est ingest-viable ; CAPC/Cité du Vin gardent leur Q-code pour cartes/géoloc sans auto-ingest.
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ⚠️→✅ — décision contenu tranchée. **Gap doc-anchor** : les commentaires référencent `c4b-sparql-counts.md` et `c2-license-uris.md`, mais aucun de ces 2 fichiers n'est committé sur la branche (`git ls-tree origin/p0/feature-gates | grep c4b/c2` → vide). Le comptage (133 rows) vit donc dans le commentaire code seulement, pas dans un doc résolvable.
  - Confiance: haute (décision) / moyenne (doc référencé absent — anchor cassé)

- **P0.C5** — Verdict: DONE-BRANCH:origin/p0/feature-gates  (⚠️ CONTREDIT le claim doc "=0")
  - Preuve: la télémétrie Plausible EST implémentée sur la branche. BE : module `museum-backend/src/modules/telemetry/` (port + `adapters/secondary/plausible.adapter.ts:47` `PlausibleAdapter implements TelemetryPort`, no-op si non configuré ; route `funnel.route.ts` + schéma Zod `funnel.schemas.ts:17`). Event `quota_exceeded` émis dans `monthly-session-quota.middleware.ts:99-106`. FE : `museum-frontend/shared/analytics/plausible.ts` (`trackFunnelEvent`, consent fail-closed AVANT fetch), `useAnalyticsConsent.ts:27` (opt-in GDPR Art.7, storage key `musaium.analytics.consent`), `ConsentBanner.tsx`. Events `paywall_modal_shown` (`PaywallProvider.tsx:73-78`), `paywall_cta_clicked`/`paywall_email_captured` (`QuotaUpsellModal.tsx:143,161`). Env vars `PLAUSIBLE_DOMAIN`/`PLAUSIBLE_ENDPOINT_URL` ajoutées (.env.example l.268-269). Plausible (pas PostHog) retenu.
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ✅ + corriger le texte — le claim "posthog|plausible = 0" est STALE sur cette branche. Funnel events + consent gate + dashboard doc (`docs/observability/PLAUSIBLE_FUNNEL.md`) livrés. Reste P0 jusqu'au merge.
  - Confiance: haute

- **P0.C6** — Verdict: DONE-BRANCH:origin/p0/feature-gates
  - Preuve: diff `49f16d8` sur `museum-backend/.env.example` + `.env.production.example` : `GOOGLE_CSE_*` et `SEARXNG_INSTANCES` supprimés ; `TTS_ENABLED`/`SMTP_BREVO`/`ANTHROPIC` remplacés par commentaires de retrait ; ajout `PLAUSIBLE_DOMAIN`/`PLAUSIBLE_ENDPOINT_URL` (l.99-100/140-141), `APP_VERSION` (l.111), `CORS_ORIGINS=https://musaium.com,...` (l.117), `GOOGLE_OAUTH_CLIENT_ID` (l.128). Les `.env.example`/`.env.production.example` sont byte-identiques entre dev et la branche (`git diff dev origin/p0/feature-gates` vide) car ces changements sont déjà sur dev via le même travail.
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ✅ — corrections release appliquées + dead vars retirées + mirror prod. Reste P0 jusqu'au merge.
  - Confiance: haute

- **P0.C7** — Verdict: DONE-BRANCH:origin/p0/feature-gates
  - Preuve: migrations `1779401558315-AddMuseumIdToReviews.ts:41-49` (reviews.museum_id integer NULL, FK ON DELETE SET NULL, partial index `IDX_reviews_museum_id`) + `1779401558316-AddMuseumIdToSupportTickets.ts:30-38` (support_tickets.museum_id idem). Entités : `review.entity.ts:38-40` + `supportTicket.entity.ts:44-46` portent `museumId`. NPS true 0-10 : schéma `review.schemas.ts:19` `rating: z.number().int().min(0).max(10)` (widening 1-5→0-10, validé par oasdiff `c963b188`), useCase `createReview.useCase.ts:48` borne 0-10, agrégation NPS per-museum `review.repository.pg.ts:98-101` (`aggregateNps(museumId)`, promoters rating 9-10). Read scope `review.repository.pg.ts:59-60` (`andWhere('r.museumId = :museumId')`).
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ✅ — museum_id sur reviews+support_tickets + NPS per-museum 0-10 (décision user IMPLÉMENTER respectée). Reste P0 jusqu'au merge.
  - Confiance: moyenne — migrations présentes + testées structurellement (`tests/integration/migrations/reviews-museum-id.migration.test.ts`, `support-tickets-museum-id.migration.test.ts`) mais pas de `migration:run`+Check exécutable de ma part. Note : `tickets` (vs `support_tickets`) — seules 2 tables ont migration ; le claim listait "reviews + tickets + support_tickets" → "tickets" et "support_tickets" semblent désigner la même table support_tickets.

- **P0.C8** — Verdict: PARTIAL
  - Preuve: la couche route + RBAC/BOLA est faite : `admin.route.ts:247-258` `requireRole('admin','moderator','museum_manager')` sur `/stats` + scope FORCÉ `scopedMuseumId = req.user.museumId` pour un museum_manager (un `?museumId=99` forgé ne peut pas exfiltrer un autre tenant). Schéma Zod `admin.schemas.ts:104` `museumId: z.coerce.number().int().positive().optional()`. Test BOLA `tests/integration/admin/analytics-scope.test.ts:10-17`. MAIS le scoping profond du repository est explicitement NON appliqué : `getStats.useCase.ts:11-26` « the underlying repository does not yet scope stats by museumId... users/chat sessions are NOT museum-scoped... may treat it as a no-op until the rest of the schema lands tenant scope ». Donc users/sessions/messages stats ne sont PAS filtrés par museum_id (seuls reviews/tickets le sont via M2/M3).
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ⚠️ — la faille cross-tenant CRITIQUE (BOLA museum_manager) est fermée au niveau route/RBAC ; le WHERE museum_id sur users/sessions/messages reste un no-op assumé (résiduel V1.0.x post-launch). Reste P0 (partiel) jusqu'au merge ; tracker le résiduel repository-scope.
  - Confiance: haute

- **P0.C9** — Verdict: DONE-BRANCH:origin/p0/feature-gates
  - Preuve: `museum-web/src/components/admin/AdminShell.tsx:189-197` — `<RoleGuard allowedRoles={['admin','moderator','super_admin','museum_manager']}>` (museum_manager AJOUTÉ à l'allow-list, commentaire "Wave B C9 / R-C9"). E2e `museum-web/e2e/admin/museum-manager-access.spec.ts:8-17` asserte qu'un museum_manager accède à `/admin` sans 403. Décision = AJOUTER+SCOPER (pas dropper le role).
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ✅ — entrée admin débloquée pour museum_manager + e2e. Reste P0 jusqu'au merge.
  - Confiance: haute

- **I-FIX1** — Verdict: DONE-BRANCH:origin/p0/feature-gates
  - Preuve: `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:77-94` — `invalidateMuseum(museumId)` itère `['museum-mode','personalized']` et construit le BON namespace `${KEY_PREFIX}:${KEY_VERSION}:${ctxClass}:${museumId}:` (= `llm:v2:...`) via `delByPrefix`. Le bouton cache-purge est désormais câblé dessus : `cache-purge.route.ts:60` `await llmCacheService.invalidateMuseum(museumIdInt)` (commentaire l.14-31 documente le remplacement de l'ancien `delByPrefix('chat:llm:${museumId}:')` qui matchait 0 clé + sort `invalidateMuseum` du dead-code). Test `tests/integration/admin/cache-purge.namespace.test.ts`.
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ✅ — dead-code réanimé + namespace corrigé (plus de stale 24h). Reste P0 jusqu'au merge.
  - Confiance: haute

- **I-FIX2** — Verdict: DONE-BRANCH:origin/p0/feature-gates
  - Preuve: `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:142-149` — `currentArtworkKey` plié dans le canonical hash (truthy-only, mirror imageContentHash). Type ajouté `llm-cache.types.ts:35-44` (`currentArtworkKey?: string`, commentaire "I-FIX2"). Population : `chat-message.service.ts:424` `currentArtworkKey: prep.session.currentArtworkId ?? prep.currentArtwork?.title ?? undefined`. Le `[CURRENT ARTWORK]` du system prompt (`llm-prompt-builder.ts:74`) est donc maintenant reflété dans la cache key → 2 visiteurs sur œuvres ≠ ne partagent plus une réponse. Test dédié `tests/unit/chat/llm-cache.service.artwork-key.test.ts:19-25` (A vs B → hash ≠ ; undefined/'' → byte-identique legacy).
  - Ref vérifiée: origin/p0/feature-gates
  - Action roadmap: ✅ — cross-talk artwork fermé. Reste P0 jusqu'au merge.
  - Confiance: haute

---

## Synthèse comptage

| Verdict | Items |
|---|---|
| DONE-BRANCH:origin/p0/feature-gates | C1, C2, C3, C4, C4b, C5, C6, C7, C9, I-FIX1, I-FIX2 (11) |
| PARTIAL | C8 (1) |
| FALSE-CLAIM | 0 |
| OPEN | 0 |

Total : 12/12 items couverts. Tout LOT 3 est livré sur `origin/p0/feature-gates`, NON mergé sur dev → reste P0 jusqu'au merge.

### Migrations C3/C7
Les 3 migrations existent sur la branche et créent les colonnes attendues :
- C3 : `1779381393403-AddWikidataQidToMuseums.ts` — `museums.wikidata_qid varchar(16) NULL UNIQUE`.
- C7 : `1779401558315-AddMuseumIdToReviews.ts` + `1779401558316-AddMuseumIdToSupportTickets.ts` — `museum_id integer NULL` FK ON DELETE SET NULL + partial index.
Tests d'intégration de schéma présents. **Pas de preuve "no drift" exécutable** (pas de `migration:run`+`generate Check` de ma part) → Confiance moyenne sur le no-drift.

### C5 telemetry
NON absente : Plausible (FE + BE funnel) est implémentée avec consent gate opt-in. Le claim doc "posthog|plausible = 0" est STALE sur cette branche.

### C4b décision contenu
Tranchée : seul Aquitaine (133 rows P195+P18) ingest-viable ; CAPC/Cité du Vin Q-code conservé sans auto-ingest. Comptage SPARQL documenté en commentaire code, MAIS le doc référencé `c4b-sparql-counts.md` (et `c2-license-uris.md`) n'est PAS committé → anchor cassé (note pour le rewrite / sentinel doc-anchor).

### Divergence avec commit "close #295"
Aucune divergence majeure : tous les items annoncés par `49f16d8` sont vérifiés présents. Le seul écart honnête est C8, dont le commit ferme la faille BOLA/RBAC (critique) mais laisse le scoping repository des stats users/sessions/messages en no-op assumé (documenté dans le code) → PARTIAL, pas DONE. `c963b188` confirme l'élargissement rating 1-5→0-10 (lié au NPS de C7).
