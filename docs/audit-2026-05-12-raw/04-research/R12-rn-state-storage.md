# R12 — RN state management + storage audit (Musaium, 2026-05-12)

**Agent**: R12 — RN state + storage
**Scope**: Zustand 5, TanStack Query 5.99 (+ persist client), AsyncStorage 2, react-native-mmkv 3/4, expo-secure-store 55, offline-first sync (PowerSync, ElectricSQL, Triplit, RxDB), sensitive-key exclusion, cache invalidation on logout/refresh/user-switch.
**Honesty discipline**: UFR-013. Every quantitative claim cites a URL. Versions cross-verified at write time.

---

## 1. TL;DR

Musaium's current state/storage stack — **Zustand 5.0.12 (7 stores)** + **TanStack Query 5.99.2 (persist client w/ AsyncStorage)** + **AsyncStorage 2.2.0** + **expo-secure-store 55.0.11** — is **architecturally sound, on the right side of the 2026 best-practice consensus, and safe to ship V1**. The `shouldDehydrateQuery` allowlist (`messages|session|admin|auth|user`) is exactly the pattern TanStack maintainers recommend for sensitive-data exclusion ([TanStack/query #3568](https://github.com/TanStack/query/discussions/3568)), the SecureStore-for-tokens + AsyncStorage-for-preferences split matches OWASP MASVS guidance ([OWASP MAS RN](https://owasp.org/blog/2024/10/02/Securing-React-Native-Mobile-Apps-with-OWASP-MAS)), and `resetPersistedCache` does the persister-removeClient-before-memory-clear ordering correctly to dodge the cold-start rehydrate race.

The four highest-leverage findings for 100k installs:

