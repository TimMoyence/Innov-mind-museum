import { renderHook, act } from '@testing-library/react-native';

import { useConversationsBulkMode } from '@/features/conversation/application/useConversationsBulkMode';
import { makeDashboardSessionCard } from '@/__tests__/helpers/factories';
import type { DashboardSessionCard } from '@/features/chat/domain/dashboard-session';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const card1 = makeDashboardSessionCard({ id: 'card-1' });
const card2 = makeDashboardSessionCard({ id: 'card-2' });
const card3 = makeDashboardSessionCard({ id: 'card-3' });

const makeVisibleItemsDeps = (items: DashboardSessionCard[] = [card1, card2, card3]) => ({
  items,
  isSavedOnly: false,
  savedSessionIds: [] as string[],
  sortMode: 'recent',
  searchQuery: '',
  getVisibleItems: () => items,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useConversationsBulkMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initialises with edit mode off and empty selection', () => {
    const { result } = renderHook(() => useConversationsBulkMode(makeVisibleItemsDeps()));

    expect(result.current.editMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('toggleEditMode enters bulk edit mode', () => {
    const { result } = renderHook(() => useConversationsBulkMode(makeVisibleItemsDeps()));

    act(() => {
      result.current.toggleEditMode();
    });

    expect(result.current.editMode).toBe(true);
  });

  it('toggleEditMode exits bulk mode and clears selection', () => {
    const { result } = renderHook(() => useConversationsBulkMode(makeVisibleItemsDeps()));

    // Enter edit mode
    act(() => {
      result.current.toggleEditMode();
    });

    // Select an item
    act(() => {
      result.current.toggleSelection('card-1');
    });

    expect(result.current.selectedIds.size).toBe(1);

    // Exit edit mode
    act(() => {
      result.current.toggleEditMode();
    });

    expect(result.current.editMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('toggleSelection adds an item to selection', () => {
    const { result } = renderHook(() => useConversationsBulkMode(makeVisibleItemsDeps()));

    act(() => {
      result.current.toggleSelection('card-1');
    });

    expect(result.current.selectedIds.has('card-1')).toBe(true);
    expect(result.current.selectedIds.size).toBe(1);
  });

  it('toggleSelection removes an already-selected item', () => {
    const { result } = renderHook(() => useConversationsBulkMode(makeVisibleItemsDeps()));

    act(() => {
      result.current.toggleSelection('card-1');
    });

    expect(result.current.selectedIds.has('card-1')).toBe(true);

    act(() => {
      result.current.toggleSelection('card-1');
    });

    expect(result.current.selectedIds.has('card-1')).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('toggleSelection triggers haptic feedback', () => {
    const Haptics = require('expo-haptics') as { selectionAsync: jest.Mock };
    const { result } = renderHook(() => useConversationsBulkMode(makeVisibleItemsDeps()));

    act(() => {
      result.current.toggleSelection('card-1');
    });

    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('selectAll selects all visible items', () => {
    const { result } = renderHook(() => useConversationsBulkMode(makeVisibleItemsDeps()));

    act(() => {
      result.current.selectAll();
    });

    expect(result.current.selectedIds.size).toBe(3);
    expect(result.current.selectedIds.has('card-1')).toBe(true);
    expect(result.current.selectedIds.has('card-2')).toBe(true);
    expect(result.current.selectedIds.has('card-3')).toBe(true);
  });

  it('selectAll triggers haptic feedback', () => {
    const Haptics = require('expo-haptics') as { selectionAsync: jest.Mock };
    const { result } = renderHook(() => useConversationsBulkMode(makeVisibleItemsDeps()));

    act(() => {
      result.current.selectAll();
    });

    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('resetSelection clears selection and exits edit mode', () => {
    const { result } = renderHook(() => useConversationsBulkMode(makeVisibleItemsDeps()));

    // Enter edit mode and select items
    act(() => {
      result.current.toggleEditMode();
    });

    act(() => {
      result.current.toggleSelection('card-1');
      result.current.toggleSelection('card-2');
    });

    expect(result.current.selectedIds.size).toBe(2);
    expect(result.current.editMode).toBe(true);

    act(() => {
      result.current.resetSelection();
    });

    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.editMode).toBe(false);
  });

  it('multiple selections accumulate correctly', () => {
    const { result } = renderHook(() => useConversationsBulkMode(makeVisibleItemsDeps()));

    act(() => {
      result.current.toggleSelection('card-1');
    });

    act(() => {
      result.current.toggleSelection('card-3');
    });

    expect(result.current.selectedIds.size).toBe(2);
    expect(result.current.selectedIds.has('card-1')).toBe(true);
    expect(result.current.selectedIds.has('card-2')).toBe(false);
    expect(result.current.selectedIds.has('card-3')).toBe(true);
  });

  it('selectAll with empty items produces empty selection', () => {
    const deps = makeVisibleItemsDeps([]);
    const { result } = renderHook(() => useConversationsBulkMode(deps));

    act(() => {
      result.current.selectAll();
    });

    expect(result.current.selectedIds.size).toBe(0);
  });
});
