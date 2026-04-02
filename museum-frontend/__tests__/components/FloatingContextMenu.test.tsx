/**
 * Tests for the `active` prop on FloatingContextMenu action items.
 *
 * We do NOT import the shared test-utils because it stubs FloatingContextMenu
 * itself. Instead we set up only the mocks this component needs.
 */

// ── Mocks (hoisted by Jest) ─────────────────────────────────────────────────

jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      primary: '#1D4ED8',
      textPrimary: '#0F172A',
      glassBorder: 'rgba(255,255,255,0.58)',
      glassBackground: 'rgba(255,255,255,0.44)',
      cardBorder: 'rgba(148,163,184,0.42)',
      surface: 'rgba(255,255,255,0.64)',
      blurTint: 'light' as const,
    },
  }),
}));

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return {
    BlurView: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <View {...props}>{children}</View>
    ),
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }: { name: string; [key: string]: unknown }) => (
      <Text {...props}>{name}</Text>
    ),
  };
});

// ── Imports ─────────────────────────────────────────────────────────────────

import type React from 'react';
import { render, screen } from '@testing-library/react-native';

import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import type { ContextMenuAction } from '@/shared/ui/FloatingContextMenu';

// Theme values matching the mock above
const THEME_PRIMARY = '#1D4ED8';
const THEME_TEXT_PRIMARY = '#0F172A';
const THEME_CARD_BORDER = 'rgba(148,163,184,0.42)';

// ── Helpers ─────────────────────────────────────────────────────────────────

const makeAction = (overrides: Partial<ContextMenuAction> = {}): ContextMenuAction => ({
  id: 'test-action',
  icon: 'camera-outline',
  label: 'Test Action',
  onPress: jest.fn(),
  ...overrides,
});

/** Flatten a style prop (array or object) into a single record. */
const flatStyle = (element: { props: { style?: unknown } }): Record<string, unknown> => {
  const raw = element.props.style;
  if (Array.isArray(raw)) {
    return Object.assign({}, ...raw) as Record<string, unknown>;
  }
  return (raw ?? {}) as Record<string, unknown>;
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('FloatingContextMenu — active prop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses theme.primary color on icon and label when active is true', () => {
    const actions = [makeAction({ id: 'a1', label: 'Active Item', icon: 'star', active: true })];
    render(<FloatingContextMenu actions={actions} />);

    // Ionicons mock renders icon name as <Text color={...}>{name}</Text>
    const icon = screen.getByText('star');
    expect(icon.props.color).toBe(THEME_PRIMARY);

    const label = screen.getByText('Active Item');
    const labelStyle = flatStyle(label);
    expect(labelStyle.color).toBe(THEME_PRIMARY);
  });

  it('uses theme.textPrimary color on icon and label when active is false', () => {
    const actions = [
      makeAction({ id: 'a2', label: 'Inactive Item', icon: 'heart', active: false }),
    ];
    render(<FloatingContextMenu actions={actions} />);

    const icon = screen.getByText('heart');
    expect(icon.props.color).toBe(THEME_TEXT_PRIMARY);

    const label = screen.getByText('Inactive Item');
    const labelStyle = flatStyle(label);
    expect(labelStyle.color).toBe(THEME_TEXT_PRIMARY);
  });

  it('uses theme.textPrimary color on icon and label when active is omitted', () => {
    const { active: _, ...actionWithoutActive } = makeAction({
      id: 'a3',
      label: 'Default Item',
      icon: 'map',
    });
    const actions = [actionWithoutActive as ContextMenuAction];
    render(<FloatingContextMenu actions={actions} />);

    const icon = screen.getByText('map');
    expect(icon.props.color).toBe(THEME_TEXT_PRIMARY);

    const label = screen.getByText('Default Item');
    const labelStyle = flatStyle(label);
    expect(labelStyle.color).toBe(THEME_TEXT_PRIMARY);
  });

  it('uses theme.primary border on the button when active is true', () => {
    const actions = [
      makeAction({ id: 'b1', label: 'Bordered Active', icon: 'flame', active: true }),
    ];
    render(<FloatingContextMenu actions={actions} />);

    const button = screen.getByLabelText('Bordered Active');
    const style = flatStyle(button);
    expect(style.borderColor).toBe(THEME_PRIMARY);
  });

  it('uses theme.cardBorder on the button when active is false', () => {
    const actions = [
      makeAction({ id: 'b2', label: 'Bordered Inactive', icon: 'globe', active: false }),
    ];
    render(<FloatingContextMenu actions={actions} />);

    const button = screen.getByLabelText('Bordered Inactive');
    const style = flatStyle(button);
    expect(style.borderColor).toBe(THEME_CARD_BORDER);
  });

  it('renders mixed active and inactive actions with correct colors', () => {
    const actions = [
      makeAction({ id: 'mix-active', label: 'Active', icon: 'star', active: true }),
      makeAction({ id: 'mix-inactive', label: 'Inactive', icon: 'moon', active: false }),
    ];
    render(<FloatingContextMenu actions={actions} />);

    // Active button
    const activeButton = screen.getByLabelText('Active');
    expect(flatStyle(activeButton).borderColor).toBe(THEME_PRIMARY);
    expect(screen.getByText('star').props.color).toBe(THEME_PRIMARY);

    // Inactive button
    const inactiveButton = screen.getByLabelText('Inactive');
    expect(flatStyle(inactiveButton).borderColor).toBe(THEME_CARD_BORDER);
    expect(screen.getByText('moon').props.color).toBe(THEME_TEXT_PRIMARY);
  });
});
