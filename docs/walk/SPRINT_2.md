# Sprint 2 — Walk Phase A: Map + Routes

> ⚠️ **STATUS**: NOT STARTED — planning doc only, 0 code.
>
> **Duree**: 2 semaines | **Priorite**: Post-traction | **Dependances**: S0, S1

## Goal

Ajouter carte interactive avec selection de parcours dans l'onglet Musees.

## Prerequis

- S1 complete | App approuvee et live sur au moins un store
- Premier feedback utilisateurs collecte

## User Stories

| ID | Story | Critere d'acceptation |
|----|-------|----------------------|
| MW-A01 | Voir musees sur carte | Toggle liste/carte dans onglet Musees, markers avec noms |
| MW-A02 | Ma position sur la carte | Blue dot si permission location accordee |
| MW-A03 | Creer un parcours | Selectionner 2-5 musees, route tracee entre eux |
| MW-A04 | Temps et distance | Distance totale (km) + duree estimee affichees |
| MW-A05 | Optimiser l'ordre | Bouton "Optimiser" applique algo nearest-neighbor |
| MW-A06 | Sauvegarder parcours | Route sauvee en AsyncStorage |
| MW-A07 | Preview avant de partir | Walk preview card: titre, duree, stops |

## Taches Techniques

### Infrastructure carte (3j)
- [ ] `npx expo install react-native-webview`
- [ ] `features/museum/infrastructure/leafletHtml.ts` — template HTML Leaflet + OSM tiles
- [ ] `features/museum/ui/MuseumMapView.tsx` — WebView bridge postMessage
- [ ] `features/museum/ui/ViewModeToggle.tsx` — toggle liste/carte
- [ ] Modifier `app/(tabs)/museums.tsx` — toggle state, rendu conditionnel

### Routing (2j)
- [ ] `features/museum/infrastructure/routingApi.ts` — client OSRM
- [ ] `features/museum/application/useWalkRoute.ts` — selection stops, nearest-neighbor, distance
- [ ] `features/museum/infrastructure/walkStorage.ts` — AsyncStorage CRUD routes

### Walk UI (2j)
- [ ] `features/museum/ui/WalkRoutePanel.tsx` — panel bottom
- [ ] `features/museum/ui/WalkPreviewCard.tsx` — preview card resume
- [ ] i18n 8 langues (~15 cles)

### Tests (1j)
- [ ] Unit test nearest-neighbor (pure function)
- [ ] Unit test routingApi (mock fetch)
- [ ] Unit test walkStorage (mock AsyncStorage)

## Definition of Done
- [ ] Toggle liste/carte | Markers | Position user | Route 2-5 musees
- [ ] Distance + duree | Optimisation | Sauvegarde | Preview
- [ ] 6+ nouveaux tests | tsc PASS | lint PASS

## Risques
| Risque | Proba | Impact | Mitigation |
|--------|-------|--------|------------|
| WebView perf vieux Android | Medium | Medium | Max 50 markers, CartoDB light tiles |
| Race condition postMessage | Medium | Medium | Attendre `mapReady` event |
| OSRM rate limit | Low | Low | Debounce + cache AsyncStorage |
