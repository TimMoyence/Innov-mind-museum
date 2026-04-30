# Design System Token Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all ~1053 hardcoded design values (hex, rgba, px) from museum-frontend and museum-web into a 3-layer design token system (primitives → functional → semantic), achieving 0 hardcoded values.

**Architecture:** Extend existing design-system/tokens/ (Layer 1 primitives), add functional.ts for RGBA tokens + withOpacity utility (Layer 2), add semantic.ts for component-level tokens (Layer 3). Build pipeline generates platform-specific outputs. ESLint rule prevents regression.

**Tech Stack:** TypeScript, React Native StyleSheet, Tailwind 4 CSS custom properties, ESLint custom rule

---

## Task 1: Extend Primitive Spacing Tokens

**Files:**
- Modify: `design-system/tokens/spacing.ts`

- [ ] **Step 1: Add missing spacing values to spacing.ts**

Add frequently-used values found in codebase that don't exist in the current scale (18px, 22px, 34px, 36px, 50px, 72px, 80px, 96px):

```ts
// Add after '16' entry in spacing:
  /** 18px — comfortable padding */
  '4.5': { px: 18, rem: '1.125rem' },
  /** 22px — generous padding */
  '5.5': { px: 22, rem: '1.375rem' },
  /** 34px — title line height */
  '8.5': { px: 34, rem: '2.125rem' },
  /** 36px — large element */
  '9': { px: 36, rem: '2.25rem' },
  /** 50px — button height (Apple login) */
  '12.5': { px: 50, rem: '3.125rem' },
  /** 56px — nav height */
  '14': { px: 56, rem: '3.5rem' },
  /** 72px — hero spacing */
  '18': { px: 72, rem: '4.5rem' },
  /** 80px — page spacing */
  '20': { px: 80, rem: '5rem' },
  /** 96px — large page spacing */
  '24': { px: 96, rem: '6rem' },
```

Add missing radii for 36px used in codebase:

```ts
// Add after '4xl' in radii:
  /** 36px — large pill elements */
  '5xl': { px: 36, rem: '2.25rem' },
```

- [ ] **Step 2: Verify build still compiles**

Run: `cd design-system && pnpm build`
Expected: ✓ museum-frontend, ✓ museum-web generated

- [ ] **Step 3: Commit**

```bash
git add design-system/tokens/spacing.ts museum-frontend/shared/ui/tokens.generated.ts museum-web/src/tokens.generated.css
git commit -m "feat(design-system): extend spacing scale with missing values (18,22,34,36,50,56,72,80,96px)"
```

---

## Task 2: Create Functional Tokens (Layer 2)

**Files:**
- Create: `design-system/tokens/functional.ts`
- Modify: `design-system/tokens/index.ts`

- [ ] **Step 1: Create functional.ts with withOpacity and RGBA tokens**

```ts
/**
 * Musaium Design System — Functional Tokens (Layer 2)
 *
 * RGBA tokens for recurring transparent colors (used 3+ times in codebase)
 * and a withOpacity() utility for one-off transparency values.
 */

/**
 * Converts a hex color to rgba with the given alpha.
 * Works with 3-char (#fff), 6-char (#ffffff), and 8-char (#ffffffaa) hex.
 */
export function withOpacity(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const functional = {
  /* ── Light theme glass ────────────────────────────── */
  glassBorder: 'rgba(255, 255, 255, 0.58)',
  glassBackground: 'rgba(255, 255, 255, 0.44)',
  cardBackground: 'rgba(255, 255, 255, 0.66)',
  cardBorder: 'rgba(148, 163, 184, 0.42)',
  inputBackground: 'rgba(255, 255, 255, 0.7)',
  inputBorder: 'rgba(148, 163, 184, 0.45)',
  surface: 'rgba(255, 255, 255, 0.64)',
  overlay: 'rgba(255, 255, 255, 0.70)',
  separator: 'rgba(148, 163, 184, 0.35)',

  /* ── Light theme bubbles ──────────────────────────── */
  userBubble: 'rgba(30, 64, 175, 0.88)',
  userBubbleBorder: 'rgba(191, 219, 254, 0.6)',
  assistantBubble: 'rgba(255, 255, 255, 0.72)',
  assistantBubbleBorder: 'rgba(148, 163, 184, 0.22)',

  /* ── Light theme accents ──────────────────────────── */
  primaryTint: 'rgba(30, 64, 175, 0.06)',
  primaryBorderSubtle: 'rgba(30, 64, 175, 0.2)',
  timestamp: 'rgba(100, 116, 139, 0.92)',

  /* ── Overlays ─────────────────────────────────────── */
  modalOverlay: 'rgba(0, 0, 0, 0.4)',
  overlayLight: 'rgba(0, 0, 0, 0.15)',
  overlayMedium: 'rgba(0, 0, 0, 0.6)',
  overlayHeavy: 'rgba(0, 0, 0, 0.95)',

  /* ── Shadows ──────────────────────────────────────── */
  shadowSubtle: 'rgba(0, 0, 0, 0.08)',
  shadowMedium: 'rgba(0, 0, 0, 0.15)',
  primaryGlow: 'rgba(37, 99, 235, 0.08)',
  primaryGlowMedium: 'rgba(37, 99, 235, 0.12)',

  /* ── Dark theme glass ─────────────────────────────── */
  darkGlassBorder: 'rgba(255, 255, 255, 0.12)',
  darkGlassBackground: 'rgba(30, 41, 59, 0.72)',
  darkCardBackground: 'rgba(30, 41, 59, 0.66)',
  darkCardBorder: 'rgba(148, 163, 184, 0.18)',
  darkInputBackground: 'rgba(30, 41, 59, 0.7)',
  darkInputBorder: 'rgba(148, 163, 184, 0.25)',
  darkSurface: 'rgba(30, 41, 59, 0.64)',
  darkOverlay: 'rgba(15, 23, 42, 0.70)',
  darkSeparator: 'rgba(148, 163, 184, 0.25)',

  /* ── Dark theme bubbles ───────────────────────────── */
  darkUserBubble: 'rgba(30, 64, 175, 0.92)',
  darkUserBubbleBorder: 'rgba(96, 165, 250, 0.4)',
  darkAssistantBubble: 'rgba(30, 41, 59, 0.72)',
  darkAssistantBubbleBorder: 'rgba(148, 163, 184, 0.18)',

  /* ── Dark theme accents ───────────────────────────── */
  darkPrimaryTint: 'rgba(96, 165, 250, 0.1)',
  darkPrimaryBorderSubtle: 'rgba(96, 165, 250, 0.2)',
  darkTimestamp: 'rgba(148, 163, 184, 0.72)',
  darkModalOverlay: 'rgba(0, 0, 0, 0.6)',
  darkShadowColor: '#000000',

  /* ── Web glass system ─────────────────────────────── */
  webGlass: 'rgba(255, 255, 255, 0.55)',
  webGlassHeavy: 'rgba(255, 255, 255, 0.72)',
  webGlassCard: 'rgba(255, 255, 255, 0.5)',
  webGlassCardHover: 'rgba(255, 255, 255, 0.65)',
  webLiquidGlass: 'rgba(255, 255, 255, 0.12)',
  webLiquidGlassHeavy: 'rgba(255, 255, 255, 0.18)',
  webLiquidGlassCard: 'rgba(255, 255, 255, 0.45)',
  webLiquidGlassCardHover: 'rgba(255, 255, 255, 0.6)',
  webSpecularHighlight: 'rgba(31, 38, 135, 0.15)',
  webSpecularHeavy: 'rgba(31, 38, 135, 0.18)',
  webGlassBorder: 'rgba(255, 255, 255, 0.35)',
  webGlassInset: 'rgba(255, 255, 255, 0.6)',
} as const;

export type Functional = typeof functional;
```

