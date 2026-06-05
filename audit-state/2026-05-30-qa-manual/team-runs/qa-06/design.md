# Design — QA-06 : Détail musée riche (champs JSONB exposés + skeleton + état vide + enrichment Bordeaux)

> Phase 2 (Plan) du workflow fresh-context 5-phase (UFR-022). Fresh-context : zéro
> mémoire de la phase Spec ; ce design est dérivé de la lecture disque de
> `audit-state/2026-05-30-qa-manual/team-runs/qa-06/spec.md` + lecture directe des
> fichiers source (tous les `file:line` ci-dessous code-vérifiés cette phase).
>
> Couvre : approche, fichiers à toucher, changements de contrat, étapes OpenAPI +
> regénération de types, ordre back → front. Le découpage commit-par-commit est
> dans `tasks.md`.

---

## 0. Synthèse de la décision d'architecture

On livre le **périmètre large (a + b + c)** + la **vérification QID (d, R12)** et on
**diffère le seed statique riche museumId-lié (d, R14)** — décision documentée §6.

Trois couches, dans l'ordre back → front (le front dépend du contrat back regénéré) :

1. **BE — exposer les 4 champs riches** (`admissionFees`, `collections`,
   `currentExhibitions`, `accessibility`) dans `MuseumEnrichmentView` + l'adapter
   cache `toView` + (R4) ne pas les écraser au refresh worker.
2. **Contrat OpenAPI** — ajouter les paths `/api/museums/{id}/enrichment` et
   `/enrichment/status` + les schémas `MuseumEnrichmentView` / `ParsedOpeningHours` /
   `MuseumEnrichmentResponse` (200 ready + 202 pending), de façon **cohérente avec la
   réponse réelle** (R3). Puis FE `generate:openapi-types` + `check:openapi-types`.
3. **FE — rendu conditionnel + skeleton + état vide** : nouvelles sections admission /
   collections / expositions / accessibilité affichées **uniquement** quand le champ
   est non-null, skeleton structuré pendant `loading`, état vide gracieux « infos à
   venir » + 8 locales.

---

## 1. Contrainte structurante n°1 — les 4 champs riches sont `Record<string, unknown>` libre (D1)

Code-vérifié : `museum-backend/src/shared/db/jsonb-schemas/museum-enrichment.schemas.ts:11-21`
définit les 4 schémas comme `LooseRecordSchema = z.record(z.string(), z.unknown())`
(`loose-record.schema.ts`). Les types inférés `AdmissionFees`/`Collections`/
`CurrentExhibitions`/`Accessibility` sont **exactement `Record<string, unknown>`**.

Le seed legacy (`scripts/seed-knowledge.ts:476-502`) confirme l'usage réel : forme
**libre, non garantie** — ex `admissionFees: { adult, under18, under26EU, ... }`,
`collections: { departments: string[], highlights: string[] }` OU `{ focus, highlights }`,
`accessibility: { wheelchairAccess: bool, audioGuide: bool, ... }`. **Aucune clé n'est
garantie.**

**Conséquences de design (non négociables, NFR1) :**

- **BE** : on type la vue avec les types nommés Zod-inférés (`AdmissionFees | null`,
  etc.), **sans** inventer de sous-structure de champs (R2). C'est un `Record` nullable.
- **OpenAPI** : on décrit ces 4 champs comme `{ "type": "object", "nullable": true,
  "additionalProperties": true }` — fidèle à `Record<string, unknown> | null`. Pas de
  `properties` fixes (mentirait sur le contrat).
- **FE** : le composant **ne peut pas** présumer de clés. Le rendu doit être
  **défensif** : un renderer générique « liste de paires clé→valeur » qui (i) ignore les
  valeurs `null`/`undefined`/`''`, (ii) aplatit `string|number|boolean` directement,
  (iii) joint les `string[]` par `· `, (iv) **skip** silencieusement toute valeur de forme
  inattendue (objet imbriqué profond) plutôt que d'afficher `[object Object]`. Si après
  filtrage un champ riche ne produit AUCUNE ligne affichable → la section est masquée
  (R6). Aucune clé technique brute mensongère affichée à l'utilisateur final.

