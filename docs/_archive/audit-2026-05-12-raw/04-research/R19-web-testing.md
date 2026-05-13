# R19 — Web Testing Stack Audit (Musaium, museum-web)

**Date** : 2026-05-12  
**Scope** : Vitest 4 + Vite 8 + Playwright 1.49 + @testing-library/react 16 + jsdom 29 + @axe-core/playwright 4.10 (museum-web)  
**Audit target** : `museum-web/` (Next.js 15 + React 19), 29 test files, Playwright e2e 3-browser nightly matrix, V1 launch 2026-06-01, 100k visitors readiness.

Honesty disclaimer (UFR-013) : findings below are sourced from official docs (vitest.dev, playwright.dev, deque.com), official release notes, and reputable secondary blogs (May 2026). Where claims are speculative ("benchmarks show…") I cite the source ; where I infer from Musaium config (verified via Read) I say so explicitly.

---

## TL;DR

Musaium web testing stack is **fundamentally on the right track** : Vitest 4.1 + Vite 8 + Playwright 1.49 + axe-core represent the canonical 2026 React-19 / Next-15 stack — same shape as Linear, Vercel internal, and most VoidZero-aligned teams. The stack is **mostly current** with three lag points : Playwright (1.49 → 1.59 lag, missing MCP / AI healer / browser.bind / 4x cheaper CLI for agents), jsdom (kept where happy-dom would yield 2-4× faster Vitest runs), and zero adoption of Vitest 4 stable Browser Mode (would replace jsdom for the 8-12 component tests that actually exercise DOM events).

**For 100k visitors readiness** the gaps are **not in the test runner** but in **coverage shape** : (1) no contract testing FE↔BE (OpenAPI types generated, but no runtime drift detector — if BE schema changes silently, FE compiles but breaks in prod), (2) no visual regression baseline (toHaveScreenshot infra trivial to add, Playwright already configured), (3) no MSW layer (every test stubs `fetch` ad-hoc, brittle), (4) Stryker not wired despite ADR-007 ratchet at 54% branch coverage — mutation testing would actually surface dead asserts, (5) no Lighthouse CI budget in PR loop (only nightly).

