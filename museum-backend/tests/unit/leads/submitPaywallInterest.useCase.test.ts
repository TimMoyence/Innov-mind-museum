import { SubmitPaywallInterestUseCase } from '@modules/leads/useCase/submitPaywallInterest.useCase';
import { logger } from '@shared/logger/logger';

import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type {
  BetaSignupNotifier,
  BetaSignupOutcome,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

type PaywallUseCaseCtor = new (
  notifier: BetaSignupNotifier,
  repository: ILeadRepository,
) => {
  execute(input: {
    email: string;
    consent: boolean;
    website?: string;
    ip?: string;
    requestId?: string;
    userAgent?: string;
  }): Promise<void>;
};

describe('SubmitPaywallInterestUseCase (R1 §1 R19-R23)', () => {
  const subscribe = jest.fn<
    Promise<{ outcome: BetaSignupOutcome } | undefined>,
    [Parameters<BetaSignupNotifier['subscribe']>[0]]
  >();
  const notifier: BetaSignupNotifier = { subscribe };
  const Ctor = SubmitPaywallInterestUseCase as unknown as PaywallUseCaseCtor;
  const useCase = new Ctor(notifier, makeStubLeadRepository());

  beforeEach(() => {
    subscribe.mockReset();
    subscribe.mockResolvedValue({ outcome: 'subscribed' });
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('R23: honeypot triggered → resolves without notifying (mirror R3 R10)', async () => {
    await expect(
      useCase.execute(makePaywallInterestPayload({ website: 'https://spam.example.com' })),
    ).resolves.toBeUndefined();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('R20: notifier resolves with outcome=noop → use case still resolves', async () => {
    subscribe.mockResolvedValueOnce({ outcome: 'noop' });
    await expect(useCase.execute(makePaywallInterestPayload())).resolves.toBeUndefined();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

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
    expect(JSON.stringify(payload)).not.toContain('someone-secret@example.com');
    expect(JSON.stringify(payload)).not.toContain('someone-secret');
  });
});
