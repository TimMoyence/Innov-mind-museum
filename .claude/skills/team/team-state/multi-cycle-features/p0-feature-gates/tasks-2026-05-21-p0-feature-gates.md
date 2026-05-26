# Tasks — Lot P0 : feature-gates & data integrity

> **Run:** 2026-05-21-p0-feature-gates · **Author:** architect (opus-4.7) · **Created:** 2026-05-21
> **Companion to:** [design.md](./design.md) · [spec.md](./spec.md) · [decisions.md](./decisions.md)

Atomic task list. Editor agent works through this wave-by-wave (cycle = vague). Each vague = un cycle red → green → review/security complet AVANT de passer à la suivante.

Conventions :
- IDs : `T-A<n>` (Vague A), `T-C<n>` (Vague C cache), `T-B<n>` (Vague B multi-tenant), `T-C6<n>` (.env), `T-C5<n>` (Plausible).
- `[RED]` = test phase rouge (doit FAIL avant green). `[GREEN]` = code phase verte. `[INV]` = investigation (non-code). `[CONFIG]` = config/migration.
- "DONE-WHEN" = critère vérifiable.
- Dépendances explicites.

---

## Multi-cycle progress

Ce lot est multi-cycle long-running. Chaque vague = un cycle red/green/review. Archive : `.claude/skills/team/team-state/multi-cycle-features/2026-05-21-p0-feature-gates/` (exempté pruning >30j).

- **Wave A — Contenu démo (C1, C2, C3, C4, C4b)** — `in-progress (current cycle)`
- **Wave C — Cache correctness (I-FIX1, I-FIX2)** — `pending`
- **Wave B — Multi-tenant (C7, C8, C9)** — `pending`
- **Wave C6 — .env release** — `pending`
- **Wave C5 — Plausible funnel** — `pending`

Chaque cycle démarre par re-fresh spec/decisions/design lecture et red/green/review fresh-context.

---

## Vague A — Contenu démo (current cycle)

### [T-A-INV1] [INV] C4b : count SPARQL P195+P18 par musée cible

**But** : décider seed auto vs manuel vs descope pour les 3 Bordeaux + Pont de Pierre.
**Requête** : `SELECT (COUNT(?item) AS ?count) WHERE { ?item wdt:P195 wd:<Qid> ; wdt:P18 ?image }` sur `query.wikidata.org/sparql`.
**Cibles** : Q3329534 (Aquitaine), Q2945071 (CAPC), Q16964634 (Cité du Vin), monument Pont de Pierre (Q-code TBD).
**Critère décision (D-SEQ)** : ≥10 œuvres avec image → seed auto OK ; <10 → seed manuel curaté ou descope (documenté dans le rapport).
**DONE-WHEN** : count SPARQL par musée + décision per-musée actés (working-dir éphémère purgé) — décision finale dans `docs/ROADMAP_PRODUCT.md` P0.C4b (Aquitaine seul ingest-viable).
**Dépend de** : rien.

### [T-A-INV2] [INV] C2 : vérifier Q-codes URI license Wikidata

**But** : confirmer URI exactes à mapper avant d'écrire le test red.
**Action** : WebFetch `https://www.wikidata.org/wiki/Q19652` (public domain), `Q6938433` (CC0), `Q6905323` (CC BY-SA 3.0), `Q18199165` (CC BY-SA 4.0). Confirmer le pattern URI `http://www.wikidata.org/entity/Qxxx`.
**DONE-WHEN** : table URI→slug confirmée (working-dir éphémère purgé) — réf `docs/ROADMAP_PRODUCT.md` P0.C4b.
**Dépend de** : rien (parallélisable avec T-A-INV1).

### [T-A1] [RED] C2 : fixture URI réelle + test mapping absent → 0 row accepté

