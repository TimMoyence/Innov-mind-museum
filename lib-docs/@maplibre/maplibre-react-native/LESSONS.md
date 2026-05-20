# Lessons — @maplibre/maplibre-react-native (v11.0.0)

Audit 2026-05-18 : **PASS** — v11 migration fully complete.

## ✅ Zero v10 API residual
- `Map` (NOT `MapView`) ✅ used MuseumMapView.tsx:260
- `GeoJSONSource` (NOT `ShapeSource`) ✅ used MuseumMapMarkers.tsx:49,109
- Unified `<Layer type="circle"|"symbol" .../>` ✅ (no per-type FillLayer/CircleLayer/SymbolLayer residual)
- `data` prop single (NOT `url`/`shape` split) ✅
- `initialViewState` on Camera (NOT `defaultSettings`) ✅
- `center`/`zoom` (NOT `centerCoordinate`/`zoomLevel`) ✅
- `LogManager` (NOT `Logging`) ✅
- `CameraEasing` not abused (only `duration` passed) ✅

## CLAUDE.md gotcha CONFIRMED acceptable (symmetric padding)
- `MuseumMapView.tsx:139-146` : `camera.fitBounds({padding: { top: FIT_PADDING, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING }})` = symmetric → RTL mirroring no-op safe.
- **Follow-up** : si padding ever asymmetric, add `I18nManager.isRTL ? swap` (lib does NOT mirror).

## ✅ Test mocks v11-aligned
- `MuseumMapView.test.tsx:140-196` mocks { Map, Camera, GeoJSONSource, Layer } — zero v10 leakage.

## Status : NO TD entry. Vendor-API gotcha documented above.

---

## 2026-05-20 — re-audit (museum-frontend museum map)

Pinned `11.0.0`; **latest stable `v11.2.1`**. No v11.x release is breaking. Re-verified all consumers.

### ⚠️ F1 LOW→MEDIUM : prod glyphs served from `demotiles.maplibre.org` (rate-limited dev host)
- `mapLibreStyle.ts:22` : `glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'`. This is MapLibre's **dev-only / rate-limited** demo host, shipped in PROD for the cluster-count label font (`Noto Sans Regular`, `MuseumMapMarkers.tsx:76`).
- Risk: at B2B/launch scale the demo host may throttle → cluster labels render blank (no crash, silent). Tiles themselves are fine (CartoDB, keyless).
- **Fix (pre-scale)** : self-host the glyph PBFs or point at a stable provider glyph endpoint. Low urgency for V1 traffic; bump priority before the 3 Bordeaux pilots scale.

### 💡 F2 INFO : bump 11.0.0 → 11.2.1 recommended (non-breaking)
- `11.0.1` = Android GeoJSONSource **memory-usage reduction** — directly relevant (museum map streams all-museums GeoJSON + clusters via `MuseumMapMarkers.tsx`).
- `11.1.0` `hillshade`+`RasterDEMSource`, `11.2.0` `color-relief` — terrain layers useful for **V2 walking-guide** GPS path. No code change required to adopt the bump; new layer types are additive.

### ✅ Confirmed correct (current code)
- v11 names everywhere, zero v10 residual (re-verified `MuseumMapView.tsx`, `MuseumMapMarkers.tsx`). ✅
- **`fitBounds` padding symmetric** (`MuseumMapView.tsx:139-147`, all sides `FIT_PADDING`) → RTL-mirror no-op safe. Codemod-skip still correct. ✅
- **Jest open-handle guard**: `LogManager.start()` skipped under `JEST_WORKER_ID` (`mapLibreBootstrap.ts:31-39`) — prevents worker hang. ✅ (RN analogue of map cleanup.)
- Camera-ref async-population guarded + retried on `onDidFinishLoadingMap` (`:123-133, 227-233`). ✅
- Attribution kept ON (`<Map attribution>` `:272`) + ATTRIBUTION on source (`mapLibreStyle.ts:5-6,28`) — ODbL satisfied. ✅
- Style is keyless inline raster — no API key in bundle. ✅
- OfflineManager errors forwarded to telemetry (`offlinePackManager.ts:128-141`). ✅
- iOS `Pods/` committed (Xcode Cloud) — verified tracked. ✅

**Verdict: PASS.** One watch-item (F1 prod glyph host) + one recommended non-breaking bump (F2).
