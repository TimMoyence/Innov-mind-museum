# B6 — Lot P0 feature-gates & data-integrity (#295 `811fd501c`) — Review SÉCURITÉ MULTI-TENANT

**Reviewer**: senior security read-only (UFR-022 fresh-context). Branche `dev`, état final HEAD `89852f2a1`. Commit audité `811fd501c` (106 fichiers, +6668/-276).

## Note : 7.5/10 — VERDICT : CHANGES_REQUESTED (non bloquant V1, mais 1 fix honnêteté + 1 fix UX/UFR-024 requis)

La majorité du lot est solide et honnête. Les write-paths multi-tenant (reviews/tickets) sont BOLA-safe. Les deux vraies faiblesses : (1) un claim FE faux dans `AdminShell.tsx` ("per-page scoping confine l'operateur") qui ne correspond à AUCUN code, et (2) des doc-anchors morts (`c2-license-uris.md`/`c4b-sparql-counts.md`) référencés 8× dans du code shippé mais inexistants (UFR-024). Le C8 no-op est honnêtement documenté côté code mais expose un agrégat cross-tenant global au `museum_manager`.

---

## ✅ Bien fait

1. **Write-paths reviews/tickets = BOLA-safe.** `museumId` est lié depuis le claim JWT au niveau route, JAMAIS depuis le body :
   - `review.route.ts:67` → `museumId: authedUser.museumId ?? null`
   - `support.route.ts:73` → `museumId: req.user?.museumId ?? null`
   - Les use cases (`createReview.useCase.ts:65-69`, `createTicket.useCase.ts:50-54`) ne thread `museumId` que s'il est explicitement fourni. Aucun chemin où un reviewer public choisit son `museumId`.

2. **Read-scope repository réel + test adversarial.** `review.repository.pg.ts:53-61` (`r.museumId` filter, skip si null=super_admin), `support.repository.pg.ts:102-104`. Le test `tests/integration/support/ticket-museum-scope.test.ts` est ADVERSARIAL (cas (c) : `listTickets({museumId:99})` depuis contexte museum 42 → 0 rows) et passe par le VRAI `SupportRepositoryPg` sur PG réel, pas un mock.

3. **catalog-ingest `museum_id=NULL` corrigé proprement (T-A8).** `catalog-ingest.ts:483-531` : flag `--museum-id=<int>` validé strict (`Number.isInteger && >0`), sinon lookup `museums.wikidata_qid` pour un seul `--museum=<Qid>`, warn-log si non résolu (pas de leak silencieux dans le catalogue global). Défense SPARQL-injection : `validateWikidataQid` (`catalog-ingest.helpers.ts:88`, regex ancrée `^Q[1-9][0-9]{0,18}$`) appliquée AU PARSE (`catalog-ingest.ts:398`) ET dans `buildArtworksOfMuseumSparql` (interpolation 2× → throw).

4. **Bug SPARQL license NON masqué — le test a été corrigé.** Le fixture injecte désormais l'URI réelle (`catalog-ingest.helpers.test.ts:131,139,191` = `WIKIDATA_URI_PUBLIC_DOMAIN`), avec commentaire explicite ligne 128-130 reconnaissant l'ancien fixture trompeur (slug). `mapLicenseUriToSlug` testé directement (lignes 346-366, incl. fail-safe URI inconnue → null). Honnête.

5. **Telemetry/Plausible PII-free + consent gate double couche.**
   - FE : `trackFunnelEvent` short-circuit AVANT le fetch (`plausible.ts:107`, 0 network call), opt-in par défaut (`useAnalyticsConsent.ts:44` `cachedStatus='unset'`), strip PII (incl. `userId`), never throws.
   - BE : `funnel.route.ts:84-101` gate `X-Musaium-Analytics-Consent: granted` strict (fail-closed 403), strip PII au boundary HTTP + adapter (`plausible.adapter.ts:18-45`), rate-limited, never throws. Pas de fingerprinting (Plausible cookieless, IP hashée server-side).

6. **Migrations testées (réel PG).** `reviews-museum-id`, `support-tickets-museum-id`, `wikidata-qid` : assertions `information_schema.columns` (type integer, nullable), FK vers `museums.id`, `scheduleStop()`. Vraies migrations, pas du happy-path.

7. **cache-purge namespace fix.** `cache-purge.route.ts` : `chat:llm:{id}:` (dead, 0 hit) → `llmCacheService.invalidateMuseum()` (`llm:v2:{ctx}:{id}:`), validation entier strict (NaN guard). Test `cache-purge.namespace.test.ts` = regression guard sur le préfixe correct + anti-régression sur l'ancien dead namespace. `requireRole('admin')` (platform staff) — purge cross-museum légitime, pas BOLA.

---

## ⚠️ Risques multi-tenant / sécu / tests

1. **[MOYEN — honnêteté UFR-013] Claim FE faux dans `AdminShell.tsx:189-194`.** Le commentaire affirme : *"FE sub-pages still rely on per-page scoping to confine the operator to their own tenant"*. **Faux, vérifié** :
   - `analytics/page.tsx:99,109-111,217` : `museumId` est un **champ texte saisi manuellement** par l'opérateur, PAS lié au claim tenant. Rien ne confine un museum_manager à son musée côté client.
   - `tickets/page.tsx:65` et `reviews/page.tsx:52` : query-string construite **sans aucun museumId** → aucun scoping per-page.
   Aucun code FE ne réalise la "per-page scoping" promise. Le commentaire doit être corrigé (ou le scoping implémenté).

