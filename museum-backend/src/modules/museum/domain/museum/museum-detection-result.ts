/**
 * W3 (geo + walk + intra-musée) — DetectMuseumUseCase return shape.
 *
 * `confidence` ∈ [0, 1], 2-decimal precision (design.md §D2).
 *   - `1.0`                  → geofence-hit (visitor inside polygon).
 *   - `max(0, 1 - d/500)`    → Haversine fallback ; 0 m → 1, 500 m+ → 0.
 *   - `0` w/ `museumId=null` → no museum within 50 km.
 *
 * `distance` in meters from museum centroid ; `null` only when no museum
 * was found at all.
 *
 * `museumId` / `name` are the matched museum's identity ; both `null` on
 * miss.
 */
export interface MuseumDetectionResult {
  museumId: number | null;
  confidence: number;
  distance: number | null;
  name: string | null;
}
