"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineDistanceMeters = haversineDistanceMeters;
const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg) => (deg * Math.PI) / 180;
/**
 * Calculates the great-circle distance between two points using the haversine formula.
 *
 * @param lat1 - Latitude of point 1 (degrees).
 * @param lon1 - Longitude of point 1 (degrees).
 * @param lat2 - Latitude of point 2 (degrees).
 * @param lon2 - Longitude of point 2 (degrees).
 * @returns Distance in meters.
 */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
