# B6 — Lot P0 feature-gates & data-integrity (#295 / `811fd501c`)

**Angle :** CORRECTNESS / migrations / data-integrity
**Reviewer :** fresh-context senior read-only (UFR-022) · branche `dev` @ `89852f2a1`
**Périmètre lu (état final) :** 3 migrations, `catalog-ingest.{ts,helpers.ts}`, `seed-museums.ts`, `llm-cache.{service,types}.ts` + `chat-message.service.ts`, `cache-purge.route.ts`, review/support repo+useCase+route+entity, `integration-harness.ts`, migration tests, license unit test, `AdminShell.tsx`.

---

## Note : 8.5/10 — VERDICT : APPROVED (avec réserves mineures non-bloquantes)

Lot solide côté data-integrity. Les migrations sont propres et conformes aux gotchas CLAUDE.md (pas de `SAVEPOINT`, nullable non-destructif, `ON DELETE SET NULL`, partial index). Les deux vrais bugs corrigés (cache namespace mort `chat:llm:` + cache cross-artwork) sont réels et bien traités. Le museum_id est effectivement câblé bout-en-bout (read scope + persist + JWT thread), pas une colonne no-op. Réserves : un mapping license CC-BY-SA incohérent (slug mappé ≠ valeur allow-list, donc inatteignable) et non testé ; pas de test de réversibilité (`down`) ; risque latent de séquence PK dans le harness de test.

---

## ✅ Bien fait

1. **Migrations conformes aux gotchas** (`1779381393403`, `…315`, `…316`)
   - Aucun `SAVEPOINT` → pas de crash sous `runMigrations({transaction:'none'})` (gotcha `AddMuseumGeofence` / `integration-harness.ts:71`). Vérifié : les 3 `up()` ne contiennent que `ALTER TABLE`/`CREATE INDEX`.
   - `museum_id integer NULL` cohérent avec `museums.id` = `@PrimaryGeneratedColumn()` (integer PK, `museum.entity.ts:18`). Pas de mismatch int/UUID.
   - `ON DELETE SET NULL` sur les deux FK (`…315:46`, `…316:35`) — choix justifié (survie tenant offboarding), aligné sur `FK_artwork_embeddings_museum_id`.
   - Partial index `WHERE museum_id IS NOT NULL` (`…315:49`, `…316:38`) — petit, mirror du pattern `IDX_support_tickets_assigned_to`.
   - `down()` réversibles avec `DROP … IF EXISTS` (`…315:53-59`, `…316:42-48`) → revert idempotent.

2. **Fix cache namespace mort (data-integrity réel)** — `cache-purge.route.ts`
   - Ancien `delByPrefix('chat:llm:${museumId}:')` matchait **0 clé** (mauvais namespace) → cache museum-mode stale jusqu'à 24h après update musée. Désormais délègue à `invalidateMuseum` avec le namespace réel `llm:v2:{contextClass}:{museumId}:` (`llm-cache.service.ts:98,130`). Cohérent avec le gotcha CLAUDE.md (`KEY_VERSION='v2'` ligne 15, key shape ligne 119).
   - `+` validation integer avant l'appel (évite `delByPrefix('llm:v2:museum-mode:NaN:')`).

3. **Fix cache cross-artwork correct** — `llm-cache.service.ts:146-148` + `chat-message.service.ts:421`
   - `currentArtworkKey` folded **truthy-only** dans le JSON canonique → 2 œuvres = 2 clés distinctes ; falsy → champ exclu → byte-identique aux entrées legacy (pas de bump `KEY_VERSION` requis, vérifié : exclusion conditionnelle ligne 146 `if (input.currentArtworkKey)`). Mirror correct du contrat `voiceMode`/`imageContentHash`.

4. **museum_id réellement scopé (pas no-op)** — review + support
   - Read scope : `review.repository.pg.ts` `andWhere('r.museumId = :museumId')` (skip si null = super_admin) + `aggregateNps(museumId)` scopé `museumId`+`approved` ; `support.repository.pg.ts` idem `t.museumId`.
   - Persist : `createReview.useCase.ts` / `createTicket.useCase.ts` `museumId: input.museumId ?? null`.
   - Thread JWT : `review.route.ts` / `support.route.ts` `museumId: authedUser.museumId ?? null`.
   - Entités déclarées cohérentes avec la migration (`review.entity.ts` / `supportTicket.entity.ts` : `@Column({type:'integer',nullable:true,name:'museum_id'})` + `@Index(... where: '"museum_id" IS NOT NULL')`) — zéro drift entité↔migration.

5. **Fixture license corrigée (anti-masquage)** — `catalog-ingest.helpers.test.ts:128-131`
   - L'ancienne fixture injectait le slug `'public-domain'` qui **masquait** le bug URI-vs-slug ; la nouvelle injecte la vraie URI `http://www.wikidata.org/entity/Q19652`. Bonne discipline RED (n'injecte pas le slug pré-mappé).

6. **Seed idempotent + QIDs vérifiés** — `seed-museums.ts`
   - `.orUpdate(['wikidata_qid'], 'slug')` backfille au re-run au lieu d'un `.orIgnore()` no-op (conflict target = UNIQUE `slug`). Cohérent avec la docstring migration `…403:9`.
   - QIDs Bordeaux = Q3329534 / Q2945071 / Q16964634 — concordent avec la référence vérifiée (`MEMORY.md reference_bordeaux_museum_qcodes`). Q1773424 = Pont de Pierre.

---

