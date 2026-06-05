# ADR-069 — `GET /api/museums/search` exposes local `id`; OSM picker rows start a generic (museum-context-free) conversation

**Status:** Accepted — implemented
**Date:** 2026-06-01
**Deciders:** product (Tim, Option B tranchée) + /team run `2026-06-01-museum-picker-osm-select` (architect + editor + reviewer fresh-context UFR-022)
**Implemented in:** working tree (not yet committed at ADR authoring time) — `museum-backend/src/modules/museum/useCase/search/searchMuseums.useCase.ts`, `museum-backend/openapi/openapi.json`, `museum-frontend/shared/api/generated/openapi.ts`, `museum-frontend/features/museum/ui/MuseumPickerScreen.tsx`, `museum-frontend/app/(stack)/museums-picker.tsx`, `museum-frontend/.maestro/museum-picker-flow.yaml`
**Related spec/design:** [`spec.md`](../../.claude/skills/team/team-state/2026-06-01-museum-picker-osm-select/spec.md) · [`design.md`](../../.claude/skills/team/team-state/2026-06-01-museum-picker-osm-select/design.md)
**Reviewer JSON (APPROVED 92.85):** [`code-review.json`](../../.claude/skills/team/team-reports/2026-06-01-museum-picker-osm-select/code-review.json)
**Security JSON (PASS):** [`security.json`](../../.claude/skills/team/team-reports/2026-06-01-museum-picker-osm-select/security.json)

---

## Context

Le museum-picker (`museum-frontend/features/museum/ui/MuseumPickerScreen.tsx`) affichait **toujours** « Aucun musée trouvé », même quand `GET /api/museums/search` renvoyait 200 OK avec des lignes réelles. Cause racine vérifiée (spec §1) : le contrat FE↔BE était cassé sur le champ `id`.

- **BE** : l'interface `SearchMuseumEntry` ne déclarait aucun `id`. La projection des entrées `source:'local'` perdait la clé primaire DB (`Museum.id`) en chemin (`LocalMuseumWithCoords` → `fetchLocalMuseumsWithCoords` → `mergeAndDedupe`). Le contrat OpenAPI `/api/museums/search` n'exposait pas d'`id` non plus.
- **FE** : `toPickable()` retournait `null` dès qu'une entrée n'avait pas d'`id` entier `> 0`. Les listes nearby + search appliquant `museums.map(toPickable).filter(non-null)`, **100 % des lignes étaient filtrées** → écran vide systématique. De surcroît, les entrées `source:'osm'` (POI OpenStreetMap, **sans** ligne DB ni `id`) étaient structurellement non-sélectionnables.

Deux directions de fond se posaient et touchent un contrat public + un modèle de sélection durable :

1. **Faut-il exposer `Museum.id` sur le contrat de recherche public ?** (changement de contrat OpenAPI consommé par le mobile via types générés).
2. **Que fait une sélection OSM** (entrée sans `id` DB) ? Démarre-t-elle une conversation, et si oui avec quel contexte ?

L'utilisateur a tranché (**Option B**, non rediscutée) : entrées `local` → conversation **contexte-musée** (`museumId` numérique) ; entrées `osm` → conversation **générique sans contexte musée** ; **OSM non favoritable**.

### Alternatives examinées