**Fichier** : `museum-backend/scripts/__tests__/catalog-ingest.helpers.test.ts` (à localiser, sinon créer sous `tests/unit/catalog-ingest/catalog-ingest.helpers.test.ts`).
**Action** : remplacer `license:'public-domain'` (slug) par `license:'http://www.wikidata.org/entity/Q19652'` (URI réelle) dans la fixture ; ajouter un test `mapLicenseUriToSlug('http://.../Q19652')` qui ne compile PAS encore (helper inexistant).
**DONE-WHEN** : `pnpm test -- --testPathPattern=catalog-ingest.helpers` → FAIL (mapper manquant OU fixture URI rejetée).
**Dépend de** : T-A-INV2.

### [T-A2] [RED] C3 : test ingest écrit museum_id non-NULL pour cible

**Fichier** : `museum-backend/tests/integration/catalog-ingest/catalog-ingest.museum-id.test.ts` (nouveau).
**Action** : testcontainers PG. Mock encoder + repo. Run `runIngest({museumId:42, ...})` → assert tous les rows persistés ont `museumId === 42`. Sans `museumId` → NULL.
**DONE-WHEN** : test FAIL (option `museumId` n'existe pas dans `RunIngestOptions`, row n'a pas le champ).
**Dépend de** : rien (test rouge, code green ensuite).

### [T-A3] [RED] C3/M1 : test migration `AddWikidataQidToMuseums` no-drift

**Fichier** : `museum-backend/tests/integration/migrations/wikidata-qid.migration.test.ts` (nouveau).
**Action** : harness clean DB → run migrations → generate Check → assert vide. Assert colonne `wikidata_qid` existe avec contrainte UNIQUE et nullable.
**DONE-WHEN** : test FAIL (migration M1 inexistante).
**Dépend de** : rien.

### [T-A4] [RED] C4 : test seed-museums idempotent + Q-codes 3 Bordeaux + Pont de Pierre

**Fichier** : `museum-backend/tests/integration/seed/seed-museums.qid.test.ts` (nouveau).
**Action** : run seed 2× ; assert 3 musées Bordeaux ont `wikidataQid` (Q3329534, Q2945071, Q16964634) ; assert monument Pont de Pierre présent avec Q-code ; assert pas de duplicates.
**DONE-WHEN** : test FAIL (champ `wikidataQid` absent du seed).
**Dépend de** : T-A3 (colonne).

### [T-A5] [RED] C1 : test bash fetch-models.sh — 2 branches fail-loud + tolérance

**Fichier** : `museum-backend/tests/integration/scripts/fetch-models.sh.test.ts` (Jest spawn shell) OU `museum-backend/scripts/__tests__/fetch-models.test.sh`.
**Action** : (a) SHA set + URL 404 → exit ≠ 0 ; (b) SHA unset + URL 404 → exit 0 + log "WARNING" ; (c) SHA mismatch → exit ≠ 0. Mock URL via fixture file:// ou serveur local.
**DONE-WHEN** : test FAIL initialement si pas de coverage existante (logique shell EST correcte `:78-87`, le test prouve la non-régression R-C1/R-C1b).
**Dépend de** : rien.

### [T-A6] [GREEN] C2 : implémenter `mapLicenseUriToSlug` + appliquer au yield

**Fichier** : `museum-backend/scripts/catalog-ingest.helpers.ts` (modify).
**Action** : ajouter `const WIKIDATA_LICENSE_URI_TO_SLUG: Record<string, AllowedLicense>` (table T-A-INV2) + `function mapLicenseUriToSlug(uri: string): AllowedLicense | null` ; remplacer ligne `:195` `license: licenseValue` → `license: mapLicenseUriToSlug(licenseValue) ?? licenseValue` (URI inconnue → raw → `classifyLicense` rejette).
**DONE-WHEN** : T-A1 PASSE ; `pnpm lint` + `pnpm test -- catalog-ingest` verts.
**Dépend de** : T-A1.

### [T-A7] [GREEN] C3/M1 : générer migration `AddWikidataQidToMuseums` + entity column

