import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useChatSession } from '@/features/chat/application/useChatSession';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { makePostMessageResponse } from '@/__tests__/helpers/factories/session.factories';
import { makeEnrichedImage } from '@/__tests__/helpers/factories/chat.factories';
import type { PostMessageResponseDTO } from '@/features/chat/domain/contracts';

// ────────────────────────────────────────────────────────────────────────────
// Cycle 5 (UFR-022 RED) — "no empty/phantom assistant bubble" across the four
// vulnerable strategies (streaming / audio / cache / history-load).
//
// DOCTRINE D8 (anti fake-world): every streaming case drives the LIVE sync
// transport via `mockSendMessageSmart.mockResolvedValue(...)`. We NEVER fire
// `onDone` — `sendMessageSmart` ignores it (send.ts:169-172). A test using
// onDone reproduces the fake world that let P0-FA1 ship green. The live finalize
// path is the sync-fallback block `sendMessageStreaming.ts:117-153`, whose
// internal truthy guard `if (response.message.text)` (`:128`) is the residual
// hole this cycle closes.
//
// EXPECTED RED today:
//   - streaming '' → placeholder `${ts}-streaming` (text:'') survives, never
//     replaced (truthy guard skips the swap, no cleanup). Phantom bubble.
//   - streaming '   ' / '\n' → truthy whitespace REPLACES the placeholder with
//     a visually-empty bubble (markdown trim). Empty-looking bubble.
//   - audio '' / whitespace → assistantMessage appended unconditionally
//     (sendMessageAudio.ts:52-75, no guard). Empty bubble.
//   - cache hit answer:'' → cached assistant bubble pushed (sendMessageCache.ts:39-47).
//   - history-load assistant text:null/'' → mapped 1:1, rendered as empty bubble.
// EXPECTED to already pass (non-regression pins):
//   - streaming '' + images → bubble kept (D7 image-only). Today survives via
//     the orphan placeholder; the GREEN must keep it rendered via the helper.
//   - happy path (non-blank) → bubble rendered. (Mirrors TR.1-TR.6.)
// ────────────────────────────────────────────────────────────────────────────

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
    session: { title: string | null; museumName: string | null; museumMode?: boolean };
    messages: {
      id: string;
      role: string;
      text: string | null;
      createdAt: string;
      imageRef?: string | null;
      image?: { url: string; expiresAt: string } | null;
      metadata?: Record<string, unknown> | null;
    }[];
  }>,
  [string]
>();
const mockSendMessageSmart = jest.fn();
const mockPostMessage = jest.fn();
const mockPostAudioMessage = jest.fn();
const mockGetMessageImageUrl = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    getSession: (...args: unknown[]) => mockGetSession(args[0] as string),
    sendMessageSmart: (...args: unknown[]) => mockSendMessageSmart(args[0]),
    postMessage: (...args: unknown[]) => mockPostMessage(args[0]),
    postAudioMessage: (...args: unknown[]) => mockPostAudioMessage(args[0]),
    getMessageImageUrl: (...args: unknown[]) => mockGetMessageImageUrl(args[0]),
  },
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

jest.mock('@/features/settings/application/useRuntimeSettings', () => ({
  useRuntimeSettings: () => ({
    locale: 'en-US',
    museumMode: true,
    guideLevel: 'beginner' as const,
    isLoading: false,
    settings: null,
  }),
}));

let mockIsConnected = true;
jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => ({
    isConnected: mockIsConnected,
    isInternetReachable: mockIsConnected,
    isOnline: mockIsConnected,
  }),
}));

const mockEnqueue = jest.fn();
const mockDequeue = jest.fn();
const mockPeek = jest.fn().mockReturnValue(undefined);
let mockIsOffline = false;
let mockPendingCount = 0;

jest.mock('@/features/chat/application/useOfflineQueue', () => ({
  useOfflineQueue: () => ({
    isOffline: mockIsOffline,
    enqueue: mockEnqueue,
    dequeue: mockDequeue,
    peek: mockPeek,
    pendingCount: mockPendingCount,
  }),
}));

let mockIsLowData = false;
jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({ isLowData: mockIsLowData }),
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_ID = 'test-session-empty-bubble';

/** Session with only a user message so each turn adds exactly the asserted assistant bubble. */
const userOnlySessionResponse = () => ({
  session: { title: 'Test Session', museumName: 'Louvre', museumMode: true },
  messages: [
    {
      id: 'seed-user-1',
      role: 'user',
      text: 'Hello',
      createdAt: new Date('2026-05-26T10:00:00.000Z').toISOString(),
      imageRef: null,
      image: null,
      metadata: null,
    },
  ],
});

/** Counts assistant bubbles whose visible text is blank (empty or whitespace) AND that carry no renderable media. */
const blankAssistantBubbles = (messages: ChatUiMessage[]) =>
  messages.filter(
    (m) =>
      m.role === 'assistant' &&
      (m.text ?? '').trim() === '' &&
      (m.metadata?.images?.length ?? 0) === 0 &&
      !m.metadata?.compareResults,
  );

