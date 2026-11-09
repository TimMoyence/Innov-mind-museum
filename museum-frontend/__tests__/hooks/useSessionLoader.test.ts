import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { useSessionLoader } from '@/features/chat/application/useSessionLoader';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { makeGetSessionResponse } from '@/__tests__/helpers/factories';

const mockGetSession = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    getSession: (...args: unknown[]) => mockGetSession(args[0]),
  },
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

jest.mock('@/shared/lib/errors', () => ({
  getErrorMessage: (err: unknown) => {
    if (err instanceof Error) return err.message;
    return String(err);
  },
}));

const mockSetSession = jest.fn();
let mockStoreSessions: Record<
  string,
  { messages: ChatUiMessage[]; title: string | null; museumName: string | null; updatedAt: number }
> = {};

jest.mock('@/features/chat/infrastructure/chatSessionStore', () => {
  const hook = Object.assign(
    (selector: (state: { sessions: typeof mockStoreSessions; setSession: jest.Mock }) => unknown) =>
      selector({ sessions: mockStoreSessions, setSession: mockSetSession }),
    {
      getState: () => ({ sessions: mockStoreSessions, setSession: mockSetSession }),
    },
  );
  return { useChatSessionStore: hook };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

const SESSION_ID = 'loader-session-1';

const renderLoader = (sessionId = SESSION_ID) => {
  const { result } = renderHook(() => {
    const [messages, setMessages] = useState<ChatUiMessage[]>([]);
    const loader = useSessionLoader(sessionId, setMessages);
    return { messages, ...loader };
  });
  return result;
};

describe('useSessionLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreSessions = {};
  });

  it('starts with isLoading true and loads session from API', async () => {
    const response = makeGetSessionResponse({
      session: {
        id: SESSION_ID,
        locale: 'en-US',
        museumMode: true,
        title: 'Impressionist Gallery',
        museumName: 'Orsay',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        intent: 'default',
      },
    });
    mockGetSession.mockResolvedValue(response);

    const result = renderLoader();

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetSession).toHaveBeenCalledWith(SESSION_ID);
    expect(result.current.sessionTitle).toBe('Impressionist Gallery');
    expect(result.current.museumName).toBe('Orsay');
    expect(result.current.error).toBeNull();
  });

  it('maps API messages to UI format and sorts by time', async () => {
    const response = makeGetSessionResponse({
      messages: [
        {
          id: 'msg-2',
          role: 'assistant' as const,
          text: 'Second',
          createdAt: '2025-01-01T00:02:00Z',
          imageRef: null,
          image: null,
          metadata: null,
        },
        {
          id: 'msg-1',
          role: 'user' as const,
          text: 'First',
          createdAt: '2025-01-01T00:01:00Z',
          imageRef: null,
          image: null,
          metadata: null,
        },
      ],
    });
    mockGetSession.mockResolvedValue(response);

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]?.id).toBe('msg-1');
    expect(result.current.messages[1]?.id).toBe('msg-2');
  });

  it('persists loaded data to the Zustand store', async () => {
    const response = makeGetSessionResponse({
      session: {
        id: SESSION_ID,
        locale: 'en-US',
        museumMode: true,
        title: 'My Title',
        museumName: 'Louvre',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        intent: 'default',
      },
    });
    mockGetSession.mockResolvedValue(response);

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSetSession).toHaveBeenCalledWith(
      SESSION_ID,
      expect.any(Array),
      'My Title',
      'Louvre',
    );
  });

  it('sets error state on API failure', async () => {
    mockGetSession.mockRejectedValue(new Error('Not found'));

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Not found');
    expect(result.current.messages).toHaveLength(0);
  });

  it('reports errors to Sentry', async () => {
    const Sentry = require('@sentry/react-native') as { captureException: jest.Mock };
    const loadError = new Error('Server error');
    mockGetSession.mockRejectedValue(loadError);

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(loadError, {
      tags: { flow: 'chat.loadSession' },
    });
  });

  it('setError allows manual error clearing', async () => {
    mockGetSession.mockRejectedValue(new Error('Oops'));

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.error).toBe('Oops');
    });

    act(() => {
      result.current.setError(null);
    });

    expect(result.current.error).toBeNull();
  });

  it('loadSession can be called again to refresh', async () => {
    const response1 = makeGetSessionResponse({
      session: {
        id: SESSION_ID,
        locale: 'en-US',
        museumMode: true,
        title: 'Original',
        museumName: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        intent: 'default',
      },
    });
    const response2 = makeGetSessionResponse({
      session: {
        id: SESSION_ID,
        locale: 'en-US',
        museumMode: true,
        title: 'Refreshed',
        museumName: 'Met',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        intent: 'default',
      },
    });
    mockGetSession.mockResolvedValueOnce(response1).mockResolvedValueOnce(response2);

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.sessionTitle).toBe('Original');
    });

    await act(async () => {
      await result.current.loadSession();
    });

    expect(result.current.sessionTitle).toBe('Refreshed');
    expect(result.current.museumName).toBe('Met');
    expect(mockGetSession).toHaveBeenCalledTimes(2);
  });

  it('handles null title and museumName', async () => {
    const response = makeGetSessionResponse({
      session: {
        id: SESSION_ID,
        locale: 'en-US',
        museumMode: false,
        title: null,
        museumName: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        intent: 'default',
      },
    });
    mockGetSession.mockResolvedValue(response);

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sessionTitle).toBeNull();
    expect(result.current.museumName).toBeNull();
  });

  it('loadSession resets error before re-fetching', async () => {
    mockGetSession
      .mockRejectedValueOnce(new Error('First fail'))
      .mockResolvedValueOnce(makeGetSessionResponse());

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.error).toBe('First fail');
    });

    await act(async () => {
      await result.current.loadSession();
    });

    expect(result.current.error).toBeNull();
  });

  it('hydrates messages from Zustand cache when API fails and a cached entry exists', async () => {
    const cachedMessages: ChatUiMessage[] = [
      {
        id: 'cached-msg-1',
        role: 'user',
        text: 'Hi',
        imageRef: null,
        createdAt: '2025-01-01T00:01:00Z',
        metadata: null,
      },
    ];
    mockStoreSessions[SESSION_ID] = {
      messages: cachedMessages,
      title: 'Cached Title',
      museumName: 'Cached Museum',
      updatedAt: Date.now(),
    };
    mockGetSession.mockRejectedValue(new Error('Network failure'));

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe('cached-msg-1');
    expect(result.current.sessionTitle).toBe('Cached Title');
    expect(result.current.museumName).toBe('Cached Museum');
    expect(result.current.error).toBe('Network failure');
  });

  it('leaves messages empty when API fails and no cache entry exists', async () => {
    mockGetSession.mockRejectedValue(new Error('API down'));

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBe('API down');
  });

  describe('cancellation', () => {
    interface Deferred<T> {
      promise: Promise<T>;
      resolve: (v: T) => void;
      reject: (e: unknown) => void;
    }
    const createDeferred = <T>(): Deferred<T> => {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };

    it('does not call setMessages after unmount when the fetch resolves late', async () => {
      const setMessagesSpy = jest.fn();
      const deferred = createDeferred<ReturnType<typeof makeGetSessionResponse>>();
      mockGetSession.mockImplementationOnce(() => deferred.promise);

      const { unmount } = renderHook(() => useSessionLoader(SESSION_ID, setMessagesSpy));

      unmount();

      await act(async () => {
        deferred.resolve(
          makeGetSessionResponse({
            session: {
              id: SESSION_ID,
              locale: 'en-US',
              museumMode: true,
              title: 'Resolved-after-unmount',
              museumName: 'Stale',
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
              intent: 'default',
            },
          }),
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(setMessagesSpy).not.toHaveBeenCalled();
      expect(mockSetSession).toHaveBeenCalledWith(
        SESSION_ID,
        expect.any(Array),
        'Resolved-after-unmount',
        'Stale',
      );
    });

    it('does not overwrite the new session state when sessionId changes mid-fetch', async () => {
      const setMessagesSpy = jest.fn();
      const deferA = createDeferred<ReturnType<typeof makeGetSessionResponse>>();
      const deferB = createDeferred<ReturnType<typeof makeGetSessionResponse>>();
      mockGetSession.mockImplementationOnce(() => deferA.promise);
      mockGetSession.mockImplementationOnce(() => deferB.promise);

      const { result, rerender } = renderHook(
        ({ sessionId }: { sessionId: string }) => useSessionLoader(sessionId, setMessagesSpy),
        { initialProps: { sessionId: 'session-A' } },
      );

      rerender({ sessionId: 'session-B' });

      await act(async () => {
        deferA.resolve(
          makeGetSessionResponse({
            session: {
              id: 'session-A',
              locale: 'en-US',
              museumMode: true,
              title: 'A-stale-title',
              museumName: 'A-museum',
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
              intent: 'default',
            },
          }),
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.sessionTitle).not.toBe('A-stale-title');
      expect(result.current.museumName).not.toBe('A-museum');

      await act(async () => {
        deferB.resolve(
          makeGetSessionResponse({
            session: {
              id: 'session-B',
              locale: 'en-US',
              museumMode: true,
              title: 'B-fresh-title',
              museumName: 'B-museum',
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
              intent: 'default',
            },
          }),
        );
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.sessionTitle).toBe('B-fresh-title');
      expect(result.current.museumName).toBe('B-museum');
    });

    it('still reports Sentry exceptions even when the fetch lands after unmount (R9)', async () => {
      const setMessagesSpy = jest.fn();
      const deferred = createDeferred<ReturnType<typeof makeGetSessionResponse>>();
      mockGetSession.mockImplementationOnce(() => deferred.promise);

      const { unmount } = renderHook(() => useSessionLoader(SESSION_ID, setMessagesSpy));
      unmount();

      const Sentry = require('@sentry/react-native') as { captureException: jest.Mock };

      const lateError = new Error('Network-after-unmount');
      await act(async () => {
        deferred.reject(lateError);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(lateError, {
        tags: { flow: 'chat.loadSession' },
      });
      expect(setMessagesSpy).not.toHaveBeenCalled();
    });
  });
});