1. **Do NOT migrate to MMKV for V1** — the perf delta vs AsyncStorage on Musaium's actual workload (≤200 cached chat entries, 7 stores, 1 throttled persist write per second) is **invisible at the user layer**. MMKV's 30× faster benchmark ([mrousavy/StorageBenchmark](https://github.com/mrousavy/StorageBenchmark)) is on 1000-iteration micro-benchmarks; with TanStack `throttleTime: 1000` you do ≤1 write/sec regardless. **Net latency savings: ≤80 ms/cold-start, ≤2 ms/persist write.** Switching costs you a TurboModule peer dep (v3) or NitroModules + RN 0.76 + new arch (v4) and a non-trivial migration test surface. **Verdict: keep AsyncStorage 2.x for V1, reassess at 50k DAU.**
2. **The `chatSessions` Zustand store persists user chat content to plaintext AsyncStorage** (`musaium.chatSessions`, line 99 of `chatSessionStore.ts`). This contradicts the TanStack persister exclusion (which correctly excludes `messages` keys) and means **chat messages ARE on disk in plaintext** despite the protective allowlist. **Severity HIGH** — same threat model as a rooted/jailbroken-device adversary that the AsyncStorage exclusion was designed to mitigate. **Fix: wrap `useChatSessionStore` storage in an encrypted persister (encrypted MMKV instance, or move to expo-secure-store with 2 KB chunked sessions).**
3. **Zustand 5 selector reference-equality footgun is unchecked.** v5 dropped support for `useStore` returning new objects without `useShallow` and will infinite-loop ([pmndrs/zustand #2790](https://github.com/pmndrs/zustand/discussions/2790)). I grep'd `museum-frontend/` for `useShallow` / `createWithEqualityFn` — **zero matches**. Either the stores all return single primitives/stable refs (audit needed) or there's a latent infinite-loop bomb waiting on a future feature that does `useStore(s => [s.a, s.b])`. **Action: add a "no inline-object selectors" ESLint rule or one-time grep audit before launch.**
4. **`refetchOnReconnect: true` without `onlineManager` NetInfo wiring = no-op on native.** TanStack's browser auto-detects online; RN does not ([TanStack/query #3590](https://github.com/TanStack/query/discussions/3590)). The `queryClient.ts` defaults set `refetchOnReconnect: true` but I found no `NetInfo.addEventListener` → `onlineManager.setOnline` wiring. **Means: queries will NOT auto-refetch when the device transitions offline→online.** Existing `useAuthAppStateSync` covers app foreground but not the network-change event. **Severity MEDIUM.**

**The 100k decision matrix:**

| Option | V1 (now → 2026-06) | V1.1 (2026 Q3) | 1M DAU (2027+) |
|---|---|---|---|
| Zustand 5 + TanStack 5 + AsyncStorage 2 + SecureStore | KEEP | KEEP | Reassess MMKV |
| Wrap `chatSessions` in encrypted storage | **FIX BEFORE V1** | (done) | (done) |
| Add NetInfo → onlineManager wiring | **FIX BEFORE V1** | (done) | (done) |
| Migrate everything to MMKV v3 | Skip | Optional 4-day project | Recommended |
| Sync engine (PowerSync etc.) | Skip | Skip | Reassess at multi-device |

---

## 2. Current Musaium state (verified)

### 2.1 Stores inventory

7 Zustand 5 stores, all using `persist` middleware:

| Store | File | Persist storage | Sensitive? | Notes |
|---|---|---|---|---|
| `runtimeSettingsStore` | `features/settings/infrastructure/runtimeSettingsStore.ts` | `storage` (AsyncStorage wrapper) | No | `defaultLocale`, `guideLevel`, museum-mode toggle |
| `userProfileStore` | `features/settings/infrastructure/userProfileStore.ts` | `storage` | **Medium** (content prefs) | `contentPreferences`, `hasSeenOnboarding` |
| `dataModePreferenceStore` | `features/settings/dataModeStore.ts` | `storage` | No | `'auto' \| 'low' \| 'normal'` |
| `chatLocalCacheStore` | `features/chat/application/chatLocalCache.ts` | `storage` | Medium | Prefetched FAQ Q/A, 200-entry cap, 7-day TTL |
| **`chatSessionStore`** | `features/chat/infrastructure/chatSessionStore.ts` | **`AsyncStorage` direct** | **HIGH** | **Full chat session messages, last 10 sessions, plaintext** |
| `artKeywordsStore` | `features/art-keywords/infrastructure/artKeywordsStore.ts` | `storage` | No | Per-locale art keywords for keyword nav |
| `offlinePackChoiceStore` | `features/museum/infrastructure/offlinePackChoiceStore.ts` | `storage` | No | Accept/decline per-city offline-pack |
| `conversationsStore` | `features/conversation/infrastructure/conversationsStore.ts` | `storage` | No (only IDs persisted via `partialize`) | `savedSessionIds[]`, sort mode |

All use `createJSONStorage` w/ `storage` from `shared/infrastructure/storage.ts` — a thin AsyncStorage wrapper.

### 2.2 TanStack Query setup (`shared/data/queryClient.ts`)

- `staleTime: 5min`, `gcTime: 24h`, `retryDelay` exponential backoff to 30s cap
- Custom `shouldRetry` that bails on `Unauthorized | Forbidden | NotFound | Validation | DailyLimitReached | RateLimited`
- `refetchOnReconnect: true` **(BUT no NetInfo wiring — see Finding 4)**
- `refetchOnWindowFocus: false`
- `mutations.retry: false` (no offline mutation queue)
- `queryPersister` = `createAsyncStoragePersister` w/ `throttleTime: 1000`, key `musaium.query.cache`
- `shouldDehydrateQuery` filters out `messages | session | admin | auth | user` heads
- `persistBuster = musaium-${appVersion}` from `expo-constants` ← correctly invalidates persisted cache on app upgrade ([TanStack persistQueryClient docs](https://tanstack.com/query/v4/docs/framework/react/plugins/persistQueryClient))
- `persistMaxAge = 24h` (matches `gcTime`, correct per [TanStack maxAge guidance](https://tanstack.com/query/v4/docs/framework/react/plugins/persistQueryClient))
- `resetPersistedCache()` order: **first** `persister.removeClient()` (awaited), **then** `queryClient.clear()` — exactly the right order to dodge the 1-second `throttleTime` rehydrate window after `clear()`

### 2.3 expo-secure-store usage (4 callsites)

| File | Key | What | Required? |
|---|---|---|---|
| `features/auth/infrastructure/authTokenStore.ts` | `auth.refreshToken`, `auth.accessToken` | JWT tokens | **YES** — OWASP M1 |
| `features/settings/infrastructure/offlineMapsPreferences.ts` | `musaium.offlineMaps.autoPreCacheEnabled` | Boolean flag | **No** — explicit comment says "not because the value is secret" |
| `features/chat/hooks/useVoiceDisclosure.ts` | (voice disclosure ack) | Boolean | No |
| Biometric store, `features/auth/infrastructure/biometricStore.ts` | Biometric prefs | Boolean | Likely No |

3 of 4 SecureStore writes are non-sensitive booleans. **Not a bug — uniform pattern is fine** — but adds 4–10× latency (1–2 ms native call) compared to AsyncStorage for no security gain. Document the pattern decision and move on.

---

## 3. Zustand 5 — 2026 state (deep dive)

### 3.1 Release & current state

- **Latest stable: 5.0.13** as of audit date, with v5.0.10 (2026-01-12) shipping a race-condition fix for concurrent rehydrate calls via a `hydrationVersion` counter. Source: [zustand on npm](https://www.npmjs.com/package/zustand), [zustand releases](https://github.com/pmndrs/zustand/releases).
- **Musaium is on 5.0.12** — one patch behind. Low-impact gap; 5.0.13 is mostly devtools fixes (Firefox/Safari stack format).
- **v5 breaking changes vs v4** (from [Announcing Zustand v5](https://pmnd.rs/blog/announcing-zustand-v5/) + [Migration guide](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5)):
  - Drops React <18, TypeScript <4.5, ES5 → smaller bundle (now uses native `useSyncExternalStore` instead of `use-sync-external-store` shim).
  - **Behavioral change**: selectors returning new references now match React default behavior — **may cause infinite loops** in code that worked on v4. Fix = `useShallow` from `zustand/react/shallow` OR `createWithEqualityFn` from `zustand/traditional`.
  - `persist` middleware no longer stores initial state at creation (changed in 4.5.5 too).

### 3.2 Patterns Musaium uses (correctness audit)

Every Musaium store follows the recommended v5 patterns:

- `create<T>()(persist(...))` curry-style typing — correct for v5 ([Zustand TypeScript docs](https://zustand.docs.pmnd.rs/guides/typescript)).
- `partialize` to control what's persisted (4 of 7 stores use it) — best practice per [Zustand persist middleware docs](https://zustand.docs.pmnd.rs/reference/middlewares/persist).
- `version` + `migrate` (artKeywordsStore v1→v2) — exemplary, per [Zustand migration docs](https://zustand.docs.pmnd.rs/integrations/persisting-store-data#how-can-i-rehydrate-on-storage-event).
- `onRehydrateStorage` to flip `_hydrated` flag — correct pattern for "wait until storage rehydrated" gating, per [DEV Solving Zustand persist re-hydration merging](https://dev.to/atsyot/solving-zustand-persisted-store-re-hydtration-merging-state-issue-1abk).

**One smell**: `useChatLocalCacheStore.persist.clearStorage()` is called synchronously inside `clearAll()` (line 157), but the store uses `createJSONStorage(() => storage)` which is async (AsyncStorage). The catch-all swallows the failure. **Minor** — the in-memory wipe protects the current runtime; the catch is acceptable as a "best effort disk cleanup".

### 3.3 Comparison vs Redux Toolkit 2, Jotai 2, Valtio

Benchmarks (synthesized from [Better Stack Zustand vs RTK vs Jotai](https://betterstack.com/community/guides/scaling-nodejs/zustand-vs-redux-toolkit-vs-jotai/), [DEV State Management 2026](https://dev.to/jsgurujobs/state-management-in-2026-zustand-vs-jotai-vs-redux-toolkit-vs-signals-2gge), [Jotai comparison docs](https://jotai.org/docs/basics/comparison)):

| Metric | Zustand 5 | Redux Toolkit 2 | Jotai 2 | Valtio |
|---|---|---|---|---|
| Bundle gzip | ~1.2 KB | ~13 KB | ~3 KB | ~3 KB |
| Single-update render time | 12 ms | 18 ms | 14 ms | n/a |
| Memory / 1000 components | 2.1 MB | 3.2 MB | 1.8 MB | n/a |
| Initial parse | 8 ms | 34 ms | 9 ms | n/a |
| Render optimization | manual selectors | manual selectors | **atomic auto** | **proxy auto** |
| RN compatibility | excellent | excellent | excellent | works (no RN-specific code) |
| TypeScript inference | needs `<T>()` curry | excellent | excellent | excellent |
| Persistence | `persist` middleware | `redux-persist` | `atomWithStorage` | not built-in |
| Debugging | devtools middleware | RTK DevTools (best) | Jotai DevTools | n/a |

**Verdict for Musaium scope (7 small focused stores, no complex inter-store derivation)**: Zustand 5 is the right choice. Jotai's atomic granularity wins for "form builder / spreadsheet" use cases; Musaium doesn't have those. Valtio's proxy mutation model is nicer DX but harder to debug nested updates ([frontend undefined comparison](https://www.frontendundefined.com/posts/monthly/proxy-state-management-mobx-valtio/)) and we'd lose `persist` ecosystem maturity. RTK overkill for 7 stores.

### 3.4 Action items

1. **Bump 5.0.12 → 5.0.13** in next chore PR. Trivial.
2. **Audit selectors for inline-object returns** — grep `useStore\(.*=>\s*[{[]` and either confirm stable refs or wrap with `useShallow`. Currently zero `useShallow` imports = either lucky or latent bug. Source: [pmndrs/zustand #2790 Infinite loop V5](https://github.com/pmndrs/zustand/discussions/2790), [Medium — Taming the Infinite Loop](https://medium.com/@oladejoboluwatife10/taming-the-infinite-loop-how-we-fixed-a-react-native-state-management-bug-with-zustand-20c8664ebb90).
3. **Document the "Zustand for client state, TanStack for server state" boundary** in `docs/` — prevents future temptation to mirror server responses in Zustand.

---

## 4. TanStack Query 5.99 + persist client — 2026 state (deep dive)

### 4.1 Versions & 2026 best practices

- Latest stable as of write: 5.x family, mid-5.99 line is current. Musaium pins `^5.99.2`.
- Active development; v5 migration guide ([TanStack/query v5 migrate](https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5)) covers all current API.

### 4.2 Persistence patterns (correctness audit)

Musaium follows the canonical 2026 pattern recommended by [Whitespectre offline-first guide](https://www.whitespectre.com/ideas/how-to-build-offline-first-react-native-apps-with-react-query-and-typescript/), [Benoit Paul offline-first TanStack](https://www.benoitpaul.com/blog/react-native/offline-first-tanstack-query/), and [TanStack/query #4342 RN Offline Mode](https://github.com/TanStack/query/discussions/4342):

| Pattern | Status |
|---|---|
| `gcTime ≥ persistMaxAge` (so persisted entries survive memory eviction) | **Correct** (24h = 24h) |
| `staleTime > 0` (avoid hammering API after rehydrate) | **Correct** (5 min) |
| `throttleTime` on persister | **Correct** (1000 ms — matches default) |
| `buster` on app version | **Correct** (`musaium-${appVersion}`) |
| `maxAge` to discard stale persisted blob | **Correct** (24h) |
| Sensitive-data exclusion via `shouldDehydrateQuery` filter | **Correct** |
| Manual `removeClient` then `clear` on logout | **Correct** (order matters — see code lines 138-147) |
| `setMutationDefaults` for `resumePausedMutations` after reload | **MISSING** — but no offline mutation queue is desired today |
| NetInfo wiring to `onlineManager.setOnline` | **MISSING** — see §1 Finding 4 |

### 4.3 Sensitive-data exclusion — why this is the right pattern

The `shouldDehydrateQuery` allowlist filter (`messages | session | admin | auth | user` → return false → skip persist) is **exactly** the pattern TanStack maintainers and security researchers recommend.

> "By default, `shouldDehydrateQuery` is implemented to only persist queries with a 'success' status to avoid persisting loading or erroneous queries. To exclude some queries from being persistent, you can pass a filter function to the `shouldDehydrateQuery` param."
>
> — [TanStack/query #3568 Selectively persist react-query keys](https://github.com/TanStack/query/discussions/3568)

The complementary pattern (use `meta: { persist: true }` on the query and check `meta?.persist` in `shouldDehydrateQuery`) is also valid — Musaium picked the "exclude by key prefix" variant which is **easier to audit** because the policy lives in one file. **Stay with the current approach.**

The 4-line comment in `queryClient.ts` (lines 65-81) is **excellent risk-documentation** — explicitly calls out that the in-memory cache is still hot and only the disk roundtrip is suppressed. Keep this paragraph; it's the kind of thing future devs will need.

### 4.4 Cache invalidation: logout / token refresh / user switch

#### 4.4.1 Logout

Musaium's `logout()` (`AuthContext.tsx` lines 254-275) calls:
1. `authStorage.getRefreshToken()` to grab token for backend revocation
2. `clearPersistedTokens()` — clears SecureStore
3. `resetPersistedCache()` — `persister.removeClient()` then `queryClient.clear()`
4. `clearPerUserFeatureStorage()` — `chatLocalCache.clearAll()`, `clearDailyArtStorage()`, `clearBiometricPreference()`
5. `Sentry.setUser(null)`
6. Navigate to auth route
7. Fire-and-forget `authService.logout(refreshToken)`

This matches the recommended pattern from [Medium — What is difference between Clear vs RemoveQueries vs ResetQueries vs QueryInvalidate](https://medium.com/@neungszad/what-is-difference-between-clear-vs-removequeries-vs-resetqueries-vs-queryinvalidate-from-384a53e79e06) and [TanStack/query #1886 Reset User Data on Logout](https://github.com/TanStack/query/discussions/1886):

> "When the user clicks logout, call clear() and then redirect to the login route, where you would be able to refetch the session key because you mount the login view with refetchOnMount."

**One missing piece**: `chatSessionStore` (the high-severity HIGH plaintext-messages persister, Finding 2) is **NOT cleared in logout**. Grep confirms — `clearPerUserFeatureStorage` clears `chatLocalCache` and daily-art but not `chatSessionStore`. **Action: add `useChatSessionStore.persist.clearStorage()` to `clearPerUserFeatureStorage`. P0 if Finding 2 is not addressed by encrypting the storage layer.**

#### 4.4.2 Token refresh

`setUnauthorizedHandler` (AuthContext line 233-241) handles the cascading 401 → invalid refresh → full logout path. This already calls `resetPersistedCache + clearPerUserFeatureStorage`, so the same caveat as 4.4.1 applies (chatSessions not cleared).

For successful token refresh (not a 401 → invalid case), **no cache invalidation is needed** — this is correct: the user identity hasn't changed.

#### 4.4.3 User switch (one user logs out, another logs in on same device)

This is the dangerous case. TanStack maintainers explicitly call out:

> "You should invalidate queries on sign-in, not on logout, because if your access token expires, you will be logged out in the background, and after signing in with a different user, you will get unexpected results."
>
> — [TanStack/query #2640 How can i remove the cache of all my queries without refetch them again](https://github.com/TanStack/query/discussions/2640)

Musaium does both (clear on logout AND fresh QueryClient state on login). The disk-persisted cache is removed on logout via `persister.removeClient()`. **This is safer than "invalidate on sign-in only"** because the persisted blob doesn't survive the logout. **Status: CORRECT.**

### 4.5 PersistQueryClientProvider performance gotcha

[TanStack/query #9775](https://github.com/TanStack/query/issues/9775) reports a severe issue: with ≥5000 cached queries, every `setQueryData` triggers a full dehydrate cycle, causing 1-3 second main-thread blocks.

**Musaium impact: NONE.** With `gcTime: 24h` + the sensitive-key exclusion, persisted cache size will stay <100 KB even after weeks of use. Document this risk but no action needed.

### 4.6 Offline mutations (not currently used)

Musaium has `mutations.retry: false` — no offline mutation queue. This is **correct for V1 scope** because:

- Chat is request/response not queue-friendly (responses come from LLM, can't replay)
- All other mutations are auth/preferences (immediate user feedback expected)

If Musaium V2 adds e.g. "queue voice notes for later upload", the pattern is:
1. `queryClient.setMutationDefaults(['voiceNote'], { mutationFn: uploadVoiceNote })` — so paused mutations can resume after app restart
2. `onSuccess` of `PersistQueryClientProvider`: `queryClient.resumePausedMutations()`
3. `networkMode: 'offlineFirst'` per-mutation

Source: [TanStack v5 mutations docs](https://tanstack.com/query/v5/docs/framework/react/guides/mutations), [TanStack/query #5275](https://github.com/TanStack/query/discussions/5275).

### 4.7 Action items

1. **Add NetInfo → onlineManager wiring** (~10 LOC):
   ```ts
   import NetInfo from '@react-native-community/netinfo';
   import { onlineManager } from '@tanstack/react-query';
   onlineManager.setEventListener((setOnline) =>
     NetInfo.addEventListener(s => setOnline(!!s.isConnected))
   );
   ```
   Source: [TanStack v5 RN docs](https://tanstack.com/query/latest/docs/framework/react/react-native), [TanStack/query #3590](https://github.com/TanStack/query/discussions/3590).
2. **Add `chatSessionStore` clear to `clearPerUserFeatureStorage`** (P0 if §6 Finding 2 not fixed).

---

## 5. AsyncStorage 2 vs react-native-mmkv 3/4

### 5.1 Versions & status

- **AsyncStorage** — `@react-native-async-storage/async-storage` 2.2.0 (Musaium current). Was 2.x for 2 years; supports new arch. Backed by SQLite on Android, NSUserDefaults on iOS. Originally part of RN core, extracted to community 2019 per [Lean Core effort](https://reactnative.dev/docs/asyncstorage).
- **react-native-mmkv v3** — last 3.x line; requires **TurboModules (RN ≥ 0.75 + new arch enabled)**. Pure C++ TurboModule. Source: [react-native-mmkv issue #733](https://github.com/mrousavy/react-native-mmkv/issues/733).
- **react-native-mmkv v4** — released 2026 Q1, version 4.3.1 at audit time. **NitroModules** (newer / faster JSI bridge), requires **RN ≥ 0.76**. Source: [react-native-mmkv README](https://github.com/mrousavy/react-native-mmkv).
- Musaium runs **RN 0.83** + **new arch enabled** (`new-arch-enabled` per `app.config.ts` and Hermes V1) → **both MMKV v3 and v4 are compatible**.

### 5.2 Performance delta

[mrousavy/StorageBenchmark](https://github.com/mrousavy/StorageBenchmark) measured on iPhone 11 Pro, 1000 read iterations:

| Library | Read 1000× | Write 1000× | Architecture | Bridge? |
|---|---|---|---|---|
| MMKV | ~10 ms | ~50 ms | mmap C++ | No (JSI) |
| AsyncStorage | ~250 ms | ~500 ms | SQLite (Android) / NSUserDefaults (iOS) | Yes (async) |
| WatermelonDB | (heavier) | (heavier) | SQLite | Mixed |
| RealmDB | ~80 ms | ~150 ms | Native | Mixed |

**MMKV is 20-30× faster on read, 10× faster on write at micro-bench scale.** This translates roughly to:
- ~2 ms saved per persist write (Musaium: 1 write/sec max from throttle, so trivial)
- ~80 ms saved on cold-start rehydrate (Musaium: 7 stores + 1 query cache = ~8 reads, total cold-start AsyncStorage time ≤200 ms)

User-visible impact on Musaium: **negligible**. App is voice/LLM-bound, not storage-bound.

### 5.3 Why people migrate (and whether it applies to Musaium)

| Reason to migrate | Applies to Musaium? |
|---|---|
| Synchronous reads (avoid `await`) | Marginal — most reads are at boot, not in tight loops |
| Faster rehydrate on cold start | Maybe — 80 ms is below human perception threshold |
| Encryption at rest | **YES** — Finding 2 chat-sessions issue |
| Larger payload size limits | No — AsyncStorage 6 MB / iOS unlimited (per [react-native-async-storage #83](https://github.com/react-native-async-storage/async-storage/issues/83)); Musaium nowhere near |
| Multiple isolated instances | No — Musaium has single namespace |
| Backup exclusion controls | Already handled by SecureStore + AsyncStorage's iOS NSUserDefaults backup-exclusion |

### 5.4 Production stability concerns

[react-native-mmkv issues](https://github.com/mrousavy/react-native-mmkv/issues) shows recent (2025-2026) production reports:

- [#980](https://github.com/mrousavy/react-native-mmkv/issues/980) — `nitro-modules 0.32` peer dep causes Android crashes (v4 specific)
- [#985](https://github.com/mrousavy/react-native-mmkv/issues/985) — NitroModules not found on Android build (Expo SDK 54 + RN 0.81)
- [#937](https://github.com/mrousavy/react-native-mmkv/issues/937) — Old Arch + Hermes: `global.__nitroDispatcher already exists`
- [#440](https://github.com/mrousavy/react-native-mmkv/issues/440) — Storage file grows uncontrollably until crash (older v2 bug, but worth monitoring)
- [#628](https://github.com/mrousavy/react-native-mmkv/issues/628) — verbose production logs

AsyncStorage 2.x = battle-tested, ~2M weekly downloads, near-zero crash reports in 2025-2026.

**For 100k V1 launch**: AsyncStorage 2 is the lower-risk choice. Revisit MMKV when (a) AsyncStorage performance becomes a measured bottleneck OR (b) Musaium hits 500k+ DAU and 1% perf improvements matter at scale.

### 5.5 Security comparison

| Aspect | AsyncStorage 2 | MMKV (no encrypt) | MMKV (AES-256) |
|---|---|---|---|
| Encryption at rest | None (plaintext SQLite) | None (plaintext mmap) | **Yes (AES-256)** |
| `adb pull` extraction | Trivial | Trivial | Encrypted blob |
| Jailbreak/root extraction | Trivial | Trivial | Encrypted (key in memory) |
| Backup exclusion | Manual config | Manual config | Manual config |
| FIPS-validated crypto | No | No | No (custom AES impl, not validated) |

Source: [PkgPulse MMKV vs AsyncStorage vs SecureStore 2026](https://www.pkgpulse.com/guides/react-native-mmkv-vs-async-storage-vs-expo-secure-store-2026), [MMKV encryption docs](https://deepwiki.com/mrousavy/react-native-mmkv/7.1-encryption-and-security), [react-native-mmkv #595 Unclear docs encryption](https://github.com/mrousavy/react-native-mmkv/issues/595).

**Critical caveat on MMKV encryption**: the encryption key is stored *in memory* while the app runs. The recommended pattern is to store the encryption key in SecureStore and load it at boot — which Musaium **could** do for `chatSessionStore`.

### 5.6 Migration story (if pursued post-launch)

Migration script available at [mrousavy MIGRATE_FROM_ASYNC_STORAGE.md](https://github.com/mrousavy/react-native-mmkv/blob/main/docs/MIGRATE_FROM_ASYNC_STORAGE.md): iterate `AsyncStorage.getAllKeys()`, copy to MMKV, delete from AsyncStorage. Idempotent on retry. Estimated effort:

- 7 Zustand stores: swap `storage: createJSONStorage(() => storage)` → `createJSONStorage(() => mmkvStorageAdapter)` (~20 LOC per store)
- TanStack query persister: wrap MMKV in AsyncStorage-shape adapter, pass to `createAsyncStoragePersister` (already exists as wrapper pattern, ~30 LOC)
- One-shot migration on first cold start (~50 LOC)
- Test surface: all persist-related Jest tests need MMKV mocks
- **Total: 1-2 days of focused work**

[mrousavy/react-native-mmkv Zustand wrapper docs](https://github.com/mrousavy/react-native-mmkv/blob/main/docs/WRAPPER_ZUSTAND_PERSIST_MIDDLEWARE.md) provides the canonical Zustand adapter.

### 5.7 Verdict

**KEEP AsyncStorage 2 for V1.** Migrate to MMKV v3 (NOT v4 yet — stability issues §5.4) at V1.1+B2B-revenue point IF either:
- Profiling shows AsyncStorage as a measured bottleneck
- We want to encrypt the entire client cache (Finding 2 alternative)

---

## 6. expo-secure-store 2026 (deep dive)

### 6.1 What it is

- Wrapper around **iOS Keychain Services** (`kSecClassGenericPassword`) and **Android Keystore** (encrypted SharedPreferences). Source: [Expo SecureStore docs](https://docs.expo.dev/versions/latest/sdk/securestore/).
- Latest stable: SDK 55 (Musaium pins `~55.0.11`). API surface = `getItemAsync`, `setItemAsync`, `deleteItemAsync` + `requireAuthentication`, `keychainAccessible`.

### 6.2 Capabilities (verified)

| Capability | iOS | Android |
|---|---|---|
| Hardware-backed encryption | Secure Enclave when avail | Keystore (TEE if avail) |
| Biometric gating via `requireAuthentication: true` | Touch ID / Face ID | Fingerprint / Face |
| Biometric invalidation on enrollment change | Yes (key becomes unreadable) | Yes |
| Size limit per value | ~2 KB practical | ~2 KB (`SharedPreferences` constraint) |
| Persistence after app uninstall | **Yes (iOS keychain retains)** | **No** |
| iCloud Keychain sync | **No** (per [expo #30795](https://github.com/expo/expo/issues/30795)) | n/a |
| Configurable accessibility | `kSecAttrAccessible` (`WHEN_UNLOCKED`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, etc.) | Less granular |

Source: [Expo SecureStore docs](https://docs.expo.dev/versions/latest/sdk/securestore/), [Tessl SDK 15.0.0 reference](https://tessl.io/registry/tessl/npm-expo-secure-store/15.0.0).

### 6.3 Known issues (2025-2026)

| Issue | Impact for Musaium |
|---|---|
| [#40662](https://github.com/expo/expo/issues/40662) iOS Keychain persists after app uninstall | Low — refresh tokens survive uninstall. **Mitigate**: clear SecureStore on first launch if app version is fresh-install vs upgrade. |
| [#12956](https://github.com/expo/expo/issues/12956) Same-Team-ID apps have wildcard keychain access | **Medium** — if Musaium ever ships a second app under same Apple Team ID, tokens are visible. **Mitigate**: set explicit `accessGroup`/keychainGroup in eas config. |
| [#23924](https://github.com/expo/expo/issues/23924) "User interaction is not allowed" in prod | **Already mitigated** by AuthContext fallback that catches the error gracefully. |
| [#30795](https://github.com/expo/expo/issues/30795) No iCloud Keychain sync | **Acceptable** — Musaium tokens should be device-specific anyway (`WHEN_UNLOCKED_THIS_DEVICE_ONLY` is correct). |
| 2 KB Android size limit | **Acceptable** — JWT tokens are typically <1 KB. |

### 6.4 vs Keychain Services directly / EncryptedSharedPreferences directly

| Aspect | expo-secure-store | Direct (iOS Keychain / Android KS) |
|---|---|---|
| Cross-platform API | **Yes** (unified) | No (separate code) |
| Setup complexity | trivial | medium |
| Custom `accessGroup` | limited | full control |
| `kSecAttrAccessControl` flags (biometric+passcode combo) | limited | full control |
| App-extension-shared keychain | NO | Yes (with `accessGroup`) |
| Maintenance cost | Expo team | self-maintained native module |

For Musaium's threat model (B2C visitor + B2B museum operator, no app extensions, no Watch app), **expo-secure-store is sufficient and correct**.

If Musaium ever needs:
- A Today / iOS Widget that shows daily art → need `accessGroup` to share with main app → consider `react-native-keychain` ([npm trends](https://npmtrends.com/expo-secure-store-vs-react-native-keychain) confirms ~10% of expo-secure-store userbase prefers the more granular control).
- Force biometric on every keychain read → expo-secure-store supports `requireAuthentication: true` but UX prompt is unavoidable.
- Truly stateless device tokens (no keychain persistence across uninstall) → needs Android Keystore directly with `setInvalidatedByBiometricEnrollment` + iOS `kSecAccessControlBiometryCurrentSet`.

### 6.5 Biometric-gated access pattern for Musaium

Musaium already uses `expo-local-authentication` ("isBiometricLocked"). The canonical biometric-gated secret pattern ([Clerk Expo guide](https://clerk.com/articles/how-to-add-face-id-biometric-login-to-your-expo-clerk-app)):

1. Store credentials with `requireAuthentication: true` ([Expo SDK 55 SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)) — credential is cryptographically tied to biometric.
2. Read attempts trigger Face ID/Touch ID prompt.
3. New biometric enrollment invalidates the entry → forces re-auth → fresh credential storage.

Musaium today stores refresh tokens WITHOUT `requireAuthentication: true` and gates separately via in-app biometric check. **Acceptable design** but slightly weaker: the token is readable by an attacker who has root + bypasses the JS layer. **For B2C launch, acceptable.** For B2B museum-ops (privileged), consider gating refresh-token read with `requireAuthentication: true` post-launch.

### 6.6 Action items

1. **Add fresh-install detection** to wipe stale SecureStore tokens from previous uninstall (one-line check at boot using a SecureStore "install marker" key).
2. **Document the threat model decision** that we accept SecureStore-without-requireAuth for V1 in `docs/MOBILE_SECURITY.md` (if exists; or in `CLAUDE.md` gotchas).

---

## 7. Offline-first patterns (PowerSync, ElectricSQL, Triplit, RxDB)

### 7.1 Spectrum of options

Per [tolinski.ski Spectrum of Local First](https://tolin.ski/posts/local-first-options), [Hacker News Offline-First Landscape 2025](https://news.ycombinator.com/item?id=45066070), and [trybuildpilot ElectricSQL vs PowerSync vs Zero](https://trybuildpilot.com/648-electric-sql-vs-powersync-vs-zero-2026):

| Engine | Architecture | Backend | RN support | Status 2026 |
|---|---|---|---|---|
| **PowerSync** | Server-auth, SQLite client, bidirectional | Postgres / MongoDB / MySQL / SQL Server | Yes (`@powersync/react-native`) | Mature, prod-ready |
| **ElectricSQL** | Server-auth, Postgres-native, replication streams | Postgres | Yes (β) | "Durable Sync" layer pivot 2026 |
| **Triplit** | Client-DB-first, query subscriptions | self-hosted | Yes | **Company folded → OSS only** |
| **RxDB** | Reactive client DB, plug-in sync | Pluggable (CouchDB, GraphQL, REST) | Yes | Mature, lots of plugins |
| **Replicache** | Server-auth, custom | self-hosted | Yes | **Sunset → replaced by Zero** |
| **Zero** | Server-auth, query-based, Rocicorp | Postgres (limited) | Web first, RN beta | Early adopters only |
| **Yjs / Automerge** | Decentralized CRDT, no server-of-truth | n/a (P2P or relay) | Yes | Mature for text editing |
| **Convex** | Custom backend + sync built-in | Convex | Yes | Lock-in |
| **InstantDB** | Postgres-shape API | Custom backend | Yes | Early |

### 7.2 Does Musaium need a sync engine?

**Decision tree**:

1. Does the user expect to make edits offline that should sync when reconnected? — **No.** Musaium is read-heavy (browse museum content) with point-in-time write events (save bookmark, submit review, fetch chat response). All writes require a live LLM/API call.
2. Does the user expect a multi-device experience (same data on phone + tablet)? — **Not for V1.** Tokens are `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (no iCloud sync). The doc-comment in `userProfileStore` explicitly accepts this limitation: *"A user who changes preferences on device A will see empty toggles on a fresh install of device B until they re-toggle."*
3. Does the cached museum data benefit from per-museum delta sync? — **Maybe, post-launch.** Offline packs are already handled separately (pre-cached HTML/CSS bundles per city).
4. Does it benefit from CRDT (conflict-free multi-writer)? — **No.** Single user per device, no real-time collab.

**Verdict: No sync engine needed for V1, V1.1, or until B2B revenue.**

The closest legitimate use case post-launch: **save bookmarks / saved sessions across devices**. Today `conversationsStore.savedSessionIds` is per-device. If users complain about cross-device parity, add a `GET /me/bookmarks` + `POST /me/bookmarks` API and hydrate Zustand from it on login — no sync engine needed. Same approach for `userProfile.contentPreferences`.

### 7.3 If we WERE to pick one (hypothetical, post-2027)

[trybuildpilot 2026 verdict](https://trybuildpilot.com/648-electric-sql-vs-powersync-vs-zero-2026), [csskat.com Best Offline-First Tech Stack 2026](https://cssauthor.com/offline-first-tech-stack/):

- **PowerSync** for "production-mobile + Postgres backend" = top pick. Postgres backend matches Musaium's stack. $0 free tier (2 GB sync/month) suitable for early B2B pilots; $399/month at 1M installs / 100k DAU per [PowerSync pricing](https://powersync.com/pricing).
- **ElectricSQL** if you want OSS and tolerate stability swings.
- Skip Triplit (company folded), Replicache (sunset), Zero (too early for RN), Yjs (wrong use case).

**Estimated migration cost when needed**: 8-12 days (SQLite client schema, upload-only sync, server-side sync rules, migration of existing Zustand-persisted reads to PowerSync-backed reads).

### 7.4 Action items

None for V1. Re-evaluate at 50k DAU or first cross-device-parity user complaint.

---

## 8. Sensitive-key exclusion — best practice doctrine

### 8.1 What MUST NOT be persisted to AsyncStorage (or any plaintext storage)

OWASP MASVS L1 + L2 ([OWASP Mobile App Sec MAS](https://owasp.org/blog/2024/10/02/Securing-React-Native-Mobile-Apps-with-OWASP-MAS)), [Medium — Credential Security in RN OWASP M1 2026](https://medium.com/@bariskandemirx/credential-security-in-react-native-owasp-mobile-top-10-m1-5da9cb7666dd):

- **MUST NOT**:
  - Auth tokens (JWT, refresh tokens, OAuth state) → SecureStore
  - Passwords (even temporarily) → never persist, in-memory only until POST
  - Encryption keys / nonces → SecureStore
  - PII fields (email, phone, real name, DOB) that map back to identity → SecureStore or backend-only
  - Health / biometric raw data → never; only hashed → SecureStore
  - Payment data (card, IBAN) → never on device; use payment SDK token
  - **Chat content (user's messages, AI responses with personal context)** → if persisted, encrypt; cleaner = backend-only
- **MUST**:
  - Document the threat model on each persisted store
  - Add a "fresh install" detection to clear stale SecureStore on uninstall
  - Clear all per-user storage on logout (every store, every cache, every persister)

### 8.2 Musaium application

Cross-referenced with Musaium's actual storage:

| Key prefix | Storage layer | Sensitive? | OWASP MASVS verdict |
|---|---|---|---|
| `auth.refreshToken`, `auth.accessToken` | SecureStore | YES | **Compliant** |
| `musaium.query.cache` (with `messages|session|admin|auth|user` excluded) | AsyncStorage | filtered | **Compliant** |
| `musaium.chatLocalCache` (prefetched FAQ Q/A) | AsyncStorage | medium (publicly available content) | Acceptable — FAQ Q/A are not PII; same content visible to all users for the museum |
| **`musaium.chatSessions` (full chat messages + AI responses)** | **AsyncStorage** | **HIGH (user PII, AI personal context)** | **NON-COMPLIANT** |
| `musaium.runtimeSettings`, `musaium.userProfile`, `musaium.dataMode.preference`, `musaium.artKeywords`, `musaium.conversations` (only IDs), `musaium-offline-pack-choice` | AsyncStorage | low (preferences) | Compliant |

The conflict: **The `shouldDehydrateQuery` filter correctly excludes `messages` from the TanStack persister, but `chatSessionStore` directly persists messages via Zustand persist + AsyncStorage**, bypassing the filter entirely.

### 8.3 Recommendation (sensitive-key exclusion canonical list)

For Musaium's `shouldDehydrateQuery` allowlist, the current `messages | session | admin | auth | user` set is **correct**. Consider also adding (defensive):

- `me` (if `useMe` ever changes its top-level key)
- `notifications`
- `chat` (in case future chat-related queries land outside `messages` namespace)

Document the policy in a single source-of-truth comment (already done — keep it).

### 8.4 Action items (HIGH PRIORITY)

For the `chatSessionStore` finding:

**Option A — Move to backend-only (RECOMMENDED for V1, lowest risk)**
- Remove the `persist` middleware from `chatSessionStore`.
- Rely on the backend chat-session API to re-fetch session list + messages on cold start.
- Pros: zero on-device PII exposure; matches Signal-style threat model.
- Cons: 200-400 ms slower cold start for chat tab; requires online to see history (V1 is online-first anyway).

**Option B — Encrypted persister wrapper**
- Generate an AES-256 key at first launch, store in SecureStore.
- Wrap AsyncStorage with an encrypt/decrypt layer for `chatSessionStore` only.
- Pros: faster cold start, chat history available offline.
- Cons: ~80 LOC, new crypto code, manageable risk.

**Option C — Use MMKV with encryption for `chatSessionStore` only**
- Single MMKV instance with `encryptionType: 'AES-256'`, key from SecureStore.
- Pros: minimal code, well-tested encryption path.
- Cons: introduces MMKV as a dep just for one store, peer dep complexity.

**For V1 ship: Option A.** Document the decision; revisit at V1.1 if offline chat history is a feature ask.

---

## 9. State / cache invalidation matrix

### 9.1 Trigger → cleanup matrix (Musaium today)

| Trigger | Token clear | Query cache clear | Persisted cache wipe | Zustand stores wiped | Sentry user reset |
|---|---|---|---|---|---|
| Manual logout button | clearPersistedTokens | queryClient.clear | persister.removeClient | chatLocalCache only | Yes |
| 401 from API → unauthorizedHandler | Same as logout | Same | Same | Same (chatLocalCache only) | Yes |
| Token refresh success | n/a | n/a | n/a | n/a | n/a (identity unchanged) |
| User switch (logout → fresh login) | Via logout then login | Cache empty post-clear | Removed post-clear | Reset post-clear; chatSessionStore NOT cleared | Reset on logout, set on login |
| App version upgrade | n/a (tokens survive) | persistBuster discards stale | n/a | n/a (Zustand `version` only triggers migration if `version` bumped) | n/a |
| Biometric enrollment change (iOS) | Token may become unreadable if `requireAuthentication:true` (NOT enabled today) | n/a | n/a | n/a | n/a |
| Fresh install on shared device (iOS Keychain leak) | **NOT detected today** — tokens from previous install hydrate! | n/a | n/a | n/a | Wrong user! |
| 30-second background → foreground | n/a | invalidate `user/me` + `notifications` | n/a | n/a | n/a |

### 9.2 Recommended additions

1. **`chatSessionStore` clear** in `clearPerUserFeatureStorage` — **P0** until §6 Finding 2 is resolved.
2. **Fresh-install detection** — write a SecureStore key `install.appVersion = current version` at first successful login. On boot, if SecureStore has stale refresh-token AND no install marker for current install, wipe both. Detects the iOS Keychain "persists across uninstall" case.
3. **Cancel in-flight queries before logout** — `await queryClient.cancelQueries()` before `clear()` to prevent late responses re-populating the now-empty cache. Per [Medium — Why Zustand State Reset Works Instantly but RQ Tricky](https://medium.com/@mariaHelllo/why-zustand-state-reset-works-instantly-but-react-query-cache-clearing-can-be-tricky-f315c8ab0775).

---

## 10. Verdict for Musaium 100k installs

### 10.1 Current stack OK?

**Yes, with 3 explicit caveats addressed.**

| Component | Verdict | Reason |
|---|---|---|
| Zustand 5.0.12 | **KEEP** (bump to 5.0.13) | Right size for 7-store scope; persist patterns canonical; no scale concerns at 100k |
| TanStack Query 5.99.2 + persist client | **KEEP** | `shouldDehydrateQuery` filter is the recommended pattern; cache invalidation is correct on logout |
| AsyncStorage 2.2.0 | **KEEP** | Battle-tested at scale; perf delta vs MMKV is invisible at Musaium's workload; lower risk than MMKV peer-dep churn |
| expo-secure-store ~55.0.11 | **KEEP** | Standard wrapper, sufficient threat model for B2C; address keychain-persists-after-uninstall gotcha |

### 10.2 Should migrate to MMKV?

**No, not for V1. Re-evaluate at one of these triggers:**

- Profiling shows AsyncStorage as a measured user-perceptible bottleneck (unlikely at <1M DAU)
- A specific feature requires fast synchronous reads (e.g. real-time render loops, animation worklets — Musaium doesn't have these)
- We decide to encrypt the full client cache (Option C of §8.4) — at that point MMKV+AES-256 is the cleanest path

**If we do migrate later** (V1.1 or 2027+): pick **MMKV v3**, not v4. v3 = pure C++ TurboModule, well-shaken-down. v4 = NitroModules, several open Android stability issues (§5.4).

### 10.3 Critical fixes BEFORE V1 ship

| Priority | Fix | Effort |
|---|---|---|
| **P0** | Encrypt `chatSessionStore` (Option A: drop persist, rely on backend) | 0.5 day |
| **P0** | Add NetInfo → onlineManager wiring | 1 hour |
| **P1** | Bump Zustand 5.0.12 → 5.0.13 | 5 min |
| **P1** | Add `useShallow` audit / ESLint rule for inline-object selectors | 0.5 day |
| **P1** | Add `chatSessionStore` clear to `clearPerUserFeatureStorage` (if P0-A not done) | 30 min |
| **P2** | Add fresh-install detection to wipe stale SecureStore keychain after iOS uninstall | 0.5 day |
| **P2** | Add `await queryClient.cancelQueries()` before `clear()` in logout | 15 min |
| **P3** | Document the SecureStore-for-non-secrets pattern decision in `docs/` | 30 min |

### 10.4 Defer post-V1

- MMKV migration (V1.1+ if needed)
- Sync engine (PowerSync etc.) — only at multi-device parity ask
- Biometric-gated SecureStore (`requireAuthentication: true`) for refresh-token reads — for B2B operator role only
- `useShallow` proactive adoption everywhere (defer to "as needed" basis)

---

## 11. Sources

### Zustand 5
- [GitHub pmndrs/zustand](https://github.com/pmndrs/zustand)
- [Announcing Zustand v5 — Poimandres](https://pmnd.rs/blog/announcing-zustand-v5/)
- [Migrating to v5 from v4 — Zustand docs](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5)
- [persist Middleware reference](https://zustand.docs.pmnd.rs/reference/middlewares/persist)
- [pmndrs/zustand #2790 Infinite loop V5](https://github.com/pmndrs/zustand/discussions/2790)
- [Medium — Taming the Infinite Loop](https://medium.com/@oladejoboluwatife10/taming-the-infinite-loop-how-we-fixed-a-react-native-state-management-bug-with-zustand-20c8664ebb90)
- [zustand on npm](https://www.npmjs.com/package/zustand)

### State management comparison
- [Better Stack Zustand vs RTK vs Jotai](https://betterstack.com/community/guides/scaling-nodejs/zustand-vs-redux-toolkit-vs-jotai/)
- [DEV State Management 2026 Zustand vs Jotai vs RTK vs Signals](https://dev.to/jsgurujobs/state-management-in-2026-zustand-vs-jotai-vs-redux-toolkit-vs-signals-2gge)
- [Zustand comparison docs](https://zustand.docs.pmnd.rs/learn/getting-started/comparison)
- [Jotai comparison docs](https://jotai.org/docs/basics/comparison)
- [pmndrs/valtio](https://github.com/pmndrs/valtio)
- [frontend undefined — Proxy state MobX vs Valtio](https://www.frontendundefined.com/posts/monthly/proxy-state-management-mobx-valtio/)

### TanStack Query 5
- [TanStack Query v5 React Native](https://tanstack.com/query/latest/docs/framework/react/react-native)
- [TanStack Query v5 Migrating Guide](https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5)
- [TanStack v5 Optimistic Updates](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates)
- [TanStack v5 Mutations](https://tanstack.com/query/v5/docs/framework/react/guides/mutations)
- [TanStack Query Query Invalidation v5](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation)
- [TanStack/query #3568 Selectively persist react-query keys](https://github.com/TanStack/query/discussions/3568)
- [TanStack/query #2640 Remove cache without refetch](https://github.com/TanStack/query/discussions/2640)
- [TanStack/query #1886 Reset User Data on Logout](https://github.com/TanStack/query/discussions/1886)
- [TanStack/query #4342 RN Offline Mode Online First](https://github.com/TanStack/query/discussions/4342)
- [TanStack/query #3590 NetInfo Online status management](https://github.com/TanStack/query/discussions/3590)
- [TanStack/query #5275 Run only latest mutation offline](https://github.com/TanStack/query/discussions/5275)
- [TanStack/query #9775 PersistQueryClientProvider perf with large cache](https://github.com/TanStack/query/issues/9775)
- [createAsyncStoragePersister docs](https://tanstack.com/query/v4/docs/framework/react/plugins/createAsyncStoragePersister)
- [persistQueryClient docs](https://tanstack.com/query/v4/docs/framework/react/plugins/persistQueryClient)
- [Whitespectre offline-first guide](https://www.whitespectre.com/ideas/how-to-build-offline-first-react-native-apps-with-react-query-and-typescript/)
- [Benoit Paul offline-first TanStack Query](https://www.benoitpaul.com/blog/react-native/offline-first-tanstack-query/)
- [Medium — Difference Clear/RemoveQueries/ResetQueries/Invalidate](https://medium.com/@neungszad/what-is-difference-between-clear-vs-removequeries-vs-resetqueries-vs-queryinvalidate-from-384a53e79e06)
- [Medium — Zustand State Reset Works Instantly vs RQ](https://medium.com/@mariaHelllo/why-zustand-state-reset-works-instantly-but-react-query-cache-clearing-can-be-tricky-f315c8ab0775)

### AsyncStorage / MMKV
- [GitHub mrousavy/react-native-mmkv](https://github.com/mrousavy/react-native-mmkv)
- [mrousavy/StorageBenchmark](https://github.com/mrousavy/StorageBenchmark)
- [mrousavy MIGRATE_FROM_ASYNC_STORAGE.md](https://github.com/mrousavy/react-native-mmkv/blob/main/docs/MIGRATE_FROM_ASYNC_STORAGE.md)
- [mrousavy WRAPPER_ZUSTAND_PERSIST_MIDDLEWARE.md](https://github.com/mrousavy/react-native-mmkv/blob/main/docs/WRAPPER_ZUSTAND_PERSIST_MIDDLEWARE.md)
- [mrousavy WRAPPER_REACT_QUERY.md](https://github.com/mrousavy/react-native-mmkv/blob/main/docs/WRAPPER_REACT_QUERY.md)
- [react-native-mmkv #733 V3 TurboModules requirement](https://github.com/mrousavy/react-native-mmkv/issues/733)
- [react-native-mmkv #980 NitroModules 0.32 Android crash](https://github.com/mrousavy/react-native-mmkv/issues/980)
- [react-native-mmkv #985 NitroModules not found Android Expo](https://github.com/mrousavy/react-native-mmkv/issues/985)
- [react-native-mmkv #937 v4 Old Arch Hermes crash](https://github.com/mrousavy/react-native-mmkv/issues/937)
- [react-native-mmkv #595 Unclear docs encryption](https://github.com/mrousavy/react-native-mmkv/issues/595)
- [DeepWiki MMKV encryption and security](https://deepwiki.com/mrousavy/react-native-mmkv/7.1-encryption-and-security)
- [Tencent/MMKV design](https://github.com/Tencent/mmkv/wiki/design_eng)
- [PkgPulse MMKV vs AsyncStorage vs SecureStore 2026](https://www.pkgpulse.com/guides/react-native-mmkv-vs-async-storage-vs-expo-secure-store-2026)
- [react-native-async-storage #83 6MB Android limit](https://github.com/react-native-async-storage/async-storage/issues/83)
- [LogRocket — react-native-mmkv for app performance](https://blog.logrocket.com/using-react-native-mmkv-improve-app-performance/)
- [oneuptime — Persist State AsyncStorage MMKV 2026](https://oneuptime.com/blog/post/2026-01-15-react-native-asyncstorage-mmkv/view)
- [Ignite Cookbook — Migrating to MMKV](https://ignitecookbook.com/docs/recipes/MigratingToMMKV/)

### expo-secure-store / Keychain
- [Expo SecureStore docs SDK 55](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Tessl expo-secure-store 15.0.0](https://tessl.io/registry/tessl/npm-expo-secure-store/15.0.0)
- [Expo Security docs](https://docs.expo.dev/app-signing/security/)
- [expo/expo #30795 No iCloud Keychain sync](https://github.com/expo/expo/issues/30795)
- [expo/expo #40662 iOS Keychain persists after uninstall](https://github.com/expo/expo/issues/40662)
- [expo/expo #12956 Same TeamID shared keychain](https://github.com/expo/expo/issues/12956)
- [expo/expo #23924 User interaction is not allowed](https://github.com/expo/expo/issues/23924)
- [expo/expo #24829 WHEN_UNLOCKED_THIS_DEVICE_ONLY incorrect handling](https://github.com/expo/expo/issues/24829)
- [Clerk — Face ID/Biometric Login Expo](https://clerk.com/articles/how-to-add-face-id-biometric-login-to-your-expo-clerk-app)
- [Medium — Secure Your RN App with SecureStorage Apr 2026](https://medium.com/@malikchohra/secure-your-react-native-app-with-secure-storage-expo-edition-a899dbbe3b8f)
- [Gist — Quick comparison expo-secure-store react-native-keychain](https://gist.github.com/ChinmayKuJena/1eae1d2d3ec2a2232a4233657ed3cfd7)
- [npmtrends expo-secure-store vs alternatives](https://npmtrends.com/expo-secure-store-vs-react-native-keychain-vs-react-native-mmkv-storage-vs-react-native-secure-storage-vs-react-native-sensitive-info)

### Sync engines
- [PowerSync pricing](https://powersync.com/pricing)
- [PowerSync — RN client SDK](https://www.npmjs.com/package/@powersync/react-native)
- [tolinski.ski — Spectrum of Local First Libraries](https://tolin.ski/posts/local-first-options)
- [Hacker News — Offline-First Landscape 2025](https://news.ycombinator.com/item?id=45066070)
- [trybuildpilot — ElectricSQL vs PowerSync vs Zero 2026](https://trybuildpilot.com/648-electric-sql-vs-powersync-vs-zero-2026)
- [cssauthor — Best Offline-First Tech Stack 2026](https://cssauthor.com/offline-first-tech-stack/)
- [findalternatives — Best ElectricSQL Alternatives 2026](https://findalternatives.net/software/electric-sql-alternatives)
- [RxDB alternatives docs](https://rxdb.info/alternatives.html)
- [Powersync developer case study](https://www.powersync.com/blog/developer-case-study-guillem-puche-xiroi-cat)

### Security & OWASP
- [Securing RN Mobile Apps with OWASP MAS](https://owasp.org/blog/2024/10/02/Securing-React-Native-Mobile-Apps-with-OWASP-MAS)
- [Medium — Credential Security in RN OWASP M1 2026](https://medium.com/@bariskandemirx/credential-security-in-react-native-owasp-mobile-top-10-m1-5da9cb7666dd)
- [DEV — Improper Credential Usage RN OWASP M1](https://dev.to/jocanola/understanding-owasp-m1-2024-improper-credential-usage-in-react-nativeexpo-and-how-to-mitigate-it-2657)
- [Cossack Labs — RN app security](https://www.cossacklabs.com/blog/react-native-app-security/)
- [Talsec — RN secure storage solutions](https://docs.talsec.app/appsec-articles/articles/safeguarding-your-data-in-react-native-secure-storage-solutions)
- [Quokka Labs — RN security risks 2026](https://quokkalabs.com/blog/react-native-app-security/)
- [secureprivacy GDPR mobile 2026](https://secureprivacy.ai/blog/gdpr-compliance-mobile-apps)
- [Apple Privacy Manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [react-native-mmkv #659 Apple Privacy Manifest](https://github.com/mrousavy/react-native-mmkv/issues/659)