| Option | Verdict |
|---|---|
| Ne pas exposer `id`, dériver la sélection locale autrement (slug, match nom+coords) | Rejetée — fragile, non-déterministe, et `Museum.id` est **déjà** exposé publiquement aux utilisateurs authentifiés par `/api/museums/directory` (`museum.route.ts` `id: m.id`). Aucune nouvelle exposition. |
| OSM **non-sélectionnable** (statu quo : lignes OSM jamais rendues) | Rejetée — c'est le bug produit. Le visiteur ne peut pas démarrer de conversation sur un monument/POI hors-musée, ce qui est un cas first-class V1 (CLAUDE.md « dedans ET dehors »). |
| OSM → conversation **avec** un pseudo-museumId / contexte musée fabriqué | Rejetée — il n'existe pas de ligne DB, donc pas de contexte musée réel ; fabriquer un contexte serait mensonger pour l'AI (et créerait une surface d'injection avec le nom OSM externe). |
| OSM **favoritable** via clé alternative (slug / coords) | Rejetée (Option B, KISS) — les favoris restent keyés par `id` DB numérique. Réexaminable en V2 (parcours guidé multi-POI). |
| `onSelect` plat `{ museumId?: number; name; lat?; lng? }` | Rejetée (Q1 design) — non type-exhaustif ; un caller peut oublier de tester la présence de `museumId`. |
| **`onSelect` union discriminée `{ kind:'local'; museumId; name } \| { kind:'osm'; name; lat; lng }`** | **Retenue** — exhaustivité vérifiée par le compilateur (`switch(kind)`). |
| `id` ajouté en **required** dans l'OpenAPI | Rejetée — breaking pour les entrées OSM (qui n'en ont pas) et pour tout consommateur existant. Ajouté en **optional** (jamais dans `required`) = additif, non-breaking. |

---

## Decision

### 1. Contrat public — `GET /api/museums/search` expose `id` optionnel (local-only)

`SearchMuseumEntry` porte désormais `id?: number`, **présent uniquement** sur les entrées `source:'local'` (= `Museum.id`, clé primaire DB), **absent** sur les entrées `source:'osm'`. L'`id` est propagé depuis `repository.findAll()` à travers `LocalMuseumWithCoords` → `fetchLocalMuseumsWithCoords` → la branche local de `mergeAndDedupe`. La branche `osm` construit un littéral **sans** clé `id`.

L'invariant **`'id' in entry === (source === 'local')`** est porté **structurellement** par les deux chemins de construction distincts (local = spread d'un `LocalMuseumWithCoords` `id`-porteur ; osm = littéral explicite sans `id`), pas par une assertion runtime.

Le schéma OpenAPI de l'item search liste `id` (type `integer`) dans `properties` mais **PAS** dans `required` → **additif, non-breaking**. Les types FE générés (`MuseumSearchEntry`) exposent `id?: number` après `npm run generate:openapi-types`.

### 2. Modèle de sélection FE — union discriminée local | osm

`toPickable` produit un `PickableMuseum` :
- entrée `source:'local'` avec `id` entier `> 0` → `kind:'local'`, `museumId = id` ;
- entrée `source:'osm'` (sans `id`) → `kind:'osm'`, **pas** de `museumId`, identité = nom + coordonnées ; **jamais `null`** ;
- entrée directory/favoris sans `id` valide → `null` (régression-guard du chemin favoris inchangé).

`onSelect` / `SelectedMuseum` est une **union discriminée** (`kind:'local'` | `kind:'osm'`). Le handler de tap fait un `switch(kind)` compiler-checked :
- **local** → `addFavourite(museumId)` + `onSelect(local)` ; le caller (`museums-picker.tsx`) appelle `startConversation({ museumMode:true, museumId, museumName })` → **conversation contexte-musée**.
- **osm** → `onSelect(osm)` **sans** `addFavourite` ; le caller appelle `startConversation({ skipSettings:true })` **sans** `museumId`/`museumName` → **conversation générique sans contexte musée**.

`testID` des lignes : local `museum-picker-row-<id>` ; osm `museum-picker-row-osm-<osmKey>` où `osmKey = lat.toFixed(5):lng.toFixed(5)` (jamais `-undefined`, jamais de collision).

`POST /api/chat/sessions` accepte déjà `museumId` optionnel (`chat-session.route.ts`) ; aucune modification backend de chat requise.

---

## Consequences

### Positifs
- Le picker rend enfin des lignes sélectionnables (local **ET** osm). Feature débloquée (était cassée à 100 %).
- Monuments/POI hors-musée first-class V1 : le visiteur démarre une conversation générique depuis un POI OSM.
- Union discriminée = `switch(kind)` exhaustif vérifié par le compilateur côté picker **et** côté caller ; les deux chemins ne peuvent pas diverger silencieusement.

