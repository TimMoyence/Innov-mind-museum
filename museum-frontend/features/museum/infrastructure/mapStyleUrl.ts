/**
 * MapLibre's OfflineManager requires a hosted style JSON URL — it downloads
 * the style, walks its sources and caches tiles inside the requested bbox.
 * Our runtime `buildOsmRasterStyle` is an inline style object that is not
 * reachable by URL, so for the offline pack download we reference the
 * MapLibre demotiles style which is API-key-free and close enough to our
 * raster flow (vector sources but same OSM geography). A follow-up ticket
 * will replace this with a self-hosted style that mirrors the exact CartoDB
 * raster layers rendered online.
 */
export const OFFLINE_STYLE_URL = 'https://demotiles.maplibre.org/style.json';
