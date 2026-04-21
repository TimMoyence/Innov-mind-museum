/**
 * Screen-specific mocks for ConversationsScreen.
 * Import AFTER test-utils (which provides global mocks for theme, router, etc.).
 */

export const mockUseConversationsData = jest.fn();
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
  useConversationsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ items: [], savedSessionIds: [], sortMode: 'recent' }),
}));

jest.mock('@/features/settings/runtimeSettings', () => ({
  loadRuntimeSettings: jest.fn().mockResolvedValue({
    defaultLocale: 'en-US',
    defaultMuseumMode: false,
  }),
}));

jest.mock('@/features/conversation/ui/ConversationsHeader', () => {
  const { View } = require('react-native');
  return { ConversationsHeader: () => <View testID="conversations-header" /> };
});

jest.mock('@/features/conversation/ui/ConversationsBulkBar', () => {
  const { View } = require('react-native');
  return { ConversationsBulkBar: () => <View testID="conversations-bulk-bar" /> };
});

jest.mock('@/features/conversation/ui/ConversationSearchBar', () => {
  const { View } = require('react-native');
  return { ConversationSearchBar: () => <View testID="conversation-search-bar" /> };
});

jest.mock('@/features/conversation/ui/SwipeableConversationCard', () => {
  const { View } = require('react-native');
  return {
    SwipeableConversationCard: ({ children }: { children: React.ReactNode }) => (
      <View testID="swipeable-card">{children}</View>
    ),
  };
});

jest.mock('@/features/chat/domain/dashboard-session', () => ({}));

export function defaultDataHook() {
  return {
    isLoading: false,
    isRefreshing: false,
    isLoadingMore: false,
    error: null,
    setError: jest.fn(),
    loadDashboard: jest.fn(),
    loadMore: jest.fn(),
  };
}
