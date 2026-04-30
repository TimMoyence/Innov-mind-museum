# Design System Token Extraction — Full Spec

**Date:** 2026-04-09
**Scope:** museum-frontend + museum-web + themes.ts refactor
**Baseline:** ~1053 hardcoded design values (133 hex, 103 rgba, 808 numeric px, 9 string sizes)
**Target:** 0 hardcoded values — everything through design tokens

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Frontend + Web + themes.ts | Complete coverage, no holes in center of system |
| Non-standard values | Hybrid: extend scale + round outliers | Balance between visual fidelity and clean scale |
| RGBA strategy | Semantic tokens for recurring + withOpacity for one-off | Recurring values get names, rare ones use utility |
| Regression tolerance | Foundations first, then vertical per module | Controlled blast radius per sprint |
| Token architecture | Semantic tokens complets (3 layers) | Auto-documented, component-level protection |

## Architecture — 3 Layers

```
┌─────────────────────────────────────┐
│  Layer 3 — Semantic (component)     │  card.padding, input.height, badge.radius
│  → design-system/tokens/semantic.ts
│  → museum-frontend: tokens.semantic.ts (generated)
│  → museum-web: tokens.semantic.css (generated)
├─────────────────────────────────────┤
│  Layer 2 — Functional (intent)      │  withOpacity(), glassBorder, overlayLight
│  → design-system/tokens/functional.ts
├─────────────────────────────────────┤
│  Layer 1 — Primitives (scale)       │  space[4], fontSize.md, primaryScale[500]
│  → design-system/tokens/ (existing, extended)
└─────────────────────────────────────┘
```

### Layer 1 — Primitives (existing, extended)

**colors.ts** — unchanged (primary, accent, gold, text, surface, status scales)

**spacing.ts** — extended with frequently-used missing values:
- Add: 18, 22, 36, 72, 80, 96 to spacing scale
- Keep existing 16 values intact
- Round rare outliers: 9→8, 11→12, 15→16, 17→16 or 18

**typography.ts** — unchanged (xs→4xl covers 12-36px, weights 400-700, line-heights)

### Layer 2 — Functional

**functional.ts** (new):
```ts
// Utility
export function withOpacity(hexColor: string, alpha: number): string;

// Recurring RGBA tokens (used 3+ times in codebase)
export const functional = {
  glassBorder: 'rgba(148, 163, 184, 0.22)',
  glassBackground: 'rgba(255, 255, 255, 0.18)',
  glassBackgroundHeavy: 'rgba(255, 255, 255, 0.22)',
  overlayLight: 'rgba(0, 0, 0, 0.15)',
  overlayMedium: 'rgba(0, 0, 0, 0.4)',
  overlayHeavy: 'rgba(0, 0, 0, 0.6)',
  overlayDark: 'rgba(0, 0, 0, 0.95)',
  shadowSubtle: 'rgba(0, 0, 0, 0.08)',
  shadowMedium: 'rgba(0, 0, 0, 0.15)',
  primaryGlow: 'rgba(30, 64, 175, 0.2)',
  primaryGlowStrong: 'rgba(30, 64, 175, 0.88)',
  slateTransparent: 'rgba(100, 116, 139, 0.92)',
  // dark mode variants
  darkGlassBorder: 'rgba(148, 163, 184, 0.15)',
  darkGlassBackground: 'rgba(0, 0, 0, 0.3)',
  darkOverlay: 'rgba(0, 0, 0, 0.7)',
} as const;
```

### Layer 3 — Semantic

**semantic.ts** (new) — component-level tokens referencing primitives:

```ts
export const semantic = {
  screen: {
    padding: space[4],          // 16px
    paddingLarge: space[6],     // 24px
    gap: space[4],              // 16px
  },
  card: {
    padding: space[4],          // 16px
    gap: space[3],              // 12px
    radius: radius.lg,          // 16px
    titleSize: fontSize.lg,     // 18px
    bodySize: fontSize.sm,      // 14px
  },
  input: {
    height: space[12],          // 48px
    padding: space[4],          // 16px
    radius: radius.md,          // 8px
    fontSize: fontSize.md,      // 16px
    borderWidth: 1,
  },
  button: {
    height: space[12],          // 48px
    paddingX: space[6],         // 24px
    paddingY: space[3],         // 12px
    radius: radius.DEFAULT,     // 10px
    fontSize: fontSize.md,      // 16px
  },
  badge: {
    paddingX: space[2],         // 8px
    paddingY: space[1],         // 4px
    radius: radius.full,        // 999px
    fontSize: fontSize.xs,      // 12px
  },
  modal: {
    padding: space[6],          // 24px
    radius: radius.xl,          // 20px
    maxWidth: 400,
  },
  nav: {
    height: space[14],          // 56px
    paddingX: space[4],         // 16px
  },
  chat: {
    bubblePadding: space[3],    // 12px
    bubbleRadius: radius.lg,    // 16px
    gap: space[2],              // 8px
    fontSize: fontSize.md,      // 16px
    timestampSize: fontSize.xs, // 12px
  },
  list: {
    itemPaddingX: space[4],     // 16px
    itemPaddingY: space[3],     // 12px
    itemGap: space[2],          // 8px
    separatorWidth: 1,
  },
  section: {
    titleSize: fontSize.xl,     // 20px
    titleWeight: fontWeight.semibold,
    gap: space[3],              // 12px
    marginBottom: space[6],     // 24px
  },
} as const;
```

## Build Pipeline

`design-system/build.ts` extended:

