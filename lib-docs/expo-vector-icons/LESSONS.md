# @expo/vector-icons — Musaium Lessons

## 2026-05-20

Promoted from family-collapse stub (`@expo/vector-icons/PATTERNS.md` pointed at `expo/PATTERNS.md`) to dedicated docs. Dedicated dir lives at `lib-docs/expo-vector-icons/` (no `@` in path) to avoid index/path-escaping issues; the `@expo/vector-icons/` stub remains as a pointer for `pre-phase-doc-freshness.sh`.

- **Ionicons is the ONLY set — verified clean.** Grep across `app/`, `features/`, `shared/`, `components/` for FontAwesome / MaterialIcons / MaterialCommunityIcons / AntDesign / Feather / Entypo / Octicons / etc. returns ZERO non-Ionicons matches. 63 import sites, all `import { Ionicons } from '@expo/vector-icons'`. No `createIconSet*`, no `Ionicons.Button`. Keep this discipline — a single set keeps bundle size, visual consistency, and a11y review tractable.
- **Accessibility is already correct everywhere — protect it.** Every icon-only `Pressable` carries `accessibilityRole="button"` + i18n `accessibilityLabel` (`a11y.*` keys). This is the bar; reject any new icon button that omits the label.
- **`keyof typeof Ionicons.glyphMap` is the typing standard** (11 sites). A bad glyph name renders a silent empty box — type it, don't `string` it.
- **No unicode emoji** (CLAUDE.md gotcha + ast-grep `no-unicode-emoji-in-screen.yml`). Missing glyph + no PNG ⇒ block the work, never an emoji placeholder.
- **Version**: range `^15.0.3`, latest `15.1.1` (minor drift). The disruptive change (`15.0.0` icon-family break + `expo-font` peer dep) is already behind the 15.x line. Bump to `15.1.1` is low-risk but not urgent — its only changes (IcoMoon JSON, `getIconSetForProps` fallback) touch code paths Musaium doesn't exercise.
