# Audit: Multi-Museum UX Polish — 2026-04-06

## Executive Summary

**Score global : 7.5/10** — Le module museum est solide et production-ready. Les items de polish sont de vrais items de polish, pas des blockers.

| Axe | Score | Findings |
|-----|-------|----------|
| Visual & Interaction UX | 7/10 | 2 medium, 6 low |
| Accessibility | 6.5/10 | 1 high, 2 medium, 3 low |
| i18n | 9/10 | 1 low |
| Backend UX-impacting | 7.5/10 | 3 medium, 2 low |
| Admin/B2B UX | 6/10 | 2 medium |

**Findings :** 0 critical, 1 high, 9 medium, 12 low
**Fichiers concernes :** 12 frontend, 7 backend, 2 web

---

## Axe 1 — Visual & Interaction UX (7/10)

### Points forts
- Architecture clean : hook `useMuseumDirectory` gere fallback search→directory avec jitter detection (500m)
- Leaflet WebView theme-aware (CartoDB light/dark tiles)
- FlashList performant pour la liste
- Pull-to-refresh natif sur la liste
- `GlassCard` + `LiquidScreen` design system coherent
- Detail screen gere proprement les OSM results (museumId <= 0 → undefined)
- Search state persiste lors du switch list/map (hook au niveau parent)

### Findings

| # | Sev | Finding | Fichier | Effort |
|---|-----|---------|---------|--------|
| F1 | **MEDIUM** | **Pas de transition animee list↔map** — switch instantane, jarring | `museums.tsx:85-101` | S (2h) |
| F2 | **MEDIUM** | **Map vide sans message** — si aucun musee, carte blanche sans guidance | `MuseumMapView.tsx` | XS (30min) |
| F3 | **LOW** | **Pas d'indicateur de recherche en cours** — apres le chargement initial, la recherche met a jour silencieusement | `MuseumDirectoryList.tsx:34-42` | XS (30min) |
| F4 | **LOW** | **Pas d'indication "search this area"** — le pan de la carte relance la recherche sans feedback visuel | `museums.tsx:45-47` | S (1h) |
| F5 | **LOW** | **Map view sans refresh** — pas de pull-to-refresh ni bouton refresh | `MuseumMapView.tsx` | XS (30min) |
| F6 | **LOW** | **Pas de feedback "min 2 chars"** — l'utilisateur tape 1 char, rien ne se passe | `useMuseumDirectory.ts:144` | XS (15min) |
| F7 | **LOW** | **Pas d'animations staggered** — les cards apparaissent d'un bloc | `MuseumDirectoryList.tsx:64-79` | S (1h) |
| F8 | **LOW** | **Navigation dupliquee** — meme router.push params dans `museums.tsx:50-63` et `MuseumMapView.tsx:138-151` | 2 fichiers | XS (15min) |

---

## Axe 2 — Accessibility (6.5/10)

### Points forts
- `MuseumCard` : `accessibilityRole="button"` + `accessibilityLabel={museum.name}`
- `ViewModeToggle` : `accessibilityRole="radiogroup"` + radio items
- Detail screen : tous les boutons ont des accessibilityLabel i18n
- "Start Chat" et "Open in Maps" accessibles

### Findings

| # | Sev | Finding | Fichier | Effort |
|---|-----|---------|---------|--------|
| F9 | **HIGH** | **Map WebView inaccessible** — les markers Leaflet sont invisibles aux screen readers. Aucune alternative | `MuseumMapView.tsx` | M (4h) — ajouter liste accessible en fallback |
| F10 | **MEDIUM** | **Search input sans accessibilityLabel** — champ non identifiable par screen reader | `MuseumDirectoryList.tsx:52` | XS (5min) |
| F11 | **MEDIUM** | **Pas de live region** — les resultats de recherche changent sans annonce VoiceOver | `MuseumDirectoryList.tsx` | S (1h) |
| F12 | **LOW** | **Skeleton loading sans a11y** — pas de `accessibilityLabel="Loading"` | `MuseumDirectoryList.tsx:36-39` | XS (5min) |
| F13 | **LOW** | **Location denied sans role semantique** — texte rouge sans `accessibilityRole="alert"` | `museums.tsx:74-77` | XS (5min) |
| F14 | **LOW** | **Distance badge sans contexte** — juste du texte, pas de hint semantique | `MuseumCard.tsx:44-55` | XS (10min) |

