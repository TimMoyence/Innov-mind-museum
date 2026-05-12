# 08 — Libraries / dependencies
**Date:** 2026-05-12  **Agent:** AGENT-08

## Verdict
- BE deps health: **78 / 100** — fresh, well-pinned, but `langfuse@3.x` is deprecated (SDK rewritten v4 Aug-2025 / v5 Mar-2026) and `prom-client@15.1.3` has had no release in 12+ months.
- FE deps health: **74 / 100** — Expo 55 / RN 0.83 chain in sync (SDK 55 patch level 0.18 vs latest 0.23 → minor lag), two extraneous packages still in node_modules (`react-native-confetti-cannon`, `@react-native-google-signin/google-signin`), `@sentry/react-native@8.9.1` is the recommended pin (8.10+ has known iOS AVAsset crash), `expo-updates` patch still needed.
- Web deps health: **86 / 100** — Next 15.5.18 = current; bleeding-edge Vite 8 / Vitest 4 / Tailwind 4.2 / React 19.2 all current; recharts loaded only on `admin/analytics` route → bundle hit isolated.
- Supply chain risk (lower = safer): **32 / 100** — three pnpm `overrides` blocks (BE/FE/Web) demonstrate active patching of transitive RegExp / proto-pollution chains; Renovate is configured for `config:best-practices` with 3-7d cool-down and vulnerability fast-track. Main vectors: deprecated langfuse SDK (will receive 0 future security patches on 3.x), niche `@ronradtke/react-native-markdown-display` fork (single maintainer), niche `react-native-ssl-public-key-pinning` (single maintainer, mid-2025 last push).

**Honest read.** This is not a "first-thing-I-googled" repo. Renovate is configured with surgical group rules per stack (LangChain, TypeORM, Expo, OpenAI SDKs all manually-reviewed; dev tooling auto-merged after 3d), pnpm `overrides` actively kill known-bad transitives, lockfiles are committed in all three apps, and almost every direct dep is in active use in `src/`. The actual risk surface is small: one deprecated SDK (langfuse), one stale-but-functional metrics lib (prom-client), two extraneous packages lingering after dep removals, one fragile fork of a markdown lib, and one bespoke Reanimated reimplementation of confetti instead of pulling `react-native-fast-confetti`. None block launch 2026-06-01. Three need pre-launch upgrades for security hygiene (`@langchain/openai` 1.4.2 → 1.4.5, `@langchain/core` 1.1.45 already current, `@stryker-mutator/core` 9.6.0 → 9.6.1).

---

## Method

- Read each `package.json` (root, BE, FE, Web, design-system, packages/musaium-shared, tools/eslint-plugin-musaium-test-discipline implicitly).
- Read `renovate.json` to understand pin/auto-merge policy.
- Ran `pnpm list --depth 0` in BE, Web; `npm ls --depth 0` in FE → captured installed versions (incl. 2 extraneous in FE).
- `grep` lockfiles for duplicate majors of `eslint`, `typescript`, `prettier`, `zod`, `react`, `axios`, `@sentry/*`, `langchain`, `pg`.
- `grep -rln <pkg>` in `src/` for every direct dep flagged as suspicious or candidate-dead → confirmed in-use vs dead.
- WebSearch (15 queries) for: express CVE 2026, typeorm 0.3.28 vs v1, multer 2.1.1 CVE, @langchain/core latest, next.js 15.5 CVE, expo SDK 55 status, axios 1.16 CVE, @sentry/node + @sentry/react-native latest, zod 4 latest, @maplibre/maplibre-react-native, react-native-ssl-public-key-pinning, bcrypt 6 status, @stryker-mutator/core latest, opossum 9 latest, i18next 26, react-i18next 17, framer-motion 12, recharts 3 bundle, prom-client 15 status, tesseract.js 7, langfuse, p-limit v7, @langchain/openai 1.4 latest, @mozilla/readability 0.6, linkedom, sharp 0.34, @ronradtke/react-native-markdown-display, react-native-confetti-cannon, typescript-eslint 8.58, ESLint 10 breaking changes, @tanstack/react-query 5, react-native-qrcode-svg 6.3, @hookform/resolvers 5, helmet 8, bullmq 5.74, @opentelemetry/sdk-node 0.217, @stryker-mutator license.
- Read `museum-frontend/patches/expo-updates+55.0.18.patch` to assess whether the entry-file workaround is still relevant.

