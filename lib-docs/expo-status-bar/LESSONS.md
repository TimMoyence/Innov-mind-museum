# expo-status-bar — LESSONS

Human-edited gotchas. Newest section first.

## 2026-05-20

- **`style` = text color, not theme name.** `style="light"` means light-colored
  text (for a dark background). Musaium's `ThemedStatusBar` correctly maps
  `isDark ? 'light' : 'dark'` (`app/_layout.tsx:88`). Reading `light` as "light
  theme" inverts contrast — recurring trap.
- **One `<StatusBar>` at the root only.** Musaium mounts it once inside the theme
  provider (`app/_layout.tsx:214`). Do not drop additional `<StatusBar>` into
  individual screens — instances fight, last-committed wins, you get flicker on
  navigation. If a screen needs a transient override (camera/media), use the
  imperative `setStatusBarStyle` and restore on unmount.
- **Android `backgroundColor`/`translucent` are deprecated in SDK 55**
  (edge-to-edge). They're inert. Never add them to "color the status bar" — set
  the screen's safe-area background or the `expo-system-ui` root background. If
  migrating from an older SDK, delete the dead props (UFR-016).
- **RTL: nothing to do.** No left/right props; locale/direction agnostic across
  all 8 locales.
