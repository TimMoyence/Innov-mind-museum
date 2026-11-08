export declare const HEX_COLOR_PATTERN: RegExp;
export declare const HTTPS_URL_PATTERN: RegExp;
export declare const SLUG_PATTERN: RegExp;
export declare const LATITUDE_RANGE: {
    readonly min: -90;
    readonly max: 90;
};
export declare const LONGITUDE_RANGE: {
    readonly min: -180;
    readonly max: 180;
};
export declare function isLatitude(value: number): boolean;
export declare function isLongitude(value: number): boolean;
export declare function isHexColor(value: string): boolean;
export declare function isHttpsUrl(value: string): boolean;
export declare function isSlug(value: string): boolean;
export declare function pickContrastingTextColor(hex: string): string;