---

## P0 — Critical (CVE / deprecated / launch-blocking)

| Pkg | Declared | Installed | Latest | Issue | Fix | Source |
|---|---|---|---|---|---|---|
| `langfuse` (BE) | `^3.38.20` | 3.38.20 | 3.38.20 (deprecated) / v4 (Aug-2025) / v5 (Mar-2026) | SDK v3 explicitly **deprecated** on npm — no future security patches. Repo is on a dead branch of the observability SDK. | Plan v3→v5 migration before V1 launch OR accept reasoned EOL risk + freeze obs scope. ADR required if staying on v3. | https://www.npmjs.com/package/langfuse — search result confirms "version 3.38.20 is deprecated, SDK rewritten as v4 in August 2025... rewritten in v5 and released in March 2026" |
| FE extraneous: `react-native-confetti-cannon@1.5.2` | not in `package.json` | 1.5.2 lingering in `node_modules` | unmaintained since 2021 | `npm ls` reports **extraneous**. Only "reference" is a comment in `shared/ui/Confetti.tsx` (custom Reanimated 4 replacement). Risk: stale code path can be `require()`-d unintentionally; supply-chain footprint without justification. | `rm -rf node_modules museum-frontend/node_modules && npm install` to clean. Verify `package-lock.json` no longer pins. | npm extraneous flag |
| FE extraneous: `@react-native-google-signin/google-signin@16.1.2` | not in `package.json` | 16.1.2 lingering | n/a — package itself is fine, but **not used** | `npm ls` reports **extraneous**. Code mentions it only in `__tests__/infrastructure/socialAuthProviders.test.ts` to *explain why it was removed* ("Google migrated off the broken @react-native-google-signin nonce"). | Same fix as above — clean reinstall. | npm extraneous flag |

---

## P1 — Important (behind major, archived, low maintenance, sec patch behind)

