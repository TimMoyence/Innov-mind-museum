"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LONGITUDE_RANGE = exports.LATITUDE_RANGE = exports.SLUG_PATTERN = exports.HTTPS_URL_PATTERN = exports.HEX_COLOR_PATTERN = void 0;
exports.isLatitude = isLatitude;
exports.isLongitude = isLongitude;
exports.isHexColor = isHexColor;
exports.isHttpsUrl = isHttpsUrl;
exports.isSlug = isSlug;
exports.pickContrastingTextColor = pickContrastingTextColor;
exports.HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
exports.HTTPS_URL_PATTERN = /^https:\/\/[^\s]+$/i;
exports.SLUG_PATTERN = /^[a-z0-9-]+$/;
exports.LATITUDE_RANGE = { min: -90, max: 90 };
exports.LONGITUDE_RANGE = { min: -180, max: 180 };
function isLatitude(value) {
    return Number.isFinite(value) && value >= exports.LATITUDE_RANGE.min && value <= exports.LATITUDE_RANGE.max;
}
function isLongitude(value) {
    return Number.isFinite(value) && value >= exports.LONGITUDE_RANGE.min && value <= exports.LONGITUDE_RANGE.max;
}
function isHexColor(value) {
    return exports.HEX_COLOR_PATTERN.test(value);
}
function isHttpsUrl(value) {
    return exports.HTTPS_URL_PATTERN.test(value);
}
function isSlug(value) {
    return exports.SLUG_PATTERN.test(value);
}
const LUMINANCE_PIVOT = 0.22;
const linearise = (channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
function pickContrastingTextColor(hex) {
    if (!isHexColor(hex))
        return '#FFFFFF';
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const luminance = 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
    return luminance > LUMINANCE_PIVOT ? '#000000' : '#FFFFFF';
}
