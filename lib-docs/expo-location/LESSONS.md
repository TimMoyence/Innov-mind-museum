# expo-location — LESSONS (Musaium project gotchas)

Human-edited. Agents append a dated section; never rewrite prior dates.

## 2026-05-20

- **`getCurrentPositionAsync` has no timeout option — race it yourself.** A cold GPS (cold start, indoors, denied A-GPS) can leave the promise pending forever. Musaium wraps it in an 8s `Promise.race` against a sentinel and falls back to the AsyncStorage last-known position (`features/museum/application/useLocation.ts:25-95`). Without this, the map screen spins indefinitely.
- **Permission status is a runtime string, not the TS enum at the call site.** `Location.requestForegroundPermissionsAsync()` resolves `{ status: 'granted' | ... }` typed loosely; comparing to the `PermissionStatus` enum trips `@typescript-eslint/no-unsafe-enum-comparison`. The disable at `useLocation.ts:71` is legitimate — compare to the string literal `'granted'`.
- **Reverse geocoding is a BACKEND concern.** FE forwards raw `{ latitude, longitude }`; `museum-backend/.../location-resolver.ts` + `nominatim.client.ts` resolve city/museum (in-museum 20min cache, city no-cache). Do NOT call `reverseGeocodeAsync`/`geocodeAsync` client-side — it would split the source of truth and double the Nominatim load.
- **Native geofencing is deliberately avoided in V1.** `useGeofencePreCache` does client-side haversine vs `CITY_CATALOG` (500m trigger, `useRef<Set>` de-dupe) instead of `startGeofencingAsync`, because native geofencing needs background ("Always") permission which V1 does not request. TD-42/TD-54 (`cachedGeofenceMode` invalidation + singleton leak, `AddMuseumGeofence` migration) are the BE-side geofence story, separate from this FE pre-cache.
- **V1 ships `locationWhenInUsePermission` only (`app.config.ts:317`).** No `locationAlwaysAndWhenInUsePermission`, no background flags. Adding background/Always pre-launch risks App Store / Play background-location-declaration rejection and over-collects under GDPR. Background is V2 (walking guide) scope.
- **`Accuracy.Balanced` is the right default for museum proximity.** ~100m, battery-friendly, fast fix. `High`/`BestForNavigation` cost battery + slower lock with zero product gain for "which museum am I near".
- **SDK 55: iOS now reports accuracy authorization (full vs reduced) in the permission response.** Reduced-accuracy still returns a usable fix for proximity; only read/branch on it if precision is product-critical (V2 walking nav).