**Fichiers** :
- `museum-backend/src/data/db/migrations/<ts>-AddWikidataQidToMuseums.ts` (généré via `node scripts/migration-cli.cjs generate --name=AddWikidataQidToMuseums`)
- `museum-backend/src/modules/museum/domain/museum/museum.entity.ts` (modify) : ajouter `@Column({type:'varchar', length:16, nullable:true, unique:true, name:'wikidata_qid'}) wikidataQid?: string | null;`
**Action** : ajouter le `@Column` D'ABORD, PUIS générer la migration (TypeORM diff entity↔DB). Vérifier `migration:run` clean → generate Check VIDE.
**DONE-WHEN** : T-A3 PASSE ; `pnpm migration:run` clean + Check vide.
**Dépend de** : T-A3.

### [T-A8] [GREEN] C3 : flag CLI `--museum-id` + résolution `--museum=<Qid>`→id + threader museumId

**Fichiers** : `museum-backend/scripts/catalog-ingest.ts` (modify).
**Action** : (1) `parseCliArgs` parse `--museum-id=<int>` (number, validation). (2) Bootstrap CLI (`main`/`bootstrap`, `:421+`) : si Qids fournis ET pas de `--museum-id`, lookup `museums.wikidata_qid` via repository → résout id integer ; si ambiguous/missing, log + skip. (3) `RunIngestOptions` gagne `museumId?: number | null`. (4) `ArtworkEmbeddingRow` (`:310-318`) set `museumId: opts.museumId ?? null`. (5) Logs `catalog_ingest_summary` (`:332-341`) inclut `museumId`.
**DONE-WHEN** : T-A2 PASSE.
**Dépend de** : T-A2, T-A7 (colonne).

### [T-A9] [GREEN] C4 : seed Q-codes 3 Bordeaux + Pont de Pierre + .orUpdate

**Fichier** : `museum-backend/scripts/seed-museums.ts` (modify).
**Action** : (1) `MuseumSeed` (`:7-14`) gagne `wikidataQid?: string`. (2) Set Q-codes sur les 3 Bordeaux (`:92-118`) : Q3329534, Q2945071, Q16964634. (3) Ajouter row Pont de Pierre (Q-code de T-A-INV1, hors-musée, lat/lon Bordeaux). (4) `.values(...)` mapping (`:208-217`) inclut `wikidataQid: m.wikidataQid ?? null`. (5) Remplacer `.orIgnore()` (`:219`) par `.orUpdate(['wikidata_qid'], 'slug')` pour backfill rows existantes sur re-run.
**DONE-WHEN** : T-A4 PASSE ; 2× run idempotent ; Q-codes persistés.
**Dépend de** : T-A4, T-A7 (colonne), T-A-INV1 (count décision + Q-code Pont de Pierre).

### [T-A10] [CONFIG] C1 : runbook provisioning bucket GCS + génération SHA

**Fichier** : `museum-backend/docs/operations/SIGLIP_PROVISIONING.md` (nouveau, si pas existant).
**Action** : documenter (a) URL bucket cible, (b) `sha256sum` du modèle ONNX, (c) passage en CI via `SIGLIP_ONNX_SHA256` GitHub secret, (d) procédure rotate. PAS de SHA réel committé.
**DONE-WHEN** : runbook existe + T-A5 passe (couvre les 2 branches).
**Dépend de** : T-A5.

### [T-A-REVIEW] [REVIEW] Vague A : reviewer fresh + verifier + security

**Action** : verdict reviewer (APPROVED | CHANGES_REQUESTED | BLOCK) + security-analyst sur scripts d'ingest (pas d'injection SPARQL ; URI license validée allow-list). `gitnexus_detect_changes()` scope = scripts + museum entity + 1 migration + tests. Pas de PII committée.
**DONE-WHEN** : verdict APPROVED + STORY.md updated.

---

## Vague C — Cache correctness (pending — démarre après A)

### [T-C1] [RED] I-FIX2 : test cache key distinctness — 2 currentArtwork → 2 hash

