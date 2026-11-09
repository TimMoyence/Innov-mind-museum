import { spacing, radii } from './spacing';
import { typography } from './typography';

export const semantic = {
  screen: {
    padding: spacing['4'].px,
    paddingLarge: spacing['6'].px,
    paddingXL: spacing['7'].px,
    gap: spacing['4'].px,
    gapSmall: spacing['3'].px,
  },

  card: {
    padding: spacing['4'].px,
    paddingCompact: spacing['3'].px,
    paddingLarge: spacing['4.5'].px,
    gap: spacing['3'].px,
    gapSmall: spacing['2'].px,
    gapTiny: spacing['1'].px,
    radius: radii['3xl'].px,
    radiusCompact: radii.lg.px,
    titleSize: typography.fontSize.lg.px,
    bodySize: typography.fontSize.sm.px,
    captionSize: typography.fontSize.xs.px,
  },

  input: {
    height: spacing['12'].px,
    padding: spacing['4'].px,
    paddingCompact: spacing['3'].px,
    radius: radii.xl.px,
    radiusSmall: radii.lg.px,
    fontSize: typography.fontSize.base.px,
    borderWidth: 1,
  },

  button: {
    height: spacing['12'].px,
    heightApple: spacing['12.5'].px,
    paddingX: spacing['6'].px,
    paddingY: spacing['3'].px,
    paddingYCompact: spacing['3.5'].px,
    radius: radii.xl.px,
    radiusSmall: radii.lg.px,
    fontSize: typography.fontSize.sm.px,
    fontSizeLarge: typography.fontSize.base.px,
  },

  badge: {
    paddingX: spacing['2'].px,
    paddingXCompact: spacing['1.5'].px,
    paddingY: spacing['1'].px,
    paddingYTight: 3,
    radius: radii.md.px,
    radiusFull: radii.full.px,
    fontSize: typography.fontSize.xs.px,
    fontSizeSmall: 11,
  },

  modal: {
    padding: spacing['5'].px,
    paddingLarge: spacing['6'].px,
    radius: radii['2xl'].px,
    maxHeight: '85%' as const,
  },

  nav: {
    height: spacing['14'].px,
    paddingX: spacing['4'].px,
  },

  chat: {
    bubblePadding: spacing['3'].px,
    bubblePaddingX: spacing['3.5'].px,
    bubbleRadius: radii['2xl'].px,
    gap: spacing['2'].px,
    gapSmall: spacing['1.5'].px,
    fontSize: typography.fontSize.base.px,
    fontSizeSmall: typography.fontSize.sm.px,
    timestampSize: typography.fontSize.xs.px,
    thumbnailSize: spacing['12'].px,
    iconSize: spacing['5.5'].px,
  },

  list: {
    itemPaddingX: spacing['4'].px,
    itemPaddingY: spacing['3'].px,
    itemPaddingYCompact: spacing['2.5'].px,
    itemGap: spacing['2'].px,
    itemGapSmall: spacing['1.5'].px,
    separatorWidth: 1,
  },

  section: {
    titleSizeHero: 28,
    titleSizeLarge: typography.fontSize['2xl'].px,
    titleSize: typography.fontSize.xl.px,
    subtitleSize: typography.fontSize.base.px,
    bodySize: typography.fontSize.sm.px,
    captionSize: typography.fontSize.xs.px,
    labelSize: 11,
    gap: spacing['3'].px,
    gapSmall: spacing['2'].px,
    gapTight: spacing['1.5'].px,
    marginBottom: spacing['6'].px,
  },

  form: {
    gap: spacing['2.5'].px,
    gapLarge: spacing['3.5'].px,
    labelSize: 13,
  },

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

  statusBadge: {
    textColor: '#FFFFFF',
    open: '#1D4ED8',
    inProgress: '#B45309',
    resolved: '#15803D',
    closed: '#6B7280',
    priorityLow: '#6B7280',
    priorityMedium: '#B45309',
    priorityHigh: '#B91C1C',
  },

  deviceChrome: {
    bezel: '#000000',
    bezelAlt: '#0a0a0a',
    frame: '#111111',
    frameDark: '#1a1a1a',
    frameAccent: '#2a2a2a',
    notch: '#000000',
    speaker: '#000000',
  },

  sectionDark: {
    background: '#0a0a1a',
    backgroundAlt: '#080820',
    backgroundDeep: '#0a0a0b',
    backgroundMid: '#0d0d12',
    backgroundAccent: '#111118',
  },

  mapMarker: {
    museum: '#7C3AED',
    restaurant: '#DC2626',
    cafe: '#0891B2',
    shop: '#EA580C',
    default: '#2563EB',
    user: '#16A34A',
    userBorder: '#FFFFFF',
    markerBorder: '#FFFFFF',
    success: '#34C759',
    error: '#FF3B30',
  },

  chart: {
    primary: '#2563eb',
    secondary: '#16a34a',
    tertiary: '#d97706',
    quaternary: '#6366f1',
  },

  media: {
    imagePreview: 220,
    artworkHeight: 180,
    sendButtonSize: 44,
    avatarSmall: 28,
    avatarMedium: 34,
    tabBarHeight: 84,
    safeAreaTop: 60,
    homeBottomPad: 110,
  },

  fullscreenModal: {
    background: '#FFFFFF',
    captionColor: '#AAAAAA',
    counterColor: '#FFFFFF',
  },

  webAuthGradient: '#D5F0FF',
} as const;

export type Semantic = typeof semantic;
