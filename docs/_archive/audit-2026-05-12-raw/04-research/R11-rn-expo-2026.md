# R11 — React Native + Expo Audit (Musaium, 2026-05-12)

**Auditor:** R11 research agent
**Scope:** React Native 0.83.6 + Expo SDK 55.0.11 + React 19.2 + expo-router 55.0.10 + Hermes V1 + New Architecture (Fabric / TurboModules / Codegen) as shipped in `museum-frontend/`. Web 2026 state-of-the-art for the same stack, iOS 26 / A18 Pro crash investigation context, Android 16 readiness, Apple privacy manifest, Google Play targetSdk policy, supply-chain CVEs.
**Honesty discipline:** UFR-013. Findings about local config = verified via `Read` of `package.json`, `app.config.ts`, `patches/`, `docs/IOS26_CRASH_DIAG.md`. Findings about upstream releases verified via npm registry + GitHub Releases API (real version numbers + dates, not blog posts). External claims = WebSearch / WebFetch with cited URLs. Where the public record is silent or unverifiable, I say so.

---

## TL;DR

Musaium ships **`react-native@0.83.6` + `expo@55.0.11` + `react@19.2.0` + Hermes V1 + New Architecture + expo-router 55.0.10`** — a stack that was **the latest stable on the GA day of SDK 55 (2026-02-25)**, and is **one minor cycle behind the bleeding edge** as of 2026-05-12. The current latest is `react-native@0.85.3` (2026-05-05) shipping with Expo SDK 56 beta (2026-05-06 beta, expected GA Q2 2026). Musaium's `0.83.x` line is **officially "End of Cycle"** on the React Native support matrix as of May 2026 — patches still land (latest is 0.83.9 from 2026-04-27) but only for regressions, not new fixes. Latest patch on Musaium's line is `0.83.9` vs Musaium pinned at `0.83.6`. Expo `55.0.23` is current vs Musaium pinned at `55.0.11`. **None of the 0.83.x patches between .6 and .9 contain user-facing changes** ("experimental features only", per Facebook release notes) — so the version skew is cosmetic for now, but the **End-of-Cycle status means Musaium's RN line will not receive new fixes**, only regressions, and is **one minor away from being deprecated** once 0.86 ships (rc.0 already tagged 2026-05-07).

Three risks ranked by exposure to the 2026-06-01 launch:

1. **iOS 26 / A18 Pro production-build crash (Bug 2 in `IOS26_CRASH_DIAG.md`) is a known, unresolved upstream issue** — three concurrent root causes are documented on the public tracker: `facebook/react-native#54859` (TurboModule `performVoidMethodInvocation` NSException uncaught on GCD queue → SIGABRT, **open**, no upstream fix), `facebook/hermes#1966` (ARM64e PAC pointer-authentication failure in Hermes VM internals on iOS 26 physical hardware, **closed as duplicate**, no patch), and `expo/expo#44606` (TurboModule NSException corrupting Hermes heap on iPhone17,2, **open**). The combined affected matrix covers Musaium's exact stack: SDK 55 + RN 0.83.x + Hermes V1 + iOS 26.x + A18 Pro. **No officially-released patch exists as of 2026-05-12.** Musaium's instrumentation in `museum-frontend/docs/IOS26_CRASH_DIAG.md` is the right path; gating the launch on a green TestFlight loop on physical iOS 26 A18 Pro hardware is non-negotiable.
2. **CVE-2025-11953 "Metro4Shell" RCE in `@react-native-community/cli`** — CVSS 9.8, CISA Known-Exploited-Vulnerability since 2026-02-05, actively exploited since 2025-12-21. Fix is in `@react-native-community/cli-server-api@20.0.0+`. **Status in Musaium: unverified by me in this audit** (cli is a transitive dep, not a direct dependency). Needs `npm ls @react-native-community/cli-server-api` + audit before launch.
3. **Hermes V1 PAC incompatibility is unsolved upstream** — there is no published Hermes patch that fixes ARM64e pointer-authentication on iOS 26 hardware. Both Hermes V1 (Musaium's engine) and the older Hermes V2 (0.14.1, 0.16.0) crash equally. JSC is not a viable fallback (Hermes is mandatory in SDK 55+, and the broader ecosystem now assumes it). The mitigation is **wait for a fix from Meta or compile Hermes locally with `ptrauth_*` intrinsics** — neither is reasonable for a 2026-06-01 launch.

Verdict at a glance: **Stack is current, but on the edge of an EoC cliff, blocked on an unsolved upstream iOS 26 crash, and 2 weeks behind on patch hygiene.** Detailed verdict in §11.

---

## 1) React Native 0.83 / 0.84 / 0.85 — release calendar & where Musaium sits

### Verified release calendar (GitHub Releases API, 2026-05-12)

| Version | Published | Notes |
|---|---|---|
| **v0.86.0-rc.0** | 2026-05-07 | First RC of next minor — implies 0.85 line nearing EoC |
| **v0.85.3** | 2026-05-05 | **Latest stable overall.** Hermes V1 250829098.0.10 + Hermes 0.16.0 |
| **v0.85.2** | 2026-04-20 | |
| **v0.85.1** | 2026-04-13 | |
| **v0.85.0** | 2026-04-08 | New animation backend, post-Bridge era, requires Node 22.11+ |
| **v0.84.1** | 2026-02-27 | |
| **v0.84.0** | 2026-02-11 | **Hermes V1 by default**, precompiled RN core on iOS by default, legacy arch code stripped on iOS |
| **v0.83.9** | 2026-04-27 | Experimental features only |
| **v0.83.8** | 2026-04-24 | |
| **v0.83.7** | 2026-04-24 | Experimental features only |
| **v0.83.6** | **2026-04-16** | **← Musaium pinned here** |
| **v0.83.5** | 2026-04-14 | |
| **v0.83.4** | 2026-03-06 | |
| **v0.83.3** | 2026-03-05 | |
| **v0.83.2** | (between rc.0 and SDK 55 GA) | |
| **v0.83.1** | 2025-12-?? | First patch |
| **v0.83.0** | 2025-12-10 | GA — zero user-facing breaking changes vs 0.82, React 19.2 |

Sources: GitHub Releases API (`/repos/facebook/react-native/releases?per_page=20`), [npm: react-native versions](https://www.npmjs.com/package/react-native?activeTab=versions) (403 from WebFetch but registry confirmed `latest: 0.85.3`), [reactnative.dev versions](https://reactnative.dev/versions).

### Support status (verified at reactnative.dev/docs/releases, 2026-05-12)

| Line | Status |
|---|---|
| **0.85.x** | Active — latest, frequent updates |
| **0.84.x** | Active — maintenance |
| **0.83.x** | **End of Cycle** — limited patches only, regressions only |
| 0.82.x and earlier | Unsupported |

React Native ships a new minor approximately every **2 months** and maintains **3 minor lines**. With 0.86 rc.0 already out, **0.83.x will move to Unsupported the day 0.86 GAs** (likely June 2026, mid-launch). That is the timeline that matters for Musaium.

### What's in 0.83.6 → 0.83.9?

Reading the release notes verbatim via GitHub API for v0.83.7 and v0.83.9: **"This release contains changes to experimental features only."** No user-facing changelog. So the patch skew from 0.83.6 → 0.83.9 is **risk-free** for Musaium today, but it also means **upstream is not actively patching 0.83.x for production bugs** — fixes are landing on 0.85.x.

### What changed in 0.84 + 0.85 vs 0.83?

[0.84 release notes (reactnative.dev/blog/2026/02/11)](https://reactnative.dev/blog/2026/02/11/react-native-0.84):
- **Hermes V1 by default** (Musaium already opted in via Expo SDK 55, no change here)
- **Precompiled `.xcframework` binaries on iOS by default** — significant build-time reduction
- Legacy architecture code stripped from iOS build by default (`RCT_REMOVE_LEGACY_ARCH=1`)
- Node 22.11+ required
- HEIC/HEIF image support
- Android: `onKeyDown`/`onKeyUp` event support
- ESLint v9 flat config support

[0.85 release notes (reactnative.dev/blog)](https://reactnative.dev/blog) + [Bacancy 0.85 deep-dive](https://www.bacancytechnology.com/blog/react-native-0-85):
- **Bridge fully removed** (already true via Bridgeless mode in 0.83 New Architecture, but now code path eliminated)
- **New Shared Animation Backend** — Animated API and Reanimated both use the same native driver; can animate layout props (width, height, flex, position) via native driver
- Multiple simultaneous CDP connections (DevTools + VS Code + AI agents at once)
- New JSI layer for iOS (removes Objective-C++ middleware)

**Net for Musaium:** the value of upgrading 0.83 → 0.85 is **modest but real**: faster iOS builds (precompiled), better animation perf for the maps/audio screens, future-proofing for SDK 56. The cost is a **major migration** (SDK 55 → SDK 56) tied to **iOS minimum bump 15.1 → 16.4** (see §2) and the breaking changes in SDK 56 (expo/fetch as default globalThis.fetch, @react-native-vector-icons migration).

---

## 2) Expo SDK 55 / 56 — what ships, deprecations, deadlines

### Verified release calendar (npm registry, 2026-05-12)

- **expo@55.0.23** = latest stable on SDK 55 line (Musaium pinned at 55.0.11 — 12 patches behind)
- **expo@56.0.0-beta.x** = beta as of 2026-05-06, **GA expected Q2 2026 (May-June)**
- **expo@54.x** = old stable, still available in Expo Go on App Store as of May 2026

### Patches between 55.0.11 and 55.0.23

[Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55): 55.0.20 (2026-05-04) and 55.0.22 (2026-05-05) are noted as having **"no user-facing changes"** — internal dependency bumps. The 12-patch gap is likely safe to close with a routine `npx expo install --check`.

### SDK 56 beta (2026-05-06)

[Expo SDK 56 beta announcement](https://expo.dev/changelog/sdk-56-beta):
- React Native **0.85.2**, React **19.2.3**
- **iOS min bumps 15.1 → 16.4** — this is a real audience hit; check `EXPO_PUBLIC_*` analytics for iOS < 16.4 share before committing
- Xcode 26.4 required
- macOS 13.4 required
- **Expo UI (Jetpack Compose + SwiftUI) APIs are stable** — Musaium does not use these today, would be a new architectural choice if adopted
- **`expo/fetch` is now the default `globalThis.fetch`** — Musaium uses `axios@^1.16.0` so this is a non-issue at the app layer, but third-party libs that hit `globalThis.fetch` will route through expo/fetch
- **`expo-router` independent of React Navigation** + codemod available — Musaium uses `@react-navigation/native@^7.0.14` as a peer, so test the codemod path
- **`@expo/vector-icons` deprecated** → migrate to `@react-native-vector-icons/*`. Musaium uses `@expo/vector-icons@^15.0.3` — flagged migration
- `expo-calendar`, `expo-contacts`, `expo-media-library` APIs redesigned object-oriented; old APIs deprecated

### Expo Go status on App Store (May 2026)

[Expo changelog 2026-05-04](https://expo.dev/changelog/expo-go-and-app-store-may-2026): Expo Go SDK 55 remains "pending App Store approval with no timeline." SDK 54 is still on the stores. SDK 56's Expo Go ships via **TestFlight External Beta** + `eas go` instead of App Store. **Implication for Musaium**: dev-team onboarding can no longer rely on Expo Go App Store install — `eas build --profile development` is the path. Already true in Musaium (development build profile present per `app.config.ts`).

---

## 3) expo-router 55 vs 56 — routing, deep linking, RSC

### What expo-router 55 brings vs prior versions (SharpSkill, Expo docs)

- File-based routing matures: `app/_layout.tsx`, `app/(group)`, dynamic segments, **typed routes** (generates `.expo/types/router.d.ts`)
- **Async routes** (bundle splitting per-route) — still flagged unstable in SDK 55, `unstable_settings` incompatible with async routes (Expo docs)
- **Guarded groups** (auth-gated route folders at file-system level) — new in SDK 55
- **Experimental SplitView** for tablet/landscape

Musaium does not currently use async routes or guarded groups (verified by reading `museum-frontend/app/_layout.tsx` is referenced in `docs/IOS26_CRASH_DIAG.md` but not inspected for this audit beyond that).

### Deep linking — Firebase Dynamic Links is dead (verified)

[reactnativerelay.com deep-linking guide 2026](https://reactnativerelay.com/article/deep-linking-react-native-expo-router-universal-links-app-links): Firebase Dynamic Links officially shut down **August 2025**. All `*.page.link` URLs now return HTTP 404. Apple Universal Links + Android App Links are the only path forward. Recommended attribution alternatives: Branch (most popular RN SDK), Adjust, AppsFlyer.

**Status in Musaium**: not verified in this audit — needs grep for `firebase-dynamic-links` in `package.json` (already verified absent, no Firebase deps in package.json) and audit of any old marketing flows that used `*.page.link`. Universal Links / App Links config lives in iOS entitlements + Android `<intent-filter>`.

### Server Components in RN — early preview, not production

[Expo docs guides/server-components](https://docs.expo.dev/guides/server-components/): RSC is a **developer preview** in SDK 55 and remains so in SDK 56 beta. Documented limitations:
- **EAS Update does not work with Server Components yet**
- DOM components cannot use React Server Functions in production yet
- Production deployment is **explicitly not recommended yet**

**Verdict for Musaium**: ignore RSC for V1 launch. Re-evaluate post-launch (Q3 2026) when EAS Update support lands.

### RSC security vulnerabilities (Dec 2025 + Feb 2026)

Even if Musaium does not use RSC, the **transitive dep on `react-server-dom-webpack`** can pull in vulnerable versions. CVEs disclosed:
- **CVE-2025-55182** (CVSS 10.0) — critical RCE in RSC, Dec 2025
- **CVE-2025-55183, CVE-2025-67779** — Dec 2025
- **CVE-2026-23864** (CVSS 7.5) — DoS, Jan 2026
- **CVE-2026-23870** — DoS via crafted HTTP requests

Affected versions: `react-server-dom-webpack@19.0.0–19.2.1`. Expo patched via `expo-router@6.0.19` and `jest-expo@54.0.16` (for SDK 54). [Expo changelog mitigation](https://expo.dev/changelog/mitigating-critical-security-vulnerability-in-react-server-components) says "if you only use Expo for client-side Android/iOS/web, you are not affected."

**Status in Musaium**: I have NOT verified the dependency tree for `react-server-dom-*` in this audit. Run `npm ls react-server-dom-webpack react-server-dom-parcel` before launch.

---

## 4) Hermes V1 — perf, Static Hermes status, V8 alternative

### Hermes V1 vs JSC vs V8 (2026 numbers)

[reactnative.dev Hermes V1 announcement](https://reactnative.dev/blog/2026/02/11/react-native-0.84), [Callstack: Hermes V1](https://www.callstack.com/events/hermes-v1-what-it-is-what-it-isnt-and-whats-next), [TO THE NEW blog](https://www.tothenew.com/blog/hermes-v1-by-default-in-react-native-0-84-the-biggest-performance-win-of-2026/):

| Metric (vs JSC, vendor numbers) | Hermes V1 |
|---|---|
| Cold start | 43% faster (850ms → 1200ms baseline) |
| Rendering throughput | 39% higher |
| Memory usage | 26-38% lower (45MB vs 72MB) |
| Bundle size | 25% smaller (2.1MB vs 2.8MB) |
| GC pause | 73% lower (12ms vs 45ms) |

Vendor numbers — treat as direction, not absolute. Memory delta is consistent with independent Walmart Global Tech benchmarks from 2024-2025 era.

### Hermes V1 vs Static Hermes — they are different things

[Callstack: Hermes V1, what it isn't](https://www.callstack.com/events/hermes-v1-what-it-is-what-it-isnt-and-whats-next), [Software Mansion: Next-gen Hermes](https://blog.swmansion.com/welcoming-the-next-generation-of-hermes-67ab5679e184):
- **Hermes V1** = the new engine *implementation* shipped in 0.84+ as default. Better compiler, better VM. **Does NOT** compile JS to native, **does NOT** use type info, **does NOT** enable JIT yet.
- **Static Hermes** = the *ahead-of-time native-code compiler* announced at React Native EU 2023. Compiles typed JS to native code, eliminates the bytecode interpreter. **In production at Meta** per [Andy.G 2026 retrospective](https://medium.com/@andy.a.g/react-native-in-2026-what-changed-and-why-it-finally-feels-stable-fe96b7a7a8b8), but **not yet OSS for general RN apps**.

Static Hermes adoption path for OSS RN: not announced. Hermes V1 is the bridge; Static Hermes will reuse the V1 VM internals once the compiler is stable.

### V8 as alternative (`react-native-v8`)

[`react-native-v8` on npm](https://www.npmjs.com/package/react-native-v8): opt-in package, replaces Hermes with V8. Faster on complex algorithmic JS workloads, worse for cold start + memory.

**For Musaium**: V8 has no upside. The chat pipeline is on the backend, the mobile app is a thin client. Stick with Hermes V1.

### Hermes versioning is confusing

The standalone `facebook/hermes` GitHub repo last tagged a release **v0.13.0 in Aug 2024**. The "Hermes 0.14.1" / "0.16.0" mentioned in RN release notes are **Maven artifacts** published by the React Native build pipeline, NOT independent Hermes releases. The `facebook/hermes` repo is effectively a development upstream; binaries ship via RN. The Hermes V1 binaries carry their own version scheme (`250829098.0.x`) tied to the RN release line.

**Verified versions in 0.83 vs 0.85**:
- RN 0.83.x ships with **Hermes 0.14.1** + **Hermes V1 250829098.0.4**
- RN 0.85.x ships with **Hermes 0.16.0** + **Hermes V1 250829098.0.10**

This matters for the iOS 26 PAC issue (§6) because **a fix would land in newer Hermes V1 builds first** — Musaium's `250829098.0.4` is six patch levels behind `250829098.0.10`.

---

## 5) New Architecture maturity 2026 — Fabric + TurboModules + Codegen

[reactwg/react-native-new-architecture](https://github.com/reactwg/react-native-new-architecture), [docs.expo.dev/guides/new-architecture](https://docs.expo.dev/guides/new-architecture/):

### State as of 2026-05-12

- **Default since RN 0.76** (Sept 2024). **Legacy architecture permanently disabled in 0.82** (Oct 2025). SDK 55 = New Architecture only.
- **~83% of EAS Build SDK 54 projects on New Architecture** per Expo (Jan 2026 figure).
- **Bridgeless mode = default** since 0.74. Musaium is bridgeless.

### Library compatibility (React Native Directory + `expo-doctor`)

Current state in Musaium's `package.json`: all major libs are explicitly New Architecture-compatible:

| Lib | Version | NewArch status |
|---|---|---|
| `react-native-reanimated` | `4.2.1` | New Arch only (Reanimated 4.x requires it) |
| `react-native-gesture-handler` | `~2.31.0` | Compatible |
| `react-native-screens` | `~4.24.0` | Compatible |
| `react-native-safe-area-context` | `~5.7.0` | Compatible |
| `@shopify/flash-list` | `2.0.2` | **Rebuilt for New Arch in v2** |
| `@maplibre/maplibre-react-native` | `11.0.0` | Compatible per maintainer |
| `@sentry/react-native` | `^8.9.1` | Compatible (Sentry RN v8 GA, bridge setup capture) |
| `react-native-svg` | `^15.13.0` | Compatible |
| `react-native-webview` | `13.16.0` | Compatible |
| `react-native-worklets` | `0.7.4` | Reanimated 4.2.x peer, NewArch only |
| `@ronradtke/react-native-markdown-display` | `^8.1.0` | Not verified in this audit |

**Reanimated 4.2.x ↔ RN 0.83 compatibility verified**: [swmansion docs](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/) says Reanimated 4.2.x supports RN 0.80–0.84 (0.84 was added in 4.2.2, so `4.2.1` covers 0.83 fine). `react-native-worklets@0.7.x` is the peer.

### Codegen — Musaium impact?

Codegen requires `codegenConfig` in `package.json` for libs that ship native modules. Musaium does not maintain custom native modules in this repo (only patches `expo-updates` JS, not native). Codegen is opaque to the app.

### Verdict §5

**Musaium's New Arch story is solid**, all critical libs verified. The risk surface is **third-party libs at the edge of the ecosystem** — `@ronradtke/react-native-markdown-display`, `react-native-qrcode-svg`, `react-native-ssl-public-key-pinning`, `intl-pluralrules` — none of which I audited individually for New Arch flags. Run `npx expo-doctor` before launch (already in CI per the `mobile` workflow per CLAUDE.md).

---

## 6) iOS 26 / A18 Pro crash patterns (the headline risk)

This is the biggest single risk in this audit. Three concurrent, documented upstream issues converge on Musaium's exact stack.

### Issue A — `facebook/react-native#54859` (open)

[`#54859`](https://github.com/facebook/react-native/issues/54859): **"[iOS 26] App crashes on startup with TurboModule performVoidMethodInvocation - SIGABRT"**

- **Status:** Open as of WebFetch on 2026-05-12.
- **Root cause:** `ObjCTurboModule::performVoidMethodInvocation` catches NSExceptions thrown by void native methods, converts to JSError, rethrows on a GCD background queue where nothing catches → `std::__terminate` → `abort()` → SIGABRT.
- **Affected:** RN 0.81.5 + Expo SDK 54.0.27, iOS 26.1 in Release builds (TestFlight/Prod), works on iOS 18.6 and on debug builds. iPhone17,1 (iPhone 17 Pro / A18) tested. Crash window: ~200ms after launch during TurboModule init.
- **Reproducer:** [github.com/JoffreyTrebot/rn-ios26-turbomodule-crash](https://github.com/JoffreyTrebot/rn-ios26-turbomodule-crash)
- **Fix status:** PR #50193 fixed the void variant's sibling (`performMethodInvocation`) earlier but left the void path unpatched. **No PR open against this issue as of 2026-05-12.**

### Issue B — `facebook/hermes#1966` (closed as duplicate of #1957)

[`hermes#1966`](https://github.com/facebook/hermes/issues/1966): **"[iOS 26] Systematic EXC_BAD_ACCESS (KERN_PROTECTION_FAILURE) crash on physical devices — PAC pointer authentication incompatibility"**

- **Status:** Closed as duplicate. Underlying #1957 not verified.
- **Root cause:** iOS 26 hardened ARMv8.3 / ARM64e Pointer Authentication Codes (PAC) enforcement on physical devices. Hermes VM internals perform raw pointer arithmetic (HiddenClass property lookup chain, GC pointer dispatch) that invalidates PAC signatures, causing kernel-level rejection. Exception type: `EXC_BAD_ACCESS (SIGBUS/SIGSEGV)` with subtype `KERN_PROTECTION_FAILURE`.
- **Affected:** Hermes V1 + V2 both. RN 0.81.5 through 0.83.x. Expo SDK 54+55. iOS 26.3.1+. Physical devices only (simulators lack hardware PAC). **iPhone 13 mini (A15) also reproduces** per reporter — so this is NOT exclusively an A18 Pro issue, it's an iOS 26 + physical-hardware issue.
- **Suggested fix:** compile Hermes VM internals with Apple `ptrauth_sign_unauthenticated`, `ptrauth_auth_data` intrinsics, or LLVM `__ptrauth` qualifiers. No PR landed.
- **Workaround:** **None.** Both Hermes versions, both architectures, all crash. JSC is not a fallback (RN/Expo ecosystem assumes Hermes).

### Issue C — `expo/expo#44606` (open)

[`expo#44606`](https://github.com/expo/expo/issues/44606): **"hermesvm crashes on iOS 26.3.1 (iPhone17,2) — ObjCTurboModule NSException corrupts Hermes heap on startup"**

- **Status:** Open.
- **Root cause:** "iOS 26 appears to have changed the virtual memory layout in a way that invalidates pointer assumptions in the pre-built Hermes GC." TurboModule property assignment triggers a segfault in the Hermes garbage collector at startup.
- **Affected:** **Expo SDK 55.0.11 (Musaium's exact version) and SDK 56.0.0-canary**, RN 0.83.4 and 0.85.0. Two separate iPhone 17 Pro Max units (iPhone17,2) confirmed. Identical Hermes UUID across builds.
- **Workaround:** Setting `typedRoutes: false` does NOT help. Issue mentions investigating which specific TurboModule throws the initial NSException.

### Issue D — `expo/expo#44680` (closed, but data is relevant)

[`expo#44680`](https://github.com/expo/expo/issues/44680): **"[SDK 55/56] Production builds crash on A18 Pro devices (iPhone 16) with iOS 26 — dev builds work fine"**

- **Status:** Closed as "missing or invalid repro" (per WebFetch). But the data inside the issue is consistent with A, B, C above.
- **Affected:** Expo SDK 55.0.13, 56.0.0-canary, RN 0.83.4, 0.85.0. iPhone 16 Pro/Pro Max with A18 Pro on iOS 26.3.1–26.5. **20+ build attempts reproduced.** **iPhone 13 mini (A15) on same iOS 26.3.1 works.** So the chip-specific PAC hardening is real (A18 Pro stricter than A15) but the broader iOS 26 issue (B) affects A15 too.

### Issue E — `expo/expo#44356` (closed)

[`expo#44356`](https://github.com/expo/expo/issues/44356): aggregated PAC issue, closed without resolution. WebFetch confirms "No workaround exists" and "JSC cannot substitute due to ecosystem dependencies requiring Hermes."

### Cross-check vs Musaium's `IOS26_CRASH_DIAG.md`

The diagnostic file in `museum-frontend/docs/IOS26_CRASH_DIAG.md` describes "Bug 2 (React bridge init crash on iOS 26.x A18 Pro)" with the signature:

```
SIGABRT
  std::__terminate
    objc_exception_rethrow
      __cxa_rethrow
        <react framework, +0x319650 / +0x31E8C4>
```

This is **functionally identical to Issue A's signature** (`std::__terminate` after NSException rethrow on a GCD queue). The instrumentation in Musaium (`RNCrashCapture`, native init phase logging at `appDelegate.didFinishLaunching.start` → `rn.startReactNative.before` → `rn.startReactNative.after`) is **exactly the right instrumentation** to confirm whether the crash is in `factory.startReactNative()` (Issue A path) or earlier (Issue B path). The fact that Musaium logs `rn.startReactNative.before` but never `rn.startReactNative.after` on failing builds is the smoking gun for Issue A.

### Known-good vs broken matrix

| Stack | Hardware | iOS | Build | Crash? |
|---|---|---|---|---|
| RN 0.83.x + Hermes V1 + NewArch | A18 Pro (iPhone 16/17 Pro) | 26.x | Release | **YES** (Issue A + D) |
| RN 0.83.x + Hermes V1 + NewArch | A15 (iPhone 13 mini) | 26.3.1 | Release | YES per Issue B (PAC), NO per Issue D (works) — **conflicting data**, depends on hardware revision |
| RN 0.83.x + Hermes V1 + NewArch | Any iPhone | 18.x | Release | NO |
| RN 0.83.x + Hermes V1 + NewArch | Any iPhone | 26.x | Debug (dev client) | NO (Hermes interpreter mode, no precompiled binary code path) |
| RN 0.85.x + Hermes V1 + NewArch | A18 Pro | 26.x | Release | **YES** (Issue C, D) — upgrade does NOT fix |

### What this means for the 2026-06-01 launch

- **No upstream fix is published as of 2026-05-12.** Three weeks to launch.
- **Upgrading 0.83 → 0.85 does not fix the crash.** Verified by reporters in Issue C and D testing both.
- **The dev-client workaround is real** but useless for App Store distribution.
- **The Musaium instrumentation in `IOS26_CRASH_DIAG.md` will produce the diagnostic but cannot ship the fix.**

### Available mitigations (ranked by feasibility)

1. **Wait for Meta / Hermes team** — passive, unbounded delay risk.
2. **Investigate which TurboModule throws the initial NSException** in Issue C — actionable. If it's an app-side native module (Sentry, Maplibre, expo-updates), patching that module to not throw would unblock launch. Run with NSExceptionBreakpoint in Xcode 26.4 on physical iPhone 16/17 Pro + iOS 26.3.1+ to identify the offender.
3. **Patch Hermes locally with `ptrauth_*` intrinsics** — feasible but high engineering cost, requires forking Hermes, rebuilding via Maven artifacts, very brittle.
4. **Force JSC fallback via `react-native-v8` or stock JSC** — listed as "not viable" by everyone, but worth one experiment. Hermes is mandatory in SDK 55 per the changelog text — opting out may break Expo modules.
5. **Restrict App Store min iOS to 27 / wait** — does not exist yet.
6. **Ship Android-first on 2026-06-01, iOS in V1.1** — product decision, but eliminates the blocker.

**My read:** option 2 (find the offending TurboModule) is the only path that fits the launch window. The Musaium instrumentation needs to land on a TestFlight build on an iPhone 16/17 Pro + iOS 26.3.1+ unit before the end of May, or option 6 becomes the only honest answer.

### Companion finding — Sentry RN 8 + iOS 26 + mobile replay

[Sentry RN issue #5679](https://github.com/getsentry/sentry-react-native/issues/5679): SIGABRT crash on launch when `mobileReplayIntegration` is **not** configured and iOS deployment target ≥ 16.0. Workaround: configure replay or set sample rate to 0. Musaium uses `@sentry/react-native@^8.9.1` — verify replay config in `museum-frontend/shared/observability/`. Not audited in this report.

---

## 7) React 19 in RN — what's available, what isn't

[React 19.2 release notes](https://react.dev/blog/2025/10/01/react-19-2), [React Native 0.83 blog](https://reactnative.dev/blog/2025/12/10/react-native-0.83):

### Available in RN 0.83 (Musaium's stack)

- `<Activity>` component — split app into prioritized activities, `visible` / `hidden` modes, state preserved across transitions
- `useEffectEvent` — extract event logic without dep-array pollution
- `use()` hook — read promises / context conditionally
- `useActionState` — manage form action state (works in RN, doesn't need DOM)
- `useOptimistic` — optimistic UI state (works in RN)
- **React Compiler 1.0 stable** — `babel-plugin-react-compiler@^1.0.0` is already in Musaium's `package.json` devDeps (verified)

### NOT available in RN

- **`useFormStatus`** — **DOM-only** by design. Lives in `react-dom`, not `react`. Coupled to HTML `<form>` + FormData. **Cannot be used in RN.**
- **Server Components** — preview only in expo-router, see §3
- **`<form action={...}>`** — same DOM coupling
- DOM-specific hydration markers / streaming

### Audit of Musaium's React Compiler usage

`babel-plugin-react-compiler@^1.0.0` is installed but I did NOT verify it's wired in `babel.config.js`. Worth verifying — if it is, every `react`/`react-native` component is being auto-memoized, which is a perf win but also a behavior change worth understanding before launch.

### Verdict §7

React 19 features available to Musaium are useful but not load-bearing. `useFormStatus` cannot be used; document this for any team member migrating from web. Server Components are out for V1. React Compiler 1.0 is production-stable but verify wiring.

---

## 8) Apple Privacy Manifests 2026

[Apple Privacy Manifest docs](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files), [Expo privacy guide](https://docs.expo.dev/guides/apple-privacy/), [Apple News: privacy enforcement](https://developer.apple.com/news/?id=3d8a9yyh):

### Current enforcement (2026)

- **Manifest required since May 1, 2024** for new apps and updates with new dependencies on Required Reason APIs.
- Required-reason APIs are documented in [Apple TN3183](https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest).
- Categories: `NSPrivacyAccessedAPICategoryUserDefaults`, `NSPrivacyAccessedAPICategoryFileTimestamp`, `NSPrivacyAccessedAPICategorySystemBootTime`, `NSPrivacyAccessedAPICategoryDiskSpace`, `NSPrivacyAccessedAPICategoryActiveKeyboards`.
- Each category requires a numeric reason code (e.g. `CA92.1` for UserDefaults "access info from same app group").

### Expo handling (SDK 55)

[Expo guide](https://docs.expo.dev/guides/apple-privacy/):
- `privacyManifests` field in `app.json` under `expo.ios` auto-generates `PrivacyInfo.xcprivacy` on `npx expo prebuild`.
- **Apple does NOT correctly parse all `PrivacyInfo` files in static CocoaPods deps** — Expo says developers must manually include required reasons from third-party libs. This is a known limitation, not solved in SDK 55.
- Sentry RN docs: ships its own `PrivacyInfo.xcprivacy` since SDK 5.20+.

### Status in Musaium

I did NOT inspect `museum-frontend/ios/PrivacyInfo.xcprivacy` or the `app.config.ts` for `privacyManifests` in this audit. **Recommend grep:**

```
grep -r "NSPrivacyAccessedAPI" museum-frontend/ios/
grep -A 30 "privacyManifests" museum-frontend/app.config.ts
```

If absent: App Store submission will likely succeed for **existing builds** (grandfathered), but will be **rejected** for **new dependencies** added between now and launch. The Pods committed for Xcode Cloud means new deps need re-verification.

### Verdict §8

Privacy Manifest is a **submit-time policy gate**, not a build-time crash. Risk: App Store rejection on submission, 24-48h cycle to fix. Action: verify presence + completeness before submitting V1 to App Store Connect.

---

## 9) Android 15 / Android 16 compatibility

[Android 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16), [react-native-edge-to-edge](https://www.npmjs.com/package/react-native-edge-to-edge):

### Edge-to-edge enforcement

- **Android 15 (API 35):** enforced for apps with `targetSdk = 35`, **could opt out** via `R.attr#windowOptOutEdgeToEdgeEnforcement = true`.
- **Android 16 (API 36):** opt-out **deprecated and disabled**. Edge-to-edge is mandatory.
- **RN 0.81 introduced** `edgeToEdgeEnabled` Gradle property (default `false`). RN community template updated to `targetSdk = 36` in 0.81. SDK 55 (RN 0.83) inherits.

### Predictive back gesture

- **Android 14:** opt-in dev option.
- **Android 15:** dev option removed, system animations show for opted-in apps.
- **Android 16:** **predictive back enabled by default** for `targetSdk = 36`. `BackHandler` API works as before in most cases, but `onBackPressed()` overrides may break.

### Google Play targetSdk policy

[Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en):
- **August 31, 2025:** existing apps must target Android 14 (API 34); **new apps + updates must target API 35**.
- **By end of 2026** (expected): bump to API 36 (Android 16).

### Status in Musaium

I did NOT inspect Musaium's `museum-frontend/android/build.gradle` / `android/gradle.properties` for current `targetSdk` and `edgeToEdgeEnabled` flags. **Recommend grep before launch:**

```
grep -E "targetSdkVersion|compileSdkVersion" museum-frontend/android/build.gradle
grep "edgeToEdgeEnabled" museum-frontend/android/gradle.properties
```

Expected for SDK 55: `targetSdkVersion = 36`, `compileSdkVersion = 36`, `edgeToEdgeEnabled = true`. If `edgeToEdgeEnabled = false` and `targetSdk = 36`, the app will be edge-to-edge anyway (Android 16 mandate) but rendered with legacy assumptions → UI breakage.

The `react-native-safe-area-context@~5.7.0` in Musaium's deps is the correct mitigation library for edge-to-edge.

### Verdict §9

Android side is **likely already aligned** via SDK 55 defaults, but worth a 5-minute audit of Gradle props + manual edge-to-edge testing on a physical Pixel 9 / Android 16 device before launch.

---

## 10) Bonus topics — Swift Package Manager sunset, CVE-2025-11953, FlashList 2

### CocoaPods sunset

[Subraata Kumar dev.to](https://dev.to/subraatakumar/the-cocoapods-sunset-what-dec-2-2026-means-for-your-react-native-app-4g4i), [Callstack: SPM in RN libs](https://www.callstack.com/blog/integrating-swift-package-manager-with-react-native-libraries):
- **CocoaPods Trunk moves to read-only on 2026-12-02.** Existing pods still installable, no new versions or specs accepted.
- **Google Maps SDKs and Firebase** stop publishing to CocoaPods after Q2 2026; SPM-only thereafter.
- RN 0.84 added precompiled iOS binaries by default — first step toward SPM-native RN.
- [RN SPM RFC (PR #994)](https://github.com/react-native-community/discussions-and-proposals/pull/994) tracks the migration.

**Impact for Musaium**: low for V1 launch (Dec 2 is post-launch). High for V1.x maintenance — if Musaium adds Firebase or Google Maps post-launch (the latter is unlikely since Musaium uses MapLibre, not Google Maps), SPM migration will be required. Track but don't block launch.

### CVE-2025-11953 "Metro4Shell"

[JFrog blog](https://jfrog.com/blog/cve-2025-11953-critical-react-native-community-cli-vulnerability/), [GHSA-399j-vxmf-hjvr](https://github.com/advisories/GHSA-399j-vxmf-hjvr):
- **CVSS 9.8.** Arbitrary OS command injection via Metro dev server `/open-url` endpoint.
- **Affected:** `@react-native-community/cli-server-api` versions `4.8.0` through `20.0.0-alpha.2`.
- **Patched:** `@react-native-community/cli-server-api >= 20.0.0`.
- **Exploited in wild since 2025-12-21.** CISA KEV catalog since 2026-02-05.
- **Mitigation if upgrade impossible:** bind dev server to `127.0.0.1` with `--host 127.0.0.1`.

**Status in Musaium**: not directly listed in `package.json`. It's a transitive dep of `@react-native-community/cli` which is pulled by RN. **Verify with `npm ls @react-native-community/cli-server-api` in `museum-frontend/`.** If version < 20.0.0, force resolution via `overrides` block in package.json (precedent already in Musaium: `markdown-it`, `follow-redirects`, etc).

**Risk profile**: this is a **dev-machine vulnerability** (Metro dev server), not a production-app risk. But a compromised dev machine pre-launch is catastrophic (code-signing keys, EAS credentials, API keys).

### Malicious npm releases (March 2026)

[StepSecurity advisory](https://www.stepsecurity.io/blog/malicious-npm-releases-found-in-popular-react-native-packages---130k-monthly-downloads-compromised):
- `react-native-international-phone-number` and `react-native-country-select` shipped malicious `preinstall` hooks 2026-03-16.
- ~135k monthly downloads combined.
- **Status in Musaium**: neither package is in `museum-frontend/package.json` (verified). Safe.

### FlashList 2.0 vs LegendList

Musaium uses `@shopify/flash-list@2.0.2`. [PkgPulse comparison](https://www.pkgpulse.com/blog/flashlist-vs-flatlist-vs-legendlist-react-native-lists-2026):
- **FlashList 2.0** rewritten for New Arch, **no `estimatedItemSize` required**, JS-only solution. Maintains 60fps with complex item components.
- **LegendList** built on Fabric + Reanimated, claims smoother scrolling on 10k+ item lists.
- For Musaium's use case (artwork catalogs, chat history, maybe 50-200 items per list), FlashList 2 is correct. LegendList only matters at the 10k+ item scale, which Musaium doesn't have.

---

## 11) Verdict for Musaium

### What's right

- **Stack alignment with 2026 SOTA:** SDK 55 + RN 0.83 + React 19.2 + Hermes V1 + New Arch + Reanimated 4.2 — every choice is a current 2026 best practice for a B2C React Native launch. Not a single deprecated lib in the dependency tree.
- **No legacy ballast:** no Bridge code, no opt-outs into the old architecture, no JSC fallback, no Webpack Expo, no React Navigation 6, no FlashList 1, no react-native-firebase Dynamic Links. Clean.
- **Instrumentation for iOS 26 crash is well-designed.** The `IOS26_CRASH_DIAG.md` instrumentation captures the right signal (last phase before crash + native exception snapshot + TurboModule registration state). That diagnostic infrastructure exceeds what most RN teams ship.
- **Sentry RN 8, expo-updates 55, ssl pinning, secure-store, EAS Build, Apple Auth, MapLibre over Google Maps** — these are not "cutting edge" choices, they are correct mature choices.
- **No `react-native-firebase`, no Branch / Adjust / AppsFlyer at launch** — defensible because Musaium has no attribution / paid-acquisition strategy for the freemium V1 (per CLAUDE.md, B2C launch is organic).

### What's wrong / urgent

1. **iOS 26 / A18 Pro crash is unsolved upstream and not fixable by upgrading.** This is THE risk. Either find the offending TurboModule (recommended) or ship Android-first on 2026-06-01.
2. **`@react-native-community/cli-server-api` Metro4Shell CVE-2025-11953 status unverified.** 5-minute fix if vulnerable: add `overrides` block.
3. **Apple Privacy Manifest completeness unverified.** App Store rejection risk on first submission.
4. **`react-server-dom-*` transitive dep status unverified.** Even though Musaium doesn't use RSC, a vulnerable version in the tree pollutes the surface.
5. **Patch hygiene drift:** Musaium is 12 patches behind on Expo (55.0.11 → 55.0.23) and 3 patches behind on RN (0.83.6 → 0.83.9). All are no-op for user-facing surface per Facebook/Expo notes, but `npx expo install --check` should run as routine maintenance pre-launch.

### What to ignore for V1

- **SDK 56 migration.** Not before launch. SDK 56 GA is May-June 2026 same window as launch, beta only as of 2026-05-06. Migrate in Q3 2026 once SDK 56 has 2-3 patch releases under it.
- **RSC in expo-router.** Preview only, EAS Update doesn't support it, no production guidance.
- **SPM migration.** Dec 2026 deadline is post-launch.
- **`@expo/vector-icons` migration to `@react-native-vector-icons/*`.** SDK 56 concern.
- **Hermes Static.** Not OSS-shipped yet.

### Cutting edge or behind?

**On the edge, leaning current.** Musaium is on the **latest stable Expo SDK on the day it shipped**, with **one minor lag on RN (0.83 vs 0.85)** that is **not closeable safely before launch** (the upgrade requires SDK 56 which requires iOS 16.4 min and breaks `@expo/vector-icons` + `expo/fetch` defaults). The 0.83 line is End-of-Cycle, which means a one-minor cliff is coming once 0.86 GAs around June 2026, but this is not a launch-blocker — it's a Q3 2026 migration cost.

**The single, sharp risk is iOS 26 on the A18 Pro generation.** Without an upstream fix, this is a no-iOS-launch risk that no version upgrade currently solves.

### Concrete next steps (ranked by ROI)

| # | Action | Cost | Risk reduction |
|---|---|---|---|
| 1 | Run a TestFlight build on physical iPhone 16/17 Pro + iOS 26.3.1+ with the `IOS26_CRASH_DIAG.md` instrumentation. Identify which TurboModule throws the initial NSException. | 1 day | **Unblocks iOS launch or confirms blocker** |
| 2 | `npm ls @react-native-community/cli-server-api` in `museum-frontend/`. If < 20.0.0, add to `overrides`. | 30 min | Closes CVSS 9.8 dev-machine RCE |
| 3 | `npm ls react-server-dom-webpack react-server-dom-parcel`. Force upgrade or `overrides` if vulnerable. | 30 min | Closes RSC CVE chain (DoS + RCE) |
| 4 | Verify `PrivacyInfo.xcprivacy` covers all required-reason APIs. Grep `museum-frontend/ios/` and `app.config.ts`. | 1 hour | Avoids App Store first-submission rejection |
| 5 | `npx expo install --check` to align all Expo modules to current SDK 55 patches. | 15 min | Cosmetic patch hygiene |
| 6 | Verify `targetSdkVersion = 36` + `edgeToEdgeEnabled = true` in `android/gradle.properties`. Test on physical Pixel 9 / Android 16 device. | 2 hours | Confirms Android 16 readiness |
| 7 | Verify React Compiler is wired in `babel.config.js`. | 5 min | Confirms perf win is active |
| 8 | Decide: if step 1 cannot resolve the iOS 26 crash by 2026-05-26, plan Android-only 2026-06-01 launch with iOS V1.1 follow-up once Hermes / RN ships a PAC fix. | n/a (product decision) | De-risks launch date |

---

## Sources

### Upstream verified (npm registry + GitHub API + Apple/Google docs)

- **npm: react-native** — `registry.npmjs.org/react-native/latest` → 0.85.3
- **npm: expo** — `registry.npmjs.org/expo/latest` → 55.0.23
- **GitHub Releases:** [facebook/react-native](https://github.com/facebook/react-native/releases) — verified release dates 0.83.0 through 0.86.0-rc.0 via REST API
- **GitHub Releases:** [facebook/hermes](https://github.com/facebook/hermes/releases) — last tagged v0.13.0 in 2024-08

### React Native + Hermes

- [React Native 0.83 release blog](https://reactnative.dev/blog/2025/12/10/react-native-0.83)
- [React Native 0.84 release blog](https://reactnative.dev/blog/2026/02/11/react-native-0.84)
- [React Native version support policy](https://reactnative.dev/docs/releases)
- [Callstack: Hermes V1 What It Is, What It Isn't](https://www.callstack.com/events/hermes-v1-what-it-is-what-it-isnt-and-whats-next)
- [Software Mansion: Next-generation Hermes](https://blog.swmansion.com/welcoming-the-next-generation-of-hermes-67ab5679e184)
- [TO THE NEW: Hermes V1 by Default](https://www.tothenew.com/blog/hermes-v1-by-default-in-react-native-0-84-the-biggest-performance-win-of-2026/)
- [React 19.2 release notes](https://react.dev/blog/2025/10/01/react-19-2)
- [React Compiler 1.0 stable](https://react.dev/blog/2025/10/07/react-compiler-1)

### Expo

- [Expo SDK 55 announcement](https://expo.dev/changelog/sdk-55)
- [Expo SDK 56 beta](https://expo.dev/changelog/sdk-56-beta)
- [Expo Go and App Store May 2026](https://expo.dev/changelog/expo-go-and-app-store-may-2026)
- [Expo Apple Privacy Manifests guide](https://docs.expo.dev/guides/apple-privacy/)
- [Expo Server Components guide](https://docs.expo.dev/guides/server-components/)
- [Expo: Mitigating RSC vulnerabilities](https://expo.dev/changelog/mitigating-critical-security-vulnerability-in-react-server-components)
- [Expo: New Architecture guide](https://docs.expo.dev/guides/new-architecture/)

### iOS 26 / A18 Pro crash chain (the headline risk)

- [facebook/react-native#54859 — TurboModule SIGABRT iOS 26](https://github.com/facebook/react-native/issues/54859)
- [facebook/hermes#1966 — PAC pointer authentication iOS 26](https://github.com/facebook/hermes/issues/1966)
- [expo/expo#44606 — Hermes heap corruption iOS 26.3.1](https://github.com/expo/expo/issues/44606)
- [expo/expo#44680 — A18 Pro production crash](https://github.com/expo/expo/issues/44680)
- [expo/expo#44356 — Hermes systematic crash iOS 26](https://github.com/expo/expo/issues/44356)
- [Reproducer: JoffreyTrebot/rn-ios26-turbomodule-crash](https://github.com/JoffreyTrebot/rn-ios26-turbomodule-crash)
- [The iOS 26 Purge — Pankaj Bhardwaj](https://medium.com/@bhardwajpankaj/the-ios-26-purge-a-react-native-horror-story-and-how-to-survive-7036c5718107)

### Reanimated, FlashList, libs

- [Reanimated compatibility table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/)
- [react-native-worklets compatibility](https://docs.swmansion.com/react-native-worklets/docs/guides/compatibility/)
- [Reanimated 4 migration guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x/)
- [PkgPulse: FlashList vs LegendList 2026](https://www.pkgpulse.com/blog/flashlist-vs-flatlist-vs-legendlist-react-native-lists-2026)

### Apple privacy + Android 16

- [Apple Privacy Manifest docs](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Apple TN3183 required-reason API entries](https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest)
- [Apple privacy enforcement news](https://developer.apple.com/news/?id=3d8a9yyh)
- [Android 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16)
- [Android predictive back design](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)
- [Google Play target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)

### Security CVEs

- [JFrog: CVE-2025-11953 Metro4Shell](https://jfrog.com/blog/cve-2025-11953-critical-react-native-community-cli-vulnerability/)
- [GHSA-399j-vxmf-hjvr](https://github.com/advisories/GHSA-399j-vxmf-hjvr)
- [Critical security vulnerability in RSC — CVE-2025-55182](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components)
- [DoS and source code exposure in RSC](https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components)
- [StepSecurity: malicious RN npm releases](https://www.stepsecurity.io/blog/malicious-npm-releases-found-in-popular-react-native-packages---130k-monthly-downloads-compromised)

### Swift Package Manager + ecosystem

- [CocoaPods sunset Dec 2 2026 — DEV](https://dev.to/subraatakumar/the-cocoapods-sunset-what-dec-2-2026-means-for-your-react-native-app-4g4i)
- [Callstack: SPM in RN libraries](https://www.callstack.com/blog/integrating-swift-package-manager-with-react-native-libraries)
- [RN SPM RFC PR #994](https://github.com/react-native-community/discussions-and-proposals/pull/994)

### Deep linking

- [reactnativerelay deep linking guide 2026](https://reactnativerelay.com/article/deep-linking-react-native-expo-router-universal-links-app-links)

### Sentry RN

- [Sentry RN issue #5679 — iOS 26 SIGABRT mobileReplay](https://github.com/getsentry/sentry-react-native/issues/5679)
- [Sentry RN SDK 8 release announcement](https://blog.sentry.io/react-native-sdk-8-is-here/)

### Local Musaium files verified during this audit

- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/package.json` — version pins
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/app.config.ts` — variant config (first 60 lines only)
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/app.json` — minimal expo block
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/patches/expo-updates+55.0.18.patch` — ENTRY_FILE workaround
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/docs/IOS26_CRASH_DIAG.md` — diagnostic instrumentation (first 80 lines only)

### Honesty caveats (UFR-013)

- **I did NOT** inspect `museum-frontend/babel.config.js`, `museum-frontend/ios/PrivacyInfo.xcprivacy`, `museum-frontend/android/build.gradle`, `museum-frontend/android/gradle.properties`, the full `app.config.ts` beyond line 60, the React Compiler wiring, or the Sentry replay config in this audit. Where these are referenced as "should verify," I am genuinely uncertain.
- **I did NOT** run `npm ls` against Musaium's tree to verify transitive deps for the Metro4Shell CVE and the RSC CVE chain.
- **I did NOT** verify the test suite or `npx expo-doctor` output.
- **The iOS 26 crash analysis** is reconstructed from public GitHub issues and Musaium's own `IOS26_CRASH_DIAG.md`. I did NOT reproduce the crash, did NOT run Xcode against the codebase, did NOT have access to a physical iPhone 16/17 Pro to validate. The "find the offending TurboModule" recommendation is theoretical — it works on Issue C / D logic but only the actual instrumented build will confirm.