> Garde-fou jsonb-drift (memory `feedback_jsonb_drift_guard.md`) : tout accès imbriqué
> garde un `typeof` même si TS dit « required » — ici TS dit `unknown`, donc
> narrowing obligatoire de toute façon.

---

## 2. Contrainte structurante n°2 — l'endpoint enrichment est ABSENT d'OpenAPI (D2)

Code-vérifié : `grep "/api/museums" openapi/openapi.json` → 7 paths, **aucun**
`/enrichment`. Aucun schéma `MuseumEnrichment`/`ParsedOpeningHours` dans le spec.
Côté FE, `museum-frontend/features/museum/infrastructure/museumApi.ts:36-90` documente
explicitement la vue comme **hand-maintained** et l'appelle via `httpRequest` brut
(pas `openApiRequest`), précisément parce que le spec ne l'expose pas.

`scripts/check-openapi-spec.cjs` = validateur **structurel** (JSON valide, `openapi`
3.x, `paths` présents, allow-list de paths requis) — il n'exige PAS que toute route
existe dans le spec, donc ajouter un path est sûr. Le test contrat
`tests/contract/openapi/openapi-response.contract.test.ts` est une **allow-list
explicite** (il valide des payloads précis nommés un par un) — ajouter un path n'y
casse rien tant qu'on n'ajoute pas d'assertion fausse ; on **ajoutera** une assertion
`assertMatchesOpenApiResponse` pour le payload `ready` enrichment (AC3).

### Décision : chemin (a) — ajouter au spec OpenAPI puis migrer `museumApi.ts` vers les types générés

Deux options (cf. spec D2) :

- **(a)** Écrire paths + schémas enrichment dans `openapi.json`, regénérer
  `shared/api/generated/openapi.ts`, migrer `museumApi.ts` → `OpenApiResponseFor`.
- **(b)** Étendre à la main les types `MuseumEnrichmentView` de `museumApi.ts` + ajouter
  les 4 champs à l'OpenAPI uniquement pour la cohérence contrat.

**Choix = (a).** Justification :
- R3 + NFR2 exigent la cohérence contrat↔réponse ET la chaîne
  `generate:openapi-types`/`check:openapi-types` verte. (b) laisse le type FE
  hand-maintained continuer à driver — donc le `check:openapi-types` ne **prouve rien**
  sur l'enrichment (il ne touche pas ce type) : le contrat resterait non-vérifié sur la
  surface qu'on est précisément en train d'enrichir.
- (a) supprime la dette de drift que `museumApi.ts:36-43` documente déjà comme à
  résorber (« Once the BE spec includes them, regenerate … and swap these for
  `OpenApiResponseFor<...>` aliases »). On exécute exactement le TODO laissé.
- Coût maîtrisé : `museumApi.ts` a déjà `openApiRequest` importé et 4 méthodes
  l'utilisent. On ne migre que `getEnrichment`/`getEnrichmentStatus`.

### Sous-décision : modéliser l'union discriminée 200/202 dans OpenAPI + types FE

