import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';

let mockIsLowData = false;
jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({
    preference: 'auto',
    resolved: mockIsLowData ? 'low' : 'normal',
    isLowData: mockIsLowData,
    metered: false,
  }),
}));

let mockIsOnline = true;
jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => ({
    isConnected: mockIsOnline,
    isInternetReachable: mockIsOnline,
    isOnline: mockIsOnline,
  }),
}));

import { LowDataBadge } from '@/features/chat/ui/LowDataBadge';

const expoRouterMock = jest.requireMock('expo-router');
expoRouterMock.useRouter = () => expoRouterMock.router;

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

  it('renders null when the resolved data mode is normal', () => {
    const { toJSON } = render(<LowDataBadge />);
    expect(toJSON()).toBeNull();
  });

  it('renders null when offline, even in low-data mode', () => {
    mockIsLowData = true;
    mockIsOnline = false;
    const { toJSON } = render(<LowDataBadge />);
    expect(toJSON()).toBeNull();
  });

  it('renders a button-role pill with the stable low-data-badge testID and i18n labels when low-data and online', () => {
    mockIsLowData = true;
    const { getByTestId, getByText } = render(<LowDataBadge />);
    const badge = getByTestId('low-data-badge');
    expect(badge.props.accessibilityRole).toBe('button');
    expect(badge.props.accessibilityLabel).toBe('chat.lowDataBadge.a11yLabel');
    expect(getByText('chat.lowDataBadge.label')).toBeTruthy();
  });

  it('navigates to /(stack)/settings on tap', () => {
    mockIsLowData = true;
    const { getByTestId } = render(<LowDataBadge />);
    fireEvent.press(getByTestId('low-data-badge'));
    expect(expoRouterMock.router.push).toHaveBeenCalledWith('/(stack)/settings');
  });

  it('uses the blue-tinted glass theme tokens in light mode', () => {
    mockIsLowData = true;
    const { theme } = themeModule.useTheme();
    const { getByTestId, getByText } = render(<LowDataBadge />);
    const style = flatten(getByTestId('low-data-badge').props.style);
    expect(style.backgroundColor).toBe(theme.glassBackground);
    expect(style.borderColor).toBe(theme.glassBorder);
    const icon = getByText('cellular-outline');
    expect(icon.props.color).toBe(theme.primary);
    const label = getByText('chat.lowDataBadge.label');
    expect(flatten(label.props.style).color).toBe(theme.textPrimary);
  });

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

  it('keeps a touch target of at least 44pt', () => {
    mockIsLowData = true;
    const { getByTestId } = render(<LowDataBadge />);
    const style = flatten(getByTestId('low-data-badge').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

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
