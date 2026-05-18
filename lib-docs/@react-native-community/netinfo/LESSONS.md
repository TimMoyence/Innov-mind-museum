# Lessons — @react-native-community/netinfo (v11.5.2)

Audit 2026-05-18 : **MOSTLY_COMPLIANT**.

## ⚠️ MEDIUM : `isConnected` null coerced to `true` via `?? true`
- `ConnectivityProvider.tsx:25` defaults null→true → app reports online during undetermined initial probe → premature API calls.
- **Fix TD-NI-01** : propagate `boolean | null` (change context type + default) per PATTERNS §3 DO #2.

## ⚠️ MEDIUM : Prefetch ignores `isInternetReachable`
- `useMuseumPrefetch.ts:39-41` only checks `info.type !== 'wifi'`. PATTERNS §4 DON'T #3 : isConnected alone insufficient — need `isInternetReachable === true` (lib does HTTP probe).
- **Fix TD-NI-02** : gate on isInternetReachable in addition to type.

## ⚠️ LOW : Missing iOS AppState 'active' → `NetInfo.refresh()` bridge
- Stale state risk after WiFi switch in background. PATTERNS §3 DO #3.
- **Fix TD-NI-03** : useEffect in ConnectivityProvider listening AppState.

## ⚠️ LOW : 5x test files inline `jest.mock` (drift risk)
- **Fix TD-NI-04** : move to `jest.setup.ts` using `@react-native-community/netinfo/jest/netinfo-mock.js` + per-test spyOn.

## ✅ Positives
- Canonical default + named imports
- addEventListener cleanup correct (return unsubscribe)
- Pure `resolveDataMode()` separation
- No `state.details.ssid` access (Platform.OS guard would be needed if added)
