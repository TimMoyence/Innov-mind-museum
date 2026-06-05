# Tasks — QA-06 : Détail musée riche

> Phase 2 (Plan). Tâches ordonnées, granularité **commit-séparé**. Suit l'ordre
> back → front de `design.md` §5. Chaque tâche cite ses critères d'acceptation (AC) de
> `spec.md` §6 et son exigence (R*/NFR*). Workflow fresh-context 5-phase : chaque tâche
> code passe Red (test qui fail) → Green (impl) → vérif. Le Tech Lead (orchestrateur)
> commite ; l'éditeur édite + vérifie.
>
> **Garde-fous transverses** : `git diff --stat <fichier>` après chaque édition (vérité =
> git, pas « updated successfully »). `jest --clearCache` avant chaque run jest.
> `gitnexus_impact` AVANT d'éditer un symbole partagé (R-H). Arbre principal, pas de
> commit par l'éditeur.

---

## Bloc A — Backend : exposer les 4 champs riches

### A1. (RED+GREEN) Étendre `MuseumEnrichmentView` avec les 4 champs Zod-inférés
- **Fichier** : `src/modules/museum/domain/enrichment/enrichment.types.ts`
- **Quoi** : importer `AdmissionFees | Collections | CurrentExhibitions | Accessibility`
  depuis `@shared/db/jsonb-schemas/museum-enrichment.schemas` ; ajouter les 4 champs
  nullable à l'interface (cf. design §3.1).
- **Impact** : `gitnexus_impact({target:'MuseumEnrichmentView', direction:'upstream'})`
  AVANT — rapporter blast radius. Tous les constructeurs de la vue cassent → A2/A3/A5.
- **AC** : AC1 (`tsc --noEmit` BE ne compile pas encore car constructeurs incomplets →
  attendu, corrigé A2/A3). **R1, R2.**
- **Commit** : `feat(museum): expose admission/collections/exhibitions/accessibility on MuseumEnrichmentView`
  (groupé avec A2+A3+A5 car le contrat type ne compile pas isolément — un seul commit
  cohérent BE-domaine).

### A2. (GREEN) Worker `buildEnrichmentView` — ajouter les 4 champs `: null`
- **Fichier** : `src/modules/museum/adapters/primary/museum-enrichment.worker.ts` (l.149-163)
- **Quoi** : ajouter `admissionFees: null, collections: null, currentExhibitions: null,
  accessibility: null` dans l'objet retourné (le worker ne les fetch pas — R4).
- **AC** : `museum-enrichment.worker.test.ts` reste vert. **R4.**

### A3. (RED+GREEN) Adapter `toView` mappe les 4 champs + `applyViewToEntity` préserve
- **Fichier** : `…/secondary/enrichment/typeorm-museum-enrichment-cache.adapter.ts`
- **Quoi** :
  - `toView` (l.141-158) : mapper les 4 colonnes (`row.admissionFees ?? null` cast type
    Zod) — design §3.2.
  - `applyViewToEntity` (l.122-130) : **NE PAS** assigner les 4 champs (préservation R4).
  - `upsert` INSERT (l.76-79) : garder `…: null` à la création.
- **RED** : étendre `typeorm-museum-enrichment-cache.adapter.test.ts` :
  (i) `toView` retourne les 4 valeurs quand peuplées + `null` quand colonnes null (AC2) ;
  (ii) UPDATE path : un champ riche pré-existant en base N'EST PAS nullifié par un
  refresh worker (vue avec ces champs = null). Factories DRY, pas d'inline `as Type`
  (NFR7) — étendre `makeView` avec les 4 champs (défaut null).
- **AC** : AC2. **R1, R4, NFR6.**

### A4. (RED+GREEN) OpenAPI — paths enrichment + schémas
- **Fichier** : `openapi/openapi.json`
- **Quoi** : ajouter `/api/museums/{id}/enrichment` + `/enrichment/status` (get,
  200 ready + 202 pending + 400/401/404) ; composants `ParsedOpeningDay`,
  `ParsedOpeningHours`, `MuseumEnrichmentView` (4 champs riches =
  `object/nullable/additionalProperties:true`), `MuseumEnrichmentReady`,
  `MuseumEnrichmentPending` — design §3.3.
