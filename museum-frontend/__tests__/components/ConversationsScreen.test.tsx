import '../helpers/test-utils';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import type { DashboardSessionCard } from '@/features/chat/domain/dashboard-session';

// ── Zustand store mock ───────────────────────────────────────────────────────

let mockItems: DashboardSessionCard[] = [];
let mockIsLoadingResponse = true;

const mockStore = {
  get items() {
    return mockItems;
  },
  setItems: jest.fn((newItems: DashboardSessionCard[]) => {
    mockItems = newItems;
  }),
  appendItems: jest.fn(),
  clearItems: jest.fn(),
  savedSessionIds: [] as string[],
  toggleSaved: jest.fn(() => true),
  sortMode: 'recent' as const,
  setSortMode: jest.fn(),
  migrateLegacySavedSessions: jest.fn(async () => {}),
};

jest.mock('@/features/conversation/infrastructure/conversationsStore', () => ({
  useConversationsStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));

// ── API + domain mocks ──────────────────────────────────────────────────────

const mockListSessions = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    get listSessions() {
      return mockListSessions;
    },
  },
}));

jest.mock('@/features/settings/runtimeSettings', () => ({
  loadRuntimeSettings: jest.fn(() => ({ defaultLocale: 'en' })),
}));

jest.mock('@/features/chat/domain/dashboard-session', () => ({
  mapSessionsToDashboardCards: jest.fn((sessions: { id: string }[]) =>
    sessions.map((s) => ({
      id: s.id,
      title: `Session ${s.id}`,
      subtitle: 'Test subtitle',
      timeLabel: 'Just now',
      messageCount: 3,
    })),
  ),
}));

jest.mock('@/features/conversation/ui/ConversationSearchBar', () => {
  const { View } = require('react-native');
  return {
    ConversationSearchBar: (props: { value: string; onChangeText: (t: string) => void }) => (
      <View testID="search-bar" />
    ),
  };
});

import ConversationsScreen from '@/app/(tabs)/conversations';

describe('ConversationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockItems = [];
    mockIsLoadingResponse = true;

    // Default: API returns empty list
    mockListSessions.mockResolvedValue({
      sessions: [],
      page: { nextCursor: null, hasMore: false },
    });
  });

  it('shows loading skeletons initially', () => {
    // Make the API hang so loading state persists
    mockListSessions.mockReturnValue(new Promise(() => {}));

    render(<ConversationsScreen />);

    const skeletons = screen.getAllByTestId('skeleton-card');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders conversation cards after loading', async () => {
    const sessions = [
      {
        id: 'sess-1',
        messages: [],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'sess-2',
        messages: [],
        createdAt: '2025-01-02T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
      },
    ];

    mockListSessions.mockResolvedValue({
      sessions,
      page: { nextCursor: null, hasMore: false },
    });

    // Pre-populate the store with mapped items (simulating what loadDashboard does)
    mockItems = [
      {
        id: 'sess-1',
        title: 'Session sess-1',
        subtitle: 'Test subtitle',
        timeLabel: 'Just now',
        messageCount: 3,
      },
      {
        id: 'sess-2',
        title: 'Session sess-2',
        subtitle: 'Test subtitle',
        timeLabel: 'Just now',
        messageCount: 3,
      },
    ];

    render(<ConversationsScreen />);

    await waitFor(() => {
      expect(screen.queryByTestId('skeleton-card')).toBeNull();
    });

    // Cards are rendered with their titles as accessibilityLabels
    expect(screen.getByText('Session sess-1')).toBeTruthy();
    expect(screen.getByText('Session sess-2')).toBeTruthy();
  });

  it('shows empty state when no conversations exist', async () => {
    mockListSessions.mockResolvedValue({
      sessions: [],
      page: { nextCursor: null, hasMore: false },
    });

    render(<ConversationsScreen />);

    await waitFor(() => {
      expect(screen.queryByTestId('skeleton-card')).toBeNull();
    });

    expect(screen.getByText('empty.conversations.title')).toBeTruthy();
    expect(screen.getByTestId('empty-state-start-button')).toBeTruthy();
  });
});
