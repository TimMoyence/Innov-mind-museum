/**
 * Global default mock for `@react-native-community/netinfo`.
 *
 * `shared/data/queryClient.ts` installs the NetInfo -> TanStack Query
 * `onlineManager` bridge as a module side-effect at import time (design §D4 —
 * wired ONCE at bootstrap, can't remount; @tanstack/react-query PATTERNS.md:174).
 * That side-effect calls the real native `NetInfo.addEventListener`, which throws
 * in the Jest (node) environment and crashes any suite that transitively imports
 * `queryClient.ts` (queryClient / resetPersistedCache / queryClient-filter /
 * AuthContext).
 *
 * Registering the officially-shipped Jest mock here in `setupFilesAfterEnv`
 * makes importing `queryClient.ts` harmless everywhere by default. The official
 * mock (§7 of netinfo PATTERNS.md, LESSONS.md TD-NI-04) exposes the full API
 * surface: `addEventListener` returns a no-op unsubscribe and `fetch`/`refresh`
 * resolve a benign "wifi + connected" state — so the bridge install is safe.
 *
 * `jest.mock` is unavailable in `setupFiles` (runs before the framework) so this
 * MUST live in `setupFilesAfterEnv`. Connectivity suites that need a controllable
 * NetInfo declare their own per-file `jest.mock('@react-native-community/netinfo',
 * factory)` — that file-scoped registration takes precedence over this default,
 * so this setup never disturbs them.
 *
 * lib-docs:
 * - @react-native-community/netinfo PATTERNS.md:219-235 (§7 official Jest mock),
 *   LESSONS.md TD-NI-04 (move inline mocks to a global setup using the official mock).
 */
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
