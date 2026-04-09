# Sprint 5 — Scale + Polish

> ⚠️ **STATUS**: NOT STARTED — planning doc only, 0 code.
>
> **Duree**: 2 semaines | **Priorite**: Post-traction | **Dependances**: S3, S4

## Goal

Routes IA, offline, Year in Culture, SEO walk pages, Universal Links.

## User Stories

| ID | Story | Critere d'acceptation |
|----|-------|----------------------|
| S5-01 | Route IA generee | "J'ai 3h pres du Louvre" → walk optimise |
| S5-02 | Walk offline | Telecharger walk: tuiles, route, contexte, audio |
| S5-03 | Year in Culture | Resume annuel "Spotify Wrapped" culturel |
| S5-04 | Streak mensuel | 1 action/mois = streak |
| S5-05 | Badges educatifs | 5-8 badges avec micro-histoires |
| S5-06 | Pages SEO /walks/[city] | Schema.org TouristTrip |
| S5-07 | Universal Links | AASA + assetlinks configures |

## Taches Techniques

### Walk Phase C: Routes IA (3j)
- [ ] `POST /api/walks/generate` — LLM genere parcours optimise
- [ ] Table walk templates + seed 3-5 routes curated
- [ ] Frontend: UI "Generate Walk" avec inputs temps/theme

### Offline (2j)
- [ ] Pre-cache route GeoJSON + contexte IA + audio TTS
- [ ] Tile caching Leaflet WebView
- [ ] Detection offline + degradation gracieuse

### Retention (2j)
- [ ] Year in Culture aggregation endpoint + UI shareable
- [ ] Monthly streak tracking + display
- [ ] Badge definitions + award logic + display grid

### SEO (1j)
- [ ] museum-web: `/walks/[city]` pages dynamiques
- [ ] Schema.org TouristTrip structured data
- [ ] Universal Links: AASA + assetlinks.json

## Definition of Done
- [ ] Routes IA (feature flag) | Offline download + playback
- [ ] Year in Culture shareable | Streaks + badges
- [ ] /walks/[city] SEO pages live | Universal Links
- [ ] Lighthouse CI (perf >90, a11y >90)