L'endpoint renvoie **200** (`{status:'ready', data: MuseumEnrichmentView}`) OU **202**
(`{status:'pending', jobId}`) — code-vérifié `museum.route.ts:136,145`.
`OpenApiResponseFor<P,'get'>` retient par défaut le **200** (cf. `openapiClient.ts`
`SuccessStatusFor` → 200 d'abord). Donc :

- OpenAPI : la `get` enrichment déclare `responses.200` (ready, `MuseumEnrichmentReady`)
  + `responses.202` (pending, `MuseumEnrichmentPending`) + 400/401/404.
- FE types : `MuseumEnrichmentView` ← dérivé du **200** via
  `OpenApiResponseFor<'/api/museums/{id}/enrichment','get', 200>['data']`.
  `MuseumEnrichmentResponse` (union) reste **assemblé** côté FE à partir des deux
  status (`...,200>` ∪ `...,202>`) — c'est l'idiome déjà utilisé dans le repo pour les
  réponses multi-status. `museumApi.getEnrichment` garde sa signature publique
  `Promise<MuseumEnrichmentResponse>` (les 2 consommateurs hooks ne changent pas).

> **Note d'impl pour la phase Green** : `openApiRequest` lance sur statut non-2xx ?
> Non — il faut vérifier que `httpRequest`/`openApiRequest` ne jette PAS sur 202 (sinon
> le flux pending casse). `museumApi.getEnrichment` appelle aujourd'hui `httpRequest`
> brut justement ; **si** `openApiRequest` ne supporte pas un 2e code 2xx (202) sans
> jeter, on **garde** l'appel `httpRequest` dans la méthode (l'appel runtime) et on ne
> récupère de l'OpenAPI **que les types** (`OpenApiResponseFor`). C'est le découplage
> propre : types générés (contrat) + transport `httpRequest` (déjà testé pour 202).
> La phase Red/Green tranchera après lecture de `openapiClient.ts` runtime ; les deux
> variantes satisfont R3/NFR2 car le contrat est dans le spec et les types sont
> regénérés. **Recommandation par défaut : types générés + transport `httpRequest`
> conservé** (zéro risque sur le polling 202 déjà couvert par les tests hook).

---

## 3. Backend — changements détaillés

### 3.1 `MuseumEnrichmentView` — ajout des 4 champs (R1, R2)
Fichier : `museum-backend/src/modules/museum/domain/enrichment/enrichment.types.ts`

Importer les types Zod-inférés et étendre l'interface (additif, nullable) :

```ts
import type { AdmissionFees, Collections, CurrentExhibitions, Accessibility }
  from '@shared/db/jsonb-schemas/museum-enrichment.schemas';

export interface MuseumEnrichmentView {
  museumId: number;
  locale: string;
  summary: string | null;
  wikidataQid: string | null;
  website: string | null;
  phone: string | null;
  imageUrl: string | null;
  openingHours: ParsedOpeningHours | null;
  admissionFees: AdmissionFees | null;        // = Record<string, unknown> | null
  collections: Collections | null;
  currentExhibitions: CurrentExhibitions | null;
  accessibility: Accessibility | null;
  fetchedAt: string;
}
```

Impact (gitnexus_impact à lancer en phase Red/Green) : tout constructeur de
`MuseumEnrichmentView` doit fournir les 4 champs. Sites connus à balayer :
- `typeorm-museum-enrichment-cache.adapter.ts` `toView` (3.2) + `upsert` INSERT branch.
- `museum-enrichment.worker.ts` `buildEnrichmentView` (l.149-163) → ajouter
  `admissionFees: null, collections: null, currentExhibitions: null, accessibility:
  null` (le worker ne les fetch pas — R4 : ils restent null à la création).
- Tests/fixtures BE qui fabriquent une vue inline (cf. NFR7) :
  `tests/unit/museum/typeorm-museum-enrichment-cache.adapter.test.ts` `makeView`,
  `tests/unit/routes/museum-enrichment.route.test.ts` (2 payloads inline l.86-96,
  155-164). **Balayage required-field** (memory `feedback_team_frozen_manifest_flat.md`
  + `feedback_cumulative_verify_broader_than_wave_scope.md`) : un champ requis ajouté
  casse tout fixture qui l'omet → grep `MuseumEnrichmentView` + `status: 'ready'` dans
  `tests/` et corriger en phase Red. Note : les 4 champs sont **nullable**, donc les
  fixtures peuvent ajouter `: null` (additif, pas de valeur inventée).

### 3.2 Adapter cache — `toView` + `upsert` + `applyViewToEntity` (R1, R4)
Fichier : `…/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter.ts`

