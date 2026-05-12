/**
 * Tests for `useVoiceDisclosure` — the EU AI Act Article 50 voice-disclosure
 * gate hook. The hook reads/writes to `expo-secure-store`; we mock both the
 * native module and `reportError` so failures surface as assertions rather
 * than console noise.
 */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: jest.fn(),
}));

import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { useVoiceDisclosure } from '@/features/chat/hooks/useVoiceDisclosure';
import { reportError } from '@/shared/observability/errorReporting';

const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;
const mockedReport = reportError as jest.Mock;

beforeEach(() => {
  mockedGet.mockReset();
  mockedSet.mockReset();
  mockedReport.mockReset();
});

describe('useVoiceDisclosure', () => {
  it('reports shouldShowDisclosure=true once resolved when the session has never been acknowledged', async () => {
    mockedGet.mockResolvedValue(null);

    const { result } = renderHook(() => useVoiceDisclosure('session-1'));

    expect(result.current.isResolved).toBe(false);

    await waitFor(() => {
      expect(result.current.isResolved).toBe(true);
    });

    expect(result.current.isAcknowledged).toBe(false);
    expect(result.current.shouldShowDisclosure).toBe(true);
    expect(mockedGet).toHaveBeenCalledWith('musaium.voice.disclosure_acknowledged.session-1');
  });

  it('reports shouldShowDisclosure=false when the persisted flag says "true"', async () => {
    mockedGet.mockResolvedValue('true');

    const { result } = renderHook(() => useVoiceDisclosure('session-2'));

    await waitFor(() => {
      expect(result.current.isResolved).toBe(true);
    });

    expect(result.current.isAcknowledged).toBe(true);
    expect(result.current.shouldShowDisclosure).toBe(false);
  });

  it('falls back to "must show" and reports the error when SecureStore read fails', async () => {
    mockedGet.mockRejectedValue(new Error('keychain locked'));

    const { result } = renderHook(() => useVoiceDisclosure('session-3'));

    await waitFor(() => {
      expect(result.current.isResolved).toBe(true);
    });

    expect(result.current.shouldShowDisclosure).toBe(true);
    expect(mockedReport).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        component: 'useVoiceDisclosure',
        action: 'read',
        sessionId: 'session-3',
      }),
    );
  });

  it('persists the acknowledgement and flips the in-memory flag', async () => {
    mockedGet.mockResolvedValue(null);
    mockedSet.mockResolvedValue(undefined);

    const { result } = renderHook(() => useVoiceDisclosure('session-4'));

    await waitFor(() => {
      expect(result.current.isResolved).toBe(true);
    });

    await act(async () => {
      await result.current.acknowledge();
    });

    expect(result.current.isAcknowledged).toBe(true);
    expect(result.current.shouldShowDisclosure).toBe(false);
    expect(mockedSet).toHaveBeenCalledWith(
      'musaium.voice.disclosure_acknowledged.session-4',
      'true',
    );
  });

  it('sanitises sessionIds containing characters not allowed in iOS keychain keys', async () => {
    mockedGet.mockResolvedValue(null);
    mockedSet.mockResolvedValue(undefined);

    const { result } = renderHook(() => useVoiceDisclosure('foo/bar:baz qux'));

    await waitFor(() => {
      expect(result.current.isResolved).toBe(true);
    });

    expect(mockedGet).toHaveBeenCalledWith('musaium.voice.disclosure_acknowledged.foo_bar_baz_qux');

    await act(async () => {
      await result.current.acknowledge();
    });

    expect(mockedSet).toHaveBeenCalledWith(
      'musaium.voice.disclosure_acknowledged.foo_bar_baz_qux',
      'true',
    );
  });

  it('still flips the in-memory ack flag when SecureStore write fails so the user is never blocked', async () => {
    mockedGet.mockResolvedValue(null);
    mockedSet.mockRejectedValue(new Error('disk full'));

    const { result } = renderHook(() => useVoiceDisclosure('session-5'));

    await waitFor(() => {
      expect(result.current.isResolved).toBe(true);
    });

    await act(async () => {
      await result.current.acknowledge();
    });

    expect(result.current.isAcknowledged).toBe(true);
    expect(mockedReport).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        component: 'useVoiceDisclosure',
        action: 'write',
        sessionId: 'session-5',
      }),
    );
  });

  it('does not read SecureStore when sessionId is empty (treats it as "not ready")', () => {
    const { result } = renderHook(() => useVoiceDisclosure(''));

    expect(result.current.isResolved).toBe(false);
    expect(result.current.shouldShowDisclosure).toBe(false);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('re-reads SecureStore when the sessionId changes (per-session gate)', async () => {
    mockedGet.mockResolvedValueOnce('true').mockResolvedValueOnce(null);

    const { result, rerender } = renderHook(({ id }: { id: string }) => useVoiceDisclosure(id), {
      initialProps: { id: 'session-A' },
    });

    await waitFor(() => {
      expect(result.current.isResolved).toBe(true);
    });
    expect(result.current.isAcknowledged).toBe(true);

    rerender({ id: 'session-B' });

    await waitFor(() => {
      expect(result.current.isResolved).toBe(true);
    });
    expect(result.current.isAcknowledged).toBe(false);
    expect(result.current.shouldShowDisclosure).toBe(true);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
