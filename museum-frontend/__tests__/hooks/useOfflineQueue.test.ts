import { renderHook, act } from '@testing-library/react-native';
import { useOfflineQueue } from '@/features/chat/application/useOfflineQueue';

// ── Mocks ────────────────────────────────────────────────────────────────────

// In-memory fake storage
const fakeStore: Record<string, string> = {};
jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: jest.fn((key: string) => fakeStore[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      fakeStore[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- test cleanup
      delete fakeStore[key];
    }),
  },
}));

let mockIsConnected = true;
jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => ({ isConnected: mockIsConnected }),
}));

const mockPersistOfflineImage = jest.fn((uri: string) => Promise.resolve(`persistent://${uri}`));
const mockCleanupOfflineImage = jest.fn();
const mockCleanupOfflineImages = jest.fn();

jest.mock('@/features/chat/application/offlineImageStorage', () => ({
  persistOfflineImage: (...args: unknown[]) => mockPersistOfflineImage(...(args as [string])),
  cleanupOfflineImage: (...args: unknown[]) => mockCleanupOfflineImage(...(args as [string])),
  cleanupOfflineImages: (...args: unknown[]) => mockCleanupOfflineImages(...(args as [string[]])),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useOfflineQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected = true;
    mockPersistOfflineImage.mockImplementation((uri: string) =>
      Promise.resolve(`persistent://${uri}`),
    );
    // Clear fake store
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- test cleanup
    for (const key of Object.keys(fakeStore)) delete fakeStore[key];
  });

  it('calls hydrate on mount', () => {
    const { result } = renderHook(() => useOfflineQueue());

    // After mount, queue should be empty (no persisted data)
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.pendingMessages).toEqual([]);
  });

  it('enqueue adds a message and increments pendingCount', async () => {
    const { result } = renderHook(() => useOfflineQueue());

    await act(async () => {
      await result.current.enqueue({ sessionId: 's1', text: 'hello' });
    });

    expect(result.current.pendingCount).toBe(1);
    expect(result.current.pendingMessages[0]).toMatchObject({
      sessionId: 's1',
      text: 'hello',
    });
  });

  it('dequeue removes a message and decrements pendingCount', async () => {
    const { result } = renderHook(() => useOfflineQueue());

    await act(async () => {
      await result.current.enqueue({ sessionId: 's1', text: 'first' });
      await result.current.enqueue({ sessionId: 's1', text: 'second' });
    });

    expect(result.current.pendingCount).toBe(2);

    act(() => {
      result.current.dequeue();
    });

    expect(result.current.pendingCount).toBe(1);
    expect(result.current.pendingMessages[0]).toMatchObject({ text: 'second' });
  });

  it('isOffline reflects useConnectivity', () => {
    mockIsConnected = false;
    const { result } = renderHook(() => useOfflineQueue());
    expect(result.current.isOffline).toBe(true);
  });

  it('empty queue has pendingCount=0 and isEmpty-equivalent state', () => {
    const { result } = renderHook(() => useOfflineQueue());

    expect(result.current.pendingCount).toBe(0);
    expect(result.current.pendingMessages).toEqual([]);
  });

  // ── Image persistence tests ──────────────────────────────────────────────

  it('enqueue with imageUri persists the image before storing', async () => {
    const { result } = renderHook(() => useOfflineQueue());

    await act(async () => {
      await result.current.enqueue({
        sessionId: 's1',
        text: 'photo',
        imageUri: 'file:///tmp/photo.jpg',
      });
    });

    expect(mockPersistOfflineImage).toHaveBeenCalledWith('file:///tmp/photo.jpg');
    expect(result.current.pendingMessages[0]).toMatchObject({
      imageUri: 'persistent://file:///tmp/photo.jpg',
    });
  });

  it('enqueue without imageUri does not call persistOfflineImage', async () => {
    const { result } = renderHook(() => useOfflineQueue());

    await act(async () => {
      await result.current.enqueue({ sessionId: 's1', text: 'no image' });
    });

    expect(mockPersistOfflineImage).not.toHaveBeenCalled();
  });

  it('enqueue still succeeds if image persistence fails', async () => {
    mockPersistOfflineImage.mockRejectedValue(new Error('disk full'));

    const { result } = renderHook(() => useOfflineQueue());

    await act(async () => {
      await result.current.enqueue({
        sessionId: 's1',
        text: 'fallback',
        imageUri: 'file:///tmp/photo.jpg',
      });
    });

    expect(result.current.pendingCount).toBe(1);
    // imageUri should be cleared since persistence failed
    expect(result.current.pendingMessages[0]?.imageUri).toBeUndefined();
  });

  it('dequeue cleans up the persisted image', async () => {
    const { result } = renderHook(() => useOfflineQueue());

    await act(async () => {
      await result.current.enqueue({
        sessionId: 's1',
        text: 'photo',
        imageUri: 'file:///tmp/photo.jpg',
      });
    });

    act(() => {
      result.current.dequeue();
    });

    expect(mockCleanupOfflineImage).toHaveBeenCalledWith('persistent://file:///tmp/photo.jpg');
  });

  it('remove cleans up the persisted image', async () => {
    const { result } = renderHook(() => useOfflineQueue());

    let messageId = '';
    await act(async () => {
      const entry = await result.current.enqueue({
        sessionId: 's1',
        text: 'photo',
        imageUri: 'file:///tmp/photo.jpg',
      });
      messageId = entry?.id ?? '';
    });

    act(() => {
      result.current.remove(messageId);
    });

    expect(mockCleanupOfflineImage).toHaveBeenCalledWith('persistent://file:///tmp/photo.jpg');
  });
});
