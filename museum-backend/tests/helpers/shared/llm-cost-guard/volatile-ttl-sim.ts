export interface KeyWithTtl {
  key: string;
  ttl: number;
}

export function simulateVolatileTtlEviction(
  seed: readonly KeyWithTtl[],
  evictCount: number,
): string[] {
  const sorted = [...seed].sort((a, b) => a.ttl - b.ttl);
  const n = Math.max(0, Math.min(evictCount, sorted.length));
  return sorted.slice(0, n).map((entry) => entry.key);
}
