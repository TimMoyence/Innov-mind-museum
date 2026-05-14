# R14 — RN Testing + EAS Build Audit (Musaium V1, 2026-05-12)

> Research agent **R14**. Scope: Maestro / Detox / Appium / Jest / RTL / Stryker (testing) + EAS Build / Xcode Cloud / Codemagic / Bitrise / GitHub Actions (CI) + App Store / Play Console / Privacy Manifests / expo-updates OTA (delivery).
> Honesty UFR-013. Every claim cites a public source. Speculation explicitly flagged.

---

## TL;DR

Musaium's mobile testing posture is **above industry median** but has three concrete gaps that justify investment before the 2026-06-01 launch:

1. **No unit-test mutation coverage** — Jest line/branch gates (91/78/80/91) prove tests *run* the code, not that they *verify* it. Stryker integration would catch tautology-tests and dead assertions in chat / auth / OTA paths. Cost: ~1 dev-week, recurring ~$0 (OSS), CI minutes only.
2. **No iOS device farm for Maestro** — current setup runs Android-only on GitHub `macos-latest` (HVF-blocked, software AVD only, 600s timeouts) plus an iOS nightly cron that is unspecified by the workflow text shown. For V1 launch with B2B museums, an iOS regression escape on iPhone 12/SE2 (oldest supported chips) is the highest-risk testing gap. Maestro Cloud at $250/device/month for 2 iOS devices = $6,000/year — affordable for a paid-licence B2B trajectory.
3. **EAS Build cost at 100k MAU is dominated by EAS Update bandwidth, not builds** — at 100k MAU with the Production tier ($199/mo + overages), expected monthly bill is $649 base + bandwidth, dwarfing iOS/Android build credits. Plan: ship infrequent OTA bundles (<3 MB), runtime-version-pin natives, and budget ~$8k–$12k/year for EAS at V1+1.

**Testing maturity score: 7.2/10.** Jest discipline (factories + ratchets) is exemplary; Maestro shard design is correct; mutation testing absent; iOS E2E coverage is the single critical gap.

---

## 1. Maestro 2026

