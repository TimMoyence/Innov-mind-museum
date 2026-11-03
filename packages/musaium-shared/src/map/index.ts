export interface RasterMapStyle {
  version: 8;
  glyphs: string;
  sources: {
    'osm-raster': {
      type: 'raster';
      tiles: string[];
      tileSize: number;
      attribution: string;
      minzoom: number;
      maxzoom: number;
    };
  };
  layers: { id: string; type: 'raster'; source: string }[];
}

export const OFFLINE_MAP_STYLE_PATH = '/maplibre/cartodb-raster-style.json';

const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'] as const;

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/">CARTO</a>';

export function buildRasterMapStyle(isDark: boolean): RasterMapStyle {
  const flavor = isDark ? 'dark_all' : 'light_all';
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'osm-raster': {
        type: 'raster',
        tiles: CARTO_SUBDOMAINS.map(
          (sub) => `https://${sub}.basemaps.cartocdn.com/${flavor}/{z}/{x}/{y}.png`,
        ),
        tileSize: 256,
        attribution: ATTRIBUTION,
        minzoom: 0,
        maxzoom: 19,
      },
    },
    layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster' }],
  };
}
