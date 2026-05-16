/**
 * R1 RED — SubmitPaywallInterestUseCase (T1.5).
 *
 * Pins R1 §1 R19/R20/R21/R22/R23 + §3.9 D9 down BEFORE implementation :
 *  - Happy path → notifier.subscribe called ONCE with normalized email AND
 *    `source: 'paywall_premium_interest'` (R19 metadata differentiation).
 *  - Missing consent → 400, notifier NOT called (R22 defense-in-depth).
 *  - Invalid email → 400, notifier NOT called.
 *  - Honeypot triggered → silent drop (R23 — resolves without notifying,
 *    mirror R3 R10).
 *  - Noop notifier outcome → use case still resolves (R20 — Brevo creds
 *    absent → 202 anyway).
 *  - Structured log `paywall_email_captured` emitted with
 *    `{requestId, emailDomain, brevoOutcome}` ; full email NEVER logged
 *    (R21 PII discipline, mirror R3 R17).
 *
 * MUST FAIL at baseline `cd7e22bc` —
 * `@modules/leads/useCase/submitPaywallInterest.useCase` does not exist.
 */
import { SubmitPaywallInterestUseCase } from '@modules/leads/useCase/submitPaywallInterest.useCase';
import { logger } from '@shared/logger/logger';

import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';

import type {
  BetaSignupNotifier,
  BetaSignupOutcome,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

describe('SubmitPaywallInterestUseCase (R1 §1 R19-R23)', () => {
  const subscribe = jest.fn<
    Promise<{ outcome: BetaSignupOutcome } | undefined>,
    [Parameters<BetaSignupNotifier['subscribe']>[0]]
  >();
  const notifier: BetaSignupNotifier = { subscribe };
  // Cast through the public contract — keeps `as any` out of the ratchet
  // while leaving TypeScript honest about the missing module at HEAD.
  const useCase = new (SubmitPaywallInterestUseCase as new (n: BetaSignupNotifier) => {
    execute(input: {
      email: string;
      consent: boolean;
      website?: string;
      ip?: string;
      requestId?: string;
      userAgent?: string;
    }): Promise<void>;
  })(notifier);

  beforeEach(() => {
    subscribe.mockReset();
    subscribe.mockResolvedValue({ outcome: 'subscribed' });
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── R19 source differentiation ───────────────────────────────────────

  it("R19: forwards source='paywall_premium_interest' to the notifier", async () => {
    await useCase.execute({
      ...makePaywallInterestPayload({ email: 'free-tier@example.com' }),
      ip: '127.0.0.1',
      requestId: 'req-paywall-1',
    });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'free-tier@example.com',
        consent: true,
        source: 'paywall_premium_interest',
      }),
    );
  });

  it('trims + lowercases email (defense-in-depth)', async () => {
    await useCase.execute({
      ...makePaywallInterestPayload({ email: '  FREE-TIER@EXAMPLE.COM  ' }),
    });
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'free-tier@example.com' }),
    );
  });

  // ── R22 consent / email validation ───────────────────────────────────

  it('R22: rejects when consent is false', async () => {
    await expect(
      useCase.execute(makePaywallInterestPayload({ consent: false as unknown as true })),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('R22: rejects invalid email', async () => {
    await expect(
      useCase.execute(makePaywallInterestPayload({ email: 'not-an-email' })),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(subscribe).not.toHaveBeenCalled();
  });

  // ── R23 honeypot silent drop ─────────────────────────────────────────

  it('R23: honeypot triggered → resolves without notifying (mirror R3 R10)', async () => {
    await expect(
      useCase.execute(makePaywallInterestPayload({ website: 'https://spam.example.com' })),
    ).resolves.toBeUndefined();
    expect(subscribe).not.toHaveBeenCalled();
  });

  // ── R20 noop notifier fallback ───────────────────────────────────────

  it('R20: notifier resolves with outcome=noop → use case still resolves', async () => {
    subscribe.mockResolvedValueOnce({ outcome: 'noop' });
    await expect(useCase.execute(makePaywallInterestPayload())).resolves.toBeUndefined();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  // ── R21 structured log + PII discipline ──────────────────────────────

  it('R21: logs paywall_email_captured with requestId+emailDomain+brevoOutcome, no full email', async () => {
    const infoSpy = jest.spyOn(logger, 'info');
    subscribe.mockResolvedValueOnce({ outcome: 'subscribed' });

    await useCase.execute({
      ...makePaywallInterestPayload({ email: 'someone-secret@example.com' }),
      requestId: 'req-paywall-logs',
    });

    const captured = infoSpy.mock.calls.filter((c) => c[0] === 'paywall_email_captured');
    expect(captured).toHaveLength(1);
    const [, payload] = captured[0] as [string, Record<string, unknown>];
    expect(payload).toEqual(
      expect.objectContaining({
        requestId: 'req-paywall-logs',
        emailDomain: 'example.com',
        brevoOutcome: 'subscribed',
      }),
    );
    // PII discipline — full email value MUST NOT appear in the structured log.
    expect(JSON.stringify(payload)).not.toContain('someone-secret@example.com');
    expect(JSON.stringify(payload)).not.toContain('someone-secret');
  });
});