| Pkg | Declared | Installed | Latest | Issue | Action | Source |
|---|---|---|---|---|---|---|
| `prom-client` (BE) | `^15.1.3` | 15.1.3 | 15.1.3 | **No new release in 12+ months** — Socket / Libraries.io flag as "discontinued or low attention". Used in `src/shared/observability/` for Prometheus scraping. No CVEs but stagnant. | Track upstream weekly. No immediate action; if no release by Aug 2026, evaluate `@opentelemetry/sdk-metrics` (OTel exporter already in stack) as native replacement. | https://libraries.io/npm/prom-client |
| `@ronradtke/react-native-markdown-display` (FE) | `^8.1.0` | 8.1.0 | **0.24.5** namespace (different package) | Active maintainer but **fork of an unmaintained upstream**, single maintainer (RonRadtke). Bus-factor 1. Used in `features/chat/ui/MarkdownBubble.tsx`. | Acceptable for V1 — actively pubbed 19d ago. Add to "bus-factor 1" risk register. Re-evaluate post-launch. | https://www.npmjs.com/package/@ronradtke/react-native-markdown-display |
| `react-native-ssl-public-key-pinning` (FE) | `^1.2.6` | 1.2.6 | 1.2.6 (last pubbed mid-2025) | Single maintainer (frw), last release ~10 months. Security-critical (cert pinning) — stale-but-functional. Used in `shared/config/cert-pinning.ts` + `shared/infrastructure/cert-pinning-init.ts`. | Test pin behavior on RN 0.83 in CI before launch (likely already covered in `__tests__/integration/cert-pinning.test.ts`). Add maintainer-activity sentinel. | https://www.npmjs.com/package/react-native-ssl-public-key-pinning |
| `eslint` (BE vs FE/Web) | BE `^10.2.0`, FE `^9.39.4`, Web `^9.39.4` | BE 10.2.0, FE 9.39.4, Web 9.39.4 | 10.2.x | **Cross-app major drift.** BE is on ESLint 10 (Feb-2026, drops `.eslintrc`, requires Node 20.19+/22+), FE+Web still on 9.x. Two different config systems running across the monorepo. | Either upgrade FE+Web to ESLint 10 (flat config already shipped per CLAUDE.md), or revert BE to 9.x until parity. Today: BE is the outlier. | https://eslint.org/blog/2026/02/eslint-v10.0.0-released/ |
| `@langchain/openai` (BE) | `1.4.2` (pinned) | 1.4.2 | **1.4.5** (15d ago) | Three patches behind on the only LLM contract layer. Renovate rule `llm-sdk` requires manual review with 7d cool-down → 1.4.5 is past cool-down. | Bump to 1.4.5 in a dedicated PR (LLM-contract diff review). | https://www.npmjs.com/package/@langchain/openai |
| `@sentry/node` (BE) | `^10.49.0` | 10.49.0 | **10.52.0** (5 May 2026) | 3 patch versions behind on production error tracking. | Bump (automerge eligible under existing Renovate rule once 3d cool-down elapses). | https://www.npmjs.com/package/@sentry/node |
| `i18next` (FE) | `^26.0.6` | (range) | **26.1.0** | One minor behind. FE locked rate. | Auto-bump under FE deps rule. | https://www.npmjs.com/package/i18next |
| `react-i18next` (FE) | `^17.0.4` | 17.0.4 | **17.0.7** (5d ago) | 3 patches behind. | Auto-bump. | https://www.npmjs.com/package/react-i18next |
| `@tanstack/react-query` (FE) | `^5.99.2` | 5.99.2 | **5.100.10** (17h ago) | Behind ~7 patches on a state-management lib. Renovate `dev-tooling` rule doesn't cover it. | Manual bump PR. | https://www.npmjs.com/package/@tanstack/react-query |
| `bullmq` (BE) | `^5.74.1` | 5.74.1 | **5.76.7** | Patch behind. | Auto-bump under prod npm patches rule. | https://docs.bullmq.io/changelog |
| `@stryker-mutator/core` + jest-runner + typescript-checker (BE) | `^9.6.0` | 9.6.0 | **9.6.1** (10 Apr 2026) | One patch behind on mutation testing infra. Dev only. | Auto-bump under dev-tooling rule. | https://www.npmjs.com/package/@stryker-mutator/core |
| `typescript-eslint` (BE+FE+Web) | `^8.58.1-2` | 8.58.1-2 | **8.59.2** (4d ago) | One minor behind. | Auto-bump dev tooling. | https://github.com/typescript-eslint/typescript-eslint/releases |
| `@maplibre/maplibre-react-native` (FE) | `11.0.0` (pinned exact) | 11.0.0 | **11.1.0** (12h ago) | One minor behind on map renderer (used in walks / POI map). Pinned exact → no Renovate auto-bump. | Manual bump after smoke test on iOS + Android (touches native arch). | https://www.npmjs.com/package/@maplibre/maplibre-react-native |

---

## P2 — Minor (cosmetic, easy bumps, fully current or near-current)

These were verified current or within 1-2 patches; no action required pre-launch.

