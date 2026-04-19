# NL-5 S1 — MapLibre Native Gate Report

**Branch**: `feat/nl5-s1-map-native`
**Worktree**: `../musaium-map-native`
**Date**: 2026-04-19
**Commits**: 10 (see `git log --oneline feat/nl5-s1-map-native ^main`)

---

## Verdict: GO (gate metrics pending physical device run)

The feature is code-complete and architecturally sound. All gate metrics below require a release-mode run on physical devices (iPhone + Android) which must be triggered manually by the owner. The branch is ready to test.

---

## Perf Gate Targets

| Metric | Target | Pixel 6a | iPhone 15 | Verdict |
|---|---|---|---|---|
| FPS P50 pan | >= 55 | — | — | PENDING |
| FPS P5 pan | >= 45 | — | — | PENDING |
| Cluster 200 POIs render | < 100 ms | — | — | PENDING |
| Frame budget zoom | < 16 ms | — | — | PENDING |
| Paris pack z10-16 | info | — | — | PENDING |
| 30min stress crash | 0 | — | — | PENDING |

**How to measure**: `PerfOverlay` HUD is visible in `__DEV__` builds (`expo run:ios --configuration Release` or `expo run:android --variant release` with `__DEV__=true`). Metrics appear in top-right overlay on the Museums map tab.

**If gate FAIL**: stop, do not merge, create `docs/plans/NL5_S1_MAP_NATIVE_DEBT.md` with failing metric + device + hypothesis, leave Leaflet intact, open ticket `TD-MAPLIBRE-RETRY-Q3`.

---

## What Was Built

### Phase 1 — MapLibre Native map (Sprints 1-5)

| File | Role |
|---|---|
| `plugins/withFmtConstevalPatch.js` | Expo config plugin — persists Xcode 26 fmt consteval fix across `prebuild --clean` |
| `features/museum/infrastructure/mapLibreBootstrap.ts` | Singleton init: LogManager + Sentry error routing. Loaded at app root (`app/_layout.tsx`) |
| `features/museum/infrastructure/mapLibreStyle.ts` | `buildOsmRasterStyle(isDark)` — CartoDB Positron/DarkMatter raster style, no API key |
| `features/museum/infrastructure/offlinePackManager.ts` | OfflineManager wrapper: `listPacks`, `hasPack`, `downloadPack`, `deletePackByCity`. CityId-vocabulary |
| `features/museum/infrastructure/cityCatalog.ts` | 5 cities (Paris, Lyon, Bordeaux, Lisbonne, Rome) with WGS84 bbox + centroids. Owns `CityId` type |
| `features/museum/infrastructure/mapStyleUrl.ts` | `OFFLINE_STYLE_URL` constant for OfflineManager tile downloads |
| `features/museum/application/buildMuseumFeatureCollection.ts` | Pure fn: `MuseumWithDistance[]` → `FeatureCollection<Point>` |
| `features/museum/application/useMapStyle.ts` | Application hook: `useMapStyle()` returns `StyleSpecification` keyed to current theme |
| `features/museum/application/generateSyntheticPois.ts` | Deterministic seeded faker, 200 dev-only POIs |
| `features/museum/ui/MuseumMapView.tsx` | **Full rewrite** of Leaflet/WebView → MapLibre Native. Preserves exact prop contract |
| `features/diagnostics/perfStore.ts` | Module-level FPS + render-time store (no React deps) |
| `features/diagnostics/useFpsMeter.ts` | rAF 60-frame ring buffer. True P50 median + P5 (95th-percentile delta) |
| `features/diagnostics/PerfOverlay.tsx` | Dev-only HUD overlay: FPS P50/P5 + cluster render ms |

### Phase 2 — Offline packs + geofence (Sprints 6-7)

| File | Role |
|---|---|
| `features/museum/application/useOfflinePacks.ts` | Per-city pack state (absent/active/complete). Optimistic download + failure revert |
| `features/museum/application/useGeofencePreCache.ts` | Haversine 500m geofence → silent downloadPack. Session-dedup via `triggeredRef` |
| `features/settings/application/useAutoPreCachePreference.ts` | Loads/persists `autoPreCacheEnabled` via SecureStore |
| `features/settings/infrastructure/offlineMapsPreferences.ts` | expo-secure-store wrapper |
| `features/settings/ui/CityPackRow.tsx` | City row: absent/downloading/complete states + Download/Delete |
| `features/settings/ui/OfflineMapsSettings.tsx` | Settings screen: auto pre-cache toggle + city list |
| `app/(stack)/offline-maps.tsx` | Route wrapping `OfflineMapsSettings` |