- **RED** : ajouter dans `tests/contract/openapi/openapi-response.contract.test.ts` une
  assertion `assertMatchesOpenApiResponse` pour le payload `ready` enrichment (200) avec
  les 4 champs non-null + null → prouve que le spec décrit la réponse réelle (AC3).
- **GREEN** : `pnpm openapi:validate` vert.
- **Commit** : `feat(openapi): document /museums/{id}/enrichment[/status] incl. rich JSONB fields`
- **AC** : AC3. **R3, NFR2.**

### A5. (RED) Balayage required-field BE — fixtures/payloads de vue enrichment
- **Fichiers** : `tests/unit/routes/museum-enrichment.route.test.ts` (payloads inline
  l.86-96, 155-164 → ajouter les 4 champs `: null`), tout autre fixture remonté par
  `grep -rn "status: 'ready'" tests/` + `grep -rn "MuseumEnrichmentView" tests/`.
- **Quoi** : compléter chaque construction de vue avec les 4 champs nullable (valeur
  `null`, jamais inventée). Préférer factory partagée si elle existe ; sinon documenter.
- **AC** : la suite BE museum/enrichment recompile et passe (AC9). **NFR3, NFR7.**

> **Vérif Bloc A** : `cd museum-backend` →
> `pnpm jest --clearCache` puis `pnpm test -- --testPathPattern="museum|enrichment|openapi"`
> (lire l'exit code réel, pas un chain `;`) + `pnpm openapi:validate` + `pnpm lint`
> (eslint + test-discipline + `tsc --noEmit`). **Élargir** à la suite museum complète
> (contrat partagé, R-A).

---

## Bloc B — Frontend : types regénérés + migration `museumApi.ts`

> **Dépend de A4 committé** (FE-1 lit `../museum-backend/openapi/openapi.json`).

### B1. (GREEN) Regénérer les types FE
- **Cmd** : `cd museum-frontend && npm run generate:openapi-types`
- **Quoi** : régénère `shared/api/generated/openapi.ts` (NE PAS éditer main). Lire le
  diff : vérifier que `MuseumEnrichmentView.data` porte les 4 champs et n'est pas
  dégénéré (`Record<string,never>`). Si dégénéré → retour A4 ajuster le spec (R-B).
- **AC** : `npm run check:openapi-types` (= regen + `git diff --exit-code`) **vert** (AC4).

### B2. (RED+GREEN) Migrer `museumApi.ts` vers les types générés
- **Fichier** : `features/museum/infrastructure/museumApi.ts`
- **Quoi** : `MuseumEnrichmentView` = `OpenApiResponseFor<'/api/museums/{id}/
  enrichment','get',200>['data']` ; `MuseumEnrichmentResponse` = union 200 ∪ 202 (ou
  hand-shaped additive) ; **conserver** l'export `ParsedOpeningHours` & co (dépendance
  `opening-hours.formatter.ts` — vérifier imports, NFR3) ; **garder** `httpRequest`
  runtime pour 202 (R-C) ; MAJ le commentaire l.36-43 (TODO résolu).
- **RED** : un test type-level ou le `tsc` qui prouve que la vue porte désormais les 4
  champs (ex : test composant B4 qui lit `enriched.admissionFees`).
- **AC** : `npx tsc --noEmit` FE vert ; tests hook `useMuseumEnrichment.test.ts`
  inchangés verts (après B3 fixture). **D2, NFR2, NFR3.**
- **Commit** : `refactor(museum): derive enrichment view types from generated OpenAPI`

