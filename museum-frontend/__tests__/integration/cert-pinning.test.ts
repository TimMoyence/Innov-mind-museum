// Integration test for the cert-pinning init flow.
//
// V1 activation status (2026-05-14):
//   - `EXPO_PUBLIC_CERT_PINNING_ENABLED=true` ships in `.env.production`.
//   - `PROD_SPKI_HASHES` in `shared/config/cert-pinning.ts` carries the
//     real captures against `musaium.com:443` (leaf + LE E8 intermediate).
//
// This suite exercises the JS init flow with the native module mocked
// — it is NOT a substitute for the real-network end-to-end smoke test
// that must run on a physical device against the prod TLS chain
// (documented in `museum-frontend/docs/CERT_PINNING_RUNBOOK.md` §Smoke).
//
// To convert to a real-network E2E, swap the `react-native-ssl-public-key-pinning`
// mock for the actual native module on a TestContainer / device, then
// assert against `addSslPinningErrorListener` real callbacks.
jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureMessage: jest.fn(),
}));

const mockInitializeSslPinning = jest.fn().mockResolvedValue(undefined);
// D7 mock-builder: return `{ remove: jest.fn() }` so the green-phase
// `disposeCertPinning` impl can call `.remove()` on the captured
// EmitterSubscription. PATTERNS §2 lines 72-84 / §7 lines 200-207.
// Setup-line change only — the 3 existing assertions stay byte-identical.
const mockAddSslPinningErrorListener = jest.fn().mockReturnValue({ remove: jest.fn() });
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
    const outcome = await initCertPinning({ apiBaseUrl: 'https://musaium.com' });
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
      apiBaseUrl: 'https://musaium.com',
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
      apiBaseUrl: 'https://musaium.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storageImpl: inMemoryStorage(),
    });

    expect(outcome).toEqual({ kind: 'skipped', reason: 'kill-switch-disabled' });
    expect(mockInitializeSslPinning).not.toHaveBeenCalled();
  });
});
