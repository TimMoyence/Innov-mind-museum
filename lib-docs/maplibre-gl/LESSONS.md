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

---

## 2026-05-20 — re-audit (single consumer `DemoMap.tsx`)

Re-verified against current `DemoMap.tsx`. Version `^5.23.0` resolves to **5.24.0** (latest stable). v6 is PRERELEASE only — no bump. No CVE / Snyk advisory for 5.x.

### ✅ F1 RESOLVED (was HIGH) — default import fixed
- `DemoMap.tsx:5` now uses **named import** `import { Map, Marker } from 'maplibre-gl'` (v5-correct). The v4 default-import gotcha is gone. TD-MGL-01 closed.

### ✅ F2 RESOLVED (was MEDIUM) — error listener wired to Sentry
- `DemoMap.tsx:54-56`: `map.on('error', (e) => Sentry.captureException(e.error ?? …))`. AJAXError no longer silently swallowed. TD-MGL-02 closed.

### ⚠️ F5 LOW : `attributionControl: false` + 20 mock pins — attribution license obligation
- `DemoMap.tsx:49` disables the built-in attribution control on a CartoDB/OSM (ODbL) basemap. Acceptable ONLY because this is a clearly-decorative landing mock (`aria-hidden` overlays, fake search bar). **If this map ever becomes interactive/real, attribution MUST be surfaced** (custom footer/overlay) — ODbL requires visible attribution. Document the exception if kept.

### ⚠️ F3 still LOW : 20 DOM markers — within threshold
- `DemoMap.tsx:58-70`, N=20 inside `'load'`. OK. Threshold to switch to GeoJSON + circle layer + clustering = **>50 points or dynamic data**.

### ✅ Positives (current)
- `'use client'` present (`:1`) ✅ — required for Next App Router.
- CSS import (`:6`) ✅ ; cleanup `map.remove()` (`:73-75`) ✅ ; markers gated behind `'load'` ✅ ; no popups/`setHTML` ✅ ; no top-level WebGL ctx opts ✅.
- Keyless CartoDB style URL (`:39`) — no API key in bundle ✅.

**Verdict: PASS.** No open TD. Only F5 (attribution) is a watch-item tied to the demo staying decorative.
