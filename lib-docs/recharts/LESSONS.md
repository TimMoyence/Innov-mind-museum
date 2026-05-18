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
