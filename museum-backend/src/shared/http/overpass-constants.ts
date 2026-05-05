/**
 * Ordered list of Overpass API endpoints tried in sequence on failure.
 * Main instance first (fastest when it admits the query), community
 * mirrors as fallback chain.
 *
 * - overpass-api.de: main DE instance, fastest but throttles cloud IPs
 * - kumi.systems: community-funded mirror, strong hardware
 * - private.coffee: Austrian non-profit, explicitly no rate limit
 *
 * Source: https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
 */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/**
 * Client-side fetch timeout per endpoint. Kept low so worst-case chain
 * (3 endpoints × 6s) stays under the VPS nginx gateway timeout (≈ 20s).
 * Real queries with [timeout:180] take < 3s in practice.
 */
export const DEFAULT_TIMEOUT_MS = 6_000;

/**
 * Overpass QL `[timeout:N]` directive — acts as a RESOURCE ADMISSION BUDGET,
 * not a real timeout. The server refuses to run the query if N seems
 * insufficient for its internal resource estimate.
 *
 * Empirically (2026-04-10): `timeout:25` was rejected with 504 in ~5s
 * ("query admission denied") on dense zones. `timeout:180` (the Overpass
 * default) is admitted and the query completes in <2s. Counter-intuitive
 * but documented in Overpass commons:
 * https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
 */
export const QL_TIMEOUT_SECONDS = 180;

/**
 * Identifying User-Agent per OSM Operations convention
 * (https://operations.osmfoundation.org/policies/api/).
 * A real contact is required so OSM admins can reach us if we misbehave.
 */
export const USER_AGENT = 'Musaium/1.0 (+https://musaium.com; contact@musaium.com)';
