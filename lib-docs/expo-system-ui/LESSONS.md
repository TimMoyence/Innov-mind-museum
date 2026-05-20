# expo-system-ui — LESSONS

Human-edited gotchas. Newest section first.

## 2026-05-20

- **Zero runtime usage today — and that's correct.** Musaium makes no
  `SystemUI.*` calls (verified: grep returns nothing in src). The root
  appearance is config-driven: `userInterfaceStyle: 'automatic'`
  (`app.config.ts:125`) lets the OS scheme drive it, and brand backgrounds are
  set at build time. Only reach for `setBackgroundColorAsync` if/when an **in-app
  theme toggle** ships that diverges from the OS scheme.
- **`setBackgroundColorAsync` is cosmetic — never await on render path.** If
  added, call it from a theme `useEffect`, `.catch(()=>{})`, and keep the value
  in sync with the config `backgroundColor` or you flash the build-time color for
  one frame.
- **It does NOT control the Android nav bar.** `setBackgroundColorAsync` sets the
  root *view* background only. For nav-bar color/visibility use
  `expo-navigation-bar` (not installed). Don't expect this package to recolor it.
- **Edge-to-edge backstop (SDK 55).** With status-bar background deprecated, the
  root view background is what shows under the transparent bars. This package's
  background (or per-screen safe-area Views) is now the correct lever for tinted
  bar areas.
