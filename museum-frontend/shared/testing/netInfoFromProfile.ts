import {
  toNetInfoSnapshot,
  type NetInfoSnapshot,
  type NetworkProfile,
} from '@/shared/infrastructure/connectivity/networkProfiles';

export interface SimNetInfoSnapshot extends NetInfoSnapshot {
  readonly isInternetReachable: boolean | null;
}

export function netInfoFromProfile(
  profile: NetworkProfile,
  options?: { online?: boolean },
): SimNetInfoSnapshot {
  const base = toNetInfoSnapshot(profile, options);
  return {
    ...base,
    isInternetReachable: base.isConnected === true,
  };
}
