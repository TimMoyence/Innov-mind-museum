/** "lat:48.8606,lng:2.3376" → coords; null on invalid/out-of-range. */
export function parseLocationString(raw?: string): { lat: number; lng: number } | null {
  if (!raw) return null;
  const match = /^lat:([-\d.]+),lng:([-\d.]+)$/.exec(raw.trim());
  if (!match) return null;
  const lat = Number.parseFloat(match[1]);
  const lng = Number.parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
