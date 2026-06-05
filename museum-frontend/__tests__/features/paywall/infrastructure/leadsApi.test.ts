/**
 * C1 Red — leadsApi infra service.
 *
 * Cluster C1 (hexagonal violations, 2026-05-23-frontend-dry-audit) — the
 * `features/paywall/ui/QuotaUpsellModal.tsx` component currently imports
 * `httpClient` directly (UI → transport, the worst kind of hexagonal layering
 * violation). Plan T2.7 extracts the POST to
 * `features/paywall/infrastructure/leadsApi.ts` exposed as
 * `leadsApi.submitPaywallInterest(payload)`.
 *
 * THIS TEST FILE IS RED-PHASE: it must FAIL because
 * `@/features/paywall/infrastructure/leadsApi` does not yet exist.
 *
 * Contract:
 *  - POST `/api/leads/paywall-interest`.
 *  - Body shape preserved byte-for-byte: `{ email, consent: true, website }`.
 *    `website` is the honeypot (RGPD Art. 7 enforced by `consent: true` literal).
 *  - Service returns void / passthrough — the component flips error state on
 *    any rejection.
 */

const mockHttpPost = jest.fn();
jest.mock('@/shared/infrastructure/httpClient', () => ({
  httpClient: {
    post: (...args: unknown[]) => mockHttpPost(...args),
  },
}));

// eslint-disable-next-line import/order, import/first -- mock-first per Jest hoisting rules
import { leadsApi } from '@/features/paywall/infrastructure/leadsApi';

describe('leadsApi (C1 hexagonal façade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts to /api/leads/paywall-interest', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: undefined });

    await leadsApi.submitPaywallInterest({
      email: 'user@test.com',
      consent: true,
      website: '',
    });

    expect(mockHttpPost).toHaveBeenCalledWith('/api/leads/paywall-interest', expect.any(Object));
  });

  it('preserves the body shape { email, consent: true, website } byte-for-byte', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: undefined });
    const payload = {
      email: 'visitor@bordeaux.example',
      consent: true as const,
      website: '',
    };

    await leadsApi.submitPaywallInterest(payload);

    const [, body] = mockHttpPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toEqual(payload);
  });

  it('forwards the honeypot website value untouched (bot-trap defense)', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: undefined });

    await leadsApi.submitPaywallInterest({
      email: 'real@user.com',
      consent: true,
      website: 'http://bot.example',
    });

    const [, body] = mockHttpPost.mock.calls[0] as [string, { website: string }];
    expect(body.website).toBe('http://bot.example');
  });

  it('propagates axios errors untouched (component flips state="error" on reject)', async () => {
    const axiosError = { response: { status: 500 } };
    mockHttpPost.mockRejectedValueOnce(axiosError);

    await expect(
      leadsApi.submitPaywallInterest({ email: 'x@y.z', consent: true, website: '' }),
    ).rejects.toBe(axiosError);
  });
});