- [ ] **Step 2: Update tokens/index.ts to export functional**

```ts
export { colors } from './colors';
export type { Colors } from './colors';
export { typography } from './typography';
export type { Typography } from './typography';
export { spacing, radii } from './spacing';
export type { Spacing, Radii } from './spacing';
export { functional, withOpacity } from './functional';
export type { Functional } from './functional';
```

- [ ] **Step 3: Commit**

```bash
git add design-system/tokens/functional.ts design-system/tokens/index.ts
git commit -m "feat(design-system): add functional tokens layer (RGBA + withOpacity utility)"
```

---

## Task 3: Create Semantic Tokens (Layer 3)

**Files:**
- Create: `design-system/tokens/semantic.ts`
- Modify: `design-system/tokens/index.ts`

- [ ] **Step 1: Create semantic.ts with component-level tokens**

```ts
/**
 * Musaium Design System — Semantic Tokens (Layer 3)
 *
 * Component-level tokens referencing primitives.
 * These tokens define the design intent for each component category.
 */
import { spacing, radii } from './spacing';
import { typography } from './typography';

export const semantic = {
  screen: {
    padding: spacing['4'].px,           // 16px
    paddingLarge: spacing['6'].px,      // 24px
    paddingXL: spacing['7'].px,         // 28px
    gap: spacing['4'].px,               // 16px
    gapSmall: spacing['3'].px,          // 12px
  },

  card: {
    padding: spacing['4'].px,           // 16px
    paddingCompact: spacing['3'].px,    // 12px
    paddingLarge: spacing['4.5'].px,    // 18px
    gap: spacing['3'].px,               // 12px
    gapSmall: spacing['2'].px,          // 8px
    radius: radii['3xl'].px,            // 20px
    radiusCompact: radii.lg.px,         // 12px
    titleSize: typography.fontSize.lg.px,   // 18px
    bodySize: typography.fontSize.sm.px,    // 14px
    captionSize: typography.fontSize.xs.px, // 12px
  },

  input: {
    height: spacing['12'].px,           // 48px
    padding: spacing['4'].px,           // 16px
    paddingCompact: spacing['3'].px,    // 12px
    radius: radii.xl.px,                // 14px
    radiusSmall: radii.lg.px,           // 12px
    fontSize: typography.fontSize.base.px,  // 16px
    borderWidth: 1,
  },

  button: {
    height: spacing['12'].px,           // 48px
    heightApple: spacing['12.5'].px,    // 50px
    paddingX: spacing['6'].px,          // 24px
    paddingY: spacing['3'].px,          // 12px
    paddingYCompact: spacing['3.5'].px, // 14px
    radius: radii.xl.px,               // 14px
    radiusSmall: radii.lg.px,           // 12px
    fontSize: typography.fontSize.sm.px,    // 14px
    fontSizeLarge: typography.fontSize.base.px, // 16px (was 15, rounded)
  },

  badge: {
    paddingX: spacing['2'].px,          // 8px
    paddingY: spacing['1'].px,          // 4px
    paddingYTight: 3,                   // 3px — tight pill
    radius: radii.md.px,               // 8px
    radiusFull: radii.full.px,          // 999px
    fontSize: typography.fontSize.xs.px,   // 12px
    fontSizeSmall: 11,                  // 11px — compact badge
  },

  modal: {
    padding: spacing['5'].px,           // 20px
    paddingLarge: spacing['6'].px,      // 24px
    radius: radii['2xl'].px,            // 16px
    maxHeight: '85%' as const,
  },

  nav: {
    height: spacing['14'].px,           // 56px
    paddingX: spacing['4'].px,          // 16px
  },

  chat: {
    bubblePadding: spacing['3'].px,     // 12px
    bubblePaddingX: spacing['3.5'].px,  // 14px
    bubbleRadius: radii['2xl'].px,      // 16px
    gap: spacing['2'].px,               // 8px
    gapSmall: spacing['1.5'].px,        // 6px
    fontSize: typography.fontSize.base.px,  // 16px
    fontSizeSmall: typography.fontSize.sm.px, // 14px (was 15, rounded)
    timestampSize: typography.fontSize.xs.px, // 12px
    thumbnailSize: spacing['12'].px,    // 48px
    iconSize: spacing['5.5'].px,        // 22px
  },

  list: {
    itemPaddingX: spacing['4'].px,      // 16px
    itemPaddingY: spacing['3'].px,      // 12px
    itemPaddingYCompact: spacing['2.5'].px, // 10px
    itemGap: spacing['2'].px,           // 8px
    itemGapSmall: spacing['1.5'].px,    // 6px
    separatorWidth: 1,
  },

  section: {
    titleSizeHero: spacing['7'].px,     // 28px (closest token to heading)
    titleSizeLarge: typography.fontSize['2xl'].px, // 24px
    titleSize: typography.fontSize.xl.px, // 20px
    subtitleSize: typography.fontSize.base.px, // 16px (was 17, rounded)
    bodySize: typography.fontSize.sm.px,   // 14px
    captionSize: typography.fontSize.xs.px, // 12px (was 13, rounded)
    labelSize: 11,                      // 11px — small labels
    gap: spacing['3'].px,               // 12px
    gapSmall: spacing['2'].px,          // 8px
    gapTight: spacing['1.5'].px,        // 6px
    marginBottom: spacing['6'].px,      // 24px
  },

  form: {
    gap: spacing['2.5'].px,             // 10px
    gapLarge: spacing['3.5'].px,        // 14px
    labelSize: 13,                      // 13px — form labels
  },

  /** Startup error screen (custom dark palette) */
  errorScreen: {
    background: '#130f0d',
    cardBackground: '#1b1411',
    cardBorder: '#3b2d25',
    badgeBackground: '#231915',
    badgeBorder: '#70584a',
    textPrimary: '#fff7f1',
    textSecondary: '#e4cfc2',
    textAccent: '#f5d7c2',
    textLabel: '#c7a58e',
    textValue: '#f6ebe4',
  },

  /** Expertise badge level colors */
  expertiseLevels: {
    beginner: { light: '#059669', dark: '#34D399' },
    intermediate: { light: '#D97706', dark: '#FBBF24' },
    expert: { light: '#7C3AED', dark: '#A78BFA' },
  },

  /** Ticket/priority status badge colors */
  statusBadge: {
    textColor: '#FFFFFF',
    open: '#3B82F6',
    inProgress: '#F59E0B',
    resolved: '#22C55E',
    closed: '#6B7280',
    priorityLow: '#6B7280',
    priorityMedium: '#F59E0B',
    priorityHigh: '#EF4444',
  },
} as const;

export type Semantic = typeof semantic;
```