const streamingIds = (messages: ChatUiMessage[]) =>
  messages.filter((m) => m.id.endsWith('-streaming'));

describe('useChatSession — no empty/phantom assistant bubble (Cycle 5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected = true;
    mockIsOffline = false;
    mockIsLowData = false;
    mockPendingCount = 0;
    mockGetSession.mockResolvedValue(userOnlySessionResponse());
    mockPeek.mockReturnValue(undefined);
    mockCacheLookup.mockReturnValue(null);
  });

  // ── Streaming (live sync path, D8) ────────────────────────────────────────

  it('AC-1 — streaming empty text leaves no assistant bubble and no -streaming placeholder', async () => {
    mockSendMessageSmart.mockResolvedValue(
      makePostMessageResponse({
        sessionId: SESSION_ID,
        message: {
          id: 'resp-empty-1',
          role: 'assistant',
          text: '',
          createdAt: new Date().toISOString(),
        },
        metadata: {},
      }),
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'Tell me about this painting' });
    });

    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
    expect(streamingIds(result.current.messages)).toHaveLength(0);
  });

  it('AC-2 — streaming whitespace-only text renders no blank bubble and no -streaming placeholder', async () => {
    mockSendMessageSmart.mockResolvedValue(
      makePostMessageResponse({
        sessionId: SESSION_ID,
        message: {
          id: 'resp-ws-1',
          role: 'assistant',
          text: '   ',
          createdAt: new Date().toISOString(),
        },
        metadata: {},
      }),
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'Tell me more' });
    });

    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
    expect(streamingIds(result.current.messages)).toHaveLength(0);
  });

  it('AC-2 — streaming newline-only text renders no blank bubble and no -streaming placeholder', async () => {
    mockSendMessageSmart.mockResolvedValue(
      makePostMessageResponse({
        sessionId: SESSION_ID,
        message: {
          id: 'resp-nl-1',
          role: 'assistant',
          text: '\n',
          createdAt: new Date().toISOString(),
        },
        metadata: {},
      }),
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'And then?' });
    });

    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
    expect(streamingIds(result.current.messages)).toHaveLength(0);
  });

  it('AC-1 — streaming null text leaves no assistant bubble and no -streaming placeholder', async () => {
    mockSendMessageSmart.mockResolvedValue(
      makePostMessageResponse({
        sessionId: SESSION_ID,
        message: {
          id: 'resp-null-1',
          role: 'assistant',
          // Runtime API can return a null text on a degraded 200 even though the
          // OpenAPI type is `string`; the FE must tolerate it.
          text: null as unknown as string,
          createdAt: new Date().toISOString(),
        },
        metadata: {},
      }),
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'Anything?' });
    });

    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
    expect(streamingIds(result.current.messages)).toHaveLength(0);
  });

  it('AC-3 (D7) — streaming empty text WITH enriched images keeps the image-only bubble rendered', async () => {
    mockSendMessageSmart.mockResolvedValue(
      makePostMessageResponse({
        sessionId: SESSION_ID,
        message: {
          id: 'resp-img-only-1',
          role: 'assistant',
          text: '',
          createdAt: new Date().toISOString(),
        },
        // Enriched-image factory is the UI shape; the API metadata DTO carries
        // the same fields at runtime. Cast at the boundary (mirrors the
        // `response.metadata as ChatUiMessageMetadata` cast in the call-sites).
        metadata: {
          images: [makeEnrichedImage()],
        } as unknown as PostMessageResponseDTO['metadata'],
      }),
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'Show me similar works' });
    });

    // The image-only bubble is legitimate content — it MUST survive (no over-blocking).
    const imageBubble = result.current.messages.find((m) => m.id === 'resp-img-only-1');
    expect(imageBubble).toBeDefined();
    expect((imageBubble?.metadata?.images?.length ?? 0) > 0).toBe(true);
    // And it must not leave a -streaming placeholder behind.
    expect(streamingIds(result.current.messages)).toHaveLength(0);
  });

  it('AC-7 — streaming non-blank text renders the bubble normally (happy path, no regression)', async () => {
    const answer = 'The Mona Lisa was painted by Leonardo.';
    mockSendMessageSmart.mockResolvedValue(
      makePostMessageResponse({
        sessionId: SESSION_ID,
        message: {
          id: 'resp-happy-1',
          role: 'assistant',
          text: answer,
          createdAt: new Date().toISOString(),
        },
      }),
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'Who painted it?' });
    });

    const answered = result.current.messages.find(
      (m) => m.role === 'assistant' && m.text === answer,
    );
    expect(answered).toBeDefined();
    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
    expect(streamingIds(result.current.messages)).toHaveLength(0);
  });

  // ── Audio ─────────────────────────────────────────────────────────────────

  it('AC-4 — audio empty text adds no assistant bubble (transcription user still applied)', async () => {
    mockPostAudioMessage.mockResolvedValue({
      message: {
        id: 'audio-empty-1',
        role: 'assistant',
        text: '',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
      transcription: { text: 'What is this painting?' },
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ audioUri: 'file://voice.m4a' });
    });

    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
    // EARS-9 — the optimistic user bubble still carries the transcription.
    const transcribed = result.current.messages.find(
      (m) => m.role === 'user' && m.text.includes('What is this painting?'),
    );
    expect(transcribed).toBeDefined();
  });

  it('AC-4 — audio whitespace-only text adds no assistant bubble', async () => {
    mockPostAudioMessage.mockResolvedValue({
      message: {
        id: 'audio-ws-1',
        role: 'assistant',
        text: '   ',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ audioUri: 'file://voice.m4a' });
    });

    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
  });

  it('AC-7 — audio non-blank text renders the bubble normally (happy path, no regression)', async () => {
    mockPostAudioMessage.mockResolvedValue({
      message: {
        id: 'audio-happy-1',
        role: 'assistant',
        text: 'I heard your question about the painting.',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ audioUri: 'file://voice.m4a' });
    });

    const assistant = result.current.messages.find((m) => m.id === 'audio-happy-1');
    expect(assistant).toBeDefined();
    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
  });

  // ── Cache (low-data hit) ────────────────────────────────────────────────────

  it('AC-5 — cache hit with empty answer adds no cached assistant bubble', async () => {
    mockIsLowData = true;
    mockGetSession.mockResolvedValue({
      session: { title: 'Museum Chat', museumName: 'Louvre', museumMode: true },
      messages: [],
    });
    mockCacheLookup.mockReturnValue({
      question: 'Who painted the Mona Lisa?',
      answer: '',
      metadata: null,
      museumId: 'Louvre',
      locale: 'en-US',
      cachedAt: Date.now(),
      source: 'prefetch' as const,
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'Who painted the Mona Lisa?' });
    });

    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
  });

  it('AC-5 — cache hit with whitespace answer adds no cached assistant bubble', async () => {
    mockIsLowData = true;
    mockGetSession.mockResolvedValue({
      session: { title: 'Museum Chat', museumName: 'Louvre', museumMode: true },
      messages: [],
    });
    mockCacheLookup.mockReturnValue({
      question: 'Tell me about this',
      answer: '   ',
      metadata: null,
      museumId: 'Louvre',
      locale: 'en-US',
      cachedAt: Date.now(),
      source: 'prefetch' as const,
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'Tell me about this' });
    });

    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
  });

  // ── History-load (session reload) ───────────────────────────────────────────

  it('AC-6 — history-load with an empty assistant message renders no blank bubble', async () => {
    mockGetSession.mockResolvedValue({
      session: { title: 'Reloaded', museumName: 'Louvre', museumMode: true },
      messages: [
        {
          id: 'hist-user-1',
          role: 'user',
          text: 'Hi there',
          createdAt: new Date('2026-05-26T09:00:00.000Z').toISOString(),
          imageRef: null,
          image: null,
          metadata: null,
        },
        {
          id: 'hist-assistant-empty',
          role: 'assistant',
          text: '',
          createdAt: new Date('2026-05-26T09:00:05.000Z').toISOString(),
          imageRef: null,
          image: null,
          metadata: null,
        },
        {
          id: 'hist-assistant-ok',
          role: 'assistant',
          text: 'A real answer.',
          createdAt: new Date('2026-05-26T09:00:10.000Z').toISOString(),
          imageRef: null,
          image: null,
          metadata: null,
        },
      ],
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // The empty assistant bubble must not appear; the good one (and the user) stay.
    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
    expect(result.current.messages.find((m) => m.id === 'hist-assistant-ok')).toBeDefined();
    expect(result.current.messages.find((m) => m.id === 'hist-user-1')).toBeDefined();
  });

  it('AC-6 — history-load with a null assistant message renders no blank bubble', async () => {
    mockGetSession.mockResolvedValue({
      session: { title: 'Reloaded null', museumName: 'Louvre', museumMode: true },
      messages: [
        {
          id: 'hist-user-2',
          role: 'user',
          text: 'Second question',
          createdAt: new Date('2026-05-26T11:00:00.000Z').toISOString(),
          imageRef: null,
          image: null,
          metadata: null,
        },
        {
          id: 'hist-assistant-null',
          role: 'assistant',
          text: null,
          createdAt: new Date('2026-05-26T11:00:05.000Z').toISOString(),
          imageRef: null,
          image: null,
          metadata: null,
        },
      ],
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(blankAssistantBubbles(result.current.messages)).toHaveLength(0);
    expect(result.current.messages.find((m) => m.id === 'hist-user-2')).toBeDefined();
  });
});