## ⚠️ À améliorer

1. **[MOYENNE] Mapping CC-BY-SA incohérent → valeur allow-list inatteignable** — `catalog-ingest.helpers.ts:58`
   - `mapLicenseUriToSlug` mappe `Q18199165` (CC-BY-SA 4.0) → `'cc-by-sa-4.0'`, **mais** l'allow-list `AllowedLicense` (`catalog-ingest.ts:67`) et le type entité `ArtworkImageLicense` (`artworkEmbedding.entity.ts:22`) ne connaissent que `'cc-by-sa'` (sans `-4.0`). Donc une œuvre CC-BY-SA légitime est mappée vers un slug **jamais présent dans l'allow-list** → `classifyLicense` (`catalog-ingest.ts:186`) la rejette systématiquement (`licenseRejected += 1`). La valeur `cc-by-sa` de l'allow-list est de facto **inatteignable** depuis l'ingest Wikidata.
   - Idem `cc-by-4.0`/`cc-by`/`gfdl-1.2` (`helpers.ts:56,57,59`) : aucune n'est dans `ArtworkImageLicense` → mortes (dropées downstream). La docstring `helpers.ts:49-51` admet "mapped for forward-compatibility but currently still get rejected" — donc le comportement est *documenté intentionnellement*, ce qui le rend non-bloquant. Mais c'est un piège : si quelqu'un ajoute `cc-by-sa` à `licenseFilter` croyant l'activer, ça ne marchera pas (slug mappé `cc-by-sa-4.0` ≠ `cc-by-sa`). **Action :** soit mapper `Q18199165 → 'cc-by-sa'`, soit supprimer les 4 entrées non-allow-list, soit ajouter un test garde-fou que tout slug mappé ∈ `ArtworkImageLicense`.

2. **[MINEURE] Incohérence interne de docstring** — `catalog-ingest.helpers.ts:40` vs `:49`
   - Ligne 40 : allow-list = `['public-domain','cc-0','cc-by-sa']` ; ligne 49 : "V1 allow-list is `['public-domain','cc-0']`". La vraie valeur runtime est `AllowedLicense = 'public-domain' | 'cc-0' | 'cc-by-sa'` (`catalog-ingest.ts:67`) — donc ligne 40 correcte, ligne 49 fausse. Sans impact runtime, mais induit en erreur.

3. **[MINEURE] CC-BY-SA non testé** — `catalog-ingest.helpers.test.ts:346-368`
   - Le bloc `mapLicenseUriToSlug` ne couvre que `public-domain`, `cc-0`, unknown, empty. Le mismatch `Q18199165 → cc-by-sa-4.0` (point #1) n'a aucun test → le bug ne serait pas détecté en régression.

4. **[MINEURE] Risque latent de séquence PK dans le harness** — `integration-harness.ts`
   - Après `RESTART IDENTITY` (séquence `museums.id` → 1) puis `INSERT … VALUES (42,…),(99,…) ON CONFLICT DO NOTHING`, la séquence reste à 1 et n'est PAS avancée (`setval`). Un test qui insère ≥42 musées sans id explicite finirait par heurter `id=42` (PK conflict) — pas le slug (le commentaire ligne harness invoque le slug unique, mais le conflit serait sur la PK, pas le slug). Improbable (peu de tests insèrent 40+ musées) → non-bloquant, mais le commentaire justificatif est techniquement faux.

5. **[INFO] `currentArtworkKey` fallback title** — `chat-message.service.ts:421`
   - `currentArtworkId ?? currentArtwork?.title` : si UUID absent, fallback sur le titre. Deux œuvres homonymes partageraient une clé. UUID préféré quand dispo → impact marginal, acceptable pour V1.

---

## 🔧 Reste à faire

- **R1 (MOYENNE)** Résoudre le mapping CC-BY-SA : `Q18199165 → 'cc-by-sa'` OU retirer les 4 entrées non-allow-list de `WIKIDATA_LICENSE_URI_TO_SLUG`, + test invariant `mappedSlug ∈ ArtworkImageLicense`.
- **R2 (MINEURE)** Corriger la docstring `helpers.ts:49` (allow-list V1 = `['public-domain','cc-0','cc-by-sa']`).
- **R3 (MINEURE)** Ajouter au harness un `setval('museums_id_seq', 100, true)` après les INSERT 42/99 OU corriger le commentaire pour mentionner le risque de séquence.
- **R4 (MINEURE)** Ajouter un test de réversibilité (`down`) sur ≥1 migration (les 3 tests n'asserent que l'état `up`). Non-bloquant : les `down()` sont triviaux et `IF EXISTS`.

---

## NOT-VERIFIABLE (read-only)

- No-drift attendu (`migration:run` puis `generate Check` vide) : non exécutable. **Forme** OK — les docstrings (`…403:18-27`) revendiquent l'isolation manuelle du diff intentionnel hors baseline drift (FK names, recovery_codes::jsonb, embedding halfvec→text) par MIGRATION_GOVERNANCE §6. Plausible mais non confirmé par exécution.
- Idempotence réelle des `up()` sous re-run : non testé (TypeORM tracking table empêche le double-run en pratique ; les `up()` ne sont pas `IF NOT EXISTS` mais c'est la convention TypeORM standard, acceptable).
- QIDs Wikidata Q18199165/Q20007257/Q6905323/Q26921686 : non re-vérifiés en ligne (Q19652/Q6938433 + les 3 Bordeaux concordent avec MEMORY.md vérifié).
