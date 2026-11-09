import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';

import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';

import type { B2bLeadNotifier } from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import type { BetaSignupNotifier } from '@modules/leads/domain/ports/beta-signup-notifier.port';

const FAKE_API_KEY = 'xkeysib-0123456789abcdef-leak-canary';
const LEAD_EMAIL = 'prospect.leak@museum.example.fr';

function leakyB2bNotifier(): B2bLeadNotifier {
  return {
    notify: jest.fn(async () => {
      throw new Error(
        `Brevo send failed (401) api-key=${FAKE_API_KEY} recipient=${LEAD_EMAIL} body=unauthorized`,
      );
    }),
  };
}

function leakyBetaNotifier(): BetaSignupNotifier {
  return {
    subscribe: jest.fn(async () => {
      throw new Error(
        `Brevo contacts add failed (401) api-key=${FAKE_API_KEY} email=${LEAD_EMAIL}`,
      );
    }),
  };
}

describe('Leads security — Lead.lastError never leaks api-key / full email (R16, NFR Privacy)', () => {
  it('B2B: lastError contains neither the api-key nor the full email', async () => {
    const repo = makeStubLeadRepository();
    const useCase = new SubmitB2bLeadUseCase(leakyB2bNotifier(), repo);

    await useCase.execute(makeB2bLeadPayload({ email: LEAD_EMAIL }));

    expect(repo.failed).toHaveLength(1);
    const lastError = repo.failed[0]?.lastError ?? '';
    expect(lastError).not.toContain(FAKE_API_KEY);
    expect(lastError).not.toContain('xkeysib');
    expect(lastError).not.toContain(LEAD_EMAIL);
  });

  it('B2B: lastError stays bounded (≤ 800 chars)', async () => {
    const repo = makeStubLeadRepository();
    const longTail = 'x'.repeat(5000);
    const notifier: B2bLeadNotifier = {
      notify: jest.fn(async () => {
        throw new Error(`Brevo 503 ${longTail}`);
      }),
    };
    const useCase = new SubmitB2bLeadUseCase(notifier, repo);

    await useCase.execute(makeB2bLeadPayload({ email: LEAD_EMAIL }));

    const lastError = repo.failed[0]?.lastError ?? '';
    expect(lastError.length).toBeLessThanOrEqual(800);
  });

  it('beta: lastError contains neither the api-key nor the full email', async () => {
    const repo = makeStubLeadRepository();
    const useCase = new SubmitBetaSignupUseCase(leakyBetaNotifier(), repo);

    await useCase.execute(makeBetaSignupPayload({ email: LEAD_EMAIL }));

    expect(repo.failed).toHaveLength(1);
    const lastError = repo.failed[0]?.lastError ?? '';
    expect(lastError).not.toContain(FAKE_API_KEY);
    expect(lastError).not.toContain('xkeysib');
    expect(lastError).not.toContain(LEAD_EMAIL);
  });
});
