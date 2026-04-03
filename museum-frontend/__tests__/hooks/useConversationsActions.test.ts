import { renderHook, act } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';

import { useConversationsActions } from '@/features/conversation/application/useConversationsActions';
import { makeDashboardSessionCard } from '@/__tests__/helpers/factories';
import type { DashboardSessionCard } from '@/features/chat/domain/dashboard-session';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}:${JSON.stringify(params)}`;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

const mockDeleteSessionIfEmpty = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    deleteSessionIfEmpty: (...args: unknown[]) => mockDeleteSessionIfEmpty(args[0] as string),
  },
}));

// Zustand store mock state — use mock prefix for jest.mock() hoisting compatibility
const mockStoreState = {
  items: [] as DashboardSessionCard[],
  savedSessionIds: [] as string[],
  sortMode: 'recent' as 'recent' | 'messages',
};

const mockRemoveItems = jest.fn<undefined, [string[]]>((ids) => {
  mockStoreState.items = mockStoreState.items.filter((item) => !ids.includes(item.id));
  mockStoreState.savedSessionIds = mockStoreState.savedSessionIds.filter((id) => !ids.includes(id));
});

const mockToggleSaved = jest.fn<boolean, [string]>((sessionId) => {
  const exists = mockStoreState.savedSessionIds.includes(sessionId);
  if (exists) {
    mockStoreState.savedSessionIds = mockStoreState.savedSessionIds.filter(
      (id) => id !== sessionId,
    );
  } else {
    mockStoreState.savedSessionIds = [...mockStoreState.savedSessionIds, sessionId];
  }
  return !exists;
});

const mockSetSortMode = jest.fn<undefined, [string]>((mode) => {
  mockStoreState.sortMode = mode as 'recent' | 'messages';
});

jest.mock('@/features/conversation/infrastructure/conversationsStore', () => ({
  useConversationsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      items: mockStoreState.items,
      removeItems: mockRemoveItems,
      savedSessionIds: mockStoreState.savedSessionIds,
      toggleSaved: mockToggleSaved,
      sortMode: mockStoreState.sortMode,
      setSortMode: mockSetSortMode,
    }),
}));

// Spy on Alert.alert and Share.share
const mockAlertAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const mockShareShare = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useConversationsActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState.items = [
      makeDashboardSessionCard({ id: 'session-1' }),
      makeDashboardSessionCard({ id: 'session-2' }),
    ];
    mockStoreState.savedSessionIds = ['session-1'];
    mockStoreState.sortMode = 'recent';
  });

  it('toggleSortMode switches from recent to messages', () => {
    const { result } = renderHook(() => useConversationsActions());

    act(() => {
      result.current.toggleSortMode();
    });

    expect(mockSetSortMode).toHaveBeenCalledWith('messages');
    expect(result.current.menuStatus).toBe('conversations.sorted_by_messages');
  });

  it('toggleSortMode switches from messages back to recent', () => {
    mockStoreState.sortMode = 'messages';
    const { result } = renderHook(() => useConversationsActions());

    act(() => {
      result.current.toggleSortMode();
    });

    expect(mockSetSortMode).toHaveBeenCalledWith('recent');
    expect(result.current.menuStatus).toBe('conversations.sorted_by_recency');
  });

  it('toggleSavedFilter toggles the saved-only filter', () => {
    const { result } = renderHook(() => useConversationsActions());

    expect(result.current.isSavedOnly).toBe(false);

    act(() => {
      result.current.toggleSavedFilter();
    });

    expect(result.current.isSavedOnly).toBe(true);
    expect(result.current.menuStatus).toBe('conversations.showing_saved_only');

    act(() => {
      result.current.toggleSavedFilter();
    });

    expect(result.current.isSavedOnly).toBe(false);
    expect(result.current.menuStatus).toBe('conversations.showing_all');
  });

  it('shareDashboard calls Share.share with summary', async () => {
    const { result } = renderHook(() => useConversationsActions());

    await act(async () => {
      await result.current.shareDashboard();
    });

    expect(mockShareShare).toHaveBeenCalledWith({
      title: 'conversations.share_title',
      message: expect.stringContaining('conversations.share_body'),
    });
    expect(result.current.menuStatus).toBe('conversations.shared_success');
  });

  it('toggleSavedSession delegates to store and sets status', () => {
    const { result } = renderHook(() => useConversationsActions());

    act(() => {
      result.current.toggleSavedSession('session-2');
    });

    expect(mockToggleSaved).toHaveBeenCalledWith('session-2');
    expect(result.current.menuStatus).toBe('conversations.session_saved');
  });

  it('toggleSavedSession reports unsaved when toggling off', () => {
    const { result } = renderHook(() => useConversationsActions());

    // session-1 is already saved, so toggling it will unsave
    act(() => {
      result.current.toggleSavedSession('session-1');
    });

    expect(result.current.menuStatus).toBe('conversations.session_unsaved');
  });

  it('confirmDeleteSingle shows an Alert with cancel and destructive actions', () => {
    const { result } = renderHook(() => useConversationsActions());

    act(() => {
      result.current.confirmDeleteSingle('session-1');
    });

    expect(mockAlertAlert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = mockAlertAlert.mock.calls[0] as [
      string,
      undefined,
      { text: string; style?: string; onPress?: () => void }[],
    ];
    expect(title).toBe('conversations.delete_confirm');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text).toBe('common.cancel');
    expect(buttons[1].text).toBe('common.delete');
    expect(buttons[1].style).toBe('destructive');
  });

  it('confirmDeleteSingle onPress calls deleteSession API and removes from store', async () => {
    const { result } = renderHook(() => useConversationsActions());

    act(() => {
      result.current.confirmDeleteSingle('session-1');
    });

    // Simulate pressing the delete button
    const buttons = mockAlertAlert.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    const deleteButton = buttons.find((b) => b.text === 'common.delete');

    await act(async () => {
      deleteButton?.onPress?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockDeleteSessionIfEmpty).toHaveBeenCalledWith('session-1');
    expect(mockRemoveItems).toHaveBeenCalledWith(['session-1']);
  });

  it('confirmDeleteSelected shows alert with count and bulk deletes', async () => {
    const { result } = renderHook(() => useConversationsActions());

    const selectedIds = new Set(['session-1', 'session-2']);

    act(() => {
      result.current.confirmDeleteSelected(selectedIds);
    });

    expect(mockAlertAlert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = mockAlertAlert.mock.calls[0] as [
      string,
      string,
      { text: string; onPress?: () => void }[],
    ];
    expect(title).toBe('conversations.delete_confirm');
    expect(body).toContain('conversations.selected_count');

    // Simulate pressing delete
    const deleteButton = buttons.find((b) => b.text === 'common.delete');

    await act(async () => {
      deleteButton?.onPress?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockDeleteSessionIfEmpty).toHaveBeenCalledTimes(2);
    expect(mockRemoveItems).toHaveBeenCalledWith(['session-1', 'session-2']);
  });

  it('confirmDeleteSelected does nothing for empty selection', () => {
    const { result } = renderHook(() => useConversationsActions());

    act(() => {
      result.current.confirmDeleteSelected(new Set());
    });

    expect(mockAlertAlert).not.toHaveBeenCalled();
  });

  it('deleteSession still removes from store when API fails', async () => {
    mockDeleteSessionIfEmpty.mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useConversationsActions());

    act(() => {
      result.current.confirmDeleteSingle('session-1');
    });

    const buttons = mockAlertAlert.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    const deleteButton = buttons.find((b) => b.text === 'common.delete');

    await act(async () => {
      deleteButton?.onPress?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Even though API failed, item should still be removed from UI
    expect(mockRemoveItems).toHaveBeenCalledWith(['session-1']);
  });
});