- [ ] **Step 2: Update tokens/index.ts**

Add to existing exports:

```ts
export { semantic } from './semantic';
export type { Semantic } from './semantic';
```

- [ ] **Step 3: Commit**

```bash
git add design-system/tokens/semantic.ts design-system/tokens/index.ts
git commit -m "feat(design-system): add semantic tokens layer (component-level design tokens)"
```

---

## Task 4: Update Build Pipeline

**Files:**
- Modify: `design-system/build.ts`

- [ ] **Step 1: Update build.ts to import new tokens and generate new output files**

Add imports at top:

```ts
import { functional, withOpacity } from './tokens/functional';
import { semantic } from './tokens/semantic';
```

Add two new generator functions before the `// ─── Write outputs` section:

```ts
// ─── React Native: Functional tokens ────────────────────────────────────────

function buildReactNativeFunctional(): string {
  const lines: string[] = [TS_HEADER, ''];

  // withOpacity utility
  lines.push(`/**`);
  lines.push(` * Converts a hex color to rgba with the given alpha.`);
  lines.push(` * Works with 3-char (#fff), 6-char (#ffffff), and 8-char (#ffffffaa) hex.`);
  lines.push(` */`);
  lines.push(`export function withOpacity(hex: string, alpha: number): string {`);
  lines.push(`  const clean = hex.replace('#', '');`);
  lines.push(`  let r: number, g: number, b: number;`);
  lines.push(`  if (clean.length === 3) {`);
  lines.push(`    r = parseInt(clean[0] + clean[0], 16);`);
  lines.push(`    g = parseInt(clean[1] + clean[1], 16);`);
  lines.push(`    b = parseInt(clean[2] + clean[2], 16);`);
  lines.push(`  } else {`);
  lines.push(`    r = parseInt(clean.slice(0, 2), 16);`);
  lines.push(`    g = parseInt(clean.slice(2, 4), 16);`);
  lines.push(`    b = parseInt(clean.slice(4, 6), 16);`);
  lines.push(`  }`);
  lines.push(`  return \`rgba(\${r}, \${g}, \${b}, \${alpha})\`;`);
  lines.push(`}`);
  lines.push('');

  // Functional tokens as flat object
  lines.push(`export const functional = {`);
  for (const [key, val] of Object.entries(functional)) {
    lines.push(`  ${key}: '${val}',`);
  }
  lines.push(`} as const;`);
  lines.push('');

  return lines.join('\n');
}

// ─── React Native: Semantic tokens ──────────────────────────────────────────

function buildReactNativeSemantic(): string {
  const lines: string[] = [TS_HEADER, ''];

  function writeObject(name: string, obj: Record<string, unknown>, depth = 0): void {
    const indent = '  '.repeat(depth);
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        lines.push(`${indent}  ${key}: {`);
        writeObject(name, val as Record<string, unknown>, depth + 1);
        lines.push(`${indent}  },`);
      } else if (typeof val === 'string') {
        lines.push(`${indent}  ${key}: '${val}',`);
      } else {
        lines.push(`${indent}  ${key}: ${String(val)},`);
      }
    }
  }

  lines.push(`export const semantic = {`);
  for (const [category, tokens] of Object.entries(semantic)) {
    lines.push(`  ${category}: {`);
    writeObject(category, tokens as Record<string, unknown>, 1);
    lines.push(`  },`);
  }
  lines.push(`} as const;`);
  lines.push('');

  return lines.join('\n');
}

