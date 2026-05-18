# Lessons — maplibre-gl (v5.23.0)

Audit 2026-05-18 : **CHANGES_REQUESTED** — single source `museum-web/src/components/marketing/DemoMap.tsx`.

## 🚨 F1 HIGH : Default import `import maplibregl from 'maplibre-gl'` — v5 dropped default export
- **Cause** : `DemoMap.tsx:4` uses v4 default import syntax. PATTERNS §4 + §5 : 'No default export' v5.
- **Currently masked** by bundler interop shim → works today, breaks on next TS/bundler bump.
- **Fix TD-MGL-01** : `import * as maplibregl from 'maplibre-gl'` OR named `import { Map, Marker } from 'maplibre-gl'`.

## ⚠️ F2 MEDIUM : No `'error'` listener → silent map blank-out on third-party CDN failure
- **Cause** : `map.on('error', ...)` missing. AJAXError (CORS/DNS/cartocdn fail) silently lost — no telemetry.
- **Fix TD-MGL-02** : `map.on('error', (e) => { if (process.env.NODE_ENV !== 'production') console.warn('[DemoMap]', e.error); });`. Also wire Sentry capture for prod observability.

## ⚠️ F3 LOW : 20 DOM markers in 'load' loop — OK at N=20, document threshold
- For >50 points or dynamic data, prefer GeoJSON source + circle layer (PATTERNS §3 DO clustering).

## ⚠️ F4 LOW : No ResizeObserver → tiles may not re-layout on parent resize
- Optional `new ResizeObserver(() => map.resize()).observe(mapRef.current)` if marketing demo viewport flexibility matters.

## ✅ Positives
- CSS import line 5 ✅
- Sources/layers gated behind 'load' event ✅
- Cleanup via `map.remove()` in useEffect return ✅
- No `setHTML` (XSS-safe) ✅
- No `antialias`/`preserveDrawingBuffer` top-level ✅