**Risk verdict** : **LOW for V1 launch** (stack is sane and current-enough), **MEDIUM for 100k scale** (missing visual-regression + contract testing means UI regressions and FE/BE drift will go undetected until users hit them ; Sentry will see fallout but won't prevent it).

---

## Per-tool deep-dive

### 1. Vitest 4 — 2026 status

**Current Musaium** : `^4.1.3` (verified `museum-web/package.json` line 60), `@vitest/coverage-v8 ^4.1.4`, vitest.config.ts uses `environment: 'jsdom'`, `globals: true`, coverage thresholds `lines 70 / branches 54 / functions 64 / statements 68`. Phase 11 Sprint 11.1 baseline.

**2026 status** :
- **Vitest 4.0 GA** late 2025 (per release notes — Browser Mode marked **stable**, removing experimental tag) [vitest.dev/blog/vitest-4](https://vitest.dev/blog/vitest-4)
- **Vitest 4.1 May 2026** : test tags + filter, native Node.js execution mode (bypass Vite module runner), AI agent reporter, GitHub Actions Job Summary auto-generation [vitest.dev/blog/vitest-4-1.html](https://vitest.dev/blog/vitest-4-1.html), [infoq.com vitest-4-1-ai-agents](https://www.infoq.com/news/2026/05/vitest-4-1-ai-agents/)
- **Breaking changes 4.x** : requires Vite >= 6.0.0 and Node.js >= 20.0.0 ; removed `poolMatchGlobs` / `environmentMatchGlobs` → use `projects` ; `new`-keyword mocks now construct instances instead of `mock.apply` [vitest.dev/guide/migration.html](https://vitest.dev/guide/migration.html)
- **Browser Mode stable** : separate package install required (`@vitest/browser-playwright` or `@vitest/browser-webdriverio` or `@vitest/browser-preview`) — old `@vitest/browser` package deprecated
- **Visual regression in Browser Mode** : built-in (`toMatchScreenshot`-style), Playwright Trace support [voidzero.dev/posts/announcing-vitest-4](https://voidzero.dev/posts/announcing-vitest-4)
- **Perf vs Jest 30** : Vitest 4 cold-start 38s vs Jest 30 214s on 50k-test enterprise monorepo (5.6× faster) per SitePoint benchmark cited by [tech-insider.org/vitest-vs-jest-2026](https://tech-insider.org/vitest-vs-jest-2026/) ; React-specific 3.8× faster than Jest 30 with ~40% lower peak memory per [dev.to vitest-vs-jest-30-2fgb](https://dev.to/dataformathub/vitest-vs-jest-30-why-2026-is-the-year-of-browser-native-testing-2fgb)
- **Vitest 5** : in roadmap discussion, no GA date yet

**Verdict Musaium** : on `4.1.3`, only one minor behind latest 4.1 line. Migration path clean. **Action** : negligible — bump-when-convenient, not blocker.

---

### 2. Vite 8 — 2026 status

**Current Musaium** : `^8.0.7` (verified), `@vitejs/plugin-react ^6.0.1`.

**2026 status** :
- **Vite 8.0 GA March 12 2026**, Vite 8 Beta documented at [vite.dev/blog/announcing-vite8-beta](https://vite.dev/blog/announcing-vite8-beta), GA at [vite.dev/blog/announcing-vite8](https://vite.dev/blog/announcing-vite8)
- **Major architectural shift** : Rolldown (Rust bundler) replaces esbuild+Rollup ; Oxc replaces esbuild for JS transform (esbuild now deprecated, auto-converted) [medium.com onix_react vite-8-0-released](https://medium.com/@onix_react/vite-8-0-released-fbf23ade5f79)
- **Perf claims** : 10-30× faster builds ; Linear's prod build 46s → 6s ; 3× faster dev server startup, 40% faster full reloads [vite.dev/blog/announcing-vite8](https://vite.dev/blog/announcing-vite8)
- **Breaking changes** : `build.rollupOptions` → `build.rolldownOptions` ; `import.meta.hot.accept(URL)` removed (id only) ; Lightning CSS default for CSS minify ; Oxc default for JS transform [vite.dev/guide/migration](https://vite.dev/guide/migration)
- **Plugin compat** : Rolldown supports Rollup plugin API → most existing plugins work

**Verdict Musaium** : on `8.0.7`, latest stable line. Plugin React `^6.0.1` is Vite-8-aware. **Action** : verify `build.rollupOptions` usage in `vite.config.ts` if any custom config exists (Musaium uses default — Read confirms only `react()` + alias). No action needed.

---

### 3. Playwright 1.49 — 2026 status

**Current Musaium** : `^1.49.0` (verified), e2e config = 3-browser matrix (chromium/firefox/webkit), 11 e2e files (5 a11y + 4 flows + setup/teardown), `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `workers: isCI ? 2 : undefined`, `retries: isCI ? 1 : 0`.

**2026 status** :
- **Latest** : Playwright 1.59+ shipped early 2026 [testdino.com playwright-release-guide](https://testdino.com/blog/playwright-release-guide) — Musaium is **10 minor versions behind**.
- **Playwright MCP (Microsoft)** : Model Context Protocol server, accessibility-tree-first (not pixel), AI agents drive real browser [github.com/microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp). Self-healing "Healer" agent — 75%+ success rate on selector-related failures per Microsoft benchmarks [testdino.com playwright-ai-ecosystem](https://testdino.com/blog/playwright-ai-ecosystem)
- **browser.bind()** API : launched browser bindable to playwright-cli / @playwright/mcp / other agents [bug0.com playwright-mcp-changes-ai-testing-2026](https://bug0.com/blog/playwright-mcp-changes-ai-testing-2026)
- **Screencast (1.59)** : video record with chapter markers, action annotations — for AI agent traces
- **MS recommends CLI over MCP for coding agents** — 4× fewer tokens per session [testdino.com playwright-ai-ecosystem](https://testdino.com/blog/playwright-ai-ecosystem)
- **Component testing** (`@playwright/test/mount()`) : still alpha-stable, niche vs Vitest Browser Mode

**Verdict Musaium** : **MEDIUM gap** — 10 versions behind (1.49 → 1.59). Functionally it works (`trace: on-first-retry` is the canonical 2026 pattern per [playwright.dev/docs/trace-viewer-intro](https://playwright.dev/docs/trace-viewer-intro)), but missing : MCP integration (relevant given Claude Code/Cursor AI agents in our dev loop), `browser.bind()` for agent-driven explore, screencast for AI-augmented bug triage. **Action** : bump to 1.59+, evaluate MCP server for QA agent loop (`/team` skill could call it to generate e2e from spec). Not launch-blocker, but quality multiplier.

---

### 4. @testing-library/react 16 + React 19 concurrent rendering

**Current Musaium** : `^16.3.2` (verified), React `^19.2.0`, `@testing-library/jest-dom ^6.9.1`.

**2026 status** :
- RTL 16 supports React 19 concurrent features by default via `ReactDOMClient.createRoot` [testing-library.com/docs/react-testing-library/api/](https://testing-library.com/docs/react-testing-library/api/)
- **Gotcha React 19** : tests using `<Suspense>` get stuck rendering fallback unless wrapped in `await act(async () => { ... })`. RTL emits warning. Pattern shift from React 18 [github.com/testing-library/react-testing-library/issues/1375](https://github.com/testing-library/react-testing-library/issues/1375)
- **renderHook async** : designed for React 19 concurrent + Suspense — uses async `act` internally
- React recommends migrating to `@testing-library/react` over deprecated `react-test-renderer` [react.dev/blog/2024/04/25/react-19-upgrade-guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)

**Verdict Musaium** : current. No `react-test-renderer` import in `package.json` (verified — only RTL + jest-dom). **Action** : grep tests for unwrapped `render(<Suspense>...)` — if any exist, wrap in `act` to silence the React 19 warning. Otherwise nothing.

---

### 5. jsdom 29 vs happy-dom vs Playwright Component

**Current Musaium** : `jsdom ^29.0.2`, `environment: 'jsdom'` in vitest.config.

**2026 perf data** :
- happy-dom is **2-4× faster** than jsdom in Vitest (some sources report **5-10×**) and is now **Vitest's recommended environment** [pkgpulse.com happy-dom-vs-jsdom-2026](https://www.pkgpulse.com/guides/happy-dom-vs-jsdom-2026), [pkgpulse.com compare happy-dom-vs-jsdom](https://www.pkgpulse.com/compare/happy-dom-vs-jsdom)
- Trade-off : happy-dom sacrifices edge-case spec compliance for speed ; jsdom is more battle-tested for obscure DOM APIs
- **Hybrid pattern** explicitly supported by Vitest : majority on happy-dom (fast), per-file `// @vitest-environment jsdom` for the 5% needing deeper compat — typical outcome 40-60% suite time reduction
- **Vitest Browser Mode** (stable in 4.x) : runs tests in real Chromium/Firefox/WebKit via Playwright provider. Same `test()`/`expect()`/RTL APIs, just real browser [epicweb.dev vitest-browser-mode-vs-playwright](https://www.epicweb.dev/vitest-browser-mode-vs-playwright). Doesn't ship its own automation — uses Playwright underneath.
- **Vitest Browser vs Playwright Component** : Vitest renders directly in browser (same as your app), Playwright Component serializes JSX from Node→browser (less natural for React/Vite teams) [pkgpulse.com vitest-browser-mode-vs-playwright-component-testing-vs-2026](https://www.pkgpulse.com/blog/vitest-browser-mode-vs-playwright-component-testing-vs-2026)
- **Browser Mode limit** : no address bar → can't test URL query-param sync inside the component test ([mayashavin.com](https://mayashavin.com/articles/component-testing-browser-vitest))

**Verdict Musaium** : jsdom 29 is OK for the 18 logic-heavy tests in `src/lib/` and 6 component tests. But the **component tests** (`Button.test.tsx`, `Header.test.tsx`, `Footer.test.tsx`, `StoreButton.test.tsx`, `GrafanaIframe.test.tsx`, admin tables) would benefit from Vitest 4 Browser Mode (real browser, real CSS, real Framer Motion behavior). **Action recommended** : pilot happy-dom on the 8 pure component tests for a 2-4× speed-up ; pilot Browser Mode for the Framer-Motion-heavy ones (`Header`, `Footer`) where jsdom mocks animations. Not launch-blocker.

**Specific Next.js 15 / RSC caveat** : RSC cannot render in jsdom or happy-dom. They run on server, `node` environment. Test their data layer + their client component output separately [dev.to shieldstring testing-react-server-components-in-nextjs](https://dev.to/shieldstring/testing-react-server-components-in-nextjs-1953), [kettanaito nextjs-rsc-testing](https://github.com/kettanaito/nextjs-rsc-testing). Musaium currently tests almost zero RSC (verified — no async server component test in suite, only client `'use client'` shells). **Action** : when RSC adoption grows, switch RSC tests to `environment: 'node'` and call them as async fns directly.

---

### 6. axe-core for accessibility — WCAG 2.2

**Current Musaium** : `@axe-core/playwright ^4.10.0` (verified), 6 a11y e2e specs (admin-login, admin-users, public-privacy, public-landing, public-support, admin-dashboard) + a11y-disable-rules-cap.test.ts.

**2026 status** :
- **axe-core latest** : `4.11.4` (~13 days old per npm). Musaium on `4.10.x` for Playwright wrapper — minor lag (1 minor) — non-blocking [npmjs.com/package/axe-core](https://www.npmjs.com/package/axe-core)
- **WCAG coverage** : axe-core covers WCAG 2.0 / 2.1 / **2.2** at A, AA, AAA [github.com/dequelabs/axe-core](https://github.com/dequelabs/axe-core), [deque.com/axe/axe-core](https://www.deque.com/axe/axe-core/)
- **Automation coverage ceiling** : ~57% of real WCAG defects detected automatically per Deque's pragmatic sampling ; 30-40% per stricter theoretical measures [testdino.com playwright-accessibility](https://testdino.com/blog/playwright-accessibility), [davidmello.com playwright-accessibility-testing-axe-lighthouse-limitations](https://www.davidmello.com/software-testing/test-automation/playwright-accessibility-testing-axe-lighthouse-limitations) — i.e. **a11y CI gate ≠ accessible site**. Manual + screen-reader + paid disabled testers required for the other 43-70%.
- **2026 baseline** : WCAG 2.2 AA is the global benchmark ; axe + Lighthouse + paid testers = the de-facto stack [testguild.com accessibility-testing-tools-automation](https://testguild.com/accessibility-testing-tools-automation/)
- **axe DevTools Pro** (Deque paid, $-tier) : IGT (Intelligent Guided Tests), ML, JIRA export, perma-share. Not free.

**Verdict Musaium** : a11y stack is current — 6 a11y specs is **above average** for a launch-phase B2C app. Disable-rules cap test (`a11y-disable-rules-cap.test.ts`) is a strong discipline pattern. **Gap** : axe alone catches ≤57%. **Action** : keep axe-CI but add manual a11y sweep before B2B contracts (museum customers will request VPAT). If budget allows, axe DevTools Pro Chrome extension for design-time review during component dev. Not launch-blocker.

---

### 7. Visual regression testing 2026

**Current Musaium** : **none**. Component snapshots exist (`component-snapshots.test.tsx`) but those are text-DOM snapshots, not pixel/visual.

**2026 landscape** :
- **Playwright `toHaveScreenshot()`** : zero-dep, built-in, pixelmatch under the hood, 1280×720 diff < 50ms [bug0.com playwright-visual-regression-testing](https://bug0.com/knowledge-base/playwright-visual-regression-testing), [playwright.dev/docs/test-snapshots](https://playwright.dev/docs/test-snapshots)
- **Percy** (BrowserStack) : 5k snapshots/month free tier, pixel-perfect diff, dynamic mobile content handling [percy.io/blog/visual-regression-testing-tools](https://percy.io/blog/visual-regression-testing-tools)
- **Chromatic** (Storybook) : unlimited parallelization, 2k tests diffed < 2min, best if frontend is Storybook-built [chromatic.com/compare/percy](https://www.chromatic.com/compare/percy)
- **Best practice** : Playwright built-in for simplicity → scale to Percy/Chromatic when cross-browser/team review needed [crosscheck.cloud blogs best-visual-regression-testing-tools-2026](https://crosscheck.cloud/blogs/best-visual-regression-testing-tools-2026)
- **Flakiness mitigation** ([turntrout.com playwright-tips](https://turntrout.com/playwright-tips), [testdino.com playwright-visual-testing](https://testdino.com/blog/playwright-visual-testing)) : disable CSS animations (`animations: 'disabled'`), mask dynamic content (timestamps, avatars, ads), generate baselines in CI not locally (use Playwright Docker), wait for fonts, set per-component thresholds, use component-level screenshots over full-page

**Verdict Musaium** : **GAP** — for a Framer-Motion landing + admin panel, visual regressions WILL slip through into prod without screenshot diff. Adding Playwright `toHaveScreenshot()` to existing e2e flows is **trivial** (no new dep, no new infra — just add `await expect(page).toHaveScreenshot('admin-dashboard.png')`). **Action recommended pre-launch** : add screenshot diff to 5-10 critical surfaces (landing hero, admin dashboard, login, support page, privacy page) — same set already covered by a11y specs. Use `mask: [locator('time')]` for timestamps. CI baseline-generation only via Docker action. Cost : ~2-3h setup, ~30s extra per CI run. **Worth it** for V1.

---

### 8. Stryker mutation for web

**Current Musaium** : **not installed** (verified — no `@stryker-mutator/*` in package.json).

**2026 status** :
- StrykerJS 7.0+ supports Vitest runner via `@stryker-mutator/vitest-runner` [stryker-mutator.io/docs/stryker-js/vitest-runner/](https://stryker-mutator.io/docs/stryker-js/vitest-runner/), [stryker-mutator.io/blog/announcing-stryker-js-7](https://stryker-mutator.io/blog/announcing-stryker-js-7/)
- Coverage analysis support + per-mutant test filtering → fast incremental runs
- ThoughtWorks April 2026 Radar flagged mutation testing as the way to "shift focus from how much code is executed to how much code is actually verified"
- React component guides exist [stryker-mutator.io/docs/stryker-js/guides/react/](https://stryker-mutator.io/docs/stryker-js/guides/react/)

**Verdict Musaium** : **APPLICABLE and recommended for high-value modules**. Musaium's vitest.config explicitly mentions ADR-007 mutation-kill rationale for the 54% branch coverage floor — meaning the intent is there but the **tool is missing**. Branch coverage 54% looks low only because **mutation testing would verify the asserted branches are meaningfully tested**. **Action** : pilot Stryker on `src/lib/` (pure logic, no DOM) for 1 sprint — measure mutation score, gate at ≥75% for lib modules. Not launch-blocker, but completes the ADR-007 story.

---

### 9. Contract testing for OpenAPI (frontend ↔ backend)

**Current Musaium** : `openapi-typescript ^7.13.0` (verified) → `generate:openapi-types` script regenerates `src/lib/api/generated/openapi.ts` from BE spec. `check:openapi-types` script in lint loop. Plus FE-mobile equivalent (`museum-frontend/shared/api/generated/openapi.ts`, 83 KB — per CLAUDE.md token discipline).

**2026 landscape** :
- **openapi-typescript** : compile-time-only types, zero runtime, OpenAPI 3.0/3.1 [openapi-ts.dev/introduction](https://openapi-ts.dev/introduction). **Detects nothing at runtime** — if BE drifts AFTER FE build, prod breaks silently
- **Schemathesis** : property-based fuzz from OpenAPI spec, hundreds of edge-case requests, hits BE not FE [dasroot.net 2026/02 api-first-development-contract-testing](https://dasroot.net/posts/2026/02/api-first-development-contract-testing/)
- **Pact / PactFlow** : consumer-driven contracts, **bi-directional contract testing** = FE publishes consumer pacts, BE publishes OAS, Pactflow brokers compatibility [pactflow.io/bi-directional-contract-testing/](https://pactflow.io/bi-directional-contract-testing/). Different from openapi-typescript : it surfaces runtime drift in CI before deploy.
- **Zod + openapi-zod-client** : single source of truth, runtime + types, generates zodios client [github.com/astahmer/openapi-zod-client](https://github.com/astahmer/openapi-zod-client). Belt-and-suspenders to openapi-typescript : add Zod for **runtime** validation of the BE response shapes the FE actually consumes (chat reply, daily art, support form payloads).
- **PactFlow AI Skill** : a Pact docs Claude skill exists [docs.pact.io/ai_tools/pactflow-skill](https://docs.pact.io/ai_tools/pactflow-skill) — supports `/team` skill integration if Musaium adopts Pact.

**Verdict Musaium** : **MEDIUM-HIGH gap** for a multi-app monorepo. Backend has OpenAPI contract tests (`pnpm test:contract:openapi`) but FE has no runtime drift detector. The `check:openapi-types` CI step blocks if generated types ≠ committed types, but **only at lint time** — if BE redeploys with a new spec AFTER FE was built, FE compiles fine, breaks at runtime. **Action** :
- Cheap : `check:openapi-types` already exists ; ensure it runs in CI **after BE merge** triggers FE re-check (cross-repo). For a monorepo this is free.
- Medium : add Zod schemas (`openapi-zod-client`) for the 3-4 critical response shapes (chat send, daily art, support submit) — validates **at runtime** that BE response matches FE expectation, alerts in Sentry.
- Heavy (post-V1) : PactFlow if/when B2B partners consume the API.

---

### 10. Other relevant findings (Lighthouse, MSW, Next.js 15 specifics)

- **Lighthouse CI** : `ci-cd-web.yml` runs LHCI on PRs per CLAUDE.md. Web Vitals 2026 baseline : INP < 200ms (43% of sites fail), LCP < 2.5s (43% fail), CLS [digitalapplied.com core-web-vitals-2026-inp-lcp-cls-optimization-guide](https://www.digitalapplied.com/blog/core-web-vitals-2026-inp-lcp-cls-optimization-guide). Performance budget recommendation : JS < 200KB, LCP < 2.5s, Perf score > 90, run 3× per URL to reduce noise [medium.com/@mtorre4580 performance-budget-for-nextjs](https://medium.com/@mtorre4580/performance-budget-for-next-js-e34eb4fda11e). **Verdict** : LHCI in PR loop = good ; verify budget thresholds in `.lighthouserc.js` aren't permissive.
- **MSW (Mock Service Worker) 2.x** : industry-standard network mock layer [mswjs.io/docs/quick-start/](https://mswjs.io/docs/quick-start/) — reusable handler defs across Vitest + Playwright + Storybook. **Musaium currently does NOT use MSW** (verified — not in package.json). Tests mock `fetch` ad-hoc inside each file. **Gap** : DRY violation, brittle on API shape changes. **Action** : not launch-blocker, but next iteration : centralize handlers in `src/__tests__/msw/handlers.ts`, share between Vitest + Playwright.
- **Next.js 15 / React 19 RSC testing** : Vitest + RTL + Playwright is the canonical 2026 stack [qaskills.sh blog react-nextjs-testing-complete-guide](https://qaskills.sh/blog/react-nextjs-testing-complete-guide). RSC must use `node` env, not jsdom. Musaium currently has near-zero RSC test coverage — acceptable given small RSC surface but track if RSC adoption grows.

---

## Web testing pyramid for Musaium (verdict shape)

```
                      ▲
                      │  e2e Playwright (3-browser nightly)
                  ┌───┤  4 flow + 6 a11y = 10 specs
                  │   │  ✓ current, ↗ bump to 1.59+, ↗ add MCP
                  │   │
                  ├───┤  Visual regression (toHaveScreenshot)
              GAP │   │  ✗ MISSING — add to existing e2e (cheap)
                  │   │
                  ├───┤  Component (Vitest jsdom)
                  │   │  6 component tests
                  │   │  ↗ pilot happy-dom / Browser Mode
                  │   │
                  ├───┤  Logic (Vitest jsdom, src/lib/**)
                  │   │  ~20 tests, coverage 70/54/64/68
                  │   │  ↗ Stryker pilot (ADR-007 follow-through)
                  │   │
                  └───┤  Contract (openapi-typescript compile-time)
              GAP     │  ✗ no runtime drift detect — add Zod for hot paths
                      ▼
```

---

## Final verdict (100k visitors readiness)

| Dimension | Status | Risk for 100k |
|---|---|---|
| Vitest / Vite versions | Current (4.1.3 / 8.0.7) | LOW |
| Playwright version | 10 minor lag (1.49 → 1.59) | LOW (works, missing MCP/AI) |
| RTL / React 19 compat | Current | LOW |
| jsdom 29 perf | Functional, 2-4× speed left on table | LOW |
| WCAG 2.2 axe coverage | Above-avg (6 specs + cap test) | LOW for code, MED for manual (need screen-reader pass pre B2B) |
| Visual regression | **MISSING** | **MED** — Framer Motion landing + admin will regress silently |
| Mutation testing (Stryker) | **MISSING** despite ADR-007 reference | LOW–MED (coverage % overstates quality at 54% branches) |
| Contract testing FE↔BE | Compile-time only via openapi-typescript | **MED-HIGH** — runtime drift = silent prod break |
| MSW network mock layer | **MISSING** | LOW (DRY hygiene only) |
| Lighthouse CI budget | Present | LOW (verify budget tight enough) |
| Playwright trace + flaky strat | Configured (on-first-retry) | LOW |

**Top 3 actions pre-launch (highest ROI / lowest cost)** :

1. **Add Playwright `toHaveScreenshot()` to 5-10 critical surfaces** (~2h setup) → catches Framer Motion / admin UI regressions before users. Free (Playwright already configured).
2. **Add Zod runtime validation for hot-path BE responses** (chat send, daily art, support submit) (~4h setup) → catches FE↔BE drift in Sentry before user reports. Adds `~5KB` to bundle for the 3-4 critical schemas.
3. **Bump Playwright 1.49 → 1.59** (~30min) → trace viewer better, screencast for AI agent triage, MCP-ready. Zero risk.

**Top 3 post-launch (V1.1)** : Vitest Browser Mode pilot for component tests, Stryker on `src/lib/`, MSW centralized handlers.

---

## Sources

- [vitest.dev/blog/vitest-4](https://vitest.dev/blog/vitest-4)
- [vitest.dev/blog/vitest-4-1.html](https://vitest.dev/blog/vitest-4-1.html)
- [vitest.dev/guide/migration.html](https://vitest.dev/guide/migration.html)
- [voidzero.dev/posts/announcing-vitest-4](https://voidzero.dev/posts/announcing-vitest-4)
- [infoq.com vitest-4-1-ai-agents](https://www.infoq.com/news/2026/05/vitest-4-1-ai-agents/)
- [vite.dev/blog/announcing-vite8-beta](https://vite.dev/blog/announcing-vite8-beta)
- [vite.dev/blog/announcing-vite8](https://vite.dev/blog/announcing-vite8)
- [vite.dev/guide/migration](https://vite.dev/guide/migration)
- [playwright.dev/docs/release-notes](https://playwright.dev/docs/release-notes)
- [playwright.dev/docs/trace-viewer-intro](https://playwright.dev/docs/trace-viewer-intro)
- [playwright.dev/docs/test-snapshots](https://playwright.dev/docs/test-snapshots)
- [playwright.dev/docs/accessibility-testing](https://playwright.dev/docs/accessibility-testing)
- [github.com/microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
- [testdino.com playwright-ai-ecosystem](https://testdino.com/blog/playwright-ai-ecosystem)
- [testdino.com playwright-accessibility](https://testdino.com/blog/playwright-accessibility)
- [bug0.com playwright-mcp-changes-ai-testing-2026](https://bug0.com/blog/playwright-mcp-changes-ai-testing-2026)
- [bug0.com playwright-visual-regression-testing](https://bug0.com/knowledge-base/playwright-visual-regression-testing)
- [testing-library.com/docs/react-testing-library/api/](https://testing-library.com/docs/react-testing-library/api/)
- [react.dev/blog/2024/04/25/react-19-upgrade-guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [github.com/testing-library/react-testing-library/issues/1375](https://github.com/testing-library/react-testing-library/issues/1375)
- [pkgpulse.com happy-dom-vs-jsdom-2026](https://www.pkgpulse.com/guides/happy-dom-vs-jsdom-2026)
- [pkgpulse.com compare happy-dom-vs-jsdom](https://www.pkgpulse.com/compare/happy-dom-vs-jsdom)
- [pkgpulse.com vitest-browser-mode-vs-playwright-component-testing-vs-2026](https://www.pkgpulse.com/blog/vitest-browser-mode-vs-playwright-component-testing-vs-2026)
- [epicweb.dev vitest-browser-mode-vs-playwright](https://www.epicweb.dev/vitest-browser-mode-vs-playwright)
- [mayashavin.com articles component-testing-browser-vitest](https://mayashavin.com/articles/component-testing-browser-vitest)
- [deque.com/axe/axe-core](https://www.deque.com/axe/axe-core/)
- [github.com/dequelabs/axe-core](https://github.com/dequelabs/axe-core)
- [npmjs.com/package/axe-core](https://www.npmjs.com/package/axe-core)
- [davidmello.com playwright-accessibility-testing-axe-lighthouse-limitations](https://www.davidmello.com/software-testing/test-automation/playwright-accessibility-testing-axe-lighthouse-limitations)
- [testguild.com accessibility-testing-tools-automation](https://testguild.com/accessibility-testing-tools-automation/)
- [percy.io/blog/visual-regression-testing-tools](https://percy.io/blog/visual-regression-testing-tools)
- [chromatic.com/compare/percy](https://www.chromatic.com/compare/percy)
- [crosscheck.cloud blogs best-visual-regression-testing-tools-2026](https://crosscheck.cloud/blogs/best-visual-regression-testing-tools-2026)
- [turntrout.com playwright-tips](https://turntrout.com/playwright-tips)
- [testdino.com playwright-visual-testing](https://testdino.com/blog/playwright-visual-testing)
- [stryker-mutator.io/docs/stryker-js/vitest-runner/](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)
- [stryker-mutator.io/blog/announcing-stryker-js-7](https://stryker-mutator.io/blog/announcing-stryker-js-7/)
- [stryker-mutator.io/docs/stryker-js/guides/react/](https://stryker-mutator.io/docs/stryker-js/guides/react/)
- [pactflow.io/bi-directional-contract-testing/](https://pactflow.io/bi-directional-contract-testing/)
- [docs.pact.io/ai_tools/pactflow-skill](https://docs.pact.io/ai_tools/pactflow-skill)
- [openapi-ts.dev/introduction](https://openapi-ts.dev/introduction)
- [github.com/astahmer/openapi-zod-client](https://github.com/astahmer/openapi-zod-client)
- [dev.to young_gao request-validation-at-the-edge-zod-schemas-openapi-and-type-safe-apis](https://dev.to/young_gao/request-validation-at-the-edge-zod-schemas-openapi-and-type-safe-apis-1kib)
- [mswjs.io/docs/quick-start/](https://mswjs.io/docs/quick-start/)
- [github.com/kettanaito/nextjs-rsc-testing](https://github.com/kettanaito/nextjs-rsc-testing)
- [dev.to shieldstring testing-react-server-components-in-nextjs](https://dev.to/shieldstring/testing-react-server-components-in-nextjs-1953)
- [qaskills.sh blog react-nextjs-testing-complete-guide](https://qaskills.sh/blog/react-nextjs-testing-complete-guide)
- [digitalapplied.com core-web-vitals-2026-inp-lcp-cls-optimization-guide](https://www.digitalapplied.com/blog/core-web-vitals-2026-inp-lcp-cls-optimization-guide)
- [medium.com/@mtorre4580 performance-budget-for-next-js](https://medium.com/@mtorre4580/performance-budget-for-next-js-e34eb4fda11e)
- [tech-insider.org vitest-vs-jest-2026](https://tech-insider.org/vitest-vs-jest-2026/)
- [dev.to dataformathub vitest-vs-jest-30-2fgb](https://dev.to/dataformathub/vitest-vs-jest-30-why-2026-is-the-year-of-browser-native-testing-2fgb)
