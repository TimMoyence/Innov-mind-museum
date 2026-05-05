// Integration placeholder for the cert-pinning Phase 2 scaffold.
//
// V1 ships with `EXPO_PUBLIC_CERT_PINNING_ENABLED=false`, so the real
// pinning behaviour cannot be validated end-to-end without (a) a staging
// TLS endpoint with known SPKI hashes wired into `cert-pinning.ts` and
// (b) a real device or simulator that exercises the native module.
//
// Until both are in place, this file documents the **expected** end-to-end
// behaviour as executable assertions against the public init API. The
// underlying `react-native-ssl-public-key-pinning` is mocked so the suite
// runs under the standard Jest harness — it is NOT a substitute for the
// real-network E2E tracked under ADR-016 Phase 2 deliverable
// "E2E validation under museum-frontend/__tests__/integration/cert-pinning.test.ts".
//
// When the activation work lands, replace the mock with a TestContainer-style
// HTTPS endpoint and assert against `addSslPinningErrorListener` real callbacks.
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

import { initCertPinning } from '@/shared/infrastructure/cert-pinning-init';

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

describe('cert-pinning integration (mocked native module)', () => {
  beforeEach(() => {
    mockInitializeSslPinning.mockClear();
    mockAddSslPinningErrorListener.mockClear();
    mockIsSslPinningAvailable.mockReturnValue(true);
    delete process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED;
  });

  it('V1 default boot — env flag absent → init is a no-op (no SDK calls)', async () => {
    const outcome = await initCertPinning({ apiBaseUrl: 'https://api.musaium.app' });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'env-disabled' });
    expect(mockInitializeSslPinning).not.toHaveBeenCalled();
    expect(mockAddSslPinningErrorListener).not.toHaveBeenCalled();
  });

  it('Post-activation boot — env flag true + open kill-switch → pinning is initialised exactly once', async () => {
    process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED = 'true';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pinningEnabled: true }),
    } as Response);

    const outcome = await initCertPinning({
      apiBaseUrl: 'https://api.musaium.app',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storageImpl: inMemoryStorage(),
    });

    expect(outcome).toEqual({ kind: 'initialized', killSwitchSource: 'network' });
    expect(mockInitializeSslPinning).toHaveBeenCalledTimes(1);
    expect(mockAddSslPinningErrorListener).toHaveBeenCalledTimes(1);
  });

  it('Mass-mispin recovery — env flag true + kill-switch returns false → init is skipped (no pinning)', async () => {
    process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED = 'true';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pinningEnabled: false }),
    } as Response);

    const outcome = await initCertPinning({
      apiBaseUrl: 'https://api.musaium.app',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storageImpl: inMemoryStorage(),
    });

    expect(outcome).toEqual({ kind: 'skipped', reason: 'kill-switch-disabled' });
    expect(mockInitializeSslPinning).not.toHaveBeenCalled();
  });
});
