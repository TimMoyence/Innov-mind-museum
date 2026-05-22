# expo-splash-screen — LESSONS

Human-edited gotchas. Newest section first.

## 2026-05-20

- **Single hide call site, in `finally`.** Musaium hides the splash in exactly
  one place: the `finally` of the auth bootstrap (`AuthContext.tsx:198`). It is
  reached on success *and* on a thrown bootstrap error (the `catch` sets
  `isAuthenticated=false` then falls through to `finally`). If you ever add an
  early `return` inside `bootstrap()` before that `finally`, you reintroduce the
  infinite-splash class. Don't.
- **`preventAutoHideAsync()` is module-scope + fire-and-forget** (`AuthContext.tsx:48`).
  It is `.catch(()=>{})`'d on purpose — a rejected prevent is non-fatal and must
  never block boot. Do not move it into a hook or `await` it.
- **No `setOptions`/fade configured** — Musaium uses defaults (400ms, no iOS
  fade). Acceptable; revisit only if launch feels abrupt. Don't add a long fade.
- **Splash config is the legacy `splash:` key** (`app.config.ts:127`), not an
  `expo-splash-screen` plugin block. Single `backgroundColor`
  (`BRAND_BACKGROUND_COLOR`), `resizeMode: 'contain'`. No `dark:` override yet —
  if a dark splash is wanted, add `dark:` to config, not a runtime hack (native
  splash paints before JS).
- **Validate on a release build.** SDK 52+ has flaky prevent/hide timing in Expo
  Go / dev clients. A dev build looking right ≠ proof (prod = stage doctrine).