**Inputs:**
- `tokens/colors.ts` (existing)
- `tokens/spacing.ts` (extended)
- `tokens/typography.ts` (existing)
- `tokens/functional.ts` (new)
- `tokens/semantic.ts` (new)

**Outputs — React Native:**
- `museum-frontend/shared/ui/tokens.generated.ts` (updated with extended spacing)
- `museum-frontend/shared/ui/tokens.semantic.ts` (new — semantic tokens as JS objects)
- `museum-frontend/shared/ui/tokenUtils.ts` (new — `withOpacity()`)

**Outputs — Web:**
- `museum-web/src/tokens.generated.css` (updated with extended spacing)
- `museum-web/src/tokens.semantic.css` (new — CSS custom properties for semantic tokens)

## ESLint Enforcement

Custom rule `no-hardcoded-design-values`:
- Blocks hex literals in StyleSheet/style props
- Blocks magic numbers on: padding, margin, gap, borderRadius, fontSize, width, height, lineHeight, top, right, bottom, left
- Allowed exceptions: `0`, `1`, `0.5`, and properties: `flex`, `opacity`, `zIndex`, `aspectRatio`, `fontWeight`
- Severity: `warn` during migration, `error` after Sprint 6

## Semantic Categories

| Category | Properties | Target files |
|----------|-----------|-------------|
| `screen` | padding, gap, backgroundGradient | all stack screens |
| `card` | padding, gap, radius, titleSize, bodySize, shadow | DailyArtCard, VisitSummary, ReviewCard... |
| `input` | height, padding, radius, fontSize, borderWidth | auth forms, chat input, search |
| `button` | height, paddingX, paddingY, radius, fontSize | all CTAs |
| `badge` | paddingX, paddingY, radius, fontSize | ExpertiseBadge, ticket status |
| `modal` | padding, radius, overlayOpacity, maxWidth | VisitSummaryModal, confirmations |
| `nav` | height, paddingX, blur, borderWidth | Header, TabBar |
| `chat` | bubblePadding, bubbleRadius, gap, fontSize, timestampSize | ChatBubble, ChatInput |
| `list` | itemPadding, itemGap, separatorWidth | conversation list, settings list |
| `section` | titleSize, titleWeight, gap, marginBottom | all screens with sections |

## Sprint Plan

### Sprint 1 — Foundations (~8 files)
- Extend `spacing.ts` with missing values
- Create `functional.ts` (withOpacity + RGBA tokens)
- Create `semantic.ts` (all 10 categories)
- Update `build.ts` to generate semantic outputs
- Run build, verify generated files
- Create counting script `scripts/count-design-debt.sh`
- Run baseline count

### Sprint 2 — shared/ui + themes.ts (~15 files)
- Refactor `themes.ts` to use functional tokens (34 RGBA → tokens)
- Migrate `shared/ui/` components to semantic tokens
- Migrate `StartupConfigurationErrorScreen.tsx` (12 hex → tokens)
- Count after sprint

### Sprint 3 — chat + auth features (~20 files)
- `features/chat/ui/` — all components (ChatBubble, ExpertiseBadge, VisitSummaryModal...)
- `features/auth/ui/` — authStyles.ts (29 hardcoded) + components
- Count after sprint

### Sprint 4 — remaining features (~25 files)
- `features/museum/` — leafletHtml.ts (17 hex), map components
- `features/daily-art/` — DailyArtCard (18 hardcoded)
- `features/onboarding/` — OnboardingSlide (17 hardcoded)
- `features/support/` — ticketHelpers.ts (8 hex)
- `features/review/` — review components
- `features/settings/` — settings components
- Count after sprint

### Sprint 5 — stack screens (~15 files)
- `app/(stack)/privacy.tsx` (53 hardcoded — biggest file)
- `app/(stack)/tickets.tsx` (23)
- `app/(stack)/settings.tsx` (23)
- `app/(stack)/reviews.tsx` (23)
- `app/(stack)/museum-detail.tsx` (23)
- `app/(stack)/preferences.tsx` (22)
- `app/(stack)/ticket-detail.tsx` (21)
- `app/(stack)/discover.tsx` (21)
- `app/(stack)/terms.tsx` (19)
- Remaining stack screens
- Count after sprint

### Sprint 6 — museum-web (~20 files)
- Marketing components: DemoChat (41), DemoMap (19), PhoneMockup (13), TabletMockup (12), HeroAnimation (7)
- StoreButton, MultiDeviceShowcase
- Admin pages: analytics (4 hex)
- globals.css hardcoded shadows/effects → CSS custom properties
- Header, shared components
- Final count — target: 0
- ESLint rule severity → `error`

## Metrics

**Counting script** (`scripts/count-design-debt.sh`):
- Grep patterns: hex (`#[0-9a-fA-F]{3,8}`), rgba (`rgba?\(`), numeric design props
- Excludes: node_modules, .generated., .test., __tests__
- Output: per-category count + total + per-file breakdown

**Baseline:** ~1053 hardcoded values
**Target:** 0

**Per-sprint tracking:**
| Sprint | Before | After | Δ |
|--------|--------|-------|---|
| 1 | 1053 | ~1053 | 0 (foundations only) |
| 2 | ~1053 | ~850 | -200 |
| 3 | ~850 | ~600 | -250 |
| 4 | ~600 | ~400 | -200 |
| 5 | ~400 | ~200 | -200 |
| 6 | ~200 | 0 | -200 |

## GitNexus Integration

- `gitnexus_impact()` before modifying any file
- `gitnexus_detect_changes()` before each commit
- Full reindex (`npx gitnexus analyze`) after each sprint commit
