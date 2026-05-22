# ADR-059 — Connectivity single source of truth + `onlineManager` bridge as a `queryClient.ts` module side-effect

**Status:** Accepted — implemented
**Date:** 2026-05-21
**Deciders:** /team cycle `2026-05-21-connectivity-offline-first` (APPROVED, weightedMean 90.2)
**Implemented in:** this cycle's commit (museum-frontend, FE-only)
**Source preserved:** Full design rationale lives in `.claude/skills/team/team-state/2026-05-21-connectivity-offline-first/design.md` (decisions D1–D9) + `STORY.md` (phase journal). This ADR records only the two cross-cutting architectural choices worth surfacing outside the run folder.

---

## Context

`museum-frontend` carried **four divergent notions of "online"** (audit TD-14 / TD-NI-01/02 / TD-OM-01):

- `ConnectivityProvider.tsx` coerced `isConnected ?? true` — a `null` (undetermined) interface was silently treated as online.
- `useMuseumPrefetch.ts` gated on `type !== 'wifi'` and ignored `isInternetReachable` (captive-portal blind).
- `useOfflineQueue.ts` derived `isOffline = !isConnected` on the coerced boolean.
- TanStack Query's `onlineManager` was **never wired** to NetInfo (0 app hits). `refetchOnReconnect: true` and `networkMode: 'online'` were therefore dead on device — no offline→online self-heal. The `queryClient.ts` comment claiming "mobile uses an explicit AppState listener" was misleading (that listener is auth-token-refresh only).

Offline-first is a pre-V1 requirement. The four notions needed collapsing into one canonical predicate, and `onlineManager` needed a real subscription. Two design questions had non-obvious answers worth recording: (1) where the single canonical online signal lives, and (2) where/how the NetInfo→`onlineManager` bridge is installed.

## Decision

**1. One pure predicate as the single source of truth.** `shared/infrastructure/connectivity/isOnline.ts` exports `isOnline(state: ConnectivityState): boolean` — a pure function (no NetInfo/React import) over `{ isConnected, isInternetReachable }` (each `boolean | null | undefined`). The shipped formula is `isConnected !== false && isInternetReachable !== false` (online-optimistic on `null`/`undefined` to avoid blocking cold-start queries; `isInternetReachable === false` forces offline even on an undetermined interface). All five consumers — `onlineManager` bridge, `ConnectivityProvider` (now tri-state, `?? true` dropped), `useMuseumPrefetch`, `useOfflineQueue`, chat replay via `useChatSession` — route through this predicate. No consumer re-implements `!isConnected` / `?? true`.

**2. The NetInfo→`onlineManager` bridge is installed once as a module side-effect in `shared/data/queryClient.ts` (`installOnlineManagerBridge()` at module scope, line 16), NOT a `_layout.tsx` `useEffect`.** `queryClient.ts` is imported before any provider renders and a module is evaluated exactly once, so the bridge is guaranteed installed before any query can run and cannot remount (StrictMode double-invoke / fast-refresh). The installer is idempotency-guarded and returns its unsubscribe for tests. `ConnectivityProvider` keeps its own NetInfo listener (it renders last-known state into React; `onlineManager` is not a React store) — two listeners on the **same** NetInfo global singleton, no extra native cost.

A single global `<OfflineBanner>` (`GlobalOfflineBannerHost`, mirroring `PaywallModalHost`) is mounted in `app/_layout.tsx` under both `ConnectivityProvider` and `DataModeProvider`; the chat-local banner is removed. `dataModeStore` gains `_hydrated` + `onRehydrateStorage` (runtime-only, excluded from `partialize`), shape-identical to `userProfileStore`.

## Consequences

### Positive
- One predicate, one bridge, five consumers — DRY at the predicate layer; `grep` confirms zero residual `?? true` / `!isConnected` in the connectivity dir.
- `refetchOnReconnect` / `networkMode:'online'` now self-heal on device (TD-OM-01 closed).
- Offline feedback is uniform across all screens (TD-14 step 1).
- Pure predicate is trivially unit-testable over the full truth table; no React/NetInfo in the test path.

### Negative / accepted
- **The module side-effect runs the REAL `NetInfo.addEventListener` at import time.** Any test importing `queryClient.ts` without a NetInfo mock crashes (this regressed 4 previously-green, unmodified suites mid-cycle — `queryClient.test.ts`, `resetPersistedCache.test.ts`, `queryClient-filter.test.ts`, `AuthContext.test.tsx`). This is the documented eager-native-subscription anti-pattern (CLAUDE.md). **Mitigation kept production-faithful:** the official `@react-native-community/netinfo/jest/netinfo-mock.js` is registered globally via `jest.config.js` `setupFilesAfterEnv` (`__tests__/helpers/setup-netinfo-mock.ts`) — `queryClient.ts` is UNCHANGED, per-file `jest.mock` still wins. Matches netinfo `LESSONS.md` TD-NI-04.
- Global banner shows offline state without the chat-queue `· N pending` suffix (count is chat-scoped). Accepted for V1 (offline state is surfaced; queue still drains).

### Neutral
- FE-only: no BE / OpenAPI / web changes, no new native dep (NetInfo stays 11.5.2), no migration.

## Alternatives considered
- **Install the bridge in a `_layout.tsx` `useEffect`.** Rejected: runs after first render (a query firing during initial render misses the online state) and re-runs on layout remount (StrictMode / fast-refresh). Module scope wires it "ONCE at app bootstrap" (react-query `PATTERNS.md:174`, netinfo `PATTERNS.md:161`).
- **Route `DataModeProvider`'s `useNetInfo()` through the connectivity context too.** Rejected (D3): it needs `type` + `cellularGeneration` + `isConnectionExpensive`, which would force the binary connectivity context to widen to the full `NetInfoState`, leaking data-mode concerns. It reads the same NetInfo singleton anyway — share the predicate, not the subscription.
- **Lazy-init the bridge / guard NetInfo in production** to dodge the test-env crash. Rejected: would alter production boot ordering to fix a test-only problem; the correct fix is a test-env global mock.

## References
- `.claude/skills/team/team-state/2026-05-21-connectivity-offline-first/design.md` — decisions D1–D9 (truth table, signatures)
- `museum-frontend/shared/infrastructure/connectivity/isOnline.ts`, `onlineManagerBridge.ts`, `ConnectivityProvider.tsx`, `GlobalOfflineBannerHost.tsx`
- `museum-frontend/shared/data/queryClient.ts:16` — bridge install
- `museum-frontend/__tests__/helpers/setup-netinfo-mock.ts` + `jest.config.js` `setupFilesAfterEnv`
- TD-OM-01, TD-NI-01, TD-NI-02, TD-14 (steps 1–3) — `docs/TECH_DEBT.md` (closed by this cycle); TD-NI-03 (iOS AppState refresh) + TD-NI-04 (test-mock refactor) remain deferred (D6)
- ADR-025 — state-management governance (mobile); ADR-055 — `PaywallModalHost`/`GlobalOfflineBannerHost` host pattern precedent
- CLAUDE.md § "Pièges connus" — eager-native-subscription anti-pattern; UFR-015 (no feature flags pre-launch → hard-flip rollback)
- lib-docs: netinfo `PATTERNS.md` (142/161/173/223), react-query `PATTERNS.md` (174/191), zustand `PATTERNS.md` (91/132)
