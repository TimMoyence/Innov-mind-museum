# Spec — QA-06 : Détail musée riche (champs JSONB exposés + skeleton + état vide + enrichment Bordeaux réel)

> Phase 1 (Spec) du workflow fresh-context 5-phase (UFR-022). Aucun code ni design ici.
> Source de vérité diagnostic : `audit-state/2026-05-30-qa-manual/QA-NOTES.md` § QA-06.
> Tous les `file:line` ci-dessous ont été code-vérifiés par lecture directe pendant cette phase.

---

## 0. Contexte & problème (code-vérifié)

L'écran détail musée (`museum-frontend/app/(stack)/museum-detail.tsx`, atteint depuis l'onglet
Musées / la map via `MuseumSheet` « voir plus ») paraît quasi vide : pendant le poll async
d'enrichment il n'affiche que nom + adresse + distance + boutons (« Ouvrir dans Plans »,
« Démarrer un chat ici »), et pour un musée sans ligne d'enrichment il aboutit à
`museum.no_extra_info` (« Pas d'infos détaillées disponibles. »).

Trois causes distinctes, vérifiées :

1. **API trop pauvre.** `MuseumEnrichmentView`
   (`museum-backend/src/modules/museum/domain/enrichment/enrichment.types.ts:30-40`)
   expose `museumId, locale, summary, wikidataQid, website, phone, imageUrl, openingHours,
   fetchedAt`. Elle **omet** `admissionFees`, `collections`, `currentExhibitions`,
   `accessibility` — qui existent pourtant comme colonnes `jsonb` nullable sur l'entité
   `MuseumEnrichment`
   (`museum-backend/src/modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity.ts:53-82`).

2. **UX de chargement / vide.** `museum-detail.tsx:75-77` calcule `showEnrichmentLoader`,
   `showEmptyEnrichment`, `showErrorAsEmpty`. Le rendu loader actuel
   (`features/museum/ui/MuseumDetailEnrichment.tsx:169-176`) = `ActivityIndicator` + une ligne
   de texte ; ce n'est pas un skeleton et le premier paint reste « nom/adresse seuls ». L'état
   vide = une seule ligne grise `no_extra_info` (`MuseumDetailEnrichment.tsx:178-182`).

3. **Données réelles manquantes pour les musées affichés en QA.** Le worker P3
   (`museum-backend/src/modules/museum/adapters/primary/museum-enrichment.worker.ts:142-160`)
   ne peuple QUE `summary/website/phone/imageUrl/openingHours` via `MuseumEnrichmentView`. Il
   **n'écrit jamais** les 4 champs riches. Ceux-ci ne sont peuplés que par le seed legacy
   knowledge-extraction (`scripts/seed-knowledge.ts:462+`) avec `museumId: null` — or l'endpoint
   P3 filtre `museumId IS NOT NULL` et matche `(museumId, locale)`
   (`typeorm-museum-enrichment-cache.adapter.ts:37-43, 88-104`), donc ces lignes legacy ne sont
   **jamais servies** au détail musée. Les 3 musées démo Bordeaux ont déjà leurs QID corrects
   dans `scripts/seed-museums.ts:107-134` (Aquitaine `Q3329534`, CAPC `Q2945071`,
   Cité du Vin `Q16964634`).

---

## 1. Découvertes qui amendent les hypothèses du brief (UFR-013 — honnêteté)

Ces points contredisent des prémisses du brief de mission ; ils sont consignés pour que les
phases Plan/Red/Green ne partent pas d'une hypothèse fausse.

- **D1 — Les schémas Zod des 4 champs riches NE sont PAS typés richement.**
  Le brief demande « utilise les types Zod-inférés (PAS `Record<string,unknown>`) ». Or
  `museum-backend/src/shared/db/jsonb-schemas/museum-enrichment.schemas.ts:11-21` définit
  `AdmissionFeesSchema/CollectionsSchema/CurrentExhibitionsSchema/AccessibilitySchema` =
  `LooseRecordSchema` = `z.record(z.string(), z.unknown())`
  (`loose-record.schema.ts:8`). Le type inféré est **exactement `Record<string, unknown>`**.
  Il n'existe pas de forme riche typée à réutiliser aujourd'hui. → La spec exige un type
  nommé issu des schémas (`AdmissionFees`, `Collections`, `CurrentExhibitions`,
  `Accessibility` exportés `museum-enrichment.schemas.ts:12,16,18,21`), nullable, sans
  inventer une structure de champs qui n'est pas garantie en base.

- **D2 — Le contrat OpenAPI n'expose PAS DU TOUT l'endpoint enrichment aujourd'hui.**
  Le brief affirme « UN seul fichier `openapi.json` (composant de réponse enrichment) ». Or
  `museum-backend/openapi/openapi.json` (6988 lignes) **ne contient ni** le path
  `/api/museums/{id}/enrichment` (ni `/enrichment/status`) **ni** de schéma
  `MuseumEnrichment`/`ParsedOpeningHours` (grep vide). Confirmé côté FE :
  `museum-frontend/features/museum/infrastructure/museumApi.ts:36-90` documente explicitement
  que la vue est **hand-maintained** et appelée via `httpRequest` brut (pas `openApiRequest`),
  parce que « the BE hand-maintained OpenAPI spec ... does not yet expose the
  /enrichment[/status] endpoints ». Donc la chaîne `generate:openapi-types` →
  `shared/api/generated/openapi.ts` **ne produit aujourd'hui aucun type enrichment**.
  → Conséquence de scope : exposer les champs richement-typés côté FE implique soit
  (a) écrire les paths+schémas enrichment dans `openapi.json` puis regénérer et migrer
  `museumApi.ts` vers `openApiRequest`, soit (b) étendre les types hand-maintained de
  `museumApi.ts` à la main (les deux consommateurs `MuseumDetailEnrichment.tsx` et
  `MuseumSheetEnrichmentBody.tsx` lisent ce type). La spec décrit l'exigence de cohérence
  (R3) ; le choix du chemin est une décision de la phase Plan (design).

- **D3 — `currentExhibitions` ne doit pas être seedé (volatile).** Aligné avec le brief.
  Reste `null` → état vide. Aucune fabrication.

---

## 2. Glossaire

| Terme | Définition |
|---|---|
| Enrichment | Données publiques agrégées (Wikidata/Wikipedia/OSM) par musée + locale, cache `museum_enrichment`. |
| `MuseumEnrichmentView` | Projection domaine BE exposée par `GET /api/museums/:id/enrichment` (`enrichment.types.ts:30`). |
| Champs riches | Les 4 colonnes `jsonb` nullable non encore exposées : `admissionFees`, `collections`, `currentExhibitions`, `accessibility`. |
| Skeleton | Placeholder de chargement structuré (formes grises mimant la disposition réelle), distinct d'un simple spinner/texte. |
| État vide gracieux | Message i18n « infos à venir » SANS contenu inventé, quand l'enrichment est résolu mais sans données riches. |
| Worker P3 | `museum-enrichment.worker.ts` — job BullMQ d'auto-fetch async ; ne peuple que summary/website/phone/imageUrl/openingHours. |
| Pipeline auto-fetch | Voie réelle Wikidata/Wikipedia/OSM peuplant l'enrichment via le worker. |
| Seed statique | Lignes `museum_enrichment` insérées par script depuis sources publiques citées (sourceUrls). |
| Vue / FE consumers | `MuseumDetailEnrichment.tsx` (détail) + `MuseumSheetEnrichmentBody.tsx` (sheet) — partagent le type vue. |

---

## 3. Parties prenantes

- **Visiteur B2C (utilisateur final)** — voit le détail musée ; attend une page non-vide,
  un chargement clair, jamais de fausse donnée.
- **Tim (PO)** — a tranché le périmètre le plus large (a+b+c) ; le seed statique réel (d) est
  acceptablement différable si infaisable honnêtement (cf. tâche (d) du brief).
- **Équipe backend** — propriétaire du contrat API + OpenAPI + cache adapter + seed.
- **Équipe frontend** — propriétaire du rendu, du skeleton, de l'i18n 8 locales, des types.
- **QA** — valide via repro l'écran détail (musée avec et sans enrichment riche).
- **DPO/Conformité** — aucune PII ici (données publiques d'établissement) ; pas de blocage GDPR
  spécifique mais l'exigence « jamais de faux contenu » et « sourceUrls cités » reste impérative.

---

## 4. Exigences fonctionnelles (EARS)

### Backend — exposition des champs riches

- **R1** WHEN l'adapter cache mappe une entité `MuseumEnrichment` vers `MuseumEnrichmentView`
  (`typeorm-museum-enrichment-cache.adapter.ts` fn `toView`), THE SYSTEM SHALL inclure
  `admissionFees`, `collections`, `currentExhibitions`, `accessibility`, en lisant les colonnes
  `jsonb` correspondantes de l'entité, et en exposant `null` quand la colonne est `null`.

- **R2** THE SYSTEM SHALL typer ces 4 champs dans `MuseumEnrichmentView`
  (`enrichment.types.ts:30-40`) avec les types issus des schémas Zod
  (`AdmissionFees | null`, `Collections | null`, `CurrentExhibitions | null`,
  `Accessibility | null` — exportés de `museum-enrichment.schemas.ts`), et NE SHALL PAS
  introduire de structure de champs internes non garantie par ces schémas.

- **R3** WHEN la réponse de `GET /api/museums/:id/enrichment` (et `/enrichment/status`) sérialise
  un résultat `ready`, THE SYSTEM SHALL inclure les 4 nouveaux champs dans le payload JSON, et
  le contrat OpenAPI (`museum-backend/openapi/openapi.json`) SHALL décrire ces champs de façon
  cohérente avec la réponse réelle.
  *(Note D2 : le path enrichment est aujourd'hui absent du spec OpenAPI ; la cohérence
  contrat↔réponse exigée ici peut nécessiter d'ajouter le path+schéma — décision Plan.)*

- **R4** WHEN un nouvel enregistrement enrichment est créé/mis à jour par le worker P3
  (`cache.upsert`), THE SYSTEM SHALL préserver le comportement actuel pour les 4 champs riches
  (le worker ne les fournit pas → ils restent `null` à la création, et les valeurs existantes
  ne SHALL PAS être écrasées par `null` lors d'un refresh worker qui ne les fournit pas).
  *(Garde-fou TypeORM `.set/{ field: undefined }` ≠ NULL — cf. CLAUDE.md Pièges connus.)*

### Frontend — affichage conditionnel

- **R5** WHEN l'enrichment résolu contient un champ riche non-`null` (`admissionFees`,
  `collections`, `currentExhibitions` ou `accessibility`), THE SYSTEM SHALL afficher une section
  dédiée correspondante (admission / collections / expositions / accessibilité) dans
  `MuseumDetailEnrichment.tsx`.

- **R6** WHEN un champ riche est `null` ou absent, THE SYSTEM SHALL masquer entièrement la
  section correspondante (pas de titre vide, pas de placeholder mensonger).

- **R7** THE SYSTEM SHALL recalculer `hasRichContent` (`museum-detail.tsx:68-74`) pour inclure
  les nouveaux champs, de sorte que l'état vide (`showEmptyEnrichment`) ne s'affiche QUE lorsque
  aucun contenu (image, summary, horaires, site, tél, ET aucun des 4 champs riches) n'est présent.

### Frontend — skeleton & état vide

- **R8** WHILE l'enrichment est en cours de chargement (`enrichment.status === 'loading'` sans
  donnée encore disponible), THE SYSTEM SHALL afficher un **skeleton de chargement structuré**
  (formes mimant les sections) à la place de l'écran « vide » ou du seul spinner+texte actuel.

- **R9** WHEN l'enrichment est résolu sans aucune donnée riche/de base, THE SYSTEM SHALL afficher
  un **état vide gracieux** via une clé i18n dédiée signifiant « infos à venir » (et NON un
  message d'absence sec percu comme un bug), SANS afficher de contenu inventé.

- **R10** WHEN l'enrichment échoue (`status === 'error'`) sans aucun contenu, THE SYSTEM SHALL
  retomber sur le même état vide gracieux (pas d'écran d'erreur brut, comportement actuel
  `showErrorAsEmpty` conservé).

### i18n

- **R11** THE SYSTEM SHALL ajouter les nouvelles clés i18n (titres de sections admission /
  collections / expositions / accessibilité + libellé de l'état vide « infos à venir ») dans les
  **8 locales** (`fr, en, de, es, it, ja, zh, ar`), avec un FR correct (accents/ligatures), sous
  le namespace `museum.*` cohérent avec les clés existantes (`museum.about`, `museum.opening_hours`,
  `museum.website`, `museum.phone`, `museum.no_extra_info`).

### Seed Bordeaux (tâche d)

- **R12** THE SYSTEM SHALL garantir que les 3 musées démo Bordeaux portent les QID Wikidata
  corrects (Aquitaine `Q3329534`, CAPC `Q2945071`, Cité du Vin `Q16964634`) dans
  `scripts/seed-museums.ts` — **déjà le cas** (`seed-museums.ts:114,124,134`) ; la spec SHALL
  vérifier (non régresser) cet état.

- **R13** IF un seed statique des champs riches est requis pour la démo Bordeaux, THEN THE SYSTEM
  SHALL ne sourcer QUE depuis des sources publiques autoritatives **avec `sourceUrls` cités**, et
  ne SHALL JAMAIS fabriquer de valeur ; AND `currentExhibitions` (volatile) SHALL rester `null`.

- **R14** IF seeder honnêtement les champs riches Bordeaux liés à `museumId` est infaisable dans
  le scope (le worker P3 ne les peuple pas et un seed museumId-lié n'existe pas aujourd'hui),
  THEN THE SYSTEM SHALL s'appuyer sur R1–R11 + les QID (R12) et **différer** le seed statique
  riche, en documentant explicitement la décision (acceptable per brief tâche d).

---

## 5. Exigences non fonctionnelles (NFR)

- **NFR1 — Jamais de faux contenu.** Aucune donnée seedée/affichée ne SHALL être inventée. Champ
  absent ⇒ section masquée / état vide, jamais un placeholder mensonger. Tout seed riche SHALL
  citer ses `sourceUrls`.
- **NFR2 — Contrat OpenAPI cross-stack.** Après modif BE : `pnpm openapi:validate` vert ; côté FE
  `npm run generate:openapi-types` puis `npm run check:openapi-types` vert (types FE re-générés ;
  `shared/api/generated/openapi.ts` jamais édité à la main).
- **NFR3 — Compatibilité du contrat partagé.** Le type vue est consommé par
  `MuseumDetailEnrichment.tsx`, `MuseumSheetEnrichmentBody.tsx`, `useMuseumEnrichment.ts`,
  `useMuseumSheetEnrichmentData.ts`, `useMuseumBranding.ts`, `museumApi.ts`. L'ajout SHALL être
  **purement additif** (champs nullable optionnels) ; aucun test existant BE/FE ne SHALL casser.
- **NFR4 — RTL.** Toute nouvelle UI SHALL utiliser des props logiques (`marginStart/End`,
  `paddingStart/End`, `start/end`, `borderStart/EndWidth`) ; `textAlign:'center'` autorisé,
  jamais `Left/Right`. (CLAUDE.md § Pièges connus RTL.)
- **NFR5 — No-emoji.** Aucune emoji unicode dans `museum-frontend` ; visuels = PNG `require`,
  affordances = Ionicons `@expo/vector-icons`. (CLAUDE.md.)
- **NFR6 — TypeORM nullable update.** R4 SHALL éviter le piège `.set({ field: undefined })`
  (silencieusement skip) — utiliser `() => 'NULL'` si une remise à null est intentionnelle, mais
  R4 demande surtout de NE PAS écraser les valeurs riches sur un refresh worker qui ne les fournit pas.
- **NFR7 — Test discipline.** Tests BE/FE SHALL utiliser les factories DRY partagées
  (`tests/helpers/<module>/*.fixtures.ts` BE ; `__tests__/helpers/factories/*` FE) ; aucun objet
  inline `as Type`. (docs/TEST_FACTORIES.md.)
- **NFR8 — Pas de PII / GDPR.** Données d'établissement publiques uniquement ; aucune donnée
  personnelle introduite.
- **NFR9 — i18n complétude.** Les 8 locales SHALL avoir toutes les nouvelles clés (pas de clé
  manquante → fallback en/raw interdit en livraison) ; FR sans faute.
- **NFR10 — UFR-021 (couverture écran).** `app/(stack)/museum-detail.tsx` est une route Expo
  user-facing modifiée. Un flow Maestro la couvre déjà : `.maestro/museum-branding-detail.yaml`
  (en-tête `# screen: MuseumDetailScreen`, tap-through home→Museums→détail→Start Chat). La route
  N'est PAS dans `.maestro/coverage-baseline.json`. → UFR-021 satisfait par le flow existant ;
  THE SYSTEM SHALL garder ce flow vert. `MuseumDetailEnrichment.tsx` est un sous-composant
  présentationnel (hors scope route) — décision : pas de nouveau flow requis, couverture
  composant via jest. (Décision documentée ici per brief.)

---

## 6. Critères d'acceptation (testables)

- **AC1** `MuseumEnrichmentView` (BE) expose `admissionFees`, `collections`,
  `currentExhibitions`, `accessibility` typés depuis les schémas Zod, nullable ; `tsc --noEmit`
  BE vert.
- **AC2** Pour une entité avec les 4 colonnes peuplées, `toView` retourne les 4 valeurs ;
  pour une entité avec colonnes `null`, retourne `null` sur chacune (test unitaire adapter).
- **AC3** Le payload `ready` de `GET /api/museums/:id/enrichment` contient les 4 champs ;
  `pnpm openapi:validate` vert ; le contrat OpenAPI décrit la réponse de façon cohérente
  (test contrat OpenAPI si la réponse est ajoutée au spec).
- **AC4** Côté FE, `npm run check:openapi-types` vert ; `npx tsc --noEmit` FE vert.
- **AC5** `MuseumDetailEnrichment.tsx` rend une section admission/collections/expositions/
  accessibilité **uniquement** quand le champ correspondant est non-`null` ; masque la section
  sinon (test jest composant, données présentes vs absentes).
- **AC6** Pendant `loading` sans donnée, l'écran rend un skeleton (présence d'un `testID` skeleton
  vérifiable), pas l'état vide ni le seul spinner+texte (test jest).
- **AC7** Enrichment résolu sans aucune donnée ⇒ état vide gracieux via la clé i18n « infos à
  venir » (test jest + clé présente dans les 8 locales).
- **AC8** Les nouvelles clés i18n existent dans les 8 fichiers `shared/locales/*/translation.json`
  (test/lint i18n FE vert) ; FR correct.
- **AC9** Aucun test BE/FE existant ne casse : `cd museum-backend && pnpm lint` + suite jest
  enrichment/museum verte ; `cd museum-frontend && jest museum/MuseumDetail` + eslint des fichiers
  touchés verts (vérif élargie au-delà du scope du fix car contrat partagé — cf. NFR3).
- **AC10** Les QID Bordeaux dans `seed-museums.ts` restent corrects (Q3329534/Q2945071/Q16964634).
- **AC11** Si un seed riche est ajouté, chaque valeur est traçable à un `sourceUrl` public cité et
  `currentExhibitions` est `null` ; sinon, la décision de différer le seed est documentée dans le
  rapport de run. AND aucune valeur fabriquée n'apparaît en base/affichage.
- **AC12** Le flow Maestro `museum-branding-detail.yaml` reste valide (référence `# screen:` +
  tap-through inchangés).

---

## 7. Fichiers concernés (scope)

### Backend
- `museum-backend/src/modules/museum/domain/enrichment/enrichment.types.ts` (R2 — vue + types riches)
- `museum-backend/src/modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter.ts` (R1, R4 — `toView`/`applyViewToEntity`/`upsert`)
- `museum-backend/src/shared/db/jsonb-schemas/museum-enrichment.schemas.ts` (référence types ; export `AdmissionFees`/`Collections`/`CurrentExhibitions`/`Accessibility` déjà présents)
- `museum-backend/openapi/openapi.json` (R3 — réponse enrichment ; path possiblement à ajouter, cf. D2)
- `museum-backend/scripts/seed-museums.ts` (R12 — vérif QID, non-régression)
- `museum-backend/scripts/seed-knowledge.ts` (R13/R14 — seed statique riche éventuel, museumId-lié, sourceUrls)
- Tests BE : `tests/.../enrichment/*` (adapter, use-case, contrat OpenAPI), factories `tests/helpers/museum/*`

### Frontend
- `museum-frontend/features/museum/infrastructure/museumApi.ts` (D2 — types vue ; migration vers `openApiRequest` ou extension hand-maintained)
- `museum-frontend/features/museum/ui/MuseumDetailEnrichment.tsx` (R5–R10 — sections, skeleton, état vide)
- `museum-frontend/app/(stack)/museum-detail.tsx` (R7, R8 — `hasRichContent`, gating skeleton)
- `museum-frontend/features/museum/application/useMuseumEnrichment.ts` (type vue — additif)
- `museum-frontend/shared/api/generated/openapi.ts` (généré — NE PAS éditer ; régénéré via script)
- `museum-frontend/shared/locales/{fr,en,de,es,it,ja,zh,ar}/translation.json` (R11 — clés `museum.*`)
- Tests FE : `__tests__/hooks/useMuseumEnrichment.test.ts`, `__tests__/features/museum/useMuseumSheetEnrichmentData.test.ts`, nouveau test composant `MuseumDetailEnrichment`, factories `__tests__/helpers/factories/*`
- `museum-frontend/.maestro/museum-branding-detail.yaml` (NFR10 — garder vert, pas de modif attendue)

### Consommateurs partagés à NE PAS casser (NFR3)
- `museum-frontend/features/museum/ui/MuseumSheetEnrichmentBody.tsx`
- `museum-frontend/features/museum/application/useMuseumSheetEnrichmentData.ts`
- `museum-frontend/features/museum/application/useMuseumBranding.ts`

---

## 8. Hors scope

- Modifier le worker P3 pour qu'il auto-fetche les 4 champs riches depuis Wikidata/Wikipedia
  (gros chantier d'agrégation ; non demandé). La spec se limite à exposer ce qui est/serait en base.
- `currentExhibitions` seedé (volatile, D3).
- Toute donnée fabriquée (NFR1).
- Refonte du `MuseumSheet` au-delà de la non-régression de contrat (NFR3).
- Édition manuelle de `shared/api/generated/openapi.ts`.