- **`toView(row)`** (l.141-158) : ajouter les 4 champs lus depuis l'entité, castés
  `Record<string, unknown> | null` (l'entité les expose déjà ainsi, l.58/68/75/82) :
  ```ts
  admissionFees: (row.admissionFees ?? null) as AdmissionFees | null,
  collections: (row.collections ?? null) as Collections | null,
  currentExhibitions: (row.currentExhibitions ?? null) as CurrentExhibitions | null,
  accessibility: (row.accessibility ?? null) as Accessibility | null,
  ```
  (même idiome que `openingHours` l.155). AC2.
- **`upsert` INSERT branch** (l.65-83) : aujourd'hui force `admissionFees: null, …` à la
  création (l.76-79). À **garder** — le worker P3 ne fournit pas ces champs, donc null à
  l'insert est correct (R4).
- **`applyViewToEntity`** (l.122-130) : **NE PAS** y ajouter d'écriture des 4 champs.
  Raison R4 + NFR6 : le refresh worker passe une vue dont ces 4 champs valent `null`
  (le worker ne les fetch pas). Si on faisait `entity.admissionFees = view.admissionFees`,
  un refresh **écraserait** un éventuel seed riche existant par `null`. En **ne touchant
  pas** ces colonnes dans `applyViewToEntity`, on préserve les valeurs riches déjà en
  base lors d'un refresh worker (comportement actuel conservé pour les colonnes legacy —
  c'est exactement le contrat documenté l.45-48 « preserve legacy columns set by the
  knowledge-extraction flow »). AC : test adapter « upsert UPDATE path ne nullifie pas
  un champ riche pré-existant ».

> Subtilité TypeORM (NFR6, CLAUDE.md Pièges) : `applyViewToEntity` mute l'entité puis
> `save()`. Comme on **n'assigne pas** les 4 champs, TypeORM ne génère pas de `SET` pour
> eux → valeurs préservées. C'est l'inverse du piège `.set({field: undefined})` ; ici on
> ne touche simplement pas la propriété, ce qui est sûr avec `repo.save(entity)`.

### 3.3 OpenAPI — paths + schémas (R3)
Fichier : `museum-backend/openapi/openapi.json`

Ajouter dans `paths` (après `/api/museums/{id}/low-data-pack` ou groupé avec les museums) :
- `"/api/museums/{id}/enrichment"` → `get` : `parameters` (path `id` int, query `locale`
  string required), `responses.200` ($ref `MuseumEnrichmentReady`), `responses.202`
  ($ref `MuseumEnrichmentPending`), `400`/`401`/`404` ($ref existants).
- `"/api/museums/{id}/enrichment/status"` → `get` : idem + query `jobId` required.

Ajouter dans `components.schemas` :
- `ParsedOpeningDay`, `ParsedOpeningHours` (miroir de `enrichment.types.ts:9-28`).
- `MuseumEnrichmentView` : objet, `required` = tous les champs (la réponse les inclut
  toujours, valeur `null` quand absent), avec `admissionFees`/`collections`/
  `currentExhibitions`/`accessibility` = `{ "type": "object", "nullable": true,
  "additionalProperties": true }` (cf. §1). `openingHours` = `$ref ParsedOpeningHours`
  nullable. `fetchedAt` = `string` (date-time).
- `MuseumEnrichmentReady` : `{ status: const 'ready', data: $ref MuseumEnrichmentView }`.
- `MuseumEnrichmentPending` : `{ status: const 'pending', jobId: string }`.

Garde-fou : exécuter `pnpm openapi:validate` (structurel) — vert exigé (AC3).

> ⚠️ openapi-typescript (FE) ne supporte pas tous les mots-clés ; rester sur des
> constructions standards (`type`, `nullable`, `$ref`, `enum`/`const`). Si le générateur
> tique sur `const`, utiliser `enum: ["ready"]`. La phase Green ajustera après le 1er
> `generate:openapi-types`.

### 3.4 Seed Bordeaux (R12, R13, R14) — vérifier QID, différer le seed riche
Fichiers : `scripts/seed-museums.ts` (lecture seule de vérif), `scripts/seed-knowledge.ts`.

- **R12 (vérif, non-régression)** : `seed-museums.ts:114,124,134` portent déjà
  Aquitaine `Q3329534`, CAPC `Q2945071`, Cité du Vin `Q16964634` — **code-vérifié**.
  Aucune modif. Un test léger peut asserter la présence de ces 3 QID (cf. tasks.md
  optionnel) pour verrouiller la non-régression.