| Pkg | Declared | Latest | Note |
|---|---|---|---|
| `express` (BE) | `^5.2.1` | 5.2.1 | Current. 0 vulns reported in 2026. (path-to-regexp transitive — see Web overrides handle similar patterns.) |
| `typeorm` (BE) | `0.3.28` (pinned) | 0.3.28 | Current. v1.0 still pending (CLAUDE.md gotcha already tracked). Renovate pin rule correct. |
| `multer` (BE) | `2.1.1` (pinned exact) | 2.1.1 | **Patched against CVE-2026-3520 (DoS via uncontrolled recursion)**. Earlier 2.x had CVE-2026-2359 + 3304. Repo is on the fix. |
| `axios` (FE) | `^1.16.0` | 1.16.0 | **Patched against CVE-2026-40175 RCE chain** + prototype-pollution. Repo is on the fix. Supply-chain attack on 1.14.1 + 0.30.4 — repo is clean. |
| `next` (Web) | `^15.5.18` | 15.5.18 | **Current**, includes May-2026 13-advisory coordinated security release patches (DoS, SSRF, cache-poison, XSS). |
| `react`, `react-dom` (FE+Web) | `19.2.0`-ish | 19.2.x | Current. RSC vuln (CVE-2026-23870) patched in Next 15.5.18 path. |
| `@langchain/core` (BE) | `1.1.45` (pinned) | 1.1.44 | Repo is **ahead** of npm's latest? More likely 1.1.45 is the same-day promotion; treat as current. |
| `@opentelemetry/sdk-node` (BE) | `^0.217.0` | 0.217.0 | Current (6d). |
| `@sentry/react-native` (FE) | `^8.9.1` | 8.11.0 (latest) — but **8.9.2 is recommended pin** | Sentry docs: pin to 8.9.x until sentry-cocoa 9.11.0 crash is fixed. Repo's pin is correct. Bump to 8.9.2 patch is safe. |
| `@hookform/resolvers` (FE) | `^5.2.2` | 5.2.2 | Current (8 months — release cadence slow but stable). |
| `react-native-qrcode-svg` (FE) | `^6.3.15` | 6.3.21 | Health: Healthy. Patch behind. |
| `helmet` (BE) | `^8.1.0` | 8.1.0 | Current, no new release in 12mo but classified "Sustainable" by Snyk. |
| `sharp` (BE) | `^0.34.0` | 0.34.5 | 5 patches behind on image pipeline. Auto-bump. |
| `recharts` (Web) | `^3.8.1` | 3.8.1 | Current. (See bundle section.) |
| `framer-motion` (Web) | `^12.38.0` | 12.38.0 | Current. Rebranded to `motion` — non-blocking. |
| `opossum` (BE) | `^9.0.0` | 9.0.0 | Current. RN 20+ required (we run 22). |
| `bcrypt` (BE) | `^6.0.0` | 6.0.0 | Current, official, not deprecated despite internet myths. Argon2id is a future consideration, not a launch blocker. |
| `p-limit` (BE) | `^3` | 3.1.0 | **v7.3.0 is latest**. v3 is ESM-CJS compatible; v4+ ESM-only. We use it in `semaphore.ts` + `wikidata-enricher.ts`. Acceptable but old. Bump to v7 requires ESM verification. |
| `pg` (BE+Web) | `8.20.0` (pinned both) | 8.20.0 | Current, in sync across apps. |
| `tesseract.js` (BE optional) | `^7.0.0` | 7.x | Active; required Node 16+ (we run 22). |
| `replicate` (BE optional) | `^1.4.0` | 1.4.0 | In active use in `chat/adapters/secondary/embeddings/replicate.adapter.ts`. |

---

## Unused / dead deps

Hard "unused" claims require AST — grep evidence below is best-effort but should be verified by `depcheck` before deletion.

**FE — confirmed extraneous in node_modules (NOT in package.json, NOT used in src/):**

- `react-native-confetti-cannon@1.5.2` — only reference is a comment in `shared/ui/Confetti.tsx` documenting the custom Reanimated replacement. **Delete from lockfile.**
- `@react-native-google-signin/google-signin@16.1.2` — only reference is a documentation comment in `__tests__/infrastructure/socialAuthProviders.test.ts` explaining why Google was migrated off. **Delete from lockfile.**

**BE — `exifr@^7.1.3` declared in `devDependencies`.** Used only in `tests/unit/chat/image-exif.test.ts` + `tests/helpers/chat/image-fixtures.ts`. Correctly classified as devDep. NOT a finding (declared dev, used in tests = fine).

**BE — every other prod dep was located via grep in `src/`**: `bcrypt`, `bullmq`, `compression`, `cors`, `dotenv`, `express`, `helmet`, `ioredis`, `jsonwebtoken`, `langfuse`, `linkedom`, `multer`, `onnxruntime-node`, `opossum`, `otpauth`, `p-limit`, `pg`, `prom-client`, `reflect-metadata`, `sharp`, `swagger-ui-express`, `typeorm`, `uuid`, `zod`, `@mozilla/readability`, `@langchain/*`, `@opentelemetry/*`, `@sentry/node`, `replicate`, `tesseract.js`. **No dead BE prod deps.**

**Web — `qrcode`, `maplibre-gl`, `recharts`, `framer-motion` all used.** `recharts` is single-page (`admin/analytics`); see Bundle section.

---

## Cross-app version drift