### Routes / Bootstrap touched

- `app/_layout.tsx` — `@/features/museum/infrastructure/mapLibreBootstrap` side-effect import (moved from `MuseumMapView` for correct layering)
- `app/(tabs)/museums.tsx` — added `useGeofencePreCache({ latitude, longitude })` call (only change)
- `app/(stack)/settings.tsx` — added link to offline-maps route

### Deleted

- `features/museum/infrastructure/leafletHtml.ts` (207L) — no consumers
- `features/museum/infrastructure/webViewNavigation.ts` — no consumers
- `__tests__/infrastructure/leafletHtml.test.ts`
- `tests/museum-webview-navigation.test.ts`

---

## Architecture Decisions

### No addProtocol (PMTiles) in React Native v11

`@maplibre/maplibre-react-native` v11 does not expose `MapLibre.addProtocol()` — the RN bridge uses a different native protocol stack. PMTiles runtime was installed then removed. Tile source: CartoDB raster (same provider as the replaced Leaflet implementation, zero regression).

### Offline tile source mismatch (known debt)

`OFFLINE_STYLE_URL` points to `demotiles.maplibre.org` (vector tiles). The online map renders CartoDB raster. The pack caches demotiles tiles; the online renders CartoDB tiles. These are disjoint. Offline mode for the gate test confirms the download/management flow works; it does not confirm offline tile rendering from the same source. A follow-up ticket (`TD-OFFLINE-STYLE-SELF-HOST`) must host a style JSON that references the CartoDB tile URLs to close this gap before shipping offline mode to users.

### CityId ownership

`CityId` is defined in `cityCatalog.ts` (domain concept). `offlinePackManager.ts` imports it from there. No circular imports.

### Layer discipline (hexagonal)

| Layer | What it does |
|---|---|
| Infrastructure | `offlinePackManager`, `cityCatalog`, `mapLibreStyle`, `mapLibreBootstrap`, `offlineMapsPreferences`, `mapStyleUrl` |
| Application | `useOfflinePacks`, `useGeofencePreCache`, `useMapStyle`, `buildMuseumFeatureCollection`, `useAutoPreCachePreference` |
| UI | `MuseumMapView`, `OfflineMapsSettings`, `CityPackRow`, `PerfOverlay` |

UI components import from Application only. Application imports from Infrastructure. No cross-layer violations remain (resolved in challenge loops 1+2).

---

## Tests

| Suite | Tests |
|---|---|
| `__tests__/components/MuseumMapView.test.tsx` | 6 |
| `__tests__/features/museum/offlinePackManager.test.ts` | 8 (incl. error callback) |
| `__tests__/features/museum/useOfflinePacks.test.tsx` | 5 (incl. download revert + remove revert) |
| `__tests__/features/museum/useGeofencePreCache.test.tsx` | 7 (incl. reportError + triggeredRef dedup) |
| `__tests__/features/settings/offlineMapsPreferences.test.ts` | 4 |
| `__tests__/features/diagnostics/perfStore.test.ts` | 5 |
| `__tests__/features/museum/generateSyntheticPois.test.ts` | 5 |

**Total project**: 137 suites, 1150 tests passing (baseline was 2715 backend + 106 frontend before branch; branch adds frontend tests only).

**Lint**: 0 errors, 22 warnings (all pre-existing baseline).

---

## Open Tickets Post-Merge

| ID | Priority | Description |
|---|---|---|
| `TD-OFFLINE-STYLE-SELF-HOST` | HIGH | Host a style JSON that serves CartoDB raster tile URLs so offline packs cache the same tiles rendered online |
| `NL-5-S2-MAP` | MEDIUM | `@gorhom/bottom-sheet` for museum tap dock + walk composer STEP 4C wiring |
| `NL-5-S3-WALK` | MEDIUM | Geofence 50m museum entry → swap UI (STEP 7), 150m next-stop notif (STEP 6) |

---

## E2E Checklist (run before merge to main)

1. Build release iOS + Android on physical devices
2. Online: Museums tab → navigate Paris, Lyon, Rome → tiles load
3. Manual download: Settings > Offline Maps > Paris → progress bar → complete → airplane mode → map still renders
4. Geofence auto: enable toggle, approach Lyon → download starts silently
5. Pan/pinch 30s → HUD FPS P50 >= 55
6. Tap cluster → zoom animated
7. Tap leaf marker → MuseumSheet opens (unchanged)
8. Dark mode → CartoDB dark tiles
9. VoiceOver → "N points d'interet" on cluster
10. 30min stress → no crash
11. `npm run lint` → 0 errors
12. `npm test` → 1150+ passing
