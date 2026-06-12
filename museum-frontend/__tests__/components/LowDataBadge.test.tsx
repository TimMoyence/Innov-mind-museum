/**
 * LowDataBadge — chat-scoped low-data glass pill.
 * Run `undefined-network-detection-reliability`, cluster D, task D-R2 (TR-07).
 *
 * Covers US-09 / INV-12 / INV-14: compact glass pill replacing the buried
 * full-width yellow bar — visible iff `isLowData && isOnline`, stable testID
 * `low-data-badge` (US-09.5 — the old variant had NONE, invisible to e2e),
 * button role + i18n a11y label (US-09.4), tap → data-mode settings screen
 * (US-09.3), blue-tinted glass tokens on light AND dark themes (INV-14,
 * design memo: tint the glass blue via theme.glassBackground, never whiten),
 * Ionicons-only affordance, gap-based internal spacing (colored-container
 * rule: NEVER a vertical margin on a direct child), ≥44pt touch target.
 *
 * Auth gating is STRUCTURAL (US-09.2): the badge is only mounted by
 * app/(stack)/chat/[sessionId].tsx — asserted by the Maestro flow (D-G3), not
 * here. Cold-start no-flash (US-09.6) is the `normal ⇒ null` case below.
 *
 * GREEN-PHASE PATH CONTRACT: export `LowDataBadge` from
 * `features/chat/ui/LowDataBadge.tsx`; consume `useDataMode()` from
 * '@/features/chat/application/DataModeProvider' and `useConnectivity()` from
 * '@/shared/infrastructure/connectivity/useConnectivity' (the '@/' specifiers
 * mocked below); navigate via expo-router push. If green needs another shape,
 * emit BLOCK-TEST-WRONG — never edit this file (frozen test, UFR-022).
 *
 * RED contract: FAILS today — `features/chat/ui/LowDataBadge.tsx` does not
 * exist (import resolution error).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';

// ── DataModeProvider mock — coherent context value, driven per-test ─────────
let mockIsLowData = false;
jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({
    preference: 'auto',
    resolved: mockIsLowData ? 'low' : 'normal',
    isLowData: mockIsLowData,
    metered: false,
    setPreference: jest.fn(),
  }),
}));

// ── Connectivity mock — tri-state coherent ───────────────────────────────────
let mockIsOnline = true;
jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => ({
    isConnected: mockIsOnline,
    isInternetReachable: mockIsOnline,
    isOnline: mockIsOnline,
  }),
}));

import { LowDataBadge } from '@/features/chat/ui/LowDataBadge';

// test-utils registers the expo-router mock with a module-level `router`
// object only (no useRouter). The badge may call `router.push` directly (repo
// convention — ChatMessageList.tsx:12) or `useRouter().push` (design §2.6
// sketch): both resolve to the same spy here.
const expoRouterMock = jest.requireMock('expo-router');
expoRouterMock.useRouter = () => expoRouterMock.router;

// Shared light theme registered by test-utils. The dark case swaps useTheme
// with the REAL dark token values (tokens.functional.ts:48-49 darkGlass*,
// tokens.generated.ts darkTextColors.primary) to prove the badge is
// theme-driven, never hardcoded to light values.
interface MockThemeBag {
  glassBackground: string;
  glassBorder: string;
  textPrimary: string;
  primary: string;
  [key: string]: unknown;
}
const themeModule = jest.requireMock('@/shared/ui/ThemeContext');
const lightUseTheme = themeModule.useTheme;
const DARK_GLASS_BACKGROUND = 'rgba(30, 41, 59, 0.72)';
const DARK_GLASS_BORDER = 'rgba(255, 255, 255, 0.12)';
const DARK_TEXT_PRIMARY = '#F8FAFC';

interface FlatStyle {
  backgroundColor?: string;
  borderColor?: string;
  color?: string;
  gap?: number;
  minHeight?: number;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginVertical?: number;
}
const flatten = (style: unknown): FlatStyle => (StyleSheet.flatten(style) ?? {}) as FlatStyle;

describe('LowDataBadge — TR-07 (D-R2, US-09/INV-12/INV-14)', () => {
  beforeEach(() => {
    mockIsLowData = false;
    mockIsOnline = true;
    expoRouterMock.router.push.mockClear();
  });

  afterEach(() => {
    themeModule.useTheme = lightUseTheme;
  });

  // INV-12 — never when resolved mode is normal (also US-09.6: no boot flash).
  it('renders null when the resolved data mode is normal', () => {
    const { toJSON } = render(<LowDataBadge />);
    expect(toJSON()).toBeNull();
  });

  // INV-12 / US-06.2 — the red offline banner has exclusive priority.
  it('renders null when offline, even in low-data mode', () => {
    mockIsLowData = true;
    mockIsOnline = false;
    const { toJSON } = render(<LowDataBadge />);
    expect(toJSON()).toBeNull();
  });

  // US-09.5 + US-09.4 — stable testID, interactive role, i18n a11y label.
  it('renders a button-role pill with the stable low-data-badge testID and i18n labels when low-data and online', () => {
    mockIsLowData = true;
    const { getByTestId, getByText } = render(<LowDataBadge />);
    const badge = getByTestId('low-data-badge');
    expect(badge.props.accessibilityRole).toBe('button');
    expect(badge.props.accessibilityLabel).toBe('chat.lowDataBadge.a11yLabel');
    expect(getByText('chat.lowDataBadge.label')).toBeTruthy();
  });

  // US-09.3 — tap navigates to the settings screen carrying DataModeSettingsSection.
  it('navigates to /(stack)/settings on tap', () => {
    mockIsLowData = true;
    const { getByTestId } = render(<LowDataBadge />);
    fireEvent.press(getByTestId('low-data-badge'));
    expect(expoRouterMock.router.push).toHaveBeenCalledWith('/(stack)/settings');
  });

  // INV-14 — blue-tinted glass tokens (light) + Ionicons-only affordance.
  it('uses the blue-tinted glass theme tokens in light mode', () => {
    mockIsLowData = true;
    const { theme } = themeModule.useTheme();
    const { getByTestId, getByText } = render(<LowDataBadge />);
    const style = flatten(getByTestId('low-data-badge').props.style);
    expect(style.backgroundColor).toBe(theme.glassBackground);
    expect(style.borderColor).toBe(theme.glassBorder);
    // Ionicons only, zero unicode emoji: the shared mock renders the icon name.
    const icon = getByText('cellular-outline');
    expect(icon.props.color).toBe(theme.primary);
    const label = getByText('chat.lowDataBadge.label');
    expect(flatten(label.props.style).color).toBe(theme.textPrimary);
  });

  // INV-14 — contrast pair verified on dark too: tokens come from the theme.
  it('follows the dark theme glass tokens (never hardcoded light values)', () => {
    mockIsLowData = true;
    const light = lightUseTheme();
    themeModule.useTheme = () => ({
      ...light,
      isDark: true,
      mode: 'dark',
      theme: {
        ...light.theme,
        glassBackground: DARK_GLASS_BACKGROUND,
        glassBorder: DARK_GLASS_BORDER,
        textPrimary: DARK_TEXT_PRIMARY,
      },
    });
    const { getByTestId, getByText } = render(<LowDataBadge />);
    const style = flatten(getByTestId('low-data-badge').props.style);
    expect(style.backgroundColor).toBe(DARK_GLASS_BACKGROUND);
    expect(style.borderColor).toBe(DARK_GLASS_BORDER);
    expect(flatten(getByText('chat.lowDataBadge.label').props.style).color).toBe(DARK_TEXT_PRIMARY);
  });

  // US-09.4 / INV-14 — touch target ≥ 44pt.
  it('keeps a touch target of at least 44pt', () => {
    mockIsLowData = true;
    const { getByTestId } = render(<LowDataBadge />);
    const style = flatten(getByTestId('low-data-badge').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

  // INV-14 + colored-container rule (CLAUDE.md gotcha): internal spacing via
  // gap/padding — NEVER a vertical margin on a direct child of a colored
  // container; RTL discipline: physical left/right margins forbidden.
  it('spaces its children with gap — no vertical margins on direct children, no physical horizontal margins', () => {
    mockIsLowData = true;
    const { getByTestId } = render(<LowDataBadge />);
    const badge = getByTestId('low-data-badge');
    const style = flatten(badge.props.style);
    expect(typeof style.gap).toBe('number');
    expect(style.gap).toBeGreaterThan(0);
    expect(style.marginLeft).toBeUndefined();
    expect(style.marginRight).toBeUndefined();
    for (const child of badge.children) {
      if (typeof child === 'string') continue;
      const childStyle = flatten(child.props.style);
      expect(childStyle.marginTop).toBeUndefined();
      expect(childStyle.marginBottom).toBeUndefined();
      expect(childStyle.marginVertical).toBeUndefined();
    }
  });
});