### B3. (RED) Fixtures FE — ajouter les 4 champs aux vues inline + factory
- **Fichiers** : `__tests__/hooks/useMuseumEnrichment.test.ts` (`makeEnrichmentView`
  l.44-55 → +4 champs `: null`) ; `__tests__/features/museum/
  useMuseumSheetEnrichmentData.test.ts` (si fixture vue inline) ;
  `__tests__/helpers/factories/*` (ajouter `makeMuseumEnrichmentView({...})` DRY,
  défaut null sur les 4 champs).
- **AC** : tests existants recompilent + passent (AC9). **NFR3, NFR7.**

---

## Bloc C — Frontend : rendu (sections + skeleton + état vide)

### C1. (RED+GREEN) Helper `renderRichField` défensif
- **Fichier** : `features/museum/ui/MuseumDetailEnrichment.tsx` (ou helper colocé
  `features/museum/application/renderRichField.ts` si testé isolément — préférable).
- **Quoi** : `(record: Record<string, unknown> | null) => string[]` (ou
  `{key,value}[]`) — string/number/bool → ligne ; `string[]` → joint `· ` ; null/''/
  objet imbriqué → skip ; `[]` si rien d'affichable (design §1). Jamais `[object Object]`.
- **RED** : test unitaire pur (`__tests__/features/museum/renderRichField.test.ts`) :
  primitives, `string[]`, null skip, objet imbriqué skip, record vide → `[]`.
- **AC** : NFR1. **R5/R6 support.**

### C2. (RED+GREEN) `MuseumDetailEnrichment.tsx` — sections riches + skeleton + état vide
- **Fichier** : `features/museum/ui/MuseumDetailEnrichment.tsx`
- **Quoi** (design §4.2) :
  - 4 sections conditionnelles (admission/collections/exhibitions/accessibilité) via
    `renderRichField` ; section masquée si `[]` (R6).
  - Skeleton structuré `testID="museum-detail-skeleton"` en `loading` (remplace le
    spinner+texte l.169-176). Réutiliser composant skeleton partagé si présent
    (`grep Skeleton shared/ui`) ; sinon shimmer simple. RTL (`marginStart/End`,
    `textAlign:'center'` ok), pas d'emoji (NFR4/NFR5).
  - État vide `testID="museum-detail-empty"` → `t('museum.info_coming_soon')` (remplace
    `museum.no_extra_info` l.178-182).
- **RED** : `__tests__/features/museum/MuseumDetailEnrichment.test.tsx` (nouveau) :
  (i) section admission visible si `admissionFees` non-null, masquée si null (idem 3
  autres) — AC5 ;
  (ii) `loading` → skeleton testID présent, PAS l'état vide — AC6 ;
  (iii) résolu sans data → `info_coming_soon` testID présent — AC7.
  Factory `makeMuseumEnrichmentView` (B3). Pas d'inline `as Type` (NFR7).
- **AC** : AC5, AC6, AC7. **R5, R6, R8, R9, R10, NFR1, NFR4, NFR5.**
- **Commit** : `feat(museum): render rich enrichment sections + loading skeleton + graceful empty state`

### C3. (RED+GREEN) `museum-detail.tsx` — `hasRichContent` inclut les 4 champs
- **Fichier** : `app/(stack)/museum-detail.tsx` (l.68-74)
- **Quoi** : ajouter les 4 champs au OU de `hasRichContent` (design §4.3). Surface de
  props vers `MuseumDetailEnrichment` inchangée.
- **AC** : `showEmptyEnrichment` ne se déclenche que si vraiment rien (R7). Couvert
  transitivement par C2 + le flow Maestro. **R7, R8.**

### C4. (RED+GREEN) i18n — 5 clés × 8 locales
- **Fichiers** : `shared/locales/{fr,en,de,es,it,ja,zh,ar}/translation.json` sous
  `museum.*` : `admission`, `collections`, `exhibitions`, `accessibility`,
  `info_coming_soon` (design §4.4). FR/EN soignés ; 6 autres traduites correctement,
  aucune vide.
- **AC** : `npm run check:i18n` vert (AC8) ; FR correct. **R11, NFR9.**
- **Commit** : `i18n(museum): add rich-section + coming-soon keys (8 locales)`

