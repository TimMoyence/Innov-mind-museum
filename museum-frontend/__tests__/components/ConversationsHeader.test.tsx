/**
 * Tests for ConversationsHeader — the thin wrapper that renders the four
 * action buttons (filter / saved / share / edit) via FloatingContextMenu.
 *
 * We do NOT import the shared test-utils because it stubs FloatingContextMenu.
 * This wrapper's only meaningful behavior is the actions array it forwards,
 * so we render the real FloatingContextMenu and assert on its labels.
 */

// ── Mocks (hoisted by Jest) ─────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
import { render } from '@testing-library/react-native';

import { ConversationsHeader } from '@/features/conversation/ui/ConversationsHeader';

describe('ConversationsHeader', () => {
  const defaultProps = {
    editMode: false,
    isSavedOnly: false,
    sortMode: 'recent',
    onToggleEdit: jest.fn(),
    onToggleSortMode: jest.fn(),
    onToggleSavedFilter: jest.fn(),
    onShareDashboard: jest.fn().mockResolvedValue(undefined),
  };

  it('renders the filter action label', () => {
    const { getByText } = render(<ConversationsHeader {...defaultProps} />);
    expect(getByText('conversations.filter')).toBeTruthy();
  });

  it('renders the saved action label', () => {
    const { getByText } = render(<ConversationsHeader {...defaultProps} />);
    expect(getByText('conversations.saved')).toBeTruthy();
  });

  it('renders the share action label', () => {
    const { getByText } = render(<ConversationsHeader {...defaultProps} />);
    expect(getByText('conversations.share')).toBeTruthy();
  });

  it('renders the edit action label by default', () => {
    const { getByText } = render(<ConversationsHeader {...defaultProps} />);
    expect(getByText('conversations.edit')).toBeTruthy();
  });

  it('renders the cancel label when in edit mode', () => {
    const { getByText } = render(<ConversationsHeader {...defaultProps} editMode />);
    expect(getByText('common.cancel')).toBeTruthy();
  });
});