2. **[MOYEN — leak agrégat cross-tenant] C8 stats no-op expose le global au `museum_manager`.** `getStats.useCase.ts:24-32` : `execute(_input)` IGNORE `museumId` et appelle `repository.getStats()` (aucun arg ; `admin.repository.interface.ts:48` `getStats(): Promise<AdminStats>` sans param). Le forçage de scope route (`admin.route.ts:256-262`) est cosmétique : il scope un param jeté en aval. Résultat concret : un `museum_manager` (seul ajouté à `requireRole` sur `/stats`, ligne 249) reçoit les **stats GLOBALES cross-tenant** (`totalUsers`, `totalReviews` toutes-tenants). Le commentaire route ligne 237-240 ("crafted ?museumId=99 cannot smuggle another tenant's aggregate — BOLA negative guard") donne une **fausse impression d'isolation** : la garde ne protège rien puisque la donnée retournée est globale quel que soit le museumId. Honnêtement documenté en doc (`getStats.useCase.ts:25-30` + header test) MAIS la divulgation d'agrégat reste réelle. Recommandation V1 : soit retirer `museum_manager` de `/stats` jusqu'à ce que les stats soient museum-scopées, soit renvoyer un sous-ensemble vide/non-sensible.

3. **[FAIBLE — UX cassée + test non-adversarial] museum_manager 403 sur tickets/reviews.** AdminShell expose les liens nav tickets/reviews/analytics au `museum_manager` (`AdminShell.tsx:195`), MAIS les routes BE `/admin/tickets` (`admin.route.ts:374`) et `/admin/reviews` (`admin.route.ts:422`) restent `requireRole('admin','moderator')` — museum_manager → **403**. Seul `/stats` a été étendu. Le scope repository (`findByMuseum`, filtre `museumId`) existe mais **n'est câblé sur AUCUNE route admin** (les handlers list ne passent jamais museumId : `admin.route.ts:379-384`, `427-431`). Le e2e web `museum-manager-access.spec.ts` ne teste QUE l'accès nav + a11y (happy-path), PAS la confinement tenant ni les 403 sub-pages → ne couvre pas le risque #1/#3.

4. **[FAIBLE — test masque le no-op C8] `analytics-scope.test.ts` mocke `getStatsUseCase.execute` (ligne 95).** Le test vérifie seulement que la ROUTE thread `{museumId:42}` dans l'appel — il n'exerce JAMAIS le vrai use case qui jette le param. Vert en CI alors que la prod renvoie du global. Anti-pattern UFR-021 (« le test mockait l'interaction même qui casse »). Le header test (lignes 11-15) documente honnêtement le no-op, donc pas de mensonge, mais la garde de test est creuse.

5. **[MOYEN — UFR-024 doc-anchors morts] `c2-license-uris.md` / `c4b-sparql-counts.md` référencés 8× dans du code shippé mais INEXISTANTS.** Vérifié : `git ls-files` + `find` → 0 fichier. Cités dans `catalog-ingest.helpers.ts:46,108`, `seed-museums.ts:101,139`, `catalog-ingest.helpers.test.ts:33`, `seed-museums.qid.test.ts:7,14,104`. Le chemin pointe vers `.claude/skills/team/team-reports/working/2026-05-21-p0-feature-gates/` — répertoire EPHÉMÈRE/disposable (CLAUDE.md "`working/` = disposable"), supprimé. Les Q-codes/URIs sont eux corrects, mais les anchors de provenance sont cassés.

---

## 🔧 Reste à faire

- [ ] **#1 (honnêteté)** : corriger le commentaire `AdminShell.tsx:189-194` — supprimer le claim "per-page scoping confine the operator" (faux) OU implémenter le scoping FE réel + un e2e adversarial (museum_manager 42 ne voit pas les données de 99).
- [ ] **#2 (leak)** : retirer `museum_manager` de `requireRole` sur `/admin/stats` jusqu'à ce que `getStats` soit museum-scopé, OU implémenter le vrai scope (ajouter `museumId` à `IAdminRepository.getStats()` + filtre SQL).
- [ ] **#3 (UX)** : aligner le BE (`/admin/tickets`, `/admin/reviews` requireRole + scope forcé museum_manager) avec le FE AdminShell, OU retirer ces liens nav pour museum_manager. Choisir une seule cohérence.
- [ ] **#5 (UFR-024)** : committer `c2-license-uris.md` + `c4b-sparql-counts.md` dans un emplacement tracké (ex `museum-backend/docs/` ou `docs/`) et corriger les 8 références, OU retirer les références au fichier ephemeral. Vérifier via le sentinel `doc-anchor-check.mjs`.
- [ ] **#4 (test)** : ajouter au moins un test integration/unit qui exerce le VRAI `GetStatsUseCase.execute({museumId})` pour pinner le comportement réel (no-op assumé ET documenté, ou scope réel après #2).
