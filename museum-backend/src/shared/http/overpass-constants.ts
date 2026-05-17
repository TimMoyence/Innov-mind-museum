/**
 * Tried in sequence on failure. Main DE first (fastest but throttles cloud IPs),
 * then Kumi (community-funded), then Austrian non-profit (explicitly no rate limit).
 *
 * @see https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
 */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** Low so worst-case (3 × 6s) stays under VPS nginx gateway timeout (~20s). Real queries < 3s. */
export const DEFAULT_TIMEOUT_MS = 6_000;

/**
 * RESOURCE ADMISSION BUDGET, not a real timeout. Server refuses if N seems insufficient.
 * Empirically (2026-04-10): timeout:25 rejected 504 in ~5s on dense zones; timeout:180
 * (Overpass default) admitted, completes <2s. Counter-intuitive but documented:
 * https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
 */
export const QL_TIMEOUT_SECONDS = 180;

/** OSM Ops requires real contact so admins can reach us if we misbehave. */
export const USER_AGENT = 'Musaium/1.0 (+https://musaium.com; contact@musaium.com)';
