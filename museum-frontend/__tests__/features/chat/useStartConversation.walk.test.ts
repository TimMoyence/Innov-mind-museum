/**
 * Tests for walk-intent wiring in useStartConversation.
 *
 * Cases:
 *  1. Walk intent calls createSession with intent: 'walk' AND coordinates AND museumId.
 *  2. Walk intent navigates with ?intent=walk in the URL.
 *  3. Walk intent does NOT push the deprecated WALK_COMPOSER_ROUTE.
 *  4. Default intent still works (smoke test).
 */

import { renderHook, act } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { makeCreateSessionResponse } from '@/__tests__/helpers/factories/session.factories';

// ── expo-router ───────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

// ── chatApi ───────────────────────────────────────────────────────────────────
const mockCreateSession = jest.fn();
jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
  },
}));

// ── runtimeSettingsStore ──────────────────────────────────────────────────────
jest.mock('@/features/settings/infrastructure/runtimeSettingsStore', () => ({
  useRuntimeSettingsStore: {
    getState: () => ({ defaultLocale: 'en-US', defaultMuseumMode: false }),
  },
}));

// ── Sentry (imported transitively via chatApi) ────────────────────────────────
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────

const WALK_COMPOSER_ROUTE = '/(stack)/walk-composer';

describe('useStartConversation — walk intent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls createSession with intent: walk, coordinates, and museumId', async () => {
    const sessionResponse = makeCreateSessionResponse();
    mockCreateSession.mockResolvedValueOnce(sessionResponse);

    const { result } = renderHook(() => useStartConversation());

    await act(async () => {
      await result.current.startConversation({
        intent: 'walk',
        skipSettings: true,
        museumId: 42,
        coordinates: { lat: 48.8584, lng: 2.2945 },
        museumMode: true,
      });
    });

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'walk',
        museumId: 42,
        coordinates: { lat: 48.8584, lng: 2.2945 },
      }),
    );
  });

  it('navigates to /chat/[id]?intent=walk after session creation', async () => {
    const sessionResponse = makeCreateSessionResponse();
    const sessionId = sessionResponse.session.id;
    mockCreateSession.mockResolvedValueOnce(sessionResponse);

    const { result } = renderHook(() => useStartConversation());

    await act(async () => {
      await result.current.startConversation({ intent: 'walk', skipSettings: true });
    });

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(`/(stack)/chat/${sessionId}?intent=walk`);
  });

  it('does NOT push the deprecated WALK_COMPOSER_ROUTE', async () => {
    const sessionResponse = makeCreateSessionResponse();
    mockCreateSession.mockResolvedValueOnce(sessionResponse);

    const { result } = renderHook(() => useStartConversation());

    await act(async () => {
      await result.current.startConversation({ intent: 'walk', skipSettings: true });
    });

    expect(router.push).toHaveBeenCalled();
    const allCalls = (router.push as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(allCalls.every((url) => !url.includes(WALK_COMPOSER_ROUTE))).toBe(true);
  });

  it('default intent creates session without intent in URL', async () => {
    const sessionResponse = makeCreateSessionResponse();
    const sessionId = sessionResponse.session.id;
    mockCreateSession.mockResolvedValueOnce(sessionResponse);

    const { result } = renderHook(() => useStartConversation());

    await act(async () => {
      await result.current.startConversation({ intent: 'default', skipSettings: true });
    });

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(`/(stack)/chat/${sessionId}`);
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ intent: 'default' }));
  });

  it('uses default intent when options is omitted entirely', async () => {
    const sessionResponse = makeCreateSessionResponse();
    const sessionId = sessionResponse.session.id;
    mockCreateSession.mockResolvedValueOnce(sessionResponse);

    const { result } = renderHook(() => useStartConversation());

    await act(async () => {
      await result.current.startConversation();
    });

    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ intent: 'default' }));
    expect(router.push).toHaveBeenCalledWith(`/(stack)/chat/${sessionId}`);
    const lastNav = (router.push as jest.Mock).mock.calls.at(-1)?.[0] as string | undefined;
    expect(lastNav).not.toContain('intent=');
  });
});
