import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';
import { SubmitPaywallInterestUseCase } from '@modules/leads/useCase/submitPaywallInterest.useCase';
import { SubmitSupportContactUseCase } from '@modules/support/useCase/contact/submitSupportContact.useCase';
import { logger } from '@shared/logger/logger';

import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';
import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';
import {
  makeStubLeadRepository,
  type StubLeadRepository,
} from '../../helpers/leads/stubLeadRepository';
import { makeSupportContactInput } from '../../helpers/support/supportContact.fixtures';

import type { BetaSignupNotifier } from '@modules/leads/domain/ports/beta-signup-notifier.port';

type Form = 'b2b_lead' | 'beta_signup' | 'paywall_interest' | 'support_contact';

const sent = jest.fn<Promise<undefined>, []>();

const submit = (
  form: Form,
  signals: { website?: string; fillMs?: number; ip?: string },
  repository: StubLeadRepository,
): Promise<void> => {
  const extra = { ...signals, requestId: 'req-9' };
  const beta = { subscribe: () => sent() } as unknown as BetaSignupNotifier;
  if (form === 'b2b_lead') {
    return new SubmitB2bLeadUseCase({ notify: () => sent() }, repository).execute({
      ...makeB2bLeadPayload(),
      ...extra,
    });
  }
  if (form === 'beta_signup') {
    return new SubmitBetaSignupUseCase(beta, repository).execute({
      ...makeBetaSignupPayload(),
      ...extra,
    });
  }
  if (form === 'paywall_interest') {
    return new SubmitPaywallInterestUseCase(beta, repository).execute({
      ...makePaywallInterestPayload(),
      ...extra,
    });
  }
  return new SubmitSupportContactUseCase({ notify: () => sent() }).execute({
    ...makeSupportContactInput(),
    ...extra,
  });
};

const FORMS: Form[] = ['b2b_lead', 'beta_signup', 'paywall_interest', 'support_contact'];

describe('POT-DE-MIEL · a bot submission is dropped and logged, a human one goes through', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    sent.mockReset();
    sent.mockResolvedValue(undefined);
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(FORMS)(
    'POT-DE-MIEL · %s : a filled trap sent too fast is logged with the request and nothing is kept',
    async (form) => {
      const repository = makeStubLeadRepository();

      await expect(
        submit(
          form,
          { website: 'http://spam.example', fillMs: 100, ip: '203.0.113.9' },
          repository,
        ),
      ).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(`${form}_honeypot_triggered`, {
        requestId: 'req-9',
        hasIp: true,
      });
      expect(sent).not.toHaveBeenCalled();
      expect(repository.inserted).toEqual([]);
    },
  );

  it.each(FORMS)('POT-DE-MIEL · %s : the log says when no ip is known', async (form) => {
    await submit(form, { website: 'x', fillMs: 0 }, makeStubLeadRepository());

    expect(warn).toHaveBeenCalledWith(`${form}_honeypot_triggered`, {
      requestId: 'req-9',
      hasIp: false,
    });
  });

  it.each(FORMS)(
    'POT-DE-MIEL · %s : a merely suspect or clean submission is not logged as a bot',
    async (form) => {
      await submit(form, { website: 'x', fillMs: 60_000 }, makeStubLeadRepository());
      await submit(form, { fillMs: 60_000 }, makeStubLeadRepository());

      expect(warn).not.toHaveBeenCalledWith(`${form}_honeypot_triggered`, expect.anything());
      expect(sent).toHaveBeenCalledTimes(2);
    },
  );
});
