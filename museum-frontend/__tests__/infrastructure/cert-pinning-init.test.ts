jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureMessage: jest.fn(),
}));

const mockInitializeSslPinning = jest.fn().mockResolvedValue(undefined);
const mockAddSslPinningErrorListener = jest.fn();
const mockIsSslPinningAvailable = jest.fn().mockReturnValue(true);

jest.mock('react-native-ssl-public-key-pinning', () => ({
  initializeSslPinning: (...args: unknown[]) => mockInitializeSslPinning(...args),
  addSslPinningErrorListener: (...args: unknown[]) => mockAddSslPinningErrorListener(...args),
  isSslPinningAvailable: () => mockIsSslPinningAvailable(),
}));

import {
  FAIL_OPEN_STATE,
  KILL_SWITCH_CACHE_TTL_MS,
  parseKillSwitchPayload,
  type KillSwitchState,
} from '@/shared/config/cert-pinning';
import { initCertPinning, resolveKillSwitchState } from '@/shared/infrastructure/cert-pinning-init';

import type { storage } from '@/shared/infrastructure/storage';

const inMemoryStorage = (): typeof storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => Promise.resolve(map.get(k) ?? null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
      return Promise.resolve();
    },
    removeItem: (k: string) => {
      map.delete(k);
      return Promise.resolve();
    },
    getJSON: <T>(k: string) => {
      const raw = map.get(k);
      return Promise.resolve(raw ? (JSON.parse(raw) as T) : null);
    },
    setJSON: (k: string, v: unknown) => {
      map.set(k, JSON.stringify(v));
      return Promise.resolve();
    },
  };
};

beforeEach(() => {
  mockInitializeSslPinning.mockClear();
  mockAddSslPinningErrorListener.mockClear();
  mockIsSslPinningAvailable.mockReturnValue(true);
  delete process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED;
});

describe('parseKillSwitchPayload', () => {
  it('treats { pinningEnabled: true } as not-disabled', () => {
    expect(parseKillSwitchPayload({ pinningEnabled: true }).pinningDisabled).toBe(false);
  });

  it('treats { pinningEnabled: false } as disabled', () => {
    expect(parseKillSwitchPayload({ pinningEnabled: false }).pinningDisabled).toBe(true);
  });

  it('falls open on a malformed payload', () => {
    expect(parseKillSwitchPayload({ unrelated: 1 }).source).toBe('fail-open');
    expect(parseKillSwitchPayload(null).source).toBe('fail-open');
    expect(parseKillSwitchPayload('nope').source).toBe('fail-open');
  });
});

describe('resolveKillSwitchState', () => {
  it('returns fail-open when no apiBaseUrl is provided', async () => {
    const state = await resolveKillSwitchState({ storageImpl: inMemoryStorage() });
    expect(state).toEqual(FAIL_OPEN_STATE);
  });

  it('returns the network payload and caches it', async () => {
    const store = inMemoryStorage();
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pinningEnabled: false }),
    } as Response);

    const state = await resolveKillSwitchState({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storageImpl: store,
    });
    expect(state.pinningDisabled).toBe(true);
    expect(state.source).toBe('network');
    const cached = await store.getJSON<KillSwitchState>('cert-pinning.kill-switch.v1');
    expect(cached?.pinningDisabled).toBe(true);
  });

  it('returns fail-open on fetch failure (network error)', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('boom'));
    const state = await resolveKillSwitchState({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storageImpl: inMemoryStorage(),
    });
    expect(state).toEqual(FAIL_OPEN_STATE);
  });

  it('returns fail-open on a non-OK HTTP status', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    const state = await resolveKillSwitchState({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storageImpl: inMemoryStorage(),
    });
    expect(state).toEqual(FAIL_OPEN_STATE);
  });

  it('reuses a fresh cache entry without hitting the network', async () => {
    const store = inMemoryStorage();
    const fresh: KillSwitchState = {
      pinningDisabled: true,
      source: 'network',
      fetchedAt: new Date(Date.now() - KILL_SWITCH_CACHE_TTL_MS / 2).toISOString(),
    };
    await store.setJSON('cert-pinning.kill-switch.v1', fresh);
    const fetchImpl = jest.fn();

    const state = await resolveKillSwitchState({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storageImpl: store,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(state.source).toBe('cache');
    expect(state.pinningDisabled).toBe(true);
  });

  it('refetches when the cache entry is older than the TTL', async () => {
    const store = inMemoryStorage();
    const stale: KillSwitchState = {
      pinningDisabled: true,
      source: 'network',
      fetchedAt: new Date(Date.now() - KILL_SWITCH_CACHE_TTL_MS - 1).toISOString(),
    };
    await store.setJSON('cert-pinning.kill-switch.v1', stale);
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pinningEnabled: true }),
    } as Response);

    const state = await resolveKillSwitchState({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storageImpl: store,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(state.source).toBe('network');
    expect(state.pinningDisabled).toBe(false);
  });
});

describe('initCertPinning', () => {
  it('skips with reason env-disabled when the flag is unset', async () => {
    const result = await initCertPinning({ apiBaseUrl: 'https://api.example.test' });
    expect(result).toEqual({ kind: 'skipped', reason: 'env-disabled' });
    expect(mockInitializeSslPinning).not.toHaveBeenCalled();
  });

  it('skips with reason native-unavailable when the module is missing', async () => {
    process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED = 'true';
    mockIsSslPinningAvailable.mockReturnValue(false);
    const result = await initCertPinning({ apiBaseUrl: 'https://api.example.test' });
    expect(result).toEqual({ kind: 'skipped', reason: 'native-unavailable' });
    expect(mockInitializeSslPinning).not.toHaveBeenCalled();
  });

  it('skips with reason kill-switch-disabled when BE returns pinningEnabled: false', async () => {
    process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED = 'true';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pinningEnabled: false }),
    } as Response);
    const result = await initCertPinning({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storageImpl: inMemoryStorage(),
    });
    expect(result).toEqual({ kind: 'skipped', reason: 'kill-switch-disabled' });
    expect(mockInitializeSslPinning).not.toHaveBeenCalled();
  });

  it('initialises pinning when env is true, native is available, kill-switch is open', async () => {
    process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED = 'true';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pinningEnabled: true }),
    } as Response);
    const result = await initCertPinning({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storageImpl: inMemoryStorage(),
    });
    expect(result).toEqual({ kind: 'initialized', killSwitchSource: 'network' });
    expect(mockInitializeSslPinning).toHaveBeenCalledTimes(1);
    expect(mockAddSslPinningErrorListener).toHaveBeenCalledTimes(1);
  });

  it('initialises with fail-open when no apiBaseUrl is provided (and env is true)', async () => {
    process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED = 'true';
    const result = await initCertPinning({
      apiBaseUrl: '',
      storageImpl: inMemoryStorage(),
    });
    expect(result).toEqual({ kind: 'initialized', killSwitchSource: 'fail-open' });
    expect(mockInitializeSslPinning).toHaveBeenCalledTimes(1);
  });
});