---

## Axe 3 — i18n (9/10)

### Points forts
- 10 cles `museumDirectory.*` couvrant tous les textes user-facing
- Traduites dans 8 locales (en, fr, es, de, it, ja, zh, ar)
- Guided mode : 10+ cles supplementaires toutes traduites
- Interpolation distance correcte (`{{distance}} km`)

### Findings

| # | Sev | Finding | Fichier | Effort |
|---|-----|---------|---------|--------|
| F15 | **LOW** | **ViewModeToggle : accessibilityLabel hardcode** — `"List view"` et `"Map view"` au lieu de `t('...')` | `ViewModeToggle.tsx:35,50` | XS (10min) |

> Note : L'unite "km" hardcodee est acceptable — les 8 locales cibles utilisent le systeme metrique. Le support miles (US/UK) peut etre ajoute plus tard si le marche l'exige.

---

## Axe 4 — Backend UX-impacting (7.5/10)

### Points forts
- Search hybride local DB + Overpass API avec deduplication (100m threshold)
- Cache Overpass 24h, rate limit search 15 req/min/user
- Haversine distance, radius 1-50km avec default 30km
- Validation Zod stricte (lat/lng coherents, radius bounds)
- Flexible resolver ID ou slug pour GET /:idOrSlug
- Fallback Nominatim geocoding pour search par texte seul

### Findings

| # | Sev | Finding | Fichier | Effort |
|---|-----|---------|---------|--------|
| F16 | **MEDIUM** | **Aucune pagination** — `/directory` et `/search` retournent tout d'un coup | `listMuseums.useCase.ts`, `museum.route.ts` | M (3h) — ajouter limit/offset |
| F17 | **MEDIUM** | **Multi-tenancy non enforced** — `req.museumId` defini mais museum endpoints ne filtrent pas par tenant | `museum.route.ts` | S (2h) |
| F18 | **MEDIUM** | **museum_manager pas scope** — un manager voit tous les musees dans admin list | `museum.route.ts:GET /` | S (1h) |
| F19 | **LOW** | **Pas d'index spatial** — radius search = O(n) haversine client-side | `searchMuseums.useCase.ts` | M (PostGIS) — pas urgent au volume actuel |
| F20 | **LOW** | **Config JSONB non type** — `Record<string, unknown>` sans validation | `museum.types.ts:5` | S (1h) — Zod schema |

---

## Axe 5 — Admin/B2B UX (6/10)

### Points forts
- Analytics "Top Museums" dans le dashboard admin web
- Role `museum_manager` defini et supporte dans le systeme
- API Key auth B2B fonctionnel (prefix msk_, HMAC-SHA256, timing-safe)

### Findings

| # | Sev | Finding | Fichier | Effort |
|---|-----|---------|---------|--------|
| F21 | **MEDIUM** | **Pas de page admin museum CRUD** — creation/edition musee uniquement via API | `museum-web/src/app/[locale]/admin/` | M (4h) |
| F22 | **MEDIUM** | **museum_manager sans UI dediee** — role existe mais aucune page specifique | idem | L (8h) — dashboard B2B |

---

## Top 10 Actions Prioritaires — Sprint "UX Polish"

| # | Action | Sev | Effort | Impact |
|---|--------|-----|--------|--------|
| 1 | **A11y : Search input accessibilityLabel** + skeleton + location alert role | MED+LOW | XS (15min) | 3 quick wins a11y |
| 2 | **i18n : ViewModeToggle labels** — remplacer hardcoded par `t(...)` | LOW | XS (10min) | Complete i18n coverage |
| 3 | **UX : Transition animee list↔map** — LayoutAnimation ou Animated crossfade | MED | S (2h) | Feel premium |
| 4 | **UX : Map empty state** — overlay "No museums in this area" sur carte vide | MED | XS (30min) | Elimine confusion carte blanche |
| 5 | **UX : "Search this area" chip** — petit badge apres pan de carte | MED | S (1h) | L'utilisateur comprend le comportement |
| 6 | **A11y : Live region resultats** — `accessibilityLiveRegion="polite"` sur le compteur resultats | MED | S (1h) | Screen readers informes des changements |
| 7 | **A11y : Alternative map accessible** — bouton "View as list" toujours visible + annonce markers | HIGH | M (4h) | Map view utilisable par tous |
| 8 | **Backend : Pagination directory/search** — limit/offset avec default 50 | MED | M (3h) | Scale-ready |
| 9 | **Backend : Tenant scoping museum_manager** — filtrer par req.museumId dans GET / | MED | S (2h) | B2B multi-tenancy correct |
| 10 | **Admin : Page CRUD musees** — table + formulaire create/edit dans admin web | MED | M (4h) | Gestion musees sans API manuelle |