| Lib | BE | FE | Web | Verdict |
|---|---|---|---|---|
| `eslint` | **10.2.0** | 9.39.4 | 9.39.4 | **DRIFT** — major split. BE is on ESLint 10 (legacy `.eslintrc` removed), FE+Web on 9.x. P1. |
| `typescript` | 5.9.3 | 5.9.3 | 5.9.3 | Aligned. |
| `prettier` | 3.8.3 | 3.8.3 | 3.8.3 | Aligned. |
| `zod` | `^4.4.3` (`4.4.3` installed + transitive `3.25.76`) | `^4.4.1` (4.4.1) | (transitive 4.3.6) | Minor drift inside the v4 line; `@musaium/shared` declares `zod ^4.0.0` peer. Acceptable. Transitive `zod@3.25.76` in BE is fine (langchain-core still on z3 internally). |
| `@types/pg` | 8.20.0 | n/a | 8.11.0 declared in Web devDeps → resolves 8.15.6 | **DRIFT** — BE @types/pg matches its pg@8.20.0, Web is at @types/pg@8.15.6 against pg@8.20.0. Cosmetic. Bump Web. |
| `@types/node` | 22.19.17 | (covered by `^22.15.21`) | 22.19.15 | Aligned within major 22. |
| `react` | n/a | 19.2.0 | 19.2.4 | Aligned, patch drift. |
| `@sentry/*` | `@sentry/node@10.49.0` | `@sentry/react-native@8.9.1` (uses `@sentry/core@10.49.0`) | `@sentry/nextjs@10.49.0` | **Aligned at @sentry/core@10.49.0** across all three. Good. |
| `openapi-typescript` | n/a | 7.13.0 | 7.13.0 | Aligned. |
| `lint-staged` | 16.4.0 | 16.4.0 | 16.4.0 | Aligned. |

---

## License hygiene

Sampled the heaviest 25 deps via npm metadata and search:

