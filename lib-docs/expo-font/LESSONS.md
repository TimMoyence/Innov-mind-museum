# expo-font — LESSONS (project gotchas)

## 2026-05-20
- **`'expo-font'` plugin is a no-op as configured.** `app.config.ts` (~line 322)
  lists the bare string `'expo-font'` with no `fonts` array, and there are no font
  files under `assets/` — so NO custom fonts load; the app uses system fonts.
  Either configure `["expo-font", {fonts:[...]}]` when shipping fonts, or remove the
  dead entry (UFR-016).
- **No `useFonts` call exists.** The splash gate is in
  `features/auth/application/AuthContext.tsx` (keyed on auth hydration), NOT fonts.
  If fonts are added, fold the font gate into that same single splash-hide chain —
  do not create a second `hideAsync()` site racing the first.
- **Hide splash on `loaded || error`, never on `loaded` alone.** A font asset/CDN
  failure must not brick boot. Always render a system-font fallback on `error`.
- **Font map must be module-level + stable.** `useFonts` does NOT reload when the
  map reference changes; an inline object per render produces confusing states.
- **Prefer the config plugin over runtime loading** for shipped native fonts —
  available on first frame, no FOUT, no gate.
- **UFR-021:** a screen that depends on a custom font needs a Maestro flow; a Jest
  snapshot can mock the font load and hide a regression.
