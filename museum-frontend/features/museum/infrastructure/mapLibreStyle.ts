import type { StyleSpecification } from '@maplibre/maplibre-react-native';

const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'] as const;

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/">CARTO</a>';

const buildCartoTileUrls = (flavor: 'light_all' | 'dark_all'): string[] =>
  CARTO_SUBDOMAINS.map((sub) => `https://${sub}.basemaps.cartocdn.com/${flavor}/{z}/{x}/{y}.png`);

/**
 * Returns a MapLibre style that renders OpenStreetMap data through the CartoDB
 * Positron (light) or Dark Matter (dark) raster tile set. No API key required,
 * same provider as the legacy Leaflet implementation so geographic detail and
 * labels match 1:1 across the transition.
 *
 * Offline packs created via `OfflineManager.createPack` will cache raster tiles
 * from these URLs on the device sandbox.
 */
export const buildOsmRasterStyle = (isDark: boolean): StyleSpecification => ({
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'osm-raster': {
      type: 'raster',
      tiles: buildCartoTileUrls(isDark ? 'dark_all' : 'light_all'),
      tileSize: 256,
      attribution: ATTRIBUTION,
      minzoom: 0,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-raster-layer',
      type: 'raster',
      source: 'osm-raster',
    },
  ],
});