// ─── Web CSS: Functional tokens ─────────────────────────────────────────────

function buildFunctionalCSS(): string {
  const lines: string[] = [HEADER, '', '@theme {'];

  for (const [key, val] of Object.entries(functional)) {
    // Convert camelCase to kebab-case
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    lines.push(`  --fn-${cssKey}: ${val};`);
  }

  lines.push('}', '');
  return lines.join('\n');
}

// ─── Web CSS: Semantic tokens ───────────────────────────────────────────────

function buildSemanticCSS(): string {
  const lines: string[] = [HEADER, '', '@theme {'];

  for (const [category, tokens] of Object.entries(semantic)) {
    lines.push(`  /* ${category} */`);
    for (const [key, val] of Object.entries(tokens as Record<string, unknown>)) {
      if (typeof val === 'object' && val !== null) {
        // Nested objects (e.g. expertiseLevels.beginner.light)
        for (const [subKey, subVal] of Object.entries(val as Record<string, unknown>)) {
          if (typeof subVal === 'string') {
            const cssKey = `--sem-${category}-${key}-${subKey}`.replace(/([A-Z])/g, '-$1').toLowerCase();
            lines.push(`  ${cssKey}: ${subVal};`);
          }
        }
      } else if (typeof val === 'number') {
        const cssKey = `--sem-${category}-${key}`.replace(/([A-Z])/g, '-$1').toLowerCase();
        const remVal = val === 0 ? '0' : `${val / 16}rem`;
        lines.push(`  ${cssKey}: ${remVal};`);
      } else if (typeof val === 'string') {
        const cssKey = `--sem-${category}-${key}`.replace(/([A-Z])/g, '-$1').toLowerCase();
        lines.push(`  ${cssKey}: ${val};`);
      }
    }
    lines.push('');
  }

  lines.push('}', '');
  return lines.join('\n');
}
```

Update the outputs array to include the 4 new files:

```ts
const outputs = [
  {
    path: resolve(root, 'museum-frontend/shared/ui/tokens.generated.ts'),
    content: buildReactNativeTS(),
    label: 'museum-frontend (primitives)',
  },
  {
    path: resolve(root, 'museum-frontend/shared/ui/tokens.functional.ts'),
    content: buildReactNativeFunctional(),
    label: 'museum-frontend (functional)',
  },
  {
    path: resolve(root, 'museum-frontend/shared/ui/tokens.semantic.ts'),
    content: buildReactNativeSemantic(),
    label: 'museum-frontend (semantic)',
  },
  {
    path: resolve(root, 'museum-web/src/tokens.generated.css'),
    content: buildTailwindCSS(),
    label: 'museum-web (primitives)',
  },
  {
    path: resolve(root, 'museum-web/src/tokens.functional.css'),
    content: buildFunctionalCSS(),
    label: 'museum-web (functional)',
  },
  {
    path: resolve(root, 'museum-web/src/tokens.semantic.css'),
    content: buildSemanticCSS(),
    label: 'museum-web (semantic)',
  },
];
```

- [ ] **Step 2: Run the build**

Run: `cd design-system && pnpm build`
Expected: 6 files generated successfully

- [ ] **Step 3: Import new CSS files in globals.css**

In `museum-web/src/app/globals.css`, add after `@import '../tokens.generated.css';`:

```css
@import '../tokens.functional.css';
@import '../tokens.semantic.css';
```

- [ ] **Step 4: Commit**

```bash
git add design-system/build.ts museum-frontend/shared/ui/tokens.functional.ts museum-frontend/shared/ui/tokens.semantic.ts museum-web/src/tokens.functional.css museum-web/src/tokens.semantic.css museum-web/src/app/globals.css
git commit -m "feat(design-system): update build pipeline for 3-layer token generation"
```

---

## Task 5: Create Design Debt Counting Script

**Files:**
- Create: `scripts/count-design-debt.sh`

- [ ] **Step 1: Write counting script**

```bash
#!/usr/bin/env bash
# Musaium Design System — Hardcoded Design Value Counter
# Counts hex colors, rgba values, and hardcoded numeric design properties
# across museum-frontend and museum-web source files.
#
# Usage: bash scripts/count-design-debt.sh [--detail]

set -euo pipefail

DETAIL="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Directories to scan
DIRS=(
  "$ROOT/museum-frontend/app"
  "$ROOT/museum-frontend/features"
  "$ROOT/museum-frontend/shared/ui"
  "$ROOT/museum-web/src"
)

# Exclude patterns
EXCLUDE="--glob=!*.generated.* --glob=!*.generated --glob=!node_modules --glob=!__tests__ --glob=!*.test.* --glob=!.test-dist --glob=!tokens.functional.* --glob=!tokens.semantic.*"

echo "═══════════════════════════════════════════════════════"
echo "  Musaium Design Debt Counter"
echo "═══════════════════════════════════════════════════════"
echo ""

total=0

