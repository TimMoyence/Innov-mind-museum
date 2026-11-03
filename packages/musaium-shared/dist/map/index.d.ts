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
    layers: {
        id: string;
        type: 'raster';
        source: string;
    }[];
}
export declare const OFFLINE_MAP_STYLE_PATH = "/maplibre/cartodb-raster-style.json";
export declare function buildRasterMapStyle(isDark: boolean): RasterMapStyle;