- **R13/R14 — décision : DIFFÉRER le seed statique riche museumId-lié.** Raisons
  honnêtes (UFR-013), §6.

---

## 4. Frontend — changements détaillés

### 4.1 Types — regénérer + migrer `museumApi.ts` (D2, NFR2, NFR3)
- `npm run generate:openapi-types` régénère `shared/api/generated/openapi.ts` (NE PAS
  l'éditer à la main — NFR, CLAUDE.md token-discipline).
- `museumApi.ts` :
  - `MuseumEnrichmentView` : remplacer l'interface hand-maintained (l.73-85) par un
    alias dérivé du 200 généré : `OpenApiResponseFor<'/api/museums/{id}/enrichment',
    'get', 200>['data']` → portera automatiquement les 4 nouveaux champs.
  - `MuseumEnrichmentResponse` : union dérivée des status 200 ∪ 202 (ou conservée
    hand-shaped si plus lisible — additif, tant que `data` = la vue générée).
  - `ParsedOpeningHours`/`ParsedOpeningDay`/`OpeningDay`/`OpeningDayStatus` : peuvent
    rester ou devenir des alias générés ; **conserver l'export** car
    `opening-hours.formatter.ts` en dépend (vérifier les imports — NFR3).
  - Transport : garder `httpRequest` runtime pour 202 (cf. §2 sous-décision).
  - Mettre à jour le commentaire l.36-43 (le TODO « does not yet expose » est résolu).

Garde-fou : `npm run check:openapi-types` (= regen + `git diff --exit-code`) **vert**
(AC4). `npx tsc --noEmit` FE vert.

### 4.2 `MuseumDetailEnrichment.tsx` — sections riches + skeleton + état vide (R5–R10)
Fichier : `museum-frontend/features/museum/ui/MuseumDetailEnrichment.tsx`

Composant purement présentationnel (styles injectés). Ajouts :

- **4 sections riches conditionnelles** (R5/R6), chacune une `GlassCard style=descCard`
  avec `sectionTitle` i18n + corps via un **renderer générique défensif** (§1) :
  - `museum.admission` ← `enriched.admissionFees`
  - `museum.collections` ← `enriched.collections`
  - `museum.exhibitions` ← `enriched.currentExhibitions` (restera vide en pratique :
    null → section masquée, c'est voulu D3)
  - `museum.accessibility` ← `enriched.accessibility`
  Helper `renderRichField(record): {key:string; value:string}[]` — pur, testable
  isolément ; retourne `[]` si rien d'affichable → la section ne s'affiche pas.
  Affichage : icône Ionicons (`pricetag-outline` / `library-outline` /
  `easel-outline` / `accessibility-outline`) + lignes `clé: valeur` (la clé peut rester
  brute techniquement — **décision UX** : on n'invente pas de libellé par clé inconnue,
  on affiche la valeur en priorité ; les clés brutes type `wheelchairAccess` sont
  acceptables en V1 et non mensongères, ou on n'affiche QUE les valeurs en liste — à
  trancher en Spec UI si besoin ; **recommandation : afficher valeurs en liste à puces**
  pour éviter d'exposer des clés techniques anglaises sous une UI FR). Ne JAMAIS afficher
  `[object Object]`/`undefined`/clé vide.
- **Skeleton** (R8) : remplacer le bloc `showEnrichmentLoader` (l.169-176,
  `ActivityIndicator` + texte) par un **skeleton structuré** : 2-3 `GlassCard` avec des
  `View` gris (hero image placeholder `heroImage` + 2 cards `descCard` avec barres
  grises mimant titre+lignes). `testID="museum-detail-skeleton"` sur le conteneur
  (AC6). Réutiliser un composant skeleton partagé s'il existe
  (`grep -r Skeleton museum-frontend/shared/ui` en phase Red) ; sinon shimmer simple
  via `theme.surface` + opacité (pas d'emoji, props logiques RTL — NFR4/NFR5).
- **État vide gracieux** (R9/R10) : remplacer `museum.no_extra_info` (l.178-182) par une
  nouvelle clé `museum.info_coming_soon` (« infos à venir ») avec `testID=
  "museum-detail-empty"`. `showEmptyEnrichment || showErrorAsEmpty` → ce message.

### 4.3 `museum-detail.tsx` — `hasRichContent` + gating skeleton (R7, R8)
Fichier : `museum-frontend/app/(stack)/museum-detail.tsx`

- `hasRichContent` (l.68-74) : ajouter les 4 champs au OU :
  ```ts
  enriched.admissionFees !== null || enriched.collections !== null ||
  enriched.currentExhibitions !== null || enriched.accessibility !== null
  ```
  (laisse `showEmptyEnrichment` ne se déclencher que quand vraiment rien — R7).
- `showEnrichmentLoader` (l.75) inchangé (`status==='loading' && !enriched`) — pilote le
  skeleton. Le skeleton vit dans `MuseumDetailEnrichment` (prop déjà passée l.181).
- Aucune nouvelle prop nécessaire si le composant lit `enriched.*` directement
  (l'objet `enriched` est déjà passé l.179). Garder la surface de props stable.

### 4.4 i18n — 8 locales (R11, NFR9)
Fichiers : `museum-frontend/shared/locales/{fr,en,de,es,it,ja,zh,ar}/translation.json`
sous `museum.*` (à côté de `about`, `opening_hours`, `website`, `phone`,
`no_extra_info`). Nouvelles clés :
- `museum.admission`
- `museum.collections`
- `museum.exhibitions`
- `museum.accessibility`
- `museum.info_coming_soon`

FR de référence (accents/ligatures corrects) : « Tarifs » / « Collections » /
« Expositions » / « Accessibilité » / « Infos à venir ». EN = reference du checker
(`check-i18n-completeness.js`, REFERENCE_LANG='en'). Les 7 autres locales doivent avoir
TOUTES les clés non vides (sinon checker exit 1). `museum.no_extra_info` : **conserver**
(d'autres écrans peuvent l'utiliser — grep avant suppression ; ne pas retirer sans
preuve qu'il est mort).

Garde-fou : `npm run check:i18n` vert (AC8).

### 4.5 Sheet (NFR3) — non-régression seule
`MuseumSheetEnrichmentBody.tsx` consomme la même vue mais N'AFFICHE PAS les 4 champs
riches (sheet = vue compacte). L'ajout étant additif/nullable, **aucune modif requise**.
Vérifier juste que `tsc` reste vert (le type vue s'élargit, pas de breaking). Hors scope
d'ajouter les sections riches à la sheet (spec §8).

### 4.6 Tests FE
- Nouveau test composant `__tests__/features/museum/MuseumDetailEnrichment.test.tsx`
  (AC5/AC6/AC7) : sections affichées si champ non-null / masquées si null ; skeleton
  présent en `loading` (`testID`) ; état vide `info_coming_soon` quand résolu sans data.
  Factories DRY (`__tests__/helpers/factories/*` — NFR7) : ajouter/étendre une factory
  `makeMuseumEnrichmentView` (les 4 champs nullable, défaut `null`).
- `__tests__/hooks/useMuseumEnrichment.test.ts` : `makeEnrichmentView` (l.44-55) doit
  ajouter les 4 champs `: null` (sinon TS casse sur le type élargi). Additif.
- `__tests__/features/museum/useMuseumSheetEnrichmentData.test.ts` : idem si fixture
  inline de vue (balayage required-field FE).
- Helper de rendu défensif `renderRichField` : test unitaire pur (string/number/bool,
  string[], null skip, objet imbriqué skip — pas de `[object Object]`).

---

## 5. Ordre back → front (dépendances)

```
BE-1  enrichment.types.ts (vue + 4 champs)            ──┐
BE-2  worker buildEnrichmentView (+4 null)             │ types BE cohérents
BE-3  adapter toView (+4 mappés) + UPDATE preserve     ──┘
BE-4  openapi.json (paths + schémas) → openapi:validate
BE-5  BE tests/fixtures balayage required-field + adapter UPDATE-preserve
            │  (le spec OpenAPI doit être committé AVANT que le FE régénère)
            ▼
FE-1  generate:openapi-types → openapi.ts régénéré
FE-2  museumApi.ts migration types (vue ← généré)  → check:openapi-types vert
FE-3  MuseumDetailEnrichment.tsx (sections + skeleton + empty) + renderRichField
FE-4  museum-detail.tsx hasRichContent
FE-5  i18n 8 locales → check:i18n vert
FE-6  tests FE (composant + helper + fixtures) ; tsc + eslint
VERIF cross-stack (gates §7 tasks) + Maestro flow inchangé vert
```

Le FE **dépend** du spec OpenAPI committé (FE-1 lit `../museum-backend/openapi/
openapi.json`). Donc BE-4 précède FE-1 strictement.

---

## 6. Décision R14 — seed statique riche museumId-lié : DIFFÉRÉ (documenté, UFR-013)

**Décision : on NE seed PAS de champs riches museumId-liés pour Bordeaux dans ce run.**
On livre R1–R11 + la vérif QID (R12). Justification honnête :

1. **Le worker P3 ne peuple pas ces champs** (code-vérifié `museum-enrichment.worker.ts`
   `buildEnrichmentView` n'écrit que summary/website/phone/imageUrl/openingHours).
   Donc même avec les bons QID, le pipeline auto-fetch ne remplira PAS admission/
   collections/accessibility. Les exposer (R1) rend visible ce qui EST en base ; ça ne
   fabrique rien et c'est la valeur immédiate.
2. **Le seul seed riche existant** (`seed-knowledge.ts` `MUSEUM_ENRICHMENTS`) est
   `museumId: null`, name-keyed, et la requête P3 filtre `museumId IS NOT NULL` +
   `(museumId, locale)` → ces lignes ne sont jamais servies au détail. Créer un seed
   museumId-lié exigerait : (a) résoudre l'ID DB des 3 Bordeaux (join par slug/name au
   runtime du seed), (b) sourcer manuellement des données réelles vérifiées (tarifs/
   collections/accessibilité) depuis les sites officiels avec `sourceUrls` cités, par
   musée ET par locale — chantier de sourcing/vérification non trivial, à risque de
   péremption (tarifs changent), hors du cœur du bug QA-06.
3. **Le bug QA-06 réel** (écran « quasi vide » + UX async) est **résolu** par (a) exposer
   ce qui est en base + (b) skeleton + (c) état vide gracieux — sans aucune donnée
   inventée. Le brief tâche (d) autorise explicitement de différer si « infaisable
   honnêtement dans le scope ».
4. **Jamais de faux contenu** (NFR1) : seeder à la va-vite des tarifs non re-vérifiés
   violerait la doctrine. Mieux vaut un état vide honnête qu'un placeholder mensonger.

**Recommandation de suivi (hors run)** : si un seed riche Bordeaux est voulu pour la
démo launch, en faire un mini-run dédié qui (i) sait résoudre `museumId` par slug,
(ii) source chaque valeur depuis le site officiel du musée avec `sourceUrls`,
(iii) laisse `currentExhibitions` à `null` (D3), (iv) cible la/les locale(s) servie(s).
Tracé ici, pas dans la roadmap (doctrine learning-loop).

---

## 7. Risques & garde-fous

- **R-A (contrat partagé, élevé)** : élargir `MuseumEnrichmentView` (champ requis ajouté)
  casse tout fixture/payload inline qui l'omet, BE **et** FE. Garde-fou : balayage
  required-field en phase Red (grep `MuseumEnrichmentView` + `status: 'ready'` dans
  `tests/` BE et `__tests__/` FE) ; vérif **full-suite** des modules museum/enrichment,
  pas seulement les fichiers touchés (memory `feedback_scoped_review_misses_contract_
  breakage` + `feedback_cumulative_verify_broader_than_wave_scope`).
- **R-B (openapi-typescript)** : le générateur peut produire des types `data` en
  `Record<string, never>` ou casser sur `const`. Garde-fou : après BE-4, lancer FE-1
  tôt et lire le diff `openapi.ts` ; ajuster le spec (`enum` vs `const`,
  `additionalProperties:true`) jusqu'à un type FE exploitable. NE PAS éditer
  `openapi.ts` à la main.
- **R-C (transport 202)** : si on migre l'appel runtime vers `openApiRequest` et qu'il
  jette sur 202, le polling pending casse silencieusement. Garde-fou : conserver
  `httpRequest` pour le runtime (cf. §2) ; les tests hook existants
  (`useMuseumEnrichment.test.ts` pending/timeout) doivent rester verts.
- **R-D (rendu non garanti, NFR1)** : forme JSONB libre → risque d'afficher
  `[object Object]` / clés techniques. Garde-fou : `renderRichField` défensif + test
  unitaire dédié + section masquée si rien d'affichable.
- **R-E (i18n incomplet)** : clé manquante dans 1 des 8 locales → `check:i18n` rouge /
  fallback EN en prod (NFR9). Garde-fou : ajouter les 5 clés dans les 8 fichiers d'un
  coup, FR/EN soignés, lancer `check:i18n`.
- **R-F (cache Jest stale)** : `npx jest --clearCache` (FE) / `pnpm jest --clearCache`
  (BE) avant chaque run de vérif (piège connu).
- **R-G (Maestro UFR-021)** : `museum-branding-detail.yaml` couvre la route (header
  `# screen: MuseumDetailScreen` + tap-through). On ne modifie ni la nav ni les `testID`
  CTA → flow reste valide (AC12). `MuseumDetailEnrichment` = sous-composant → couvert
  par jest, pas de nouveau flow (NFR10, décision confirmée).
- **R-H (gitnexus impact)** : lancer `gitnexus_impact` sur `MuseumEnrichmentView`,
  `toView`, `buildEnrichmentView` avant édition (CLAUDE.md GitNexus § Always Do) et
  rapporter le blast radius.

---

## 8. Fichiers à toucher (récapitulatif)

**Backend (modif) :**
- `museum-backend/src/modules/museum/domain/enrichment/enrichment.types.ts`
- `museum-backend/src/modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter.ts`
- `museum-backend/src/modules/museum/adapters/primary/museum-enrichment.worker.ts`
- `museum-backend/openapi/openapi.json`
- `museum-backend/tests/unit/museum/typeorm-museum-enrichment-cache.adapter.test.ts`
- `museum-backend/tests/unit/routes/museum-enrichment.route.test.ts`
- `museum-backend/tests/contract/openapi/openapi-response.contract.test.ts` (ajout assertion ready)
- (vérif lecture seule) `museum-backend/scripts/seed-museums.ts`

**Frontend (modif) :**
- `museum-frontend/shared/api/generated/openapi.ts` (régénéré, NON édité main)
- `museum-frontend/features/museum/infrastructure/museumApi.ts`
- `museum-frontend/features/museum/ui/MuseumDetailEnrichment.tsx`
- `museum-frontend/app/(stack)/museum-detail.tsx`
- `museum-frontend/shared/locales/{fr,en,de,es,it,ja,zh,ar}/translation.json`
- `museum-frontend/__tests__/features/museum/MuseumDetailEnrichment.test.tsx` (nouveau)
- `museum-frontend/__tests__/hooks/useMuseumEnrichment.test.ts` (fixture +4 null)
- `museum-frontend/__tests__/features/museum/useMuseumSheetEnrichmentData.test.ts` (si fixture inline)
- `museum-frontend/__tests__/helpers/factories/*` (factory vue enrichment)

**NE PAS toucher (non-régression NFR3) :**
- `MuseumSheetEnrichmentBody.tsx`, `useMuseumSheetEnrichmentData.ts`,
  `useMuseumBranding.ts`, `useMuseumEnrichment.ts` (signature publique),
  `.maestro/museum-branding-detail.yaml`.