### Négatifs / coûts
- Élargissement du contrat `onSelect` : tout futur caller du picker doit gérer les deux variants (compiler le force).
- L'`osmKey` repose sur les coordonnées arrondies à 5 décimales ; deux POI OSM à < ~1 m l'un de l'autre partageraient une clé (cas pathologique, hors scope).

### Neutres / non affectés
- **Pas de migration DB** — changement de **projection** uniquement ; `Museum.id` (PK) préexiste. Aucune colonne créée/modifiée.
- **Latence inchangée** — ajout d'un champ scalaire à la projection, zéro requête DB/réseau supplémentaire (NFR spec §5).
- **`mergeAndDedupe`** non refondu — seule la propagation d'`id` sur la branche local est touchée.
- **Sécurité** (security.json PASS) — `id` déjà public via `/directory`, numérique, jamais interpolé dans un prompt ; pas d'IDOR/BOLA (catalogue public `activeOnly`, même modèle de confiance que les favoris pré-existants) ; le nom OSM externe **n'atteint pas** le prompt LLM (la sélection OSM ne passe ni `museumName` ni coords à `startConversation`). `GET /api/museums/search` reste `bearerAuth`.

### Risques
- Si un futur dev ré-introduit un `museumId` fabriqué pour les entrées OSM, l'AI recevrait un faux contexte musée + le nom OSM externe atteindrait le prompt (surface d'injection). Mitigation : `D4` du design vérifie que `useStartConversation` n'auto-détecte PAS de musée quand `autoDetectMuseum` est `undefined` (bloc detect skippé) ; tests composant + reviewer (`code-review.json` correctness 95) gardent l'invariant OSM = générique.
- L'assertion Maestro tape la **ligne d'index 0** en supposant que les lignes locales trient en premier (le BE pré-trie par distance) — fragile si un POI OSM plus proche dépassait un jour tous les locaux (NIT reviewer, hors scope ; couverture UFR-021 cible = ligne locale).

---

## Verification

- **Gates** : verify PASS (lint + tsc + tests + detect_changes) ; security PASS (semgrep `p/owasp-top-ten` exit 0, 0 résultat ; analyse manuelle LLM-injection — ruleset `p/llm-security` 404 upstream, déviation déclarée) ; review APPROVED **92.85** (correctness 95 / security 92 / maintainability 93 / testCoverage 92 / docQuality 90).
- **Frozen-test** PASS — les 5 fichiers de test manifestés byte-identiques (sha256) au `red-test-manifest.json`.
- **Tests** : BE unit `searchMuseums-id` 3/3 + contract OpenAPI `museum-search-id` 2/2 ; FE 346 suites / 3589 tests verts (toPickable local/osm/directory-null ; tap-local favourite+onSelect ; tap-osm no-favourite no-museumId ; empty-state ; testID OSM déterministe).
- **R14 (Maestro)** : PASS-ENV-GATED — `museum-picker-flow.yaml` tape la ligne locale puis assert `chat-input` ; exécution runtime iOS-sim + seed env-gated (caveat entrée déterministe UFR-021), non lancée dans ce run.

---

## References

- Spec — [`spec.md`](../../.claude/skills/team/team-state/2026-06-01-museum-picker-osm-select/spec.md) §1–§9 (R1–R14)
- Design — [`design.md`](../../.claude/skills/team/team-state/2026-06-01-museum-picker-osm-select/design.md) D1–D6
- Reviewer JSON (APPROVED 92.85) — [`code-review.json`](../../.claude/skills/team/team-reports/2026-06-01-museum-picker-osm-select/code-review.json)
- Security JSON (PASS) — [`security.json`](../../.claude/skills/team/team-reports/2026-06-01-museum-picker-osm-select/security.json)
- STORY — [`STORY.md`](../../.claude/skills/team/team-state/2026-06-01-museum-picker-osm-select/STORY.md)
- Related — [ADR-035](ADR-035-knowledge-base-wikidata.md) (museum-context knowledge prompts), [ADR-061](ADR-061-i-sec8-artwork-knowledge-not-multi-tenant.md) (global catalogue trust model), CLAUDE.md « dedans ET dehors » NorthStar + AI Safety (sanitization des champs user-controlled dans le prompt).
