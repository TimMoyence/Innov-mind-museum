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
    gapTiny: spacing['1'].px,           // 4px
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
    fontSizeLarge: typography.fontSize.base.px, // 16px
  },

  badge: {
    paddingX: spacing['2'].px,          // 8px
    paddingXCompact: spacing['1.5'].px, // 6px
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
    fontSizeSmall: typography.fontSize.sm.px, // 14px
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
    titleSizeHero: 28,                  // 28px — hero headings
    titleSizeLarge: typography.fontSize['2xl'].px, // 24px
    titleSize: typography.fontSize.xl.px, // 20px
    subtitleSize: typography.fontSize.base.px, // 16px
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