**Fichier** : `museum-backend/tests/unit/chat/llm-cache.service.artwork-key.test.ts` (nouveau).
**Action** : (1) 2 `LlmCacheKeyInput` identiques sauf `currentArtworkKey` → assert hashes différents. (2) Input sans `currentArtworkKey` → hash byte-identique à un input legacy de même shape (golden snapshot copié de l'état actuel). (3) Truthy-only fold (empty string / undefined → champ absent du canonical JSON).
**DONE-WHEN** : test FAIL (champ inexistant).
**Dépend de** : Vague A clôturée.

### [T-C2] [RED] I-FIX1 : test purge admin → invalide namespace `llm:v2:` réel

**Fichier** : `museum-backend/tests/integration/admin/cache-purge.namespace.test.ts` (nouveau).
**Action** : (1) seed cache avec une clé `llm:v2:museum-mode:42:anon:<hash>`. (2) POST `/admin/museums/42/cache/purge`. (3) Assert lookup suivant = miss (clé invalidée). (4) Assert `delByPrefix` appelé avec préfixe matchant `llm:v2:museum-mode:42:` ET `llm:v2:personalized:42:` (pas `chat:llm:42:`).
**DONE-WHEN** : test FAIL (préfixe actuel = `chat:llm:` n'invalide rien).
**Dépend de** : Vague A clôturée.

### [T-C3] [GREEN] I-FIX2 : threader `currentArtworkKey` dans LlmCacheKeyInput + canonical

**Fichiers** :
- `museum-backend/src/modules/chat/useCase/llm/llm-cache.types.ts` (modify) : ajouter `readonly currentArtworkKey?: string;` à `LlmCacheKeyInput` (après `audioDescriptionMode`).
- `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts` (modify) : dans `sha256OfCanonicalInput` (`:118-148`), après `voiceMode` (`:139-141`), ajouter `if (input.currentArtworkKey) canonical.currentArtworkKey = input.currentArtworkKey;` (truthy-only mirror).
- `museum-backend/src/modules/chat/useCase/message/chat-message.service.ts` (modify) : dans `buildLlmCacheInput` (`:379-407`), set `currentArtworkKey: prep.currentArtwork ? String(<artwork-id>) : undefined`. Préférer un `session.currentArtworkId` stable accessible via `prep.session` (vérifier en green via Read ; sinon fallback `prep.currentArtwork.title`).
**DONE-WHEN** : T-C1 PASSE.
**Dépend de** : T-C1.

### [T-C4] [GREEN] I-FIX1 : câbler bouton sur `invalidateMuseum` + injecter LlmCacheService

**Fichier** : `museum-backend/src/modules/admin/adapters/primary/http/routes/cache-purge.route.ts` (modify).
**Action** : (1) `createCachePurgeRouter(cache, llmCacheService: LlmCacheService)` (signature étendue). (2) `museumIdStr = parseStringParam(req,'id')` → `museumIdInt = Number.parseInt(museumIdStr, 10)` → `if (!Number.isInteger(museumIdInt) || museumIdInt < 1) throw badRequest(...)`. (3) Remplacer `:25` `await cache.delByPrefix('chat:llm:${museumId}:')` par `await llmCacheService.invalidateMuseum(museumIdInt)`. (4) Garder audit log + métriques. (5) Mettre à jour le composition root où ce router est instancié pour passer `llmCacheService`.
**DONE-WHEN** : T-C2 PASSE.
**Dépend de** : T-C2.

### [T-C5-VAGUEC] [GREEN] Doc CLAUDE.md : `llm:v1:` → `llm:v2:` (gotcha stale)

**Fichier** : `CLAUDE.md` (modify).
**Action** : corriger le bullet « LLM response cache » qui dit `llm:v1:...` → `llm:v2:...`. Hors code applicatif → potentiellement exempté du pipeline 5-phase (vérifier exemption auto UFR-022 ; sinon pure-doc edit en finalize).
**DONE-WHEN** : grep `llm:v1:` dans CLAUDE.md = 0.
**Dépend de** : T-C4.

### [T-C-REVIEW] [REVIEW] Vague C : reviewer + security (pipeline chat touché)

**Action** : guardrail audit non-régression (cache key n'introduit pas d'user-controlled raw injection — `currentArtworkKey` dérive d'un id DB OU titre déjà sanitizé `:71`). Verifier cache hit/miss metrics non-régression. Verdict.
**DONE-WHEN** : APPROVED + STORY.md.

---

## Vague B — Multi-tenant (pending — démarre après C)

### [T-B1] [RED] M2 : test migration `AddMuseumIdToReviews` no-drift

**Fichier** : `museum-backend/tests/integration/migrations/reviews-museum-id.migration.test.ts` (nouveau).
**Action** : harness clean → run migrations → generate Check → assert vide. Assert colonne `museum_id` integer nullable + FK→museums.id + index `IDX_reviews_museum_id`.
**DONE-WHEN** : test FAIL (migration M2 inexistante).
**Dépend de** : Vague C clôturée.

### [T-B2] [RED] M3 : test migration `AddMuseumIdToSupportTickets` no-drift

**Fichier** : `museum-backend/tests/integration/migrations/support-tickets-museum-id.migration.test.ts` (nouveau).
**Action** : idem T-B1 pour `support_tickets`.
**DONE-WHEN** : test FAIL.
**Dépend de** : T-B1 (parallèle possible).

### [T-B3] [RED] C7 : test review rating 0-10 + scope museum_id

**Fichiers** : `museum-backend/tests/unit/review/review.schema.test.ts` (modify ou nouveau).
**Action** : (1) `createReviewSchema.parse({rating: 0, comment:'...'})` → OK. (2) `rating: 11` → reject. (3) `rating: 5` toujours OK (back-compat). (4) Integration : create review avec museumId → persiste museumId ; list reviews scopé museumId → seules les rows de ce museum.
**DONE-WHEN** : test FAIL (schéma min(1).max(5) + colonne absente).
**Dépend de** : T-B1.

### [T-B4] [RED] C7 : test support tickets scope museum_id

**Fichier** : `museum-backend/tests/integration/support/ticket-museum-scope.test.ts` (nouveau).
**Action** : create + list tickets scopés museumId.
**DONE-WHEN** : test FAIL.
**Dépend de** : T-B2.

### [T-B5] [RED] C8 : test admin analytics museumId scope + BOLA

**Fichier** : `museum-backend/tests/integration/admin/analytics-scope.test.ts` (nouveau).
**Action** : (1) `GET /admin/stats?museumId=42` as museum_manager(museumId=42) → 200 scoped. (2) `GET /admin/stats?museumId=99` as museum_manager(museumId=42) → 403 OR scope forcé à 42 (OWASP API3). (3) super_admin sans museumId → vue cross-tenant. (4) Zod `strictObject` rejette query param hors-schéma.
**DONE-WHEN** : test FAIL.
**Dépend de** : T-B3, T-B4 (use cases analytics dépendent des colonnes museum_id).

### [T-B6] [RED] C9 : Playwright museum_manager entre /admin sans 403 + a11y

**Fichier** : `museum-web/tests/e2e/admin/museum-manager-access.spec.ts` (nouveau).
**Action** : login museum_manager → navigate `/[locale]/admin` → assert pas 403, AdminShell rendu. `@axe-core/playwright` scan a11y AA.
**DONE-WHEN** : test FAIL (allow-list AdminShell exclut museum_manager).
**Dépend de** : rien (FE only).

### [T-B7] [GREEN] M2 : générer + entity column reviews.museum_id

**Fichiers** :
- `museum-backend/src/modules/review/domain/review/review.entity.ts` (modify) : `@Index('IDX_reviews_museum_id',{where:'"museum_id" IS NOT NULL'})` + `@Column({type:'integer', nullable:true, name:'museum_id'}) museumId?: number | null;`.
- `museum-backend/src/data/db/migrations/<ts>-AddMuseumIdToReviews.ts` (généré via migration-cli).
**DONE-WHEN** : T-B1 PASSE ; Check vide.
**Dépend de** : T-B1.

### [T-B8] [GREEN] M3 : générer + entity column support_tickets.museum_id

**Fichiers** :
- `museum-backend/src/modules/support/domain/ticket/supportTicket.entity.ts` (modify) : idem T-B7.
- `museum-backend/src/data/db/migrations/<ts>-AddMuseumIdToSupportTickets.ts`.
**DONE-WHEN** : T-B2 PASSE.
**Dépend de** : T-B2.

### [T-B9] [GREEN] C7 : élargir rating 0-10 + scope reviews use cases

**Fichiers** :
- `museum-backend/src/modules/review/adapters/primary/http/schemas/review.schemas.ts` (modify) : `rating: z.number().int().min(0).max(10)` (ligne `:4`).
- `museum-backend/src/modules/review/useCase/createReview.useCase.ts` (modify) : set museumId depuis le contexte ; borne 0-10.
- Review repo : `findByMuseum(museumId)`, `aggregateNps(museumId)` (NPS = % promoteurs 9-10 − % détracteurs 0-6).
- OpenAPI : `museum-backend/src/helpers/swagger.ts` régénéré (`pnpm openapi:validate`) → FE `npm run generate:openapi-types`.
**DONE-WHEN** : T-B3 PASSE ; OpenAPI à jour ; FE check:openapi-types OK.
**Dépend de** : T-B3, T-B7.

### [T-B10] [GREEN] C7 : scope support tickets

**Fichiers** : support use cases + repo (`museum-backend/src/modules/support/`).
**Action** : set museumId au create ; filter par museumId au list/find.
**DONE-WHEN** : T-B4 PASSE.
**Dépend de** : T-B4, T-B8.

### [T-B11] [GREEN] C8 : admin analytics museumId scope

**Fichiers** :
- `museum-backend/src/modules/admin/adapters/primary/http/routes/admin.route.ts` (modify lignes `:229-339`).
- Zod schemas (`usageAnalyticsQuerySchema`, `contentAnalyticsQuerySchema`, `engagementAnalyticsQuerySchema`, + nouveau pour `/stats`) : `z.strictObject({ ..., museumId: z.coerce.number().int().positive().optional() })`.
- Use cases analytics : `WHERE museum_id` quand fourni.
- Middleware RBAC : super_admin → museumId optionnel ; museum_manager → museumId forcé à son scope (claim JWT ou lookup user→museum).
**DONE-WHEN** : T-B5 PASSE.
**Dépend de** : T-B7, T-B8, T-B9, T-B10.

### [T-B12] [GREEN] C9 : AdminShell RoleGuard + scope FE

**Fichier** : `museum-web/src/components/admin/AdminShell.tsx` (modify ligne `:196`).
**Action** : `allowedRoles={['admin','moderator','super_admin','museum_manager']}`. Vérifier que les sous-pages admin (analytics/reviews/tickets) gèrent l'UI scoping (masquer sélecteur cross-tenant pour museum_manager). i18n FR+EN strings ajoutées si nouvelle UI.
**DONE-WHEN** : T-B6 PASSE.
**Dépend de** : T-B6.

### [T-B13] [GREEN] Maestro flow museum_manager admin (UFR-021)

**Fichier** : `museum-frontend/.maestro/admin-museum-manager.yaml` (nouveau, si écran user-facing modifié côté mobile — sinon scope web Playwright seulement).
**Action** : flow happy-path museum_manager. Ajouter à `museum-frontend/.maestro/shards.json` si applicable. **NB** : C9 est web-first (AdminShell.tsx = web), donc Maestro pas obligatoire si pas d'écran mobile admin nouveau ; sinon couvert par T-B6 Playwright.
**DONE-WHEN** : `pnpm sentinel:screen-test-coverage` OK ou N/A.
**Dépend de** : T-B12.

### [T-B-REVIEW] [REVIEW] Vague B : reviewer + security (BOLA / OWASP API3)

**Action** : security-analyst verdict obligatoire (tenant isolation). Verifier OpenAPI breaking change rating 0-10 documenté. `gitnexus_detect_changes()` scope.
**DONE-WHEN** : APPROVED + STORY.md.

---

## Vague C6 — .env release (pending — démarre après B)

### [T-C61] [GREEN] Mirror 3 vars + drop 5 dead vars

**Fichiers** :
- `museum-backend/.env.production.example` (modify) : ajouter `CORS_ORIGINS=`, `APP_VERSION=`, `GOOGLE_OAUTH_CLIENT_ID=` (placeholders `REPLACE_ME`, valeurs prod hors-repo).
- `museum-backend/.env.example` (modify) : drop lignes `:7 APP_VERSION` (gardé si ref code) — **vérifier** d'abord `grep APP_VERSION museum-backend/src` ; si 0 ref → drop, sinon mirror. Drop lignes `:8 TTS_ENABLED`, `:17 GOOGLE_CSE_API_KEY`, `:18 GOOGLE_CSE_ID`, `:24 SEARXNG_INSTANCES`, `:168 SMTP_BREVO` (5 dead vars confirmées spec).
**DONE-WHEN** : `grep -r "TTS_ENABLED\|GOOGLE_CSE_API_KEY\|GOOGLE_CSE_ID\|SEARXNG_INSTANCES\|SMTP_BREVO" museum-backend/src` = 0 ; diff vérifié ; CI env-lint passe.
**Dépend de** : Vague B clôturée.

### [T-C6-REVIEW] [REVIEW] Vague C6 : reviewer

**Action** : verdict. Possiblement exemptée pipeline 5-phase (pure-config, diff∩src vide). Vérifier exemption auto UFR-022.
**DONE-WHEN** : APPROVED.

---

## Vague C5 — Plausible funnel (pending — démarre après C6)

### [T-C51] [INV] Lib-docs Plausible (doc-fetcher + doc-curator)

**Action** : pas d'entrée `lib-docs/plausible/` (INDEX.json vérifié 2026-05-21) → fresh fetch via **doc-fetcher** (custom events API, script tag, proxy/self-host, privacy/cookieless) → **doc-curator** produit `lib-docs/plausible/PATTERNS.md` + `LESSONS.md`. Mettre à jour `INDEX.json`.
**DONE-WHEN** : `lib-docs/plausible/PATTERNS.md` existe + INDEX.json updated + `libDocsConsulted[]` couvre `plausible` dans le rapport red.
**Dépend de** : Vague C6 clôturée.

### [T-C52] [RED] C5 : test FE consent gate → 0 émission sans consent

**Fichier** : `museum-frontend/__tests__/analytics/plausible-consent.test.ts` (nouveau).
**Action** : mock fetch ; `trackFunnelEvent('paywall_modal_shown')` SANS consent → 0 appel réseau. AVEC consent → 1 appel POST sur l'endpoint proxy avec props attendues (sans email/PII).
**DONE-WHEN** : test FAIL (module `shared/analytics/plausible.ts` inexistant).
**Dépend de** : T-C51.

### [T-C53] [RED] C5 : test BE `quota_exceeded` émis vers Plausible

**Fichier** : `museum-backend/tests/integration/telemetry/funnel-quota-exceeded.test.ts` (nouveau).
**Action** : hit le gate quota chat → assert event `quota_exceeded` envoyé via le client Plausible (mock HTTP).
**DONE-WHEN** : test FAIL.
**Dépend de** : T-C51.

### [T-C54] [GREEN] FE module analytics + consent + events

**Fichiers** :
- `museum-frontend/shared/analytics/plausible.ts` (nouveau) : `trackFunnelEvent(name, props)` ; consent gate via `useAnalyticsConsent()` ; `readEnvString('PLAUSIBLE_ENDPOINT_URL')` ; HTTP POST vers BE proxy `/api/telemetry/funnel` (D7). Pas d'emoji, pas de PII.
- `museum-frontend/shared/analytics/useAnalyticsConsent.ts` (nouveau) : hook persistant (`expo-secure-store` ou AsyncStorage).
- `museum-frontend/features/paywall/application/PaywallProvider.tsx` (modify ligne `:72`) : ajouter `trackFunnelEvent('paywall_modal_shown', {tier})` à côté du breadcrumb (NON régression Sentry).
- `museum-frontend/features/paywall/ui/QuotaUpsellModal.tsx` (modify ligne `:21`) : idem pour `paywall_cta_clicked` et `paywall_email_captured`.
- i18n FR+EN strings consent gate.
**DONE-WHEN** : T-C52 PASSE.
**Dépend de** : T-C52.

### [T-C55] [GREEN] BE proxy `/api/telemetry/funnel` + `quota_exceeded`

**Fichiers** :
- `museum-backend/src/modules/telemetry/` (nouveau module, hexagonal) : port + adapter Plausible HTTP + route + Zod schema.
- Chat quota gate (à localiser : `chat.service` ou middleware quota) : émettre `quota_exceeded` via le port telemetry.
- OpenAPI régénéré.
**DONE-WHEN** : T-C53 PASSE.
**Dépend de** : T-C53.

### [T-C56] [GREEN] Web : Plausible script + proxy Next + dashboard

**Fichiers** :
- `museum-web/next.config.ts` (modify) : rewrites `/js/script.js` → plausible CDN, `/api/event` → plausible (proxy same-origin).
- `museum-web/src/app/layout.tsx` (modify) : `<Script>` Plausible avec data-domain, consent gate via `useAnalyticsConsent` web (cookie ou localStorage).
- Strings i18n bannière consent FR+EN.
- Dashboard : créer 4 Goals dans Plausible (paywall_modal_shown / cta_clicked / email_captured / quota_exceeded) + funnel. Documentation `docs/observability/PLAUSIBLE_FUNNEL.md`.
**DONE-WHEN** : émission web testée localement ; dashboard accessible.
**Dépend de** : T-C55.

### [T-C57] [GREEN] Maestro flow paywall happy-path (UFR-021)

**Fichier** : `museum-frontend/.maestro/paywall-funnel.yaml` (nouveau OU baseline si déjà couvert).
**Action** : tap-through paywall → assert event émis (sous consent).
**DONE-WHEN** : `pnpm sentinel:screen-test-coverage` passe pour les écrans paywall modifiés.
**Dépend de** : T-C54.

### [T-C5-REVIEW] [REVIEW] Vague C5 : reviewer + security + GDPR

**Action** : audit consent gate (R-C5b 0 appel sans consent) ; pas de PII brut dans events ; lib-docs Plausible référencée. Verdict.
**DONE-WHEN** : APPROVED + STORY.md.

---

## Verification gate (par vague, run par verifier agent)

> Use `;` (NOT `&&`) so a single failure does not hide later failures.

- [ ] `cd museum-backend; pnpm lint; pnpm test; pnpm test:contract:openapi`
- [ ] `cd museum-frontend; npm run lint; npm test; npm run check:openapi-types`
- [ ] `cd museum-web; pnpm lint; pnpm test` (si web touché — Vagues B, C5)
- [ ] `cd museum-backend; pnpm migration:run` (clean DB) `;` `node scripts/migration-cli.cjs generate --name=Check` → output VIDE
- [ ] `gitnexus_detect_changes()` scope = vague courante
- [ ] no new `eslint-disable` without `Justification: ≥20 chars` + `Approved-by:`
- [ ] no inline test entities (factories shape-match)
- [ ] red-test-manifest.json sha256 chain intact (frozen-test)
- [ ] `libDocsConsulted[]` couvre toutes les libs touchées (typeorm, express, zod ; +plausible pour C5)
- [ ] STORY.md updated end-of-wave
