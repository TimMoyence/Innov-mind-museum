"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OFFLINE_MAP_STYLE_PATH = void 0;
exports.buildRasterMapStyle = buildRasterMapStyle;
exports.OFFLINE_MAP_STYLE_PATH = '/maplibre/cartodb-raster-style.json';
const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'];
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/">CARTO</a>';
function buildRasterMapStyle(isDark) {
    const flavor = isDark ? 'dark_all' : 'light_all';
    return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
            'osm-raster': {
                type: 'raster',
                tiles: CARTO_SUBDOMAINS.map((sub) => `https://${sub}.basemaps.cartocdn.com/${flavor}/{z}/{x}/{y}.png`),
                tileSize: 256,
                attribution: ATTRIBUTION,
                minzoom: 0,
                maxzoom: 19,
            },
        },
        layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster' }],
    };
}