| Pkg | License | Compatible w/ closed-source distribution? |
|---|---|---|
| express | MIT | yes |
| typeorm | MIT | yes |
| react / react-native / expo / next | MIT | yes |
| @langchain/* | MIT | yes |
| @sentry/* | MIT | yes |
| @opentelemetry/* | Apache-2.0 | yes |
| @stryker-mutator/* | Apache-2.0 | yes (verified via WebSearch) |
| sharp | Apache-2.0 | yes |
| pg | MIT | yes |
| bullmq | MIT | yes |
| ioredis | MIT | yes |
| zod | MIT | yes |
| jsonwebtoken | MIT | yes |
| multer | MIT | yes |
| helmet | MIT | yes |
| recharts | MIT | yes |
| framer-motion | MIT | yes |
| maplibre-gl, @maplibre/maplibre-react-native | BSD-3-Clause | yes |
| tesseract.js | Apache-2.0 | yes |
| onnxruntime-node | MIT | yes |
| sharp libvips bindings | (libvips: LGPL-2.1) | yes (dynamic link, distribution OK) |
| @mozilla/readability | Apache-2.0 | yes |
| linkedom | ISC | yes |
| prom-client | Apache-2.0 | yes |
| opossum | Apache-2.0 | yes |

**No AGPL / SSPL / proprietary licenses detected in the sample.** No license-side blockers for closed-source / B2C distribution. Recommend a future `pnpm licenses ls > docs/LICENSES.md` ratchet sentinel post-launch (out of scope this audit).

---

## Bundle-size offenders

| Lib | Where | Cost | Verdict / Alternative |
|---|---|---|---|
| `recharts@3.8.1` | Web — used ONLY in `src/app/[locale]/admin/analytics/page.tsx` (and its test) | ~136 KB gzipped | Loaded only on `/admin/analytics` (server-rendered + dynamic). Acceptable. If admin analytics is rarely opened, consider `next/dynamic` to lazy-load on click. Alternative for line/bar charts: `chart.js` (~70 KB) or hand-rolled SVG. Keep recharts for V1 — admin-only route. |
| `framer-motion@12.38.0` | Web — 11 marketing components + scroll-progress | ~50 KB gzipped (varies) | Used widely on landing page. Appropriate for the use case (scroll animations, layout transitions). Future consideration: switch to lighter `motion-one` for primitive transitions if landing performance budget tightens. |
| `langchain @langchain/* stack` | BE | several MB on disk, runtime impact | Server-side, no bundle concern. |
| `@opentelemetry/auto-instrumentations-node` | BE | ~hundreds of transitives | Server-side, no bundle concern. |
| `tesseract.js` (optional) | BE | ~2 MB wasm | Optional dep — only loaded when OCR path taken. Acceptable. |
| `onnxruntime-node` | BE | native binary, ~30 MB on disk | Required for SigLIP local embeddings (ADR-037). No alternative at the embedding-quality tier we need. |
| `linkedom` | BE | ~250 KB lib, but used server-side in knowledge-extraction scraper | Acceptable. happy-dom faster but linkedom chosen for memory profile under big-doc scraping; consistent with documented use case. |

**No "imported lodash for one function" smells detected.** No `moment.js`. No `rxjs` for one observable.

---

## Renovate config sanity

`renovate.json` is well-thought-through. Highlights:

- `vulnerabilityAlerts` → fires anytime + automerge → correct.
- `lockFileMaintenance` → weekly Monday + automerge → correct.
- `postUpdateOptions: [pnpmDedupe]` → kills transitive bloat → correct.
- `prConcurrentLimit: 10`, `prHourlyLimit: 4` → tight enough to avoid PR-flood, slack enough for vuln fast-track.
- `minimumReleaseAge: 3 days` on dev tooling + prod patches → buffer against supply-chain compromise.
- `7 days` on LLM SDKs + TypeORM + pg → correct extra cool-down for high-risk stacks.
- `14 days` on majors + never automerge → correct.
- `groupName: "expo + react-native"` with no automerge → correct, since SDK 55 → 56 will be a manual cycle.

**Two gaps:**

1. `@tanstack/react-query` is not under any auto-merge rule (it's neither in the `^/^@types/` rule nor the prod-patch rule by default, since FE uses `npm` not `pnpm` and the rule patterns target Renovate's `matchPackageNames`). Currently 7 patches behind → suggests Renovate isn't actively bumping. **Add a rule** matching `/^@tanstack//` under devTooling-like automerge.
2. `langfuse` isn't pinned in any rule despite being deprecated — when v5 migration happens it'll be a major bump and should be in a manual-review group. **Add `langfuse` to the LLM-SDK rule** group.

---

## Patches & native pods

**`museum-frontend/patches/expo-updates+55.0.18.patch`**

Read the patch:
- Targets `node_modules/expo-updates/utils/build/createManifestForBuildAsync.js`.
- Fixes Android embed-bundler Metro 404 when entry path is absolute + extension-stripped (e.g. `node_modules/expo-router/entry`).
- Documented in comments as "expo-updates Android SDK 55 bug".

**Still needed?** I confirmed `createManifestForBuildAsync.js` still exists in `node_modules/expo-updates/utils/build/` at the patched path. The patched logic is non-trivial (extension preservation for `.js/.jsx/.ts/.tsx`). Per CLAUDE.md and `feedback_ios_build_chain` memory, this is the **expo-updates ENTRY_FILE workaround**.

**Verification needed:** check if `expo-updates@55.0.23` (current latest) ships an upstream fix. WebSearch didn't surface that specific commit. **Action:** when bumping Expo to SDK 55.0.23, re-run `npx patch-package` and verify patch still applies — if it fails because upstream fixed it, **delete the patch**. Track in `docs/TECH_DEBT.md`.

**iOS Pods committed (per memory):** Podfile fmt consteval patch — out of scope for this lib audit (it's a Cocoa toolchain fix, not an npm dep).

---

## Multiple versions of same lib in lockfiles

Spot-checked:

- BE pnpm-lock: **`zod@3.25.76` + `zod@4.4.3`** coexist. Reason: LangChain still pulls z3 internally. Expected; no action.
- BE pnpm-lock: `eslint@10.2.0` only (one).
- BE pnpm-lock: `typescript@5.9.3` only (one).
- BE pnpm-lock: `prettier@3.8.3` only (one).
- Web pnpm-lock: `eslint@9.39.4` (two resolved entries — one with `jiti@2.6.1` peer, one without — that's pnpm's content-addressing, not duplicate trees).
- Web pnpm-lock: `zod@4.3.6` only (one) — drift vs BE/FE noted in cross-app section.
- FE package-lock: not exhaustively scanned (17 861 lines) but `@sentry/core@10.49.0` resolves once, `react@19.2.0` once.

**No alarming dup-major bloat.** pnpm `overrides` in BE force `protobufjs >=7.5.5`, `handlebars >=4.7.9`, `fast-uri >=3.1.2`, `uuid ^11.1.1`, `langsmith >=0.5.20` — this kills known-vulnerable transitive versions actively. Same pattern in Web (`brace-expansion`, `protocol-buffers-schema`, `postcss`, `fast-uri`). FE has top-level `overrides` for `markdown-it`, `follow-redirects`, `@tootallnate/once`, `@xmldom/xmldom`, `postcss`. **This is exemplary supply-chain hygiene** for a solo-dev project.

---

## Lib choices appropriate to product stage

Solo-dev pre-launch B2C → reviewing for "premature ceremony":

- ✅ Express 5 + TypeORM + ioredis + bullmq: appropriate scale.
- ⚠️ Full OpenTelemetry stack (`auto-instrumentations-node`, `exporter-trace-otlp-http`, `resources`, `sdk-node`, `semantic-conventions`) PLUS Sentry PLUS Prometheus PLUS Langfuse: **observability ceremony is heavy for pre-launch**. Each is justifiable (Sentry = errors, OTel = traces, Prom = metrics, Langfuse = LLM-specific traces) but the cardinality of vendors is high. Per CLAUDE.md gotcha "Sentry+OTel dedup — root cause of 21-listener spam" — this stack already cost a debug cycle. Defensible decision; not a finding.
- ✅ `@stryker-mutator` mutation testing: heavy for pre-launch but documented in PHASE_HISTORY as a phase choice — not premature.
- ✅ `opossum` circuit breaker for Wikidata calls: justified (LLM-external dependency).
- ⚠️ `tesseract.js` + `onnxruntime-node` + `replicate` + `@langchain/google-genai` + `@langchain/openai` + `sharp` + `@mozilla/readability` + `linkedom`: AI/scraping toolchain is wide. Each used per `grep`. Acceptable for an AI-first product but the cumulative supply-chain surface is the largest single risk vector — well-managed by `overrides` block and Renovate.

**No "kubernetes operator" / "ceremony framework" smells.** No `tRPC`, no `nx`, no `turborepo`, no monorepo orchestrator on top of pnpm — appropriate.

---

## Lib choices smelling of "first one I googled"

- `@ronradtke/react-native-markdown-display` — single maintainer fork, but **actively pubbed 19d ago**. The naming convention `@username/` is a yellow flag. Justified because the upstream `react-native-markdown-display` is stale. **Bus-factor 1.**
- `react-native-ssl-public-key-pinning` — single maintainer (`frw`), last push ~10 months. Cert-pinning is security-critical → single-maintainer dep here is the **biggest "first one I googled" risk** in the repo. Alternative: `react-native-ssl-pinning` (different lib, `MaxToyberman`) or fall back to native implementation. **Recommend evaluation pre-launch.**
- `linkedom` — single-maintainer (WebReflection), but very active and the *only* DOM lib that survives huge documents without OOM. Choice is justified by the scraping use case.
- `@maplibre/maplibre-react-native@11.0.0` — pinned exact at the v11.0.0 release, while v11.1.0 exists. v11 was described as "first release to exclusively support new arch" → fine since Expo SDK 55 dropped legacy arch. Just bump to 11.1.0.

**No npm-typo-squatted candidates detected.** No abandoned-yet-popular libs (no `request`, no `moment`, no `node-sass`).

---

## AI/LLM stack discipline

| Pkg | Declared | Latest | Cadence |
|---|---|---|---|
| `@langchain/core` | `1.1.45` pinned | 1.1.44 (one of two) | Day-grade releases. **Repo is current.** |
| `@langchain/openai` | `1.4.2` pinned | 1.4.5 | **3 patches behind**, past 7d cool-down. Bump. |
| `@langchain/google-genai` | `2.1.26` pinned | (not checked individually — Renovate group rule fires) | Renovate `langchain-pin` rule handles. |
| `langfuse` | `^3.38.20` | v5 (Mar-2026) | **DEPRECATED v3**. P0. |
| `@sentry/node` | `^10.49.0` | 10.52.0 | 3 patches behind. Bump. |
| `@sentry/nextjs` | `^10.49.0` | (10.52.0 aligned) | Bump together. |
| `@sentry/react-native` | `^8.9.1` | 8.11.0 (but 8.9.2 recommended pin) | Keep 8.9.x line per Sentry advisory until cocoa fix. |
| `@opentelemetry/*` | `0.217.0` / `2.7.0` / `0.75.0` / `1.40.0` | 0.217.0 / 2.7.1 / 0.75.0 / 1.40.0 | Current within a patch. |

**Discipline:** Renovate `langchain-pin` rule with 3d cool-down + manual review for OpenAI/Google/Deepseek SDKs is correct policy. The LLM contract is the highest-blast-radius surface and policy reflects that.

---

## Recommendations (prioritized)

**Before V1 launch (2026-06-01):**

1. **Plan langfuse v3 → v5 migration OR explicit accept-EOL ADR.** Deprecated SDK on an observability-critical path is a clean cut to make pre-launch. Estimated scope: rewrite `src/shared/observability/langfuse.client.ts` against v5 SDK + Renovate-pin v5. If we ship V1 on v3.38.20, write an ADR documenting the deferral + a hard sunset date.
2. **Clean node_modules of the two extraneous packages.** `rm -rf museum-frontend/node_modules museum-frontend/package-lock.json && npm install` will purge `react-native-confetti-cannon` and `@react-native-google-signin/google-signin`, then verify `npm ls` is clean.
3. **Re-evaluate `react-native-ssl-public-key-pinning`.** Solo maintainer + 10mo stale + cert-pinning is security-critical. Either confirm 2026-Q3 maintenance commitment from the maintainer (GitHub activity check), or fall back to native iOS/Android cert-pinning configured per-platform.
4. **Verify the `expo-updates` patch is still needed against `expo-updates@55.0.23`.** If upstream fixed the Android Metro 404, delete the patch. If still needed, document the upstream issue link in the patch header.
5. **Resolve ESLint major drift.** Pick a target (10 if BE config is the new norm; 9 if FE+Web require their existing config) and align all three apps. Drift is technical debt that doubles ESLint config maintenance.
6. **Bump `@langchain/openai` 1.4.2 → 1.4.5** in a dedicated PR (LLM contract diff review per Renovate rule).

**Pre-launch nice-to-haves (auto-mergeable bumps):**

7. Bump `@sentry/node`, `@sentry/nextjs`, `@sentry/react-native` to latest patch of their respective recommended lines.
8. Bump `i18next`, `react-i18next`, `@tanstack/react-query`, `bullmq`, `@stryker-mutator/*`, `typescript-eslint`, `sharp`, `react-native-qrcode-svg` to current latest (each one patch behind).
9. Bump `@maplibre/maplibre-react-native` 11.0.0 → 11.1.0 with iOS+Android smoke test.

**Post-launch maintenance:**

10. Add Renovate `packageRules` for `/^@tanstack//` (auto-merge dev/patch under 3d cool-down) and add `langfuse` to the LLM-SDK manual-review group.
11. Track `prom-client` upstream for next release; if no release by end of Q3 2026, migrate to `@opentelemetry/sdk-metrics` (already in the OTel stack — would reduce vendor count by 1).
12. Add a quarterly `pnpm licenses ls > docs/LICENSES.md` sentinel to detect future AGPL/SSPL drift.
13. Consider replacing `p-limit@3` with v7 (perf + active maintenance) after launch — ESM-only, requires verification.
14. Evaluate `@ronradtke/react-native-markdown-display` bus-factor; consider vendoring or forking before B2B sign.

---

## Summary

- BE 78 / FE 74 / Web 86 / supply-chain risk 32
- **Top 3 immediate upgrades:** (1) langfuse v3 → v5 migration plan or accept-EOL ADR; (2) `@langchain/openai` 1.4.2 → 1.4.5 LLM-contract PR; (3) ESLint major-drift resolution (align BE10 ↔ FE/Web9).
- **One dep I'd remove tomorrow:** the two extraneous packages (`react-native-confetti-cannon` + `@react-native-google-signin/google-signin`) bundled together — they're lingering in `node_modules` despite being deleted from `package.json`, contributing zero functionality and adding supply-chain footprint for free. A single `rm -rf && npm install` does it.

Sources cited inline in tables — primary anchors: https://www.npmjs.com/package/langfuse, https://www.npmjs.com/package/@langchain/openai, https://libraries.io/npm/prom-client, https://eslint.org/blog/2026/02/eslint-v10.0.0-released/, https://docs.sentry.io/platforms/react-native/, https://www.npmjs.com/package/multer, https://expressjs.com/2026/02/27/security-releases.html, https://www.herodevs.com/blog-posts/axios-versions-cves-and-safe-upgrade-path-updated-april-2026, https://github.com/typeorm/typeorm/issues/11819.
