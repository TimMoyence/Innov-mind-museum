# Lessons — recharts (v3.8.1)

Audit 2026-05-18 : **PASS_WITH_MINOR** — single consumer admin/analytics/page.tsx.

## ⚠️ F5 MEDIUM : `isAnimationActive={false}` missing in tests → flaky DOM assertions
- Source charts have no `isAnimationActive` prop → default 'auto' may animate under JSDOM sans prefers-reduced-motion.
- **Fix TD-RECH-01** : set `isAnimationActive={false}` on Line/Bar in tests OR stub ResizeObserver + skip chart DOM assertions.

## ⚠️ F6 LOW : ResponsiveContainer in JSDOM needs `ResizeObserver` polyfill
- Verify vitest setup stubs `global.ResizeObserver` OR render charts with fixed width/height in tests.

## ⚠️ F3 LOW : Per-component generics for `dataKey` type-safety missing
- `<LineChart data={chartData}>` + `<BarChart>` no generics. dataKey='sessions'|'messages'|'activeUsers' typos won't be caught despite `UsageChartPoint` type.
- **Fix TD-RECH-02** : wrap with `createHorizontalChart<UsageChartPoint>()` OR use `<Line<UsageChartPoint, number> dataKey='sessions' />`.

## ⚠️ F9 LOW : Chart container missing `role='img'` + `aria-label`
- v3 `accessibilityLayer` adds keyboard nav but not description.
- **Fix TD-RECH-03** : `role='img' + aria-label={adminDict.analyticsPage.usage/topArtworks}` on ResponsiveContainer parent div.

## ⚠️ F4 LOW : Tooltip declared BEFORE Line series (z-index review)
- v3 z-index = render order. Tooltip is HTML overlay (not SVG) → likely OK but verify hover visual.

## ✅ Positives
- ResponsiveContainer wraps all charts ✅
- `accessibilityLayer` default true preserved ✅
- No `recharts.org` URL hardcoded (host migrated to recharts.github.io) ✅
- No `<Area>` so `connectNulls` v3 change N/A ✅

## 2026-05-20 (refresh — verified against 3.8.1 + React 19 + Next 15)

Re-audit of the single consumer `museum-web/src/app/[locale]/admin/analytics/page.tsx` + its test. Verdict: **PASS_WITH_MINOR** — same 4 carry-over findings still open, plus version/compat confirmations.

### Confirmed safe
- **React 19 compat OK** — `npm view recharts peerDependencies` lists `react: ^19.0.0`; museum-web runs React 19.2 / Next 15.5. No upgrade pressure: npm `latest` = 3.8.1 (2026-03-25), no newer 3.x, **zero security advisories** on recharts/recharts.
- **`'use client'` boundary correct** — `page.tsx:1` declares it; recharts is client-only (DOM + ResizeObserver). No RSC violation.
- **Theme tokens correct** — `stroke`/`fill` use `var(--sem-chart-primary..quaternary)` (defined `src/tokens.semantic.css:161-164`), not hex literals.
- **Empty/zero guard correct** — `isAllZero()` + `EmptyChartPlaceholder` (`role="status"` + `aria-label`) prevents recharts rendering blank axes; "Top Museums" is a real `<table>` (fully accessible), not a chart.
- **Test mock pragmatic** — suite mocks every recharts component to `<div>`/`null`, sidestepping the JSDOM ResizeObserver gap. UFR-021 note: this is a Vitest component test, not the screen-coverage contract (web admin, not Expo screen).

### ⚠️ Carry-over findings (still open)
- **F9 LOW / TD-RECH-03 — no `role="img"` + `aria-label` on chart containers.** `accessibilityLayer=true` gives keyboard nav but NOT a description; SR users get nothing for the Usage LineChart and Top-Artworks BarChart. Fix: wrap each `ResponsiveContainer` in `<div role="img" aria-label={adminDict.analyticsPage.usage / .topArtworks}>` (or a visually-hidden `<table>` fallback). WCAG 1.1.1 / 1.3.1.
- **F3 LOW / TD-RECH-02 — no TS generics on `<LineChart>`/`<BarChart>`.** `dataKey="sessions|messages|activeUsers"` typos uncaught despite `UsageChartPoint`. Fix: `createHorizontalChart<UsageChartPoint>()` or `<Line<UsageChartPoint, number> dataKey=... />`.
- **F5 MEDIUM / TD-RECH-01 — `isAnimationActive` not set `false` in source/tests.** Default `'auto'` animates without `prefers-reduced-motion` → potential flaky DOM assertions if the recharts mock is ever removed. Currently masked by the full mock.
- **F6 LOW — ResponsiveContainer needs ResizeObserver in JSDOM.** Masked today by the component mock; if real charts are tested, stub `global.ResizeObserver` or render fixed width/height.

### New (perf, low priority)
- **`chartData` recomputed inline every render** (`page.tsx:204`) — `mergeUsageTimeSeries(usage)` returns a new array each render → recharts rebuilds SVG + replays animation on any unrelated state change (e.g. error toast). Wrap in `useMemo([usage])`. Negligible at current data sizes (≤90 daily points); flag if series grow. No built-in virtualization — downsample server-side if a series could exceed a few hundred points.
