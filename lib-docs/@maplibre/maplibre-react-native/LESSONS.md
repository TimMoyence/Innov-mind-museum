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
