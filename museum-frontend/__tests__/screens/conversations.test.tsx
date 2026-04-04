import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockUseConversationsData = jest.fn();
jest.mock('@/features/conversation/application/useConversationsData', () => ({
  useConversationsData: () => mockUseConversationsData(),
}));

jest.mock('@/features/conversation/application/useConversationsActions', () => ({
  useConversationsActions: () => ({
    isSavedOnly: false,
    menuStatus: null,
    isDeleting: false,
    sortMode: 'recent' as const,
    savedSessionIds: [],
    toggleSortMode: jest.fn(),
    toggleSavedFilter: jest.fn(),
    shareDashboard: jest.fn(),
    toggleSavedSession: jest.fn(),
    confirmDeleteSingle: jest.fn(),
    confirmDeleteSelected: jest.fn(),
  }),
}));

jest.mock('@/features/conversation/application/useConversationsBulkMode', () => ({
  useConversationsBulkMode: () => ({
    editMode: false,
    selectedIds: new Set<string>(),
    toggleEditMode: jest.fn(),
    toggleSelection: jest.fn(),
    selectAll: jest.fn(),
    resetSelection: jest.fn(),
  }),
}));

jest.mock('@/features/conversation/infrastructure/conversationsStore', () => ({
  useConversationsStore: (selector: (state: any) => any) =>
    selector({ items: [], savedSessionIds: [], sortMode: 'recent' }),
}));

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { createSession: jest.fn() },
}));

jest.mock('@/features/settings/runtimeSettings', () => ({
  loadRuntimeSettings: jest.fn().mockResolvedValue({
    defaultLocale: 'en-US',
    defaultMuseumMode: false,
  }),
}));

jest.mock('@/features/conversation/ui/ConversationsHeader', () => {
  const { View } = require('react-native');
  return {
    ConversationsHeader: (props: any) => <View testID="conversations-header" />,
  };
});

jest.mock('@/features/conversation/ui/ConversationsBulkBar', () => {
  const { View } = require('react-native');
  return {
    ConversationsBulkBar: (props: any) => <View testID="conversations-bulk-bar" />,
  };
});

jest.mock('@/features/conversation/ui/ConversationSearchBar', () => {
  const { View } = require('react-native');
  return {
    ConversationSearchBar: (props: any) => <View testID="conversation-search-bar" />,
  };
});

jest.mock('@/features/conversation/ui/SwipeableConversationCard', () => {
  const { View } = require('react-native');
  return {
    SwipeableConversationCard: ({ children }: any) => (
      <View testID="swipeable-card">{children}</View>
    ),
  };
});

jest.mock('@/features/chat/domain/dashboard-session', () => ({}));

import ConversationsScreen from '@/app/(tabs)/conversations';

const defaultDataHook = () => ({
  isLoading: false,
  isRefreshing: false,
  isLoadingMore: false,
  error: null,
  setError: jest.fn(),
  loadDashboard: jest.fn(),
  loadMore: jest.fn(),
});

describe('ConversationsScreen', () => {
  beforeEach(() => {
    mockUseConversationsData.mockReturnValue(defaultDataHook());
  });

  it('renders loading state with skeleton cards', () => {
    mockUseConversationsData.mockReturnValue({
      ...defaultDataHook(),
      isLoading: true,
    });
    render(<ConversationsScreen />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  it('renders header', () => {
    render(<ConversationsScreen />);
    expect(screen.getByTestId('conversations-header')).toBeTruthy();
  });

  it('renders search bar', () => {
    render(<ConversationsScreen />);
    expect(screen.getByTestId('conversation-search-bar')).toBeTruthy();
  });

  it('renders start new conversation button', () => {
    render(<ConversationsScreen />);
    expect(screen.getAllByLabelText('a11y.conversations.start_new').length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('renders empty state when no conversations', () => {
    render(<ConversationsScreen />);
    expect(screen.getByText('conversations.empty_title')).toBeTruthy();
    expect(screen.getByText('conversations.empty_body')).toBeTruthy();
  });

  it('renders empty state start button', () => {
    render(<ConversationsScreen />);
    expect(screen.getByTestId('empty-state-start-button')).toBeTruthy();
  });
});
