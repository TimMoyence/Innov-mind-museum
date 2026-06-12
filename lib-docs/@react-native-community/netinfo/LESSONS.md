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

## 2026-05-20

Refresh re-verify (lib-doc-curator, UFR-022). Pinned `11.5.2`. Registry latest **12.0.1**; **v12.0.0 is a BREAKING major** (iOS 14+ / RN 0.76+ min; Wi-Fi API `CNCopyCurrentNetworkInfo`→`NEHotspotNetwork` requiring the Access Wi-Fi Information entitlement). API surface for `fetch`/`addEventListener`/`useNetInfo` unchanged — migration is mostly native config. No advisory forces it; defer the bump to a post-launch native-config window. Pin ≥11.5.2 anyway (monorepo node-resolver fix).

- **🚨 TD-14 STILL OPEN (headline gap)** — `grep onlineManager` across museum-frontend = **0 hits**. TanStack Query's `onlineManager` is NOT wired to NetInfo → no refetch-on-reconnect, mutations not queued offline. Offline-first is PRE-V1. Highest-leverage fix: `onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected === true && s.isInternetReachable !== false)))` once at startup. See PATTERNS §8.
- **TD-NI-01 STILL OPEN** — `ConnectivityProvider.tsx:25` `isConnected: netState.isConnected ?? true` coerces null→true; context type `isConnected: boolean` (line 7) not nullable → reports online during undetermined initial probe → premature API calls. Propagate `boolean | null`, default null (line 12).
- **TD-NI-02 STILL OPEN** — `useMuseumPrefetch.ts:41` gates only on `info.type !== 'wifi'`; ignores `isInternetReachable`. Captive-portal interface still prefetches. Add `isInternetReachable === true`.
- **TD-NI-03 (LOW) STILL OPEN** — no AppState `'active'` → `NetInfo.refresh()` bridge; stale state after background iOS WiFi switch.
- ⚠️ **AMENDED 2026-06-12 (run undefined-network-detection-reliability, INV-24/D-13)** — l'ancien « ✅ DataModeProvider.tsx correct » de cette ligne ratifiait un BUG : utiliser `isConnectionExpensive` pour résoudre le data mode `low` est FAUX. `isConnectionExpensive` = axe COÛT (metered : iOS `_expensive=true` pour TOUT cellulaire 2G comme 5G, `RNCConnectionState.m:47` ; Android `isActiveNetworkMetered()`), JAMAIS un axe QUALITÉ — il ne doit alimenter que des décisions de volume (prefetch, compression upload), jamais la résolution `low`/`normal` (un user 5G plein signal était puni : TTS off, réponses courtes). Restent corrects dans `DataModeProvider.tsx` : `useNetInfo`, check `isConnected === false`, court-circuit cellular gen `2g`/`3g`. `addEventListener` cleanup correct in ConnectivityProvider (returns unsubscribe). No `state.details.ssid` access (avoids the v12 entitlement requirement). No CVE/GHSA.
