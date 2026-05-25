import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useChatSession } from '@/features/chat/application/useChatSession';

/**
 * I-CMP3(1)(2)(4) / R3+R4+R5 — the audio-description autoplay effect in
 * useChatSession.ts (L111-129) reads `metadata.imageDescription` aloud via
 * device-native expo-speech. Pre-fix it has three a11y/coordination defects:
 *
 *  - R3: it NEVER stops in-flight speech when the chat screen unmounts/blurs
 *        (no cleanup returned) → speech keeps playing off-screen.
 *  - R4: it NEVER `Speech.stop()`s before re-triggering on a new message →
 *        utterances QUEUE and stack (expo-speech speak() queues; stop() flushes
 *        — lib-docs/expo-speech/LESSONS.md:5 + PATTERNS.md §1-2).
 *  - R5: it speaks regardless of whether the message also carries body text,
 *        so a body-text message gets read by BOTH expo-speech AND the
 *        server-TTS path (double-playback race). Design §D1 partitions by
 *        content: expo-speech owns imageDescription-ONLY messages (empty text);
 *        server-TTS owns body-text messages.
 *
 * These tests drive the autoplay effect by seeding messages through the
 * session loader (mockGetSession) + reload(), with audioDescriptionMode
 * mocked enabled and expo-speech mocked (speak/stop jest.fn).
 */

// ── expo-speech (lazy-required inside the effect; mock the module) ────────────
const mockSpeak = jest.fn();
const mockStop = jest.fn();
jest.mock('expo-speech', () => ({
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: (...args: unknown[]) => mockStop(...args),
}));

// ── audio-description mode ENABLED (gates the autoplay effect) ────────────────
jest.mock('@/features/settings/application/useAudioDescriptionMode', () => ({
  useAudioDescriptionMode: () => ({ enabled: true, isLoading: false, toggle: jest.fn() }),
}));

// ── Harness mocks (mirror __tests__/hooks/useChatSession.test.ts) ─────────────
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

// Stable mock fns (module-level) — selectors must return a STABLE identity each
// render, otherwise `useSessionLoader`'s `loadSession` useCallback changes every
// render and the load effect re-fires forever (getSession called endlessly,
// isLoading never settles). Mirror __tests__/hooks/useChatSession.test.ts.
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

// ── Helpers ───────────────────────────────────────────────────────────────────
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

    // Image description auto-read fired once.
    await waitFor(() => {
      expect(mockSpeak).toHaveBeenCalledTimes(1);
    });
    expect(mockSpeak).toHaveBeenCalledWith('A portrait of a woman.', expect.anything());

    // Pre-fix: the autoplay effect returns NO cleanup → unmount leaves speech
    // playing → Speech.stop() never called.
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

    // A new assistant image-description message arrives (different id).
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

    // Pre-fix: speak() is called twice but stop() is never called → the second
    // utterance queues behind the first (expo-speech queues). R4 requires a
    // stop() before the second speak() to flush the queue.
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

    // Give the autoplay effect a chance to run.
    await act(async () => {
      await Promise.resolve();
    });

    // Pre-fix: the effect speaks regardless of body text → double-playback with
    // server-TTS. R5/design §D1: a body-text message must NOT be read by
    // expo-speech.
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
