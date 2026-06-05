/**
 * RUN_ID 2026-06-01-weak-net-idempotency — phase RED (UFR-022).
 *
 * W1-IDEM-05 (FE / chatApi) — `postMessage` MUST attach the OPTIONAL
 * `idempotencyKey` as an `Idempotency-Key` HTTP header so the backend dedup
 * layer can collapse a replayed send (spec R5):
 *   - JSON branch (text-only) → header present when `idempotencyKey` is set;
 *   - multipart branch (imageUri) → header present when `idempotencyKey` is set;
 *   - header OMITTED when `idempotencyKey` is unset (no break to the live send
 *     path — `PostMessageParams.idempotencyKey` is optional).
 *
 * RED expectation: `PostMessageParams` has no `idempotencyKey` field
 * (`send.ts:20-37`) and `postMessage` sets only `X-Data-Mode` (`send.ts:81`),
 * so no `Idempotency-Key` header is ever emitted → assertions fail → exits ≠ 0.
 * The unset-case assertion already passes today, pinning the no-regression
 * contract for the live path.
 *
 * Run scope (FE): npx jest idempotency
 */
import '@/__tests__/helpers/test-utils';

import { makePostMessageResponse } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockHttpRequest = jest.fn<Promise<unknown>, [string, Record<string, unknown>?]>();

jest.mock('@/shared/api/httpRequest', () => ({
  httpRequest: (...args: unknown[]) =>
    mockHttpRequest(args[0] as string, args[1] as Record<string, unknown>),
}));

jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  getAccessToken: () => 'test-access-token',
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  getApiBaseUrl: () => 'https://api.test.com',
  getLocale: () => 'en-US',
}));

import { chatApi } from '@/features/chat/infrastructure/chatApi';

// ── Helpers ──────────────────────────────────────────────────────────────────

const headersOf = (callIndex = 0): Record<string, string> => {
  const options = mockHttpRequest.mock.calls[callIndex]?.[1];
  return (options?.headers as Record<string, string> | undefined) ?? {};
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('chatApi.postMessage — Idempotency-Key header (W1-IDEM-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHttpRequest.mockResolvedValue(makePostMessageResponse());
  });

  it('attaches Idempotency-Key on the JSON (text-only) branch when idempotencyKey is set', async () => {
    await chatApi.postMessage({
      sessionId: 'sess-1',
      text: 'Hello',
      idempotencyKey: 'offline-123',
    });

    expect(headersOf()).toEqual(expect.objectContaining({ 'Idempotency-Key': 'offline-123' }));
  });

  it('attaches Idempotency-Key on the multipart (image) branch when idempotencyKey is set', async () => {
    await chatApi.postMessage({
      sessionId: 'sess-1',
      text: 'What is this?',
      imageUri: '/path/to/photo.jpg',
      idempotencyKey: 'offline-456',
    });

    const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body;
    expect(callBody).toBeInstanceOf(FormData);
    expect(headersOf()).toEqual(expect.objectContaining({ 'Idempotency-Key': 'offline-456' }));
  });

  it('omits the Idempotency-Key header when idempotencyKey is unset (live send path unchanged)', async () => {
    await chatApi.postMessage({
      sessionId: 'sess-1',
      text: 'Hello, no key',
    });

    expect(headersOf()).not.toHaveProperty('Idempotency-Key');
  });
});
