import fs from 'node:fs';
import path from 'node:path';

import { buildOsmRasterStyle } from '@/features/museum/infrastructure/mapLibreStyle';
import { OFFLINE_STYLE_URL } from '@/features/museum/infrastructure/mapStyleUrl';

// Path resolution: this file lives at
//   museum-frontend/__tests__/features/museum/mapStyleUrl.test.ts
// repo root is 4 levels up from __dirname (museum/ → features/ → __tests__/ → museum-frontend/ → repo root).
const STYLE_JSON_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'maplibre',
  'cartodb-raster-style.json',
);

interface RasterSource {
  type: 'raster';
  tiles: string[];
  tileSize: number;
  attribution: string;
  minzoom: number;
  maxzoom: number;
}

interface MirrorStyle {
  version: number;
  glyphs: string;
  sources: { 'osm-raster': RasterSource };
  layers: { id: string; type: string; source: string }[];
}

const loadMirrorStyle = (): MirrorStyle => {
  const raw = fs.readFileSync(STYLE_JSON_PATH, 'utf8');
  return JSON.parse(raw) as MirrorStyle;
};

describe('OFFLINE_STYLE_URL — self-hosted CartoDB raster mirror (TD-3)', () => {
  it('is an HTTPS URL hosted on GitHub Pages and pointing at cartodb-raster-style.json', () => {
    expect(OFFLINE_STYLE_URL.startsWith('https://')).toBe(true);

    const parsed = new URL(OFFLINE_STYLE_URL);
    expect(parsed.hostname.endsWith('.github.io')).toBe(true);
    expect(parsed.pathname.endsWith('/cartodb-raster-style.json')).toBe(true);
  });
});

describe('docs/maplibre/cartodb-raster-style.json — drift guard against buildOsmRasterStyle(false)', () => {
  const mirror = loadMirrorStyle();
  const online = buildOsmRasterStyle(false);
  const onlineSource = online.sources['osm-raster'] as RasterSource;
  const mirrorSource = mirror.sources['osm-raster'];

  it('matches the StyleSpecification version', () => {
    expect(mirror.version).toBe(online.version);
  });

  it('matches the first raster tile URL pattern (light_all subdomain a)', () => {
    expect(mirrorSource.tiles[0]).toBe('https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png');
    expect(mirrorSource.tiles[0]).toBe(onlineSource.tiles[0]);
  });

  it('matches tileSize, minzoom, maxzoom, attribution', () => {
    expect(mirrorSource.tileSize).toBe(onlineSource.tileSize);
    expect(mirrorSource.minzoom).toBe(onlineSource.minzoom);
    expect(mirrorSource.maxzoom).toBe(onlineSource.maxzoom);
    expect(mirrorSource.attribution).toBe(onlineSource.attribution);
  });

  it('matches layer count and layer 0 type/source', () => {
    expect(mirror.layers).toHaveLength(online.layers.length);
    expect(mirror.layers[0]?.type).toBe('raster');
    expect(mirror.layers[0]?.source).toBe('osm-raster');
  });

  it('mirrors all four CartoDB subdomains (a, b, c, d) in order', () => {
    expect(mirrorSource.tiles).toEqual(onlineSource.tiles);
  });
});