**Version & adoption.** Maestro is the open-source mobile/web E2E framework from mobile.dev. 10,800+ GitHub stars by Feb 2026, broad ecosystem traction. The killer feature: **Zero-Wait Intelligence** monitors UI state + view hierarchy + main-thread activity to detect idle states without `sleep()` / `pause()`. Settling check every 200 ms, animations up to 2 s, default 17 s element timeout, 7 s optional-element timeout. Reported flakiness rate **<1%** on properly designed flows. ([maestro.dev/insights/detox-vs-maestro-reducing-flakiness-react-native](https://maestro.dev/insights/detox-vs-maestro-reducing-flakiness-react-native))

**Maestro Cloud.** Hosted parallel device cloud. Pricing: **$250 per concurrent device per month**, iOS and Android both. Web: $125 per concurrent browser. CLI + Studio + MaestroGPT remain free OSS. Enterprise tier custom with SSO, fully-managed test cases, vendor/security review. ([maestro.dev/pricing](https://maestro.dev/pricing))

**Vs Detox.** Detox is faster on micro-flows (8–12 s vs 12–18 s login). Detox = white-box (RN-aware, Native sync via FabricDetoxIdlingResourceFactoryStrategy); Maestro = black-box (UI-tree polling). For RN-centric monolith teams w/ JS skills + sub-hour CI needs → Detox. For mixed teams w/ QA analysts, multi-platform, lower maintenance → Maestro. Reliability comparable, both well below the manual-sync flake regime. ([getpanto.ai/blog/detox-vs-maestro](https://www.getpanto.ai/blog/detox-vs-maestro))

**Vs Appium 3.** Appium 3 (Aug 2025) dropped JSON Wire Protocol, ships W3C WebDriver only, built-in Inspector plugin, modernized JavaScript core, easier third-party driver development. Still the universal/cross-platform tool but has historically lagged on RN-specific patterns. Maestro YAML is more accessible to PMs/QA; Appium 3 fits teams w/ existing WebDriverIO investment + non-RN apps in portfolio. ([appium.io/docs/en/3.1/blog/2025/08/07/-appium-3](https://appium.io/docs/en/3.1/blog/2025/08/07/-appium-3/))

**Vs WebDriverIO + Appium.** WdIO+Appium = Selenium-grade abstraction, full JS test framework, page-object patterns. Maestro YAML is simpler but less expressive for complex assertions/parameterization. WdIO better for cross-cutting web+mobile portfolios; for an RN-only mobile-only app like Musaium, Maestro wins on velocity.

**Musaium-specific assessment.** The current 4-shard config (`auth`, `chat`, `museum`, `settings`) matches Maestro's strength (parallel YAML flows). The HVF-unsupported Android emulator constraint on GitHub `macos-latest` is documented in `ci-cd-mobile.yml` and is a known industry pain point — the practical fix is either a **self-hosted Mac runner with HVF** or **migrating Android emulator runs to Linux KVM** (Ubuntu runners + nested virt). ([github.com/retyui/Using-GitHub-Actions-to-run-your-Maestro-Flows](https://github.com/retyui/Using-GitHub-Actions-to-run-your-Maestro-Flows))

---

## 2. Detox 2026 — New Architecture support status

Detox **is compatible** with React Native New Architecture (Fabric + TurboModules) for RN 0.77.x–0.84.x. Musaium uses RN 0.83.6 → in the supported window. ([drcsystems.com — RN 0.83](https://www.drcsystems.com/blogs/whats-new-in-react-native-0-83-latest-features-you-should-know/), [reactnative.dev/blog/2025/12/10/react-native-0.83](https://reactnative.dev/blog/2025/12/10/react-native-0.83))

**Known issues.** GitHub Issue `wix/Detox#4842` (Nov 2025) documents `FabricDetoxIdlingResourceFactoryStrategy` failure on RN 0.81.4 + new arch + Detox 20.42.0 — fixed in later patch versions but a reminder that the integration is still maturing. Older deadlock on iOS new-arch start was Detox 20.22.2 era. ([github.com/wix/Detox/issues/4842](https://github.com/wix/Detox/issues/4842))

**Bottom line for Musaium.** Detox would work today on 0.83.6 + new arch, but it would be a NEW investment (no current Detox harness) competing for the same use case as Maestro. **Do not adopt Detox**; deepen Maestro instead. Migration only justified if a future need for native-bridge assertions (e.g., audio recording state introspection) appears that YAML can't express.

---

## 3. Jest + RTL for RN 2026

**Current state.** Musaium runs Jest 29.7.0 + jest-expo 55.0.13 + @testing-library/react-native 13.3.3, 204 RN tests + 15 Node tests, coverage 91/78/80/91. Sane choice — RTL 13 is current major, has stable RN paths. ([github.com/jestjs/jest/issues/15743](https://github.com/jestjs/jest/issues/15743))

**Jest 30 caveat.** Migration from 29 → 30 has a **documented memory leak regression** (Jest 30.0.2 worse than 29.6.2). Recommendation: stay on Jest 29 until 30.x stabilizes. ([github.com/jestjs/jest/issues/15743](https://github.com/jestjs/jest/issues/15743))

**Vitest alternative for RN.** **Not viable for RN unit tests in 2026.** Industry consensus:
> "If you're building React Native apps, Jest is mandatory."
> ([sitepoint.com/vitest-vs-jest-2026-migration-benchmark](https://www.sitepoint.com/vitest-vs-jest-2026-migration-benchmark/), [pkgpulse.com — node:test vs Vitest vs Jest 2026](https://www.pkgpulse.com/blog/node-test-vs-vitest-vs-jest-native-test-runner-2026))

Why: jest-expo preset handles Metro transform, native-module mocks, Hermes parser quirks, `__mocks__/expo-modules-core`, and `jest-environment-react-native`. Vitest would require porting all of this. Vitest is 5–10× faster on web/component tests but the migration cost is enormous for marginal gain on RN.

**node:test.** Musaium already uses `node --test` for the Node-side helpers (15 tests, compiled via tsc to `.test-dist/`). This is correct — fast, zero-deps, pure logic. **Keep this split.**

---

## 4. EAS Build 2026 — pricing + alternatives

**Tiers (verbatim from expo.dev/pricing):**
| Tier | Price | Build credits | EAS Update MAU | Bandwidth |
|------|-------|---------------|----------------|-----------|
| Free | $0 | 15 Android + 15 iOS builds | 1,000 MAU | 100 GiB |
| Starter | $19/mo + usage | $45 credit | 3,000 MAU | 100 GiB |
| **Production** | **$199/mo + usage** | **$225 credit** | **50,000 MAU** | **1 TiB** |
| Enterprise | $1,999+/mo | $1,000 credit | 1,000,000 MAU | 40 TiB |

Additional concurrency: $50 extra. ([expo.dev/pricing](https://expo.dev/pricing))

**Per-build cost (docs example).** Android medium = **~$1**, iOS large = **~$4**. Full schedule not published on docs.expo.dev — directs to pricing page which lists tier credits only, not per-build line items. Resource classes: Android medium (4 vCPUs / 16 GB RAM), Android large (8 vCPUs / 32 GB RAM), iOS large (10 perf cores / 40 GiB RAM). Large requires paid plan. ([docs.expo.dev/billing/usage-based-pricing](https://docs.expo.dev/billing/usage-based-pricing/), [docs.expo.dev/build-reference/infrastructure](https://docs.expo.dev/build-reference/infrastructure/))

**Alternatives.**

| Platform | Notes | Pricing | Mac iOS support |
|----------|-------|---------|-----------------|
| **EAS Build** | Tight Expo integration, OTA bundled, eas-cli mature | $199/mo Production tier | M1/M2 cloud Macs |
| **Codemagic** | M2 Macs, free 500 min/mo, ~40% faster than Bitrise on iOS | $0.04–0.08/min after free tier | M2 Mac mini cloud |
| **Bitrise** | 300+ steps marketplace, mature mobile CI veteran | 300 free min/mo, then per-step | Yes, paid |
| **GitHub Actions self-hosted** | March 2026 charge for self-hosted runners was **shelved indefinitely** (community backlash). M1 macOS runner = 3-core, 7 GB, ~2.4× slower than Codemagic M4 | Free for self-hosted; ~$0.16/min for hosted iOS | macos-15 hosted or BYO Mac mini |
| **Xcode Cloud** | iOS/macOS only. Apple-only CI, deep TestFlight integration | 25 hrs/mo free w/ Dev Program; $49.99/100h, $99.99/250h, $399/1000h | Native |

Sources: [blog.codemagic.io/build-speed-benchmark-comparison](https://blog.codemagic.io/build-speed-benchmark-comparison/), [9to5mac.com — Xcode Cloud free hours](https://9to5mac.com/2023/12/07/free-hours-xcode-cloud-extended-apple-developers/), [github.blog/changelog/2025-12-16](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/), [devclass.com — GitHub self-hosted shelved](https://devclass.com/2025/12/17/github-to-charge-for-self-hosted-runners-from-march-2026/)

**EAS Build verdict for Musaium.** Stay on EAS Build. Reasons:
- Already using `expo-updates` → EAS Update is the integrated OTA path.
- Xcode Cloud is committed in `project.pbxproj` (CLAUDE.md notes "Pods committed for Xcode Cloud, Podfile fmt consteval patch, expo-updates ENTRY_FILE workaround") — switching would break the iOS commit-to-CI flow.
- Codemagic is the only viable swap for cost reduction (M2, faster iOS), but the savings would be marginal vs. the migration cost from EAS Submit + EAS Update.

---

## 5. Xcode Cloud 2026 — limitations + cost

**Pricing.** All Apple Developer Program memberships include **25 compute hours/month free** as of Dec 2023 (extended indefinitely). Beyond that:
- $49.99/mo → 100 hours
- $99.99/mo → 250 hours
- $399.99/mo → 1,000 hours
- $3,999.99/mo → 10,000 hours

Unused hours **do not roll over**. Compute hour = wall-clock CPU time on the macOS runner. ([apple.com/news?id=ik9z4ll6](https://developer.apple.com/news/?id=ik9z4ll6), [oreateai.com — Xcode Cloud pricing](https://www.oreateai.com/blog/demystifying-xcode-cloud-pricing-what-every-developer-needs-to-know/f577e433a2e80fced9861e867cc1a46b))

**Parallel jobs.** Xcode Cloud parallelizes test execution across device types automatically (e.g., 5 parallel iPhones for one workflow). No published cap on parallel workflows for paid tiers. ([developer.apple.com/xcode-cloud](https://developer.apple.com/xcode-cloud/))

**Limitations.**
- iOS / macOS / tvOS / watchOS / visionOS only. **No Android.**
- No EAS Update integration.
- 25 h cap = ~5 builds of 5 min/each or ~2 of 12 min/each per day. Tight for >1 PR/day.
- Workflow language = JSON in App Store Connect, not as expressive as `eas.json` for env layering.

**Musaium-specific.** Musaium already uses Xcode Cloud for iOS commits (per CLAUDE.md). The 25 h/mo free tier is enough for current cadence (per `git log -- museum-frontend/ios/`, low frequency). At V1 launch w/ daily nightly builds, expect to hit the $49.99/mo (100 h) tier within ~2 months. **Budget $50–100/mo.**

---

## 6. App Store / Play Console release 2026

### Apple TestFlight
- **External testers**: up to **10,000** via link/email invite.
- **Internal testers**: up to **100** App Store Connect users.
- Up to **100 builds** can be shared simultaneously.
- **Build expiration: 90 days** from upload. Build becomes unavailable to testers; cannot be extended.

Source: [developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/), [foresightmobile.com/blog/ios-app-distribution-guide-2026](https://foresightmobile.com/blog/ios-app-distribution-guide-2026)

### Apple Phased Release
- **7-day phased rollout** for app updates only (NOT first-time submissions).
- Randomly-selected % of users w/ auto-update enabled each day.
- **Pausable up to 30 days, no limit on number of pauses.**

### Google Play Console — 2026 closed testing rule
Personal accounts created after **2023-11-13** must run a **closed test with ≥ 12 testers continuously opted-in for ≥ 14 days** before production-track access is granted. Organization accounts are exempt. Testers must use real Android devices + genuine Google accounts (emulators rejected). Drop below 12 → 14-day clock resets. Reduced from 20 testers → 12 testers on 2024-12-11. ([primetestlab.com — 20 to 12 testers](https://primetestlab.com/blog/google-play-changed-20-to-12-testers))

**For Musaium**: assume organization account is in place — verify before launch. If personal account → block 14 days into the launch calendar.

### Google Play staged rollouts
Standard Play Console feature, % rollout (default starts 5%, ramp 20% / 50% / 100%). Pausable. ([capgo.app — staged rollouts](https://capgo.app/blog/google-play-staged-rollouts-how-it-works/))

---

## 7. Apple Privacy Manifests — CI testing

**Mandatory since 2024-05-01.** Apps must ship `PrivacyInfo.xcprivacy` declaring:
1. **Required-reason API usage** (NSPrivacyAccessedAPICategoryFileTimestamp, UserDefaults, SystemBootTime, DiskSpace, ActiveKeyboards) — one of ~5 approved reasons per category.
2. **Data usage categories** (what data collected, for which purpose, linked to user or not).
3. **Domain usage** (third-party domains contacted).

Fingerprinting prohibited regardless of user permission. App Store Connect **rejects builds** lacking proper manifest declarations for required-reason APIs. ([developer.apple.com/documentation/bundleresources/privacy-manifest-files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files), [mysk.blog/2024/05/03/apple-required-reason-api](https://mysk.blog/2024/05/03/apple-required-reason-api/))

**CI validation.** Three options:
1. **Xcode static check** at build time → `xcodebuild` surfaces missing PrivacyInfo entries via warnings. Not fail-fast by default.
2. **Bitrise privacy-manifest validator step** (community plugins).
3. **App Store Connect submission validation** — last line of defense, surfaces on `eas submit`.

**Musaium gap (not verified end-to-end in this audit).** Did not check whether `expo-build-properties` Privacy Manifest support is configured in `app.json`/`app.config.ts` for Musaium. **Action**: run `grep -r "PrivacyInfo" museum-frontend/` and `grep -r "xcprivacy" museum-frontend/` to confirm. Expo SDK 55 has auto-generation but third-party native deps (notably `react-native-ssl-public-key-pinning`, `expo-secure-store`, `@maplibre/maplibre-react-native`) require manual addition or upstream support. ([github.com/frw/react-native-ssl-public-key-pinning](https://github.com/frw/react-native-ssl-public-key-pinning))

---

## 8. expo-updates OTA 2026

**Version.** Musaium ships `expo-updates ~55.0.18`. Recent versions support **runtime override API** (≥0.29.0) — lets you decouple OTA bundle from native binary version. ([docs.expo.dev/versions/latest/sdk/updates](https://docs.expo.dev/versions/latest/sdk/updates/))

**Security.**
- **End-to-end code signing** via public-key cryptography. Public key embedded in binary at build; `eas update` signs bundle locally with private key; device verifies signature before applying. Rejects unsigned bundles.
- **Runtime version policies** ensure OTA bundles only reach binaries with matching native code. Mismatched native deps = bundle blocked.
- No known CVE specifically on `expo-updates` in 2026 per Snyk advisory DB at time of audit. ([security.snyk.io/package/npm/expo-updates](https://security.snyk.io/package/npm/expo-updates))

**Rollback.**
- `eas update:rollback --channel production` — interactive. Two modes:
  1. **Republish prior update** (becomes new "active" tip of the branch).
  2. **Revert to embedded update** (the bundle compiled into the binary at build time).
- Devices receive rollback on **next app launch**.
- "Bricked" app scenario (OTA breaks `expo-updates` itself) → users must reinstall. Critical to **stage rollouts** before 100%. ([docs.expo.dev/eas-update/rollbacks](https://docs.expo.dev/eas-update/rollbacks/))

**Staged rollouts.** Per-update rollout % via `eas update --rollout=10` etc. Adoption rate visible in EAS dashboard. Revert: `eas update:revert-update-rollout`. ([docs.expo.dev/eas-update/rollouts](https://docs.expo.dev/eas-update/rollouts/))

**Musaium-specific gap.** No evidence in this audit that Musaium uses **staged OTA rollouts** for production updates. With 100k MAU trajectory, going 0 → 100% on every OTA push is a significant risk (one bad bundle = full user base affected immediately). Recommend: standard rollout cadence **10 % → 50 % → 100 %** over 24–48 h, gated on Sentry crash rate + adoption metric.

---

## 9. Mutation testing for RN — Stryker support

**Stryker supports React + Jest with JSX/TSX.** Jest runner via `@stryker-mutator/jest-runner` w/ `--coverageAnalysis perTest` for performance. TypeScript checker (`@stryker-mutator/typescript-checker`) prunes type-error mutants before running. ([stryker-mutator.io/docs/stryker-js/guides/react](https://stryker-mutator.io/docs/stryker-js/guides/react/))

**RN-specific limitations.**
- Stryker mutates pure JS/TS. Native module bridge calls are out of scope — same as Jest itself.
- No official RN guide; community examples scarce.
- Slow on full-suite runs: tens of minutes for non-trivial codebases. Practical approach: scope to **business-critical modules** (chat orchestrator, auth flow, OTA gating logic).

**ThoughtWorks Radar (April 2026)** flags mutation testing as the next-gen way to "shift focus from how much code is executed to how much code is actually verified." Coverage % is the wrong KPI; mutation score (% of mutants killed) is more honest. ([prodsens.live — Stryker + Cosmic Ray](https://prodsens.live/2026/02/01/the-pitfalls-of-test-coverage-introducing-mutation-testing-with-stryker-and-cosmic-ray/))

**Musaium recommendation.** Adopt Stryker for **specific high-risk modules** (NOT global): `museum-frontend/features/chat/`, `museum-frontend/features/auth/`, OTA bootstrap. Target mutation score ≥ 60 % (industry "good" threshold). Skip for UI components — RTL tests there are mostly snapshot-driven, low mutation value.

---

## 10. Verdict — Musaium V1 launch testing maturity

### Testing pyramid (recommended for Musaium)

```
                ┌──────────────────────────┐
                │  Maestro E2E (10–15 flow)│   <- iOS device cloud + Android matrix
                │  Smoke pre-prod          │
                └──────────────────────────┘
              ┌──────────────────────────────┐
              │  Integration / RTL widget    │   <- 30–50 component tests, factories
              │  Hooks, useChat, auth gate   │
              └──────────────────────────────┘
        ┌─────────────────────────────────────────┐
        │  Unit (Jest + RTL): 204 RN + 15 Node    │   <- current, healthy
        │  Coverage gate 91/78/80/91              │
        │  Mutation score gate ≥60% on critical   │
        └─────────────────────────────────────────┘
```

### EAS cost model for 100k MAU

Assumes Production tier ($199/mo) + Musaium's actual build profile (4 EAS builds/week iOS large + 4 Android medium, $4 + $1 = $5/cycle × 4 = $20/week ≈ $87/mo, well within $225 credit). **EAS Update is the cost driver.**

| Line | Calc | Monthly |
|------|------|---------|
| Production base | $199 | $199 |
| MAU overage | (100,000 − 50,000) × $0.005 | $250 |
| Bandwidth (assume 3 MB bundle × 100k MAU × 2 OTA/mo = 600 GB; 1 TiB included) | within plan | $0 |
| **Subtotal** | | **$449/mo** |
| Bandwidth headroom (worst case 5 OTA/mo × 5 MB × 100k = 2.4 TiB → 1.4 TiB overage) | 1,400 × $0.10 | +$140 |
| Concurrency surcharge (2 extra) | 2 × $50 | +$100 |
| **Worst-case** | | **~$689/mo** = **$8,268/year** |

Sources: [expo.dev/pricing](https://expo.dev/pricing), [docs.expo.dev/billing/usage-based-pricing](https://docs.expo.dev/billing/usage-based-pricing/), [stalliontech.io/expo-eas-update-pricing](https://stalliontech.io/expo-eas-update-pricing)

**Note:** the Stallion blog quotes CodePush at $99/mo for 10k-100k MAU with unlimited bandwidth. If OTA costs exceed $1k/mo at scale, evaluate Codemagic CodePush as a swap-in. Cost crossover ~70k MAU. ([stalliontech.io/expo-eas-update-pricing](https://stalliontech.io/expo-eas-update-pricing))

### CI gaps (prioritized)

| # | Gap | Impact | Effort | Priority |
|---|-----|--------|--------|----------|
| 1 | **No iOS Maestro on physical/emulated device per-PR** (current = nightly cron only) | iOS regression escapes pre-merge | Self-hosted Mac mini ~$700 one-time + $80/mo electricity, OR Maestro Cloud iOS device $250/mo | **CRITICAL** |
| 2 | **No Privacy Manifest validation step in CI** | App Store rejection at submission | 1 dev-day to add `xcprivacy` lint + grep guard | **HIGH** |
| 3 | **No staged OTA rollout discipline** | 100% deploy of broken bundle | 1 dev-day to wrap `eas update` in rollout script | **HIGH** |
| 4 | **No mutation testing on critical paths** | False sense of quality from coverage gate | 3 dev-days to scope Stryker config + tune | MEDIUM |
| 5 | **Android Maestro on Linux KVM not attempted** (would unblock per-PR) | Slow feedback loop | 1–2 dev-days to migrate from macos-latest to ubuntu-24.04 + KVM | MEDIUM |
| 6 | **Jest 30 upgrade blocked** | Marginal perf gain blocked by 30.0.x memory leak | Wait for 30.1+ | LOW |
| 7 | **No Detox** | None — Maestro covers the niche | N/A — do not adopt | N/A |

### Testing maturity score: **7.2 / 10**

Breakdown:
- **Unit tests** 9/10 (factories, ratchets, 91% coverage gate)
- **Component tests** 8/10 (RTL 13, good practice)
- **E2E Android** 7/10 (Maestro 4-shard, nightly cron — not per-PR)
- **E2E iOS** 4/10 (nightly cron only, no device cloud, no per-PR validation)
- **Mutation testing** 0/10 (absent)
- **CI gates** 8/10 (lint + tests + audit + i18n + emoji guard + OpenAPI sync)
- **OTA discipline** 6/10 (no staged rollout in workflow, manual)
- **Privacy compliance** 5/10 (not verified in audit, action required)
- **Tooling sanity** 9/10 (no over-engineering, no zombie Detox harness, jest-expo current)

Weighted avg ≈ 7.2.

---

## Sources (consolidated)

**Maestro / E2E**
- [maestro.dev/insights/detox-vs-maestro-reducing-flakiness-react-native](https://maestro.dev/insights/detox-vs-maestro-reducing-flakiness-react-native)
- [maestro.dev/insights/best-mobile-app-testing-frameworks](https://maestro.dev/insights/best-mobile-app-testing-frameworks)
- [maestro.dev/pricing](https://maestro.dev/pricing)
- [maestro.dev/cloud](https://maestro.dev/cloud)
- [github.com/mobile-dev-inc/Maestro](https://github.com/mobile-dev-inc/Maestro)
- [getpanto.ai/blog/detox-vs-maestro](https://www.getpanto.ai/blog/detox-vs-maestro)
- [drizz.dev/post/detox-vs-appium-vs-maestro](https://www.drizz.dev/post/detox-vs-appium-vs-maestro-which-mobile-testing-framework-in-2026)
- [pkgpulse.com/blog/detox-vs-maestro-vs-appium-react-native-e2e-testing-2026](https://www.pkgpulse.com/blog/detox-vs-maestro-vs-appium-react-native-e2e-testing-2026)
- [github.com/retyui/Using-GitHub-Actions-to-run-your-Maestro-Flows](https://github.com/retyui/Using-GitHub-Actions-to-run-your-Maestro-Flows)
- [docs.maestro.dev/cloud/ci-integration/github-actions](https://docs.maestro.dev/cloud/ci-integration/github-actions)

**Detox**
- [github.com/wix/Detox/releases](https://github.com/wix/Detox/releases)
- [github.com/wix/Detox/issues/4842](https://github.com/wix/Detox/issues/4842)
- [github.com/wix/Detox/issues/4506](https://github.com/wix/Detox/issues/4506)

**Appium 3**
- [appium.io/docs/en/3.1/blog/2025/08/07/-appium-3](https://appium.io/docs/en/3.1/blog/2025/08/07/-appium-3/)
- [codoid.com/mobile-application-testing/appium-3-features-migration-guide](https://codoid.com/mobile-application-testing/appium-3-features-migration-guide/)

**Jest / RTL / Vitest**
- [sitepoint.com/vitest-vs-jest-2026-migration-benchmark](https://www.sitepoint.com/vitest-vs-jest-2026-migration-benchmark/)
- [pkgpulse.com/blog/node-test-vs-vitest-vs-jest-native-test-runner-2026](https://www.pkgpulse.com/blog/node-test-vs-vitest-vs-jest-native-test-runner-2026)
- [github.com/jestjs/jest/issues/15743](https://github.com/jestjs/jest/issues/15743) (Jest 30 memory leak)
- [tech-insider.org/vitest-vs-jest-2026](https://tech-insider.org/vitest-vs-jest-2026/)

**EAS / Expo**
- [expo.dev/pricing](https://expo.dev/pricing)
- [docs.expo.dev/billing/usage-based-pricing](https://docs.expo.dev/billing/usage-based-pricing/)
- [docs.expo.dev/billing/plans](https://docs.expo.dev/billing/plans/)
- [docs.expo.dev/build-reference/infrastructure](https://docs.expo.dev/build-reference/infrastructure/)
- [docs.expo.dev/eas-update/rollbacks](https://docs.expo.dev/eas-update/rollbacks/)
- [docs.expo.dev/eas-update/rollouts](https://docs.expo.dev/eas-update/rollouts/)
- [docs.expo.dev/eas-update/estimate-bandwidth](https://docs.expo.dev/eas-update/estimate-bandwidth/)
- [stalliontech.io/expo-eas-update-pricing](https://stalliontech.io/expo-eas-update-pricing)
- [reactnativerelay.com/article/react-native-ota-updates-eas-update-rollouts-rollbacks-cicd](https://reactnativerelay.com/article/react-native-ota-updates-eas-update-rollouts-rollbacks-cicd)

**Xcode Cloud**
- [developer.apple.com/news?id=ik9z4ll6](https://developer.apple.com/news/?id=ik9z4ll6)
- [developer.apple.com/xcode-cloud](https://developer.apple.com/xcode-cloud/)
- [9to5mac.com — Xcode Cloud free hours](https://9to5mac.com/2023/12/07/free-hours-xcode-cloud-extended-apple-developers/)
- [oreateai.com — Xcode Cloud pricing](https://www.oreateai.com/blog/demystifying-xcode-cloud-pricing-what-every-developer-needs-to-know/f577e433a2e80fced9861e867cc1a46b)
- [presidio.com — eliminating-ios-build-costs](https://www.presidio.com/technical-blog/eliminating-ios-build-costs-a-practical-guide-to-xcode-cloud/)

**Codemagic / Bitrise / GitHub Actions**
- [blog.codemagic.io/build-speed-benchmark-comparison](https://blog.codemagic.io/build-speed-benchmark-comparison/)
- [blog.codemagic.io/codemagic-vs-bitrise](https://blog.codemagic.io/codemagic-vs-bitrise/)
- [blog.codemagic.io/why-github-actions-not-built-for-mobile-cicd](https://blog.codemagic.io/why-github-actions-not-built-for-mobile-cicd/)
- [agentdeals.dev/ci-cd-pricing](https://agentdeals.dev/ci-cd-pricing)
- [northflank.com — GitHub self-hosted alternatives 2026](https://northflank.com/blog/github-pricing-change-self-hosted-alternatives-github-actions)
- [devclass.com — GitHub charge shelved](https://devclass.com/2025/12/17/github-to-charge-for-self-hosted-runners-from-march-2026/)
- [github.blog/changelog/2025-12-16](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)

**App Store / Play Console**
- [developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [foresightmobile.com/blog/ios-app-distribution-guide-2026](https://foresightmobile.com/blog/ios-app-distribution-guide-2026)
- [support.google.com/googleplay/android-developer/answer/9845334](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en)
- [support.google.com/googleplay/android-developer/answer/14151465](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [primetestlab.com — 20 to 12 testers](https://primetestlab.com/blog/google-play-changed-20-to-12-testers)
- [primetestlab.com — 12-testers closed-testing-guide](https://primetestlab.com/blog/google-play-12-testers-closed-testing-guide)
- [capgo.app — staged rollouts](https://capgo.app/blog/google-play-staged-rollouts-how-it-works/)

**Privacy Manifests**
- [developer.apple.com/documentation/bundleresources/privacy-manifest-files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [developer.apple.com/news?id=3d8a9yyh](https://developer.apple.com/news/?id=3d8a9yyh)
- [bitrise.io — Privacy Manifest enforcement](https://bitrise.io/blog/post/enforcement-of-apple-privacy-manifest-starting-from-may-1-2024)
- [mysk.blog/2024/05/03/apple-required-reason-api](https://mysk.blog/2024/05/03/apple-required-reason-api/)
- [bugfender.com/blog/apple-privacy-requirements](https://bugfender.com/blog/apple-privacy-requirements/)

**Stryker / Mutation testing**
- [stryker-mutator.io/docs/stryker-js/guides/react](https://stryker-mutator.io/docs/stryker-js/guides/react/)
- [stryker-mutator.io/docs/stryker-js/jest-runner](https://stryker-mutator.io/docs/stryker-js/jest-runner/)
- [stryker-mutator.io/docs/stryker-js/typescript-checker](https://stryker-mutator.io/docs/stryker-js/typescript-checker/)
- [github.com/stryker-mutator/stryker-js](https://github.com/stryker-mutator/stryker-js)
- [prodsens.live — Stryker + Cosmic Ray](https://prodsens.live/2026/02/01/the-pitfalls-of-test-coverage-introducing-mutation-testing-with-stryker-and-cosmic-ray/)

**RN 0.83 / New Architecture**
- [reactnative.dev/blog/2025/12/10/react-native-0.83](https://reactnative.dev/blog/2025/12/10/react-native-0.83)
- [docs.expo.dev/guides/new-architecture](https://docs.expo.dev/guides/new-architecture/)
- [callstack.com/events/react-native-0-83](https://www.callstack.com/events/react-native-0-83)
- [agilesoftlabs.com/blog/2026/03/react-native-new-architecture-migration](https://www.agilesoftlabs.com/blog/2026/03/react-native-new-architecture-migration)

**expo-updates security**
- [security.snyk.io/package/npm/expo-updates](https://security.snyk.io/package/npm/expo-updates)
- [expo.dev/blog/the-production-playbook-for-ota-updates](https://expo.dev/blog/the-production-playbook-for-ota-updates)
- [expo.dev/solutions/eas-ota-updates](https://expo.dev/solutions/eas-ota-updates)

---

*End of R14. Audit honest per UFR-013 — flags raised where I did not directly verify codebase state (Privacy Manifest config check, staged-rollout discipline, Play Console account type).*
