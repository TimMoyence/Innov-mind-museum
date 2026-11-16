import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';
import { SubmitPaywallInterestUseCase } from '@modules/leads/useCase/submitPaywallInterest.useCase';
import { logger } from '@shared/logger/logger';

import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';
import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';
import {
  makeStubLeadRepository,
  type StubLeadRepository,
} from '../../helpers/leads/stubLeadRepository';

import type { B2bLeadNotifier } from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import type { BetaSignupNotifier } from '@modules/leads/domain/ports/beta-signup-notifier.port';

type LeadType = 'b2b' | 'beta' | 'paywall';

const send = jest.fn<Promise<unknown>, []>();

const submit = (type: LeadType, repository: StubLeadRepository): Promise<void> => {
  const b2b: B2bLeadNotifier = { notify: () => send() as Promise<void> };
  const beta = { subscribe: () => send() } as unknown as BetaSignupNotifier;
  if (type === 'b2b') {
    return new SubmitB2bLeadUseCase(b2b, repository).execute(makeB2bLeadPayload());
  }
  if (type === 'beta') {
    return new SubmitBetaSignupUseCase(beta, repository).execute(makeBetaSignupPayload());
  }
  return new SubmitPaywallInterestUseCase(beta, repository).execute({
    ...makePaywallInterestPayload({ email: 'visitor@example.org' }),
    requestId: 'req-1',
  });
};

const TYPES: LeadType[] = ['b2b', 'beta', 'paywall'];

describe('LIVRAISON · a persisted lead is delivered once, or marked failed without failing the request', () => {
  let info: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    send.mockReset();
    info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(TYPES)(
    'LIVRAISON · %s : a delivered lead is marked delivered and logged',
    async (type) => {
      send.mockResolvedValue({ outcome: 'subscribed' });
      const repository = makeStubLeadRepository();

      await submit(type, repository);

      const leadId = repository.inserted[0]?.id;
      expect(repository.delivered).toEqual([leadId]);
      expect(repository.failed).toEqual([]);
      expect(info).toHaveBeenCalledWith('lead_delivered', { leadId, type });
      expect(warn).not.toHaveBeenCalledWith('lead_delivery_failed', expect.anything());
    },
  );

  it.each(TYPES)(
    'LIVRAISON · %s : a failed delivery is marked failed with a sanitized error and logged, the request still succeeds',
    async (type) => {
      send.mockRejectedValue(new TypeError('upstream refused'));
      const repository = makeStubLeadRepository();

      await expect(submit(type, repository)).resolves.toBeUndefined();

      const leadId = repository.inserted[0]?.id;
      expect(repository.delivered).toEqual([]);
      expect(repository.failed).toEqual([{ id: leadId, lastError: expect.any(String) }]);
      expect(repository.failed[0]?.lastError).toContain('upstream refused');
      expect(info).not.toHaveBeenCalledWith('lead_delivered', expect.anything());
      expect(warn).toHaveBeenCalledWith('lead_delivery_failed', {
        leadId,
        type,
        ...(type === 'paywall' ? { emailDomain: 'example.org' } : {}),
        errorClass: 'TypeError',
      });
    },
  );

  it.each(TYPES)(
    'LIVRAISON · %s : a failure to mark the lead delivered marks it failed instead',
    async (type) => {
      send.mockResolvedValue(undefined);
      const repository = makeStubLeadRepository();
      repository.markDelivered = () => Promise.reject(new Error('db down'));

      await expect(submit(type, repository)).resolves.toBeUndefined();

      expect(repository.failed).toHaveLength(1);
      expect(repository.failed[0]?.lastError).toContain('db down');
    },
  );

  it('LIVRAISON · paywall : the captured email is logged with the provider outcome only once delivered', async () => {
    send.mockResolvedValue({ outcome: 'duplicate' });
    await submit('paywall', makeStubLeadRepository());
    expect(info).toHaveBeenCalledWith('paywall_email_captured', {
      requestId: 'req-1',
      emailDomain: 'example.org',
      brevoOutcome: 'duplicate',
    });

    info.mockClear();
    send.mockResolvedValue(undefined);
    await submit('paywall', makeStubLeadRepository());
    expect(info).toHaveBeenCalledWith('paywall_email_captured', {
      requestId: 'req-1',
      emailDomain: 'example.org',
      brevoOutcome: 'unknown',
    });

    info.mockClear();
    send.mockRejectedValue(new Error('boom'));
    await submit('paywall', makeStubLeadRepository());
    expect(info).not.toHaveBeenCalledWith('paywall_email_captured', expect.anything());
  });
});
