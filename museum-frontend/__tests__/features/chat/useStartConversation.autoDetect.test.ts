/**
 * W3 — Auto-detect on session-create.
 *
 * Asserts spec R11/R12/R14 wiring on `useStartConversation`:
 *
 *   - autoDetectMuseum=true + museumId absent + GPS granted →
 *     calls museumApi.detectMuseum.
 *   - confidence > 0.8 → session created with museumId/museumName/museumMode=true (R12).
 *   - confidence <= 0.5 → navigates to the museum picker, no session created (R14).
 *   - confidence ∈ (0.5, 0.8] → navigates to the museum picker (R14 hybrid).
 *   - detectMuseum rejects → navigates to picker (R14).
 *   - status !== 'granted' → navigates to picker (R14).
 *   - autoDetectMuseum=false (default) → NO detect call; legacy behaviour preserved.
 */

import { renderHook, act } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { makeCreateSessionResponse } from '@/__tests__/helpers/factories/session.factories';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

const mockCreateSession = jest.fn();
jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
  },
}));

jest.mock('@/features/settings/infrastructure/runtimeSettingsStore', () => ({
  useRuntimeSettingsStore: {
    getState: () => ({ defaultLocale: 'en-US', defaultMuseumMode: false }),
  },
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

const mockUseLocation = jest.fn();
jest.mock('@/features/museum/application/useLocation', () => ({
  useLocation: () => mockUseLocation(),
}));

const mockDetectMuseum = jest.fn<Promise<unknown>, [unknown]>();
jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: {
    detectMuseum: (params: unknown) => mockDetectMuseum(params),
  },
}));

const PICKER_ROUTE = '/(stack)/museums-picker';

describe('useStartConversation — autoDetectMuseum (W3 R11/R12/R14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocation.mockReturnValue({
      latitude: 48.8606,
      longitude: 2.3376,
      status: 'granted',
      precision: 'fresh',
      error: null,
    });
  });

  it('calls museumApi.detectMuseum when autoDetectMuseum=true, no museumId, GPS granted', async () => {
    mockDetectMuseum.mockResolvedValue({
      museumId: 7,
      confidence: 0.95,
      distance: 30,
      name: 'Louvre',
    });
    mockCreateSession.mockResolvedValue(makeCreateSessionResponse());

    const { result } = renderHook(() => useStartConversation());
    await act(async () => {
      await result.current.startConversation({ autoDetectMuseum: true });
    });

    expect(mockDetectMuseum).toHaveBeenCalledTimes(1);
    expect(mockDetectMuseum).toHaveBeenCalledWith({ lat: 48.8606, lng: 2.3376 });
  });

  it('R12 — confidence > 0.8 → silent auto-set museumId + museumMode=true', async () => {
    mockDetectMuseum.mockResolvedValue({
      museumId: 7,
      confidence: 0.95,
      distance: 30,
      name: 'Louvre',
    });
    mockCreateSession.mockResolvedValue(makeCreateSessionResponse());

    const { result } = renderHook(() => useStartConversation());
    await act(async () => {
      await result.current.startConversation({ autoDetectMuseum: true });
    });

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        museumId: 7,
        museumName: 'Louvre',
        museumMode: true,
      }),
    );
  });

  it('R14 — confidence <= 0.5 → navigate to picker, NO session created', async () => {
    mockDetectMuseum.mockResolvedValue({
      museumId: 99,
      confidence: 0.4,
      distance: 300,
      name: 'Far museum',
    });

    const { result } = renderHook(() => useStartConversation());
    await act(async () => {
      await result.current.startConversation({ autoDetectMuseum: true });
    });

    expect(router.push).toHaveBeenCalledWith(PICKER_ROUTE);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('R14 hybrid — confidence ∈ (0.5, 0.8] → navigate to picker, NO session created', async () => {
    mockDetectMuseum.mockResolvedValue({
      museumId: 42,
      confidence: 0.6,
      distance: 200,
      name: "Musée d'Orsay",
    });

    const { result } = renderHook(() => useStartConversation());
    await act(async () => {
      await result.current.startConversation({ autoDetectMuseum: true });
    });

    expect(router.push).toHaveBeenCalledWith(PICKER_ROUTE);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('R14 — detectMuseum rejects → navigate to picker', async () => {
    mockDetectMuseum.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useStartConversation());
    await act(async () => {
      await result.current.startConversation({ autoDetectMuseum: true });
    });

    expect(router.push).toHaveBeenCalledWith(PICKER_ROUTE);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('R14 — GPS status !== granted → navigate to picker, NO detect call', async () => {
    mockUseLocation.mockReturnValue({
      latitude: null,
      longitude: null,
      status: 'denied',
      precision: null,
      error: null,
    });

    const { result } = renderHook(() => useStartConversation());
    await act(async () => {
      await result.current.startConversation({ autoDetectMuseum: true });
    });

    expect(mockDetectMuseum).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith(PICKER_ROUTE);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('autoDetectMuseum default → NO detect call, legacy behaviour', async () => {
    mockCreateSession.mockResolvedValue(makeCreateSessionResponse());

    const { result } = renderHook(() => useStartConversation());
    await act(async () => {
      await result.current.startConversation({ intent: 'default' });
    });

    expect(mockDetectMuseum).not.toHaveBeenCalled();
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('autoDetectMuseum=true + explicit museumId → skip detect, use provided museum', async () => {
    mockCreateSession.mockResolvedValue(makeCreateSessionResponse());

    const { result } = renderHook(() => useStartConversation());
    await act(async () => {
      await result.current.startConversation({
        autoDetectMuseum: true,
        museumId: 999,
        museumName: 'Manual',
      });
    });

    expect(mockDetectMuseum).not.toHaveBeenCalled();
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ museumId: 999, museumName: 'Manual' }),
    );
  });
});
