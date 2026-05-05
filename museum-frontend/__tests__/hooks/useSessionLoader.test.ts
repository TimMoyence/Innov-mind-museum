import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { useSessionLoader } from '@/features/chat/application/useSessionLoader';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { makeGetSessionResponse } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

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
// Mutable sessions map — mutate in tests, reset in beforeEach.
// Declared with `let` so we can replace the whole map; the mock factory captures it lazily.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_ID = 'loader-session-1';

/** Renders the hook wired to a real useState for messages. */
const renderLoader = (sessionId = SESSION_ID) => {
  const { result } = renderHook(() => {
    const [messages, setMessages] = useState<ChatUiMessage[]>([]);
    const loader = useSessionLoader(sessionId, setMessages);
    return { messages, ...loader };
  });
  return result;
};

// ── Tests ────────────────────────────────────────────────────────────────────

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
    // Messages should be sorted by createdAt ascending
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

    // Messages hydrated from cache
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe('cached-msg-1');
    expect(result.current.sessionTitle).toBe('Cached Title');
    expect(result.current.museumName).toBe('Cached Museum');
    // Error is still set so the user knows the API is down
    expect(result.current.error).toBe('Network failure');
  });

  it('leaves messages empty when API fails and no cache entry exists', async () => {
    // mockStoreSessions is empty (reset in beforeEach)
    mockGetSession.mockRejectedValue(new Error('API down'));

    const result = renderLoader();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBe('API down');
  });
});
