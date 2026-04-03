import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useConversationsData } from '@/features/conversation/application/useConversationsData';
import { makeListSessionsResponse } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockListSessions = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    listSessions: (...args: unknown[]) => mockListSessions(args[0]),
  },
}));

jest.mock('@/features/settings/runtimeSettings', () => ({
  loadRuntimeSettings: jest.fn().mockResolvedValue({ defaultLocale: 'en-US' }),
}));

jest.mock('@/shared/lib/errors', () => ({
  getErrorMessage: (err: unknown) => {
    if (err instanceof Error) return err.message;
    return String(err);
  },
}));

const mockSetItems = jest.fn();
const mockAppendItems = jest.fn();
const mockClearItems = jest.fn();
const mockMigrateLegacy = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

jest.mock('@/features/conversation/infrastructure/conversationsStore', () => ({
  useConversationsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setItems: mockSetItems,
      appendItems: mockAppendItems,
      clearItems: mockClearItems,
      migrateLegacySavedSessions: mockMigrateLegacy,
    }),
}));

jest.mock('@/features/chat/domain/dashboard-session', () => ({
  mapSessionsToDashboardCards: jest.fn((sessions: { id: string }[], _locale: string) =>
    sessions.map((s) => ({
      id: s.id,
      title: 'mapped',
      subtitle: '',
      timeLabel: '',
      messageCount: 0,
    })),
  ),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useConversationsData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initial load fetches sessions and sets items', async () => {
    const response = makeListSessionsResponse();
    mockListSessions.mockResolvedValue(response);

    const { result } = renderHook(() => useConversationsData());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockListSessions).toHaveBeenCalledWith({ limit: 20 });
    expect(mockSetItems).toHaveBeenCalled();
  });

  it('runs legacy migration on mount', async () => {
    mockListSessions.mockResolvedValue(makeListSessionsResponse());

    renderHook(() => useConversationsData());

    await waitFor(() => {
      expect(mockMigrateLegacy).toHaveBeenCalledTimes(1);
    });
  });

  it('loadDashboard with manual refresh sets isRefreshing', async () => {
    mockListSessions.mockResolvedValue(makeListSessionsResponse());

    const { result } = renderHook(() => useConversationsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockListSessions.mockResolvedValue(makeListSessionsResponse());

    await act(async () => {
      await result.current.loadDashboard(true);
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(mockListSessions).toHaveBeenCalledTimes(2);
  });

  it('sets error and clears items on API failure', async () => {
    mockListSessions.mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useConversationsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network failure');
    expect(mockClearItems).toHaveBeenCalled();
  });

  it('loadMore appends items when hasMore is true', async () => {
    const firstResponse = makeListSessionsResponse({
      page: { nextCursor: 'cursor-1', hasMore: true, limit: 20 },
    });
    mockListSessions.mockResolvedValue(firstResponse);

    const { result } = renderHook(() => useConversationsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Setup next page
    const secondResponse = makeListSessionsResponse({
      page: { nextCursor: null, hasMore: false, limit: 20 },
    });
    mockListSessions.mockResolvedValue(secondResponse);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockListSessions).toHaveBeenCalledWith({ limit: 20, cursor: 'cursor-1' });
    expect(mockAppendItems).toHaveBeenCalled();
  });

  it('loadMore does nothing when hasMore is false', async () => {
    const response = makeListSessionsResponse({
      page: { nextCursor: null, hasMore: false, limit: 20 },
    });
    mockListSessions.mockResolvedValue(response);

    const { result } = renderHook(() => useConversationsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockListSessions.mockClear();

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockListSessions).not.toHaveBeenCalled();
    expect(mockAppendItems).not.toHaveBeenCalled();
  });

  it('loadMore silently handles errors', async () => {
    const firstResponse = makeListSessionsResponse({
      page: { nextCursor: 'cursor-1', hasMore: true, limit: 20 },
    });
    mockListSessions.mockResolvedValue(firstResponse);

    const { result } = renderHook(() => useConversationsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockListSessions.mockRejectedValue(new Error('Page load fail'));

    await act(async () => {
      await result.current.loadMore();
    });

    // Should not set error (loadMore fails silently)
    expect(result.current.error).toBeNull();
    expect(result.current.isLoadingMore).toBe(false);
  });

  it('setError allows manual error clearing', async () => {
    mockListSessions.mockRejectedValue(new Error('Oops'));

    const { result } = renderHook(() => useConversationsData());

    await waitFor(() => {
      expect(result.current.error).toBe('Oops');
    });

    act(() => {
      result.current.setError(null);
    });

    expect(result.current.error).toBeNull();
  });

  it('loadDashboard without manual refresh sets isLoading', async () => {
    mockListSessions.mockResolvedValue(makeListSessionsResponse());

    const { result } = renderHook(() => useConversationsData());

    // Initial load uses isLoading (not isRefreshing)
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isRefreshing).toBe(false);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});