> **Vérif Bloc B+C** : `cd museum-frontend` → `npx jest --clearCache` puis
> `npm run check:openapi-types` + `npx tsc --noEmit` + `npm run check:i18n` +
> tests ciblés (`museum`, `MuseumDetail`, `useMuseumEnrichment`, `renderRichField`) +
> `eslint` sur les fichiers touchés. Lire chaque exit code. **Élargir** : lancer la
> suite museum FE complète (contrat partagé, R-A).

---

## Bloc D — Seed Bordeaux (R12) + décision R14

### D1. (vérif, lecture seule) QID Bordeaux non régressés
- **Fichier** : `scripts/seed-museums.ts` (l.114/124/134 — Aquitaine Q3329534, CAPC
  Q2945071, Cité du Vin Q16964634).
- **Quoi** : **déjà corrects** (code-vérifié). Aucune modif. OPTIONNEL : test léger
  asserting la présence des 3 QID (verrou non-régression) si le module exporte la liste.
- **AC** : AC10, AC11 (branche « différé documenté »). **R12.**

### D2. (doc) Décision R14 — seed statique riche DIFFÉRÉ
- **Quoi** : consigner dans le rapport de run la décision §6 du design (différer le seed
  museumId-lié, raisons honnêtes UFR-013) — pas de fabrication, état vide gracieux est la
  livraison honnête. Recommandation de suivi = mini-run dédié sourcé.
- **AC** : AC11 (aucune valeur fabriquée ; décision documentée). **R13, R14, NFR1.**

---

## Bloc E — Vérification cross-stack finale (avant handoff Review)

### E1. Gates BE (lire chaque exit code, pas un chain global)
- `cd museum-backend` → `pnpm jest --clearCache`
- `pnpm lint` (eslint + lint:test-discipline + `tsc --noEmit`)
- `pnpm openapi:validate`
- `pnpm test -- --testPathPattern="museum|enrichment|openapi"` (et suite museum élargie)
- `pnpm test:contract:openapi`

### E2. Gates FE (lire chaque exit code)
- `cd museum-frontend` → `npx jest --clearCache`
- `npm run check:openapi-types`
- `npx tsc --noEmit`
- `npm run check:i18n`
- tests `museum` / `MuseumDetail` / `useMuseumEnrichment` / `renderRichField`
- `eslint` sur les fichiers touchés

### E3. UFR-021 / Maestro
- Confirmer `.maestro/museum-branding-detail.yaml` inchangé et toujours valide (header
  `# screen: MuseumDetailScreen`, tap-through `Start Chat Here` → `chat-input`). Aucune
  nouvelle entrée `coverage-baseline.json`. **AC12, NFR10.**

### E4. gitnexus detect_changes
- `gitnexus_detect_changes()` avant handoff : vérifier que le scope des symboles
  modifiés correspond à l'attendu (vue enrichment, toView, buildEnrichmentView, écran
  détail). **R-H.**

---

## Découpage commits (proposé)

1. `feat(museum): expose rich JSONB fields on MuseumEnrichmentView + map in cache adapter`
   (A1 + A2 + A3 + A5 — cohérent BE domaine/adapter/worker/fixtures).
2. `feat(openapi): document /museums/{id}/enrichment[/status] incl. rich fields` (A4).
3. `refactor(museum): derive enrichment view types from generated OpenAPI` (B1 regen + B2 + B3).
4. `feat(museum): rich enrichment sections + loading skeleton + graceful empty state`
   (C1 + C2 + C3).
5. `i18n(museum): rich-section + coming-soon keys (8 locales)` (C4).
6. (doc/verif) consigner décision R14 + vérif QID dans le rapport de run (D1/D2) — pas de
   commit code (lecture seule + doc run-state).

> Ordre de merge : 1 → 2 (BE complet) **avant** 3 (FE régénère depuis le spec). 4/5
> ensuite. Chaque commit doit passer ses gates locaux (hooks pre-commit/pre-push, ZÉRO
> bypass — UFR-020).
