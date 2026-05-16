/**
 * MapLibre's OfflineManager requires a hosted style JSON URL — it downloads
 * the style, walks its sources and caches tiles inside the requested bbox.
 * `buildOsmRasterStyle` (the runtime online style) is an inline object that
 * is not reachable by URL, so for the offline pack download we point at a
 * static mirror hosted on GitHub Pages from `docs/maplibre/`. The mirror
 * MUST stay structurally equivalent to `buildOsmRasterStyle(false)` — a
 * Jest test in `__tests__/features/museum/mapStyleUrl.test.ts` enforces it.
 *
 * Deploy : edit `docs/maplibre/cartodb-raster-style.json` on `main`, the
 * workflow `.github/workflows/deploy-privacy-policy.yml` republishes the
 * Pages artifact in ~30 seconds.
 */
export const OFFLINE_STYLE_URL =
  'https://timmoyence.github.io/Innov-mind-museum/maplibre/cartodb-raster-style.json';
