import type { NetworkProfile } from '@/shared/infrastructure/connectivity/networkProfiles';
import type { QualitySample } from '@/shared/infrastructure/connectivity/networkQuality';

export function qualitySamplesFromProfile(
  profile: NetworkProfile,
  opts?: { count?: number; startAtMs?: number; spacingMs?: number },
): QualitySample[] {
  const count = opts?.count ?? 10;
  const startAtMs = opts?.startAtMs ?? 0;
  const spacingMs = opts?.spacingMs ?? 1000;
  const failCount = Math.round(profile.lossPct * count);

  return Array.from({ length: count }, (_, i): QualitySample => {
    const failed = i < failCount;
    return {
      rttMs: profile.latencyMs,
      ok: !failed,
      timedOut: failed,
      atMs: startAtMs + i * spacingMs,
    };
  });
}