# 1. Hex colors (#fff, #ffffff, #ffffffaa)
hex_count=0
for dir in "${DIRS[@]}"; do
  if [ -d "$dir" ]; then
    c=$(rg $EXCLUDE --type ts --type tsx --type css -c "'#[0-9a-fA-F]{3,8}'" "$dir" 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
    hex_count=$((hex_count + c))
  fi
done
echo "  Hex colors (#xxx):        $hex_count"
total=$((total + hex_count))

# 2. RGBA colors
rgba_count=0
for dir in "${DIRS[@]}"; do
  if [ -d "$dir" ]; then
    c=$(rg $EXCLUDE --type ts --type tsx --type css -c "rgba?\(" "$dir" 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
    rgba_count=$((rgba_count + c))
  fi
done
echo "  RGBA colors:              $rgba_count"
total=$((total + rgba_count))

# 3. Hardcoded numeric design props (fontSize, gap, padding*, margin*, borderRadius, width, height)
numeric_count=0
for dir in "${DIRS[@]}"; do
  if [ -d "$dir" ]; then
    c=$(rg $EXCLUDE --type ts --type tsx -c "(fontSize|gap|padding|margin|borderRadius|borderWidth|width|height|lineHeight|top|right|bottom|left):\s*\d" "$dir" 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
    numeric_count=$((numeric_count + c))
  fi
done
echo "  Numeric design values:    $numeric_count"
total=$((total + numeric_count))

echo ""
echo "  ─────────────────────────────────"
echo "  TOTAL HARDCODED VALUES:   $total"
echo "  ─────────────────────────────────"
echo ""

if [ "$DETAIL" = "--detail" ]; then
  echo "Top 20 files by hardcoded value count:"
  echo ""
  for dir in "${DIRS[@]}"; do
    if [ -d "$dir" ]; then
      rg $EXCLUDE --type ts --type tsx --type css -c "(#[0-9a-fA-F]{3,8}|rgba?\(|(fontSize|gap|padding|margin|borderRadius|width|height|lineHeight):\s*\d)" "$dir" 2>/dev/null || true
    fi
  done | sort -t: -k2 -nr | head -20 | while IFS=: read -r file count; do
    echo "  $count  ${file#$ROOT/}"
  done
fi
```

- [ ] **Step 2: Make executable and run baseline**

```bash
chmod +x scripts/count-design-debt.sh
bash scripts/count-design-debt.sh --detail
```

Record the baseline number.

- [ ] **Step 3: Commit**

```bash
git add scripts/count-design-debt.sh
git commit -m "feat(scripts): add design debt counting script for token migration tracking"
```

---

## Task 6: Migrate themes.ts to Functional Tokens

**Files:**
- Modify: `museum-frontend/shared/ui/themes.ts`

- [ ] **Step 1: Update imports in themes.ts**

Replace current imports with:

```ts
import {
  primaryScale,
  textColors,
  darkTextColors,
  darkSurfaceColors,
  statusColors,
  gradientColors,
  surfaceColors,
} from './tokens.generated';
import { functional } from './tokens.functional';
```

- [ ] **Step 2: Replace all hardcoded RGBA values in lightTheme**

Replace the entire `lightTheme` object:

```ts
export const lightTheme: ThemePalette = {
  pageGradient: [primaryScale['50'], primaryScale['100'], gradientColors.lightEnd],
  primary: primaryScale['600'],
  primaryContrast: surfaceColors.default,
  textPrimary: textColors.primary,
  textSecondary: textColors.secondary,
  textTertiary: textColors.tertiary,
  placeholderText: textColors.placeholder,
  glassBorder: functional.glassBorder,
  glassBackground: functional.glassBackground,
  cardBackground: functional.cardBackground,
  cardBorder: functional.cardBorder,
  inputBackground: functional.inputBackground,
  inputBorder: functional.inputBorder,
  userBubble: functional.userBubble,
  userBubbleBorder: functional.userBubbleBorder,
  assistantBubble: functional.assistantBubble,
  assistantBubbleBorder: functional.assistantBubbleBorder,
  error: statusColors.error.light,
  errorBackground: statusColors.errorBg.light,
  success: statusColors.success.light,
  successBackground: statusColors.successBg.light,
  danger: statusColors.danger.light,
  warningText: statusColors.warning.light,
  warningBackground: statusColors.warningBg.light,
  shadowColor: primaryScale['800'],
  primaryTint: functional.primaryTint,
  primaryBorderSubtle: functional.primaryBorderSubtle,
  modalOverlay: functional.modalOverlay,
  separator: functional.separator,
  timestamp: functional.timestamp,
  surface: functional.surface,
  overlay: functional.overlay,
  blurTint: 'light',
};
```

- [ ] **Step 3: Replace all hardcoded RGBA values in darkTheme**

Replace the entire `darkTheme` object:

```ts
export const darkTheme: ThemePalette = {
  pageGradient: [darkSurfaceColors.default, darkSurfaceColors.elevated, darkSurfaceColors.default],
  primary: primaryScale['350'],
  primaryContrast: surfaceColors.default,
  textPrimary: darkTextColors.primary,
  textSecondary: darkTextColors.secondary,
  textTertiary: darkTextColors.tertiary,
  placeholderText: darkTextColors.placeholder,
  glassBorder: functional.darkGlassBorder,
  glassBackground: functional.darkGlassBackground,
  cardBackground: functional.darkCardBackground,
  cardBorder: functional.darkCardBorder,
  inputBackground: functional.darkInputBackground,
  inputBorder: functional.darkInputBorder,
  userBubble: functional.darkUserBubble,
  userBubbleBorder: functional.darkUserBubbleBorder,
  assistantBubble: functional.darkAssistantBubble,
  assistantBubbleBorder: functional.darkAssistantBubbleBorder,
  error: statusColors.error.dark,
  errorBackground: statusColors.errorBg.dark,
  success: statusColors.success.dark,
  successBackground: statusColors.successBg.dark,
  danger: statusColors.danger.dark,
  warningText: statusColors.warning.dark,
  warningBackground: statusColors.warningBg.dark,
  shadowColor: functional.darkShadowColor,
  primaryTint: functional.darkPrimaryTint,
  primaryBorderSubtle: functional.darkPrimaryBorderSubtle,
  modalOverlay: functional.darkModalOverlay,
  separator: functional.darkSeparator,
  timestamp: functional.darkTimestamp,
  surface: functional.darkSurface,
  overlay: functional.darkOverlay,
  blurTint: 'dark',
};
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd museum-frontend && npm run lint`
Expected: PASS (no type errors)

- [ ] **Step 5: Run tests**

Run: `cd museum-frontend && npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add museum-frontend/shared/ui/themes.ts
git commit -m "refactor(themes): migrate all RGBA to functional tokens (34 hardcoded → 0)"
```

---

## Task 7: Migrate shared/ui Components

**Files:**
- Modify: `museum-frontend/shared/ui/StartupConfigurationErrorScreen.tsx`
- Modify: Any other shared/ui files with hardcoded values

- [ ] **Step 1: Migrate StartupConfigurationErrorScreen.tsx**

Replace hex colors with semantic tokens. Update imports:

```ts
import { semantic } from './tokens.semantic';
```

Replace the StyleSheet — the `errorScreen` semantic tokens contain all the custom palette colors. Replace each hardcoded hex/numeric value with the corresponding semantic token:

- `backgroundColor: '#130f0d'` → `backgroundColor: semantic.errorScreen.background`
- `paddingHorizontal: 24` → `paddingHorizontal: semantic.screen.paddingLarge`
- `paddingVertical: 28` → `paddingVertical: semantic.screen.paddingXL`
- `gap: 18` → `gap: semantic.card.paddingLarge`
- `borderRadius: 999` → `borderRadius: semantic.badge.radiusFull`
- `borderColor: '#70584a'` → `borderColor: semantic.errorScreen.badgeBorder`
- `backgroundColor: '#231915'` → `backgroundColor: semantic.errorScreen.badgeBackground`
- `paddingHorizontal: 12` → `paddingHorizontal: semantic.card.paddingCompact`
- `paddingVertical: 6` → `paddingVertical: semantic.list.itemGapSmall`
- `color: '#f5d7c2'` → `color: semantic.errorScreen.textAccent`
- `fontSize: 12` → `fontSize: semantic.card.captionSize`
- `color: '#fff7f1'` → `color: semantic.errorScreen.textPrimary`
- `fontSize: 28` → `fontSize: semantic.section.titleSizeHero`
- `lineHeight: 34` → `lineHeight: 34` (use space['8.5'] from generated)
- `color: '#e4cfc2'` → `color: semantic.errorScreen.textSecondary`
- `fontSize: 16` → `fontSize: semantic.section.subtitleSize`
- `lineHeight: 24` → `lineHeight: semantic.section.titleSizeLarge`
- `borderRadius: 20` → `borderRadius: semantic.card.radius`
- `borderColor: '#3b2d25'` → `borderColor: semantic.errorScreen.cardBorder`
- `backgroundColor: '#1b1411'` → `backgroundColor: semantic.errorScreen.cardBackground`
- `padding: 18` → `padding: semantic.card.paddingLarge`
- `gap: 12` → `gap: semantic.card.gap`
- `color: '#c7a58e'` → `color: semantic.errorScreen.textLabel`
- `fontSize: 15` → `fontSize: semantic.chat.fontSizeSmall`
- `lineHeight: 22` → `lineHeight: 22` (use space['5.5'] from generated)
- `color: '#f6ebe4'` → `color: semantic.errorScreen.textValue`

Remove the `eslint-disable` comment at top since colors now come from tokens.

- [ ] **Step 2: Scan and migrate other shared/ui files**

Check `museum-frontend/shared/ui/` for other files with hardcoded values and migrate them using the same token import pattern.

- [ ] **Step 3: Verify typecheck**

Run: `cd museum-frontend && npm run lint`
Expected: PASS

- [ ] **Step 4: Run tests**

Run: `cd museum-frontend && npm test`
Expected: All tests pass

- [ ] **Step 5: Run count**

Run: `bash scripts/count-design-debt.sh`
Expected: Decrease from baseline

- [ ] **Step 6: Commit**

```bash
git add museum-frontend/shared/ui/
git commit -m "refactor(shared/ui): migrate hardcoded values to semantic tokens"
```

---

## Task 8: Migrate features/auth

**Files:**
- Modify: `museum-frontend/features/auth/ui/authStyles.ts`
- Modify: Other auth UI files with hardcoded values

- [ ] **Step 1: Migrate authStyles.ts**

Add import:

```ts
import { semantic } from '@/shared/ui/tokens.semantic';
```

Replace all hardcoded numeric values with semantic tokens:

- `paddingHorizontal: 16` → `paddingHorizontal: semantic.screen.padding`
- `paddingBottom: 18` → `paddingBottom: semantic.card.paddingLarge`
- `gap: 12` → `gap: semantic.card.gap`
- `marginBottom: 8` → `marginBottom: semantic.card.gapSmall`
- `paddingHorizontal: 18` → `paddingHorizontal: semantic.card.paddingLarge`
- `paddingVertical: 18` → `paddingVertical: semantic.card.paddingLarge`
- `gap: 14` → `gap: semantic.form.gapLarge`
- `gap: 6` → `gap: semantic.list.itemGapSmall`
- `fontSize: 28` → `fontSize: semantic.section.titleSizeHero`
- `fontSize: 14` → `fontSize: semantic.card.bodySize`
- `lineHeight: 21` → `lineHeight: 21` (computed: fontSize.sm × lineHeight.normal = 14 × 1.5 = 21)
- `gap: 10` → `gap: semantic.form.gap`
- `fontSize: 13` → `fontSize: semantic.form.labelSize`
- `marginBottom: 6` → `marginBottom: semantic.list.itemGapSmall`
- `marginTop: 4` → `marginTop: semantic.list.itemGap` (round 4 → 8? keep 4 using space['1'])
- `borderRadius: 14` → `borderRadius: semantic.button.radius`
- `paddingVertical: 14` → `paddingVertical: semantic.button.paddingYCompact`
- `fontSize: 15` → `fontSize: semantic.button.fontSizeLarge`
- `borderRadius: 12` → `borderRadius: semantic.button.radiusSmall`
- `paddingVertical: 12` → `paddingVertical: semantic.button.paddingY`
- `height: 50` → `height: semantic.button.heightApple`
- `width: 22, height: 22` → `width: semantic.chat.iconSize, height: semantic.chat.iconSize`
- `borderRadius: 6` → `borderRadius: semantic.list.itemGapSmall` (use radius.sm = 6)
- `fontSize: 12` → `fontSize: semantic.card.captionSize`
- `lineHeight: 18` → `lineHeight: 18` (computed)
- `fontSize: 11` → `fontSize: semantic.section.labelSize`
- `lineHeight: 16` → `lineHeight: 16` (computed)

- [ ] **Step 2: Migrate other auth UI files**

Scan `museum-frontend/features/auth/ui/` for other files with hardcoded values.

- [ ] **Step 3: Verify typecheck + tests**

Run: `cd museum-frontend && npm run lint && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add museum-frontend/features/auth/
git commit -m "refactor(auth): migrate hardcoded design values to semantic tokens"
```

---

## Task 9: Migrate features/chat

**Files:**
- Modify: `museum-frontend/features/chat/ui/ExpertiseBadge.tsx`
- Modify: `museum-frontend/features/chat/ui/VisitSummaryModal.tsx`
- Modify: Other chat UI files with hardcoded values

- [ ] **Step 1: Migrate ExpertiseBadge.tsx**

Replace hardcoded color maps and styles with semantic tokens:

```ts
import { semantic } from '@/shared/ui/tokens.semantic';

const lightColorByLevel: Record<string, string> = semantic.expertiseLevels.beginner
  ? {
      beginner: semantic.expertiseLevels.beginner.light,
      intermediate: semantic.expertiseLevels.intermediate.light,
      expert: semantic.expertiseLevels.expert.light,
    }
  : {};

const darkColorByLevel: Record<string, string> = {
  beginner: semantic.expertiseLevels.beginner.dark,
  intermediate: semantic.expertiseLevels.intermediate.dark,
  expert: semantic.expertiseLevels.expert.dark,
};

// StyleSheet:
const styles = StyleSheet.create({
  pill: {
    borderRadius: semantic.badge.radius,
    paddingHorizontal: semantic.badge.paddingX,
    paddingVertical: semantic.badge.paddingYTight,
  },
  text: {
    fontSize: semantic.badge.fontSizeSmall,
    fontWeight: '700',
  },
});
```

- [ ] **Step 2: Migrate VisitSummaryModal.tsx and remaining chat UI files**

Apply same pattern: import semantic tokens, replace all hardcoded numeric/color values.

- [ ] **Step 3: Verify typecheck + tests**

Run: `cd museum-frontend && npm run lint && npm test`

- [ ] **Step 4: Commit**

```bash
git add museum-frontend/features/chat/
git commit -m "refactor(chat): migrate hardcoded design values to semantic tokens"
```

---

## Task 10: Migrate features/support + features/review

**Files:**
- Modify: `museum-frontend/features/support/ui/ticketHelpers.ts`
- Modify: Other support and review UI files

- [ ] **Step 1: Migrate ticketHelpers.ts**

Replace hardcoded status colors with semantic tokens:

```ts
import { semantic } from '@/shared/ui/tokens.semantic';

export const BADGE_TEXT_COLOR = semantic.statusBadge.textColor;

export const statusColor = (status: TicketStatus): string => {
  switch (status) {
    case 'open':
      return semantic.statusBadge.open;
    case 'in_progress':
      return semantic.statusBadge.inProgress;
    case 'resolved':
      return semantic.statusBadge.resolved;
    case 'closed':
      return semantic.statusBadge.closed;
  }
};

export const priorityColor = (priority: TicketPriority): string => {
  switch (priority) {
    case 'low':
      return semantic.statusBadge.priorityLow;
    case 'medium':
      return semantic.statusBadge.priorityMedium;
    case 'high':
      return semantic.statusBadge.priorityHigh;
  }
};
```

- [ ] **Step 2: Migrate support + review UI files**

Scan and migrate all files in `features/support/ui/` and `features/review/ui/`.

- [ ] **Step 3: Verify typecheck + tests**

Run: `cd museum-frontend && npm run lint && npm test`

- [ ] **Step 4: Commit**

```bash
git add museum-frontend/features/support/ museum-frontend/features/review/
git commit -m "refactor(support,review): migrate hardcoded design values to semantic tokens"
```

---

## Task 11: Migrate features/daily-art + features/onboarding + features/museum + features/settings

**Files:**
- Modify: `museum-frontend/features/daily-art/ui/DailyArtCard.tsx`
- Modify: `museum-frontend/features/onboarding/ui/OnboardingSlide.tsx`
- Modify: `museum-frontend/features/museum/infrastructure/leafletHtml.ts`
- Modify: Other UI files in these feature directories

- [ ] **Step 1: Migrate DailyArtCard.tsx**

Import semantic tokens, replace all hardcoded fontSize, gap, padding, borderRadius, height values.

- [ ] **Step 2: Migrate OnboardingSlide.tsx**

Same pattern.

- [ ] **Step 3: Migrate leafletHtml.ts**

This file generates HTML for Leaflet maps. Replace hardcoded hex colors with token references. Since this is HTML string generation, inject the token values as template literals:

```ts
import { semantic } from '@/shared/ui/tokens.semantic';
import { primaryScale, textColors } from '@/shared/ui/tokens.generated';
```

- [ ] **Step 4: Migrate remaining features**

Scan `features/museum/`, `features/settings/`, `features/conversation/`, `features/legal/` for hardcoded values.

- [ ] **Step 5: Verify typecheck + tests**

Run: `cd museum-frontend && npm run lint && npm test`

- [ ] **Step 6: Run count**

Run: `bash scripts/count-design-debt.sh`
Expected: Significant decrease

- [ ] **Step 7: Commit**

```bash
git add museum-frontend/features/
git commit -m "refactor(features): migrate remaining feature modules to semantic tokens"
```

---

## Task 12: Migrate app/(stack)/ Screens

**Files:**
- Modify: `museum-frontend/app/(stack)/privacy.tsx` (53 hardcoded)
- Modify: `museum-frontend/app/(stack)/tickets.tsx` (23)
- Modify: `museum-frontend/app/(stack)/settings.tsx` (23)
- Modify: `museum-frontend/app/(stack)/reviews.tsx` (23)
- Modify: `museum-frontend/app/(stack)/museum-detail.tsx` (23)
- Modify: `museum-frontend/app/(stack)/preferences.tsx` (22)
- Modify: `museum-frontend/app/(stack)/ticket-detail.tsx` (21)
- Modify: `museum-frontend/app/(stack)/discover.tsx` (21)
- Modify: `museum-frontend/app/(stack)/terms.tsx` (19)
- Modify: Other stack screens

- [ ] **Step 1: Migrate privacy.tsx**

This is the worst offender with 53 hardcoded values. Add imports:

```ts
import { semantic } from '@/shared/ui/tokens.semantic';
import { fontSize, space, radius } from '@/shared/ui/tokens.generated';
```

Map each hardcoded value to the nearest semantic token. Common patterns in stack screens:
- Section padding → `semantic.screen.padding` / `semantic.screen.paddingLarge`
- Card padding → `semantic.card.padding` / `semantic.card.paddingLarge`
- Gap between items → `semantic.card.gap` / `semantic.list.itemGap`
- Title fontSize → `semantic.section.titleSize` / `semantic.section.titleSizeLarge`
- Body fontSize → `semantic.section.bodySize`
- Caption fontSize → `semantic.section.captionSize`
- Label fontSize → `semantic.section.labelSize`
- Card borderRadius → `semantic.card.radius` / `semantic.card.radiusCompact`
- Badge borderRadius → `semantic.badge.radiusFull`

- [ ] **Step 2: Migrate tickets.tsx, settings.tsx, reviews.tsx**

Apply same semantic token mapping pattern.

- [ ] **Step 3: Migrate museum-detail.tsx, preferences.tsx, ticket-detail.tsx**

Apply same pattern.

- [ ] **Step 4: Migrate discover.tsx, terms.tsx, and remaining stack screens**

- [ ] **Step 5: Migrate app/(tabs)/ if any hardcoded values remain**

- [ ] **Step 6: Verify typecheck + tests**

Run: `cd museum-frontend && npm run lint && npm test`

- [ ] **Step 7: Run count for museum-frontend**

Run: `bash scripts/count-design-debt.sh`
Expected: museum-frontend should be near 0

- [ ] **Step 8: Commit**

```bash
git add museum-frontend/app/
git commit -m "refactor(screens): migrate all stack/tab screens to semantic tokens"
```

---

## Task 13: Migrate museum-web Components

**Files:**
- Modify: `museum-web/src/components/marketing/DemoChat.tsx`
- Modify: `museum-web/src/components/marketing/DemoMap.tsx`
- Modify: `museum-web/src/components/marketing/PhoneMockup.tsx`
- Modify: `museum-web/src/components/marketing/TabletMockup.tsx`
- Modify: `museum-web/src/components/marketing/HeroAnimation.tsx`
- Modify: `museum-web/src/components/marketing/MultiDeviceShowcase.tsx`
- Modify: `museum-web/src/components/marketing/StoreButton.tsx`
- Modify: `museum-web/src/components/shared/Header.tsx`
- Modify: `museum-web/src/app/[locale]/admin/analytics/page.tsx`
- Modify: `museum-web/src/app/globals.css`

- [ ] **Step 1: Migrate DemoChat.tsx (41 hardcoded values)**

Web components use CSS custom properties from tokens.generated.css. Replace inline hex/rgba with `var(--color-...)` or `var(--fn-...)` or `var(--sem-...)` values.

For inline style objects in JSX, use the CSS variable references:

```tsx
// Replace hardcoded hex:
color: '#0F172A' → color: 'var(--color-text-primary)'
color: '#475569' → color: 'var(--color-text-tertiary)'
background: 'rgba(255,255,255,0.72)' → background: 'var(--fn-assistant-bubble)'
background: 'rgba(30,64,175,0.88)' → background: 'var(--fn-user-bubble)'
```

For Tailwind classes, use the token-based class names:
```tsx
text-[#334155] → text-text-secondary
bg-[#f0f4ff] → bg-primary-50
```

- [ ] **Step 2: Migrate DemoMap.tsx, PhoneMockup.tsx, TabletMockup.tsx**

Same pattern — replace inline hex/rgba with CSS custom property references.

- [ ] **Step 3: Migrate HeroAnimation.tsx, MultiDeviceShowcase.tsx, StoreButton.tsx**

Same pattern.

- [ ] **Step 4: Migrate admin analytics page**

Replace hardcoded chart colors with CSS custom property values.

- [ ] **Step 5: Migrate globals.css RGBA values**

Replace hardcoded rgba values in glass classes with CSS custom properties from `tokens.functional.css`:

```css
/* Before */
background: rgba(255, 255, 255, 0.55);
/* After */
background: var(--fn-web-glass);
```

- [ ] **Step 6: Migrate Header.tsx and remaining shared components**

- [ ] **Step 7: Verify build**

Run: `cd museum-web && pnpm build`
Expected: Build succeeds

- [ ] **Step 8: Run tests**

Run: `cd museum-web && pnpm test`
Expected: All tests pass

- [ ] **Step 9: Final count**

Run: `bash scripts/count-design-debt.sh --detail`
Expected: 0 hardcoded values (or very close)

- [ ] **Step 10: Commit**

```bash
git add museum-web/src/
git commit -m "refactor(web): migrate all hardcoded design values to design system tokens"
```

---

## Task 14: Final Verification & Cleanup

- [ ] **Step 1: Full typecheck both projects**

```bash
cd museum-frontend && npm run lint
cd ../museum-web && pnpm lint
```

- [ ] **Step 2: Full test suite both projects**

```bash
cd museum-frontend && npm test
cd ../museum-web && pnpm test
```

- [ ] **Step 3: Final design debt count**

```bash
bash scripts/count-design-debt.sh --detail
```

Target: 0 hardcoded values outside tokens

- [ ] **Step 4: GitNexus detect changes**

Run GitNexus detect_changes to verify scope of all modifications.

- [ ] **Step 5: GitNexus reindex**

```bash
npx gitnexus analyze
```

- [ ] **Step 6: Final commit with summary**

If any cleanup files remain:
```bash
git add -A
git commit -m "chore(design-system): complete token extraction — 0 hardcoded design values"
```