**Effort total estime : ~2-3 jours (items 1-6) + 1 semaine (items 7-10)**

---

## Matrice Effort / Impact

```
         HIGH IMPACT
              |
    [7] A11y  |  [3] Transition  [4] Empty state
    map alt   |  [5] Search area chip
              |  [8] Pagination
              |
LOW ──────────┼────────────── HIGH EFFORT
              |
    [1] Quick |  [10] Admin CRUD
    a11y wins |  [9] Tenant scope
    [2] i18n  |  [22] B2B dashboard
    [6] Live  |
              |
         LOW IMPACT
```

**Quick wins (< 1h, do first) :** F1→#1, F15→#2, F2→#4, F10, F12, F13
**High-value medium effort :** F1→#3, F4→#5, F11→#6
**Strategic (sprint dedié) :** F9→#7, F16→#8, F17/18→#9, F21→#10

---

## Recommandation de Sequencing

### Micro-sprint A — Quick Wins (1 jour)
Items 1, 2, 4 : a11y labels + i18n toggle + map empty state
Resultat : 6 findings resolus, score a11y passe de 6.5 → 7.5

### Micro-sprint B — Interaction Polish (1 jour)
Items 3, 5, 6 : transition animee + "search this area" chip + live region
Resultat : feel premium, 3 findings resolus

### Sprint C — Backend + Admin (3-5 jours)
Items 7, 8, 9, 10 : map accessible + pagination + tenancy + admin CRUD
Resultat : module enterprise-ready, a11y compliant

---

## Fichiers Cles

```
museum-frontend/
├── app/(tabs)/museums.tsx                          ← ecran principal (134L)
├── app/(stack)/museum-detail.tsx                   ← detail musee (278L)
├── app/(stack)/guided-museum-mode.tsx              ← mode guide (199L)
├── features/museum/
│   ├── application/
│   │   ├── useMuseumDirectory.ts                   ← hook central (191L)
│   │   ├── useLocation.ts                          ← permissions GPS
│   │   └── haversine.ts                            ← calcul distance
│   ├── infrastructure/
│   │   ├── museumApi.ts                            ← 3 endpoints API
│   │   └── leafletHtml.ts                          ← builder HTML Leaflet
│   └── ui/
│       ├── MuseumDirectoryList.tsx                 ← liste + search + empty
│       ├── MuseumMapView.tsx                       ← carte WebView Leaflet
│       ├── MuseumCard.tsx                          ← card individuelle
│       └── ViewModeToggle.tsx                      ← toggle list/map

museum-backend/src/modules/museum/
├── domain/
│   ├── museum.entity.ts
│   ├── museum.repository.interface.ts
│   └── museum.types.ts
├── useCase/
│   ├── searchMuseums.useCase.ts                    ← plus complexe (213L)
│   ├── listMuseums.useCase.ts
│   ├── getMuseum.useCase.ts
│   ├── createMuseum.useCase.ts
│   └── updateMuseum.useCase.ts
└── adapters/
    ├── primary/http/museum.route.ts                ← 6 endpoints, RBAC
    └── secondary/museum.repository.pg.ts

museum-web/src/app/[locale]/admin/
├── analytics/page.tsx                              ← "Top Museums" (existant)
└── (manque: museums/page.tsx)                      ← CRUD a creer
```

---

## Definition of Done

- [x] 3 scans (backend + frontend + web) completes
- [x] Findings consolides et cross-valides (code relu manuellement)
- [x] Rapport ecrit dans team-reports/
- [x] Score global calcule (7.5/10)
- [x] Top 10 actions identifiees et priorisees
- [x] Sequencing en micro-sprints propose
