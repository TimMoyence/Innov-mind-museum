import { EMAIL_PATTERN, isEmail } from '@musaium/shared';
import { z } from 'zod';

import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';
import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';
import { makeSupportContactInput } from '../../helpers/support/supportContact.fixtures';

import { RegisterUseCase } from '@modules/auth/useCase/registration/register.useCase';
import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';
import { SubmitPaywallInterestUseCase } from '@modules/leads/useCase/submitPaywallInterest.useCase';
import { SubmitSupportContactUseCase } from '@modules/support/useCase/contact/submitSupportContact.useCase';

const REFUSED_BY_ROUTE = [
  'a@b.c',
  'user@exam_ple.com',
  'first..last@museum.fr',
  '.dot@museum.fr',
  'user@-museum.fr',
  'élodie@musée.fr',
  'unicode-éàç@example.com',
];

const ACCEPTED_BY_ROUTE = [
  'user@museum.fr',
  'user+tag@museum.co.uk',
  "o'brien@museum.ie",
  'first.last@example.co.uk',
];

describe('TIM-2026-11-08-EMAIL-STRICT · une seule règle e-mail, celle de la route', () => {
  it('la règle partagée est exactement celle de Zod', () => {
    expect(EMAIL_PATTERN.source).toBe(z.regexes.email.source);
    expect(EMAIL_PATTERN.flags).toBe(z.regexes.email.flags);
  });

  it.each([...REFUSED_BY_ROUTE, ...ACCEPTED_BY_ROUTE])(
    '%s : isEmail répond comme la route',
    (email) => {
      expect(isEmail(email)).toBe(z.email().safeParse(email).success);
    },
  );

  it.each(REFUSED_BY_ROUTE)('%s : refusé par les cas d’usage contact et leads', async (email) => {
    const notify = jest.fn().mockResolvedValue(undefined);
    const subscribe = jest.fn().mockResolvedValue(undefined);

    await expect(
      new SubmitSupportContactUseCase({ notify }).execute(makeSupportContactInput({ email })),
    ).rejects.toMatchObject({ statusCode: 400, message: 'email must be valid' });
    await expect(
      new SubmitB2bLeadUseCase({ notify }, makeStubLeadRepository()).execute(
        makeB2bLeadPayload({ email }),
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: 'email must be valid' });
    await expect(
      new SubmitBetaSignupUseCase({ subscribe }, makeStubLeadRepository()).execute(
        makeBetaSignupPayload({ email }),
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: 'email must be valid' });
    await expect(
      new SubmitPaywallInterestUseCase({ subscribe }, makeStubLeadRepository()).execute(
        makePaywallInterestPayload({ email }),
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: 'email must be valid' });
    expect(notify).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each(REFUSED_BY_ROUTE)('%s : refusé à l’inscription', async (email) => {
    await expect(
      new RegisterUseCase(makeUserRepo()).execute({ email, password: 'StrongP@ss1!' }),
    ).rejects.toThrow('Invalid email format');
  });
});
