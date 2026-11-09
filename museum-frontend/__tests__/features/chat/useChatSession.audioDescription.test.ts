import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useChatSession } from '@/features/chat/application/useChatSession';

const mockSpeak = jest.fn();
const mockStop = jest.fn();
jest.mock('expo-speech', () => ({
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: (...args: unknown[]) => {
    mockStop(...args);
    return Promise.resolve();
  },
}));

jest.mock('@/features/settings/application/useAudioDescriptionMode', () => ({
  useAudioDescriptionMode: () => ({ enabled: true, isLoading: false, toggle: jest.fn() }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/shared/infrastructure/inAppReview', () => ({
  incrementCompletedSessions: jest.fn(),
  maybeRequestReview: jest.fn(),
}));

const mockGetSession = jest.fn<
  Promise<{
    session: { title: string | null; museumName: string | null; museumMode?: boolean | null };
    messages: {
      id: string;
      role: string;
      text: string;
      createdAt: string;
      imageRef?: string | null;
      image?: { url: string; expiresAt: string } | null;
      metadata?: Record<string, unknown> | null;
    }[];
  }>,
  [string]
>();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    getSession: (...args: unknown[]) => mockGetSession(args[0] as string),
    sendMessageSmart: jest.fn(),
    postMessage: jest.fn(),
    postAudioMessage: jest.fn(),
    getMessageImageUrl: jest.fn(),
  },
}));

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

jest.mock('@/features/settings/application/useRuntimeSettings', () => ({
  useRuntimeSettings: () => ({
    locale: 'en-US',
    museumMode: true,
    guideLevel: 'beginner' as const,
    isLoading: false,
    settings: null,
  }),
}));

jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => ({ isConnected: true, isInternetReachable: true, isOnline: true }),
}));

const mockEnqueue = jest.fn();
const mockDequeue = jest.fn();
const mockPeek = jest.fn().mockReturnValue(undefined);
jest.mock('@/features/chat/application/useOfflineQueue', () => ({
  useOfflineQueue: () => ({
    isOffline: false,
    enqueue: mockEnqueue,
    dequeue: mockDequeue,
    peek: mockPeek,
    pendingCount: 0,
  }),
}));

jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({ isLowData: false }),
}));

const mockCacheLookup = jest.fn().mockReturnValue(null);
const mockCacheStore = jest.fn();
jest.mock('@/features/chat/application/chatLocalCache', () => ({
  useChatLocalCacheStore: (selector: (state: { lookup: jest.Mock; store: jest.Mock }) => unknown) =>
    selector({ lookup: mockCacheLookup, store: mockCacheStore }),
}));

const mockSetSession = jest.fn();
const mockUpdateMessages = jest.fn();
jest.mock('@/features/chat/infrastructure/chatSessionStore', () => {
  const getState = () => ({
    sessions: {},
    setSession: mockSetSession,
    updateMessages: mockUpdateMessages,
  });
  const hook = Object.assign(
    (selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()),
    { getState },
  );
  return { useChatSessionStore: hook };
});

const SESSION_ID = 'audio-desc-session';

interface SeedMsg {
  id: string;
  role: string;
  text: string;
  imageDescription?: string;
  createdAt: string;
}

const sessionWith = (messages: SeedMsg[]) => ({
  session: { title: 'Audio Session', museumName: 'Louvre', museumMode: true },
  messages: messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    createdAt: m.createdAt,
    imageRef: null,
    image: null,
    metadata: m.imageDescription !== undefined ? { imageDescription: m.imageDescription } : null,
  })),
});

describe('useChatSession audio-description autoplay (I-CMP3 / R3+R4+R5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('R3 — stops expo-speech on unmount when an utterance was in flight', async () => {
    mockGetSession.mockResolvedValue(
      sessionWith([
        {
          id: 'a1',
          role: 'assistant',
          text: '',
          imageDescription: 'A portrait of a woman.',
          createdAt: '2026-01-01T10:00:00.000Z',
        },
      ]),
    );

    const { result, unmount } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(() => {
      expect(mockSpeak).toHaveBeenCalledTimes(1);
    });
    expect(mockSpeak).toHaveBeenCalledWith('A portrait of a woman.', expect.anything());

    act(() => {
      unmount();
    });
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('R4 — stops the previous utterance before reading a new image-description message', async () => {
    mockGetSession.mockResolvedValue(
      sessionWith([
        {
          id: 'a1',
          role: 'assistant',
          text: '',
          imageDescription: 'First description.',
          createdAt: '2026-01-01T10:00:00.000Z',
        },
      ]),
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    await waitFor(() => {
      expect(mockSpeak).toHaveBeenCalledTimes(1);
    });

    mockGetSession.mockResolvedValue(
      sessionWith([
        {
          id: 'a2',
          role: 'assistant',
          text: '',
          imageDescription: 'Second description.',
          createdAt: '2026-01-01T10:01:00.000Z',
        },
      ]),
    );
    await act(async () => {
      await result.current.reload();
    });
    await waitFor(() => {
      expect(mockSpeak).toHaveBeenCalledTimes(2);
    });

    expect(mockStop).toHaveBeenCalled();
    const firstStopOrder = mockStop.mock.invocationCallOrder[0] ?? Infinity;
    const secondSpeakOrder = mockSpeak.mock.invocationCallOrder[1] ?? -Infinity;
    expect(firstStopOrder).toBeLessThan(secondSpeakOrder);
  });

  it('R5 — does NOT read a message that also carries body text (server-TTS owns it)', async () => {
    mockGetSession.mockResolvedValue(
      sessionWith([
        {
          id: 'b1',
          role: 'assistant',
          text: 'Here is a detailed explanation of the painting in the message body.',
          imageDescription: 'A portrait of a woman.',
          createdAt: '2026-01-01T10:00:00.000Z',
        },
      ]),
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('R5 — DOES read an image-description message with empty body text', async () => {
    mockGetSession.mockResolvedValue(
      sessionWith([
        {
          id: 'c1',
          role: 'assistant',
          text: '',
          imageDescription: 'A marble sculpture of a discus thrower.',
          createdAt: '2026-01-01T10:00:00.000Z',
        },
      ]),
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(() => {
      expect(mockSpeak).toHaveBeenCalledTimes(1);
    });
    expect(mockSpeak).toHaveBeenCalledWith(
      'A marble sculpture of a discus thrower.',
      expect.anything(),
    );
  });
});
