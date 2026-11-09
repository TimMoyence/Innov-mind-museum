import '@/__tests__/helpers/test-utils';

jest.mock('@/shared/infrastructure/requestId', () => ({
  generateRequestId: () => 'mock-request-id',
}));

jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
}));

jest.mock('@/shared/infrastructure/apiConfig', () => ({
  resolveInitialApiBaseUrl: () => 'https://api.test.com',
}));

import {
  httpClient,
  setPaywallHandler,
  setAuthRefreshHandler,
  setUnauthorizedHandler,
} from '@/shared/infrastructure/httpClient';

interface QuotaInfo {
  tier: string;
  currentCount: number;
  limit: number;
  resetAt: string;
}

const QUOTA_BODY: QuotaInfo & { code: string } = {
  code: 'QUOTA_EXCEEDED',
  tier: 'free',
  currentCount: 3,
  limit: 3,
  resetAt: '2026-06-01T00:00:00.000Z',
};

class SyntheticAxiosError extends Error {
  response: { status: number; data: unknown };
  config: { url: string; method: string };
  constructor(status: number, data: unknown) {
    super(`synthetic ${String(status)}`);
    this.response = { status, data };
    this.config = { url: '/api/sessions', method: 'POST' };
  }
}

const requestWithStubbedResponse = async (status: number, data: unknown): Promise<unknown> => {
  return httpClient
    .request({
      url: '/api/sessions',
      method: 'POST',
      requiresAuth: true,
      adapter: () => Promise.reject(new SyntheticAxiosError(status, data)) as never,
    } as never)
    .then(
      () => null,
      (err: unknown) => err,
    );
};

describe('httpClient — 402 paywall interceptor (R1 §1 R24 + §3.7 D7)', () => {
  beforeEach(() => {
    setAuthRefreshHandler(null);
    setUnauthorizedHandler(null);
    setPaywallHandler(null);
  });

  it('R24: 402 + code=QUOTA_EXCEEDED → registered handler called once with payload', async () => {
    const handler = jest.fn();
    setPaywallHandler(handler);

    await requestWithStubbedResponse(402, QUOTA_BODY);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'free',
        currentCount: 3,
        limit: 3,
        resetAt: '2026-06-01T00:00:00.000Z',
      }),
    );
  });

  it('R24: 402 + QUOTA_EXCEEDED still propagates the error to .catch()', async () => {
    const handler = jest.fn();
    setPaywallHandler(handler);

    const err = await requestWithStubbedResponse(402, QUOTA_BODY);
    expect(err).toBeTruthy();
  });

  it('402 with different code (e.g. PAYMENT_REQUIRED_OTHER) → handler NOT called', async () => {
    const handler = jest.fn();
    setPaywallHandler(handler);

    await requestWithStubbedResponse(402, {
      code: 'PAYMENT_REQUIRED_OTHER',
      tier: 'free',
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('500 → handler NOT called', async () => {
    const handler = jest.fn();
    setPaywallHandler(handler);
    await requestWithStubbedResponse(500, { message: 'server down' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('429 (daily chat limit) → handler NOT called (N15 — 402 vs 429 separation)', async () => {
    const handler = jest.fn();
    setPaywallHandler(handler);
    await requestWithStubbedResponse(429, { code: 'DAILY_LIMIT_REACHED', limit: 100 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('handler=null → 402 response does not throw / no crash', async () => {
    setPaywallHandler(null);
    const err = await requestWithStubbedResponse(402, QUOTA_BODY);
    expect(err).toBeTruthy();
  });
});
