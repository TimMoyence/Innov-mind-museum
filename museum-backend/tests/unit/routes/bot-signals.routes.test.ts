import express from 'express';
import request from 'supertest';

import leadsRouter from '@modules/leads/adapters/primary/http/routes/leads.route';
import supportRouter from '@modules/support/adapters/primary/http/routes/support.route';
import { errorHandler } from '@shared/middleware/error.middleware';

import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';
import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';
import { resetRateLimits, stopRateLimitSweep } from '../../helpers/http/route-test-setup';
import { makeSupportContactInput } from '../../helpers/support/supportContact.fixtures';

const mockSupportNotify = jest.fn();
const mockB2bNotify = jest.fn();
const mockSubscribe = jest.fn();

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@modules/support/useCase', () => {
  const { SubmitSupportContactUseCase } = jest.requireActual<
    typeof import('@modules/support/useCase/contact/submitSupportContact.useCase')
  >('@modules/support/useCase/contact/submitSupportContact.useCase');
  return {
    submitSupportContactUseCase: new SubmitSupportContactUseCase({
      notify: (...args: unknown[]) => mockSupportNotify(...args) as Promise<void>,
    }),
  };
});

jest.mock('@modules/leads/useCase', () => {
  const { SubmitB2bLeadUseCase } = jest.requireActual<
    typeof import('@modules/leads/useCase/submitB2bLead.useCase')
  >('@modules/leads/useCase/submitB2bLead.useCase');
  const { SubmitBetaSignupUseCase } = jest.requireActual<
    typeof import('@modules/leads/useCase/submitBetaSignup.useCase')
  >('@modules/leads/useCase/submitBetaSignup.useCase');
  const { SubmitPaywallInterestUseCase } = jest.requireActual<
    typeof import('@modules/leads/useCase/submitPaywallInterest.useCase')
  >('@modules/leads/useCase/submitPaywallInterest.useCase');
  const { makeStubLeadRepository } = jest.requireActual<
    typeof import('../../helpers/leads/stubLeadRepository')
  >('../../helpers/leads/stubLeadRepository');
  const notifier = {
    subscribe: (...args: unknown[]) => mockSubscribe(...args) as Promise<void>,
  };
  return {
    submitB2bLeadUseCase: new SubmitB2bLeadUseCase(
      { notify: (...args: unknown[]) => mockB2bNotify(...args) as Promise<void> },
      makeStubLeadRepository(),
    ),
    submitBetaSignupUseCase: new SubmitBetaSignupUseCase(notifier, makeStubLeadRepository()),
    submitPaywallInterestUseCase: new SubmitPaywallInterestUseCase(
      notifier,
      makeStubLeadRepository(),
    ),
  };
});

const app = express()
  .use(express.json())
  .use('/api/support', supportRouter)
  .use('/api/leads', leadsRouter)
  .use(errorHandler);

const TRAP = 'https://spam.example';

describe('TIM-2026-11-08-DEUX-SIGNAUX · les routes publiques lisent le délai de remplissage', () => {
  beforeEach(() => {
    resetRateLimits();
    for (const mock of [mockSupportNotify, mockB2bNotify, mockSubscribe]) {
      mock.mockReset();
      mock.mockResolvedValue(undefined);
    }
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('contact rempli en 30 s : e-mail sans marque', async () => {
    await request(app)
      .post('/api/support/contact')
      .send(makeSupportContactInput({ fillMs: 30_000 }))
      .expect(202, { accepted: true });

    expect(mockSupportNotify).toHaveBeenCalledWith(expect.objectContaining({ suspect: false }));
  });

  it('contact avec champ caché rempli en 30 s : e-mail marqué suspect', async () => {
    await request(app)
      .post('/api/support/contact')
      .send(makeSupportContactInput({ website: TRAP, fillMs: 30_000 }))
      .expect(202, { accepted: true });

    expect(mockSupportNotify).toHaveBeenCalledWith(expect.objectContaining({ suspect: true }));
  });

  it('B2B rempli en 30 s : e-mail sans marque', async () => {
    await request(app)
      .post('/api/leads/b2b')
      .send({ ...makeB2bLeadPayload(), fillMs: 30_000 })
      .expect(202, { accepted: true });

    expect(mockB2bNotify).toHaveBeenCalledWith(expect.objectContaining({ suspect: false }));
  });

  it('bêta et paywall avec champ caché rempli en 30 s : inscrits', async () => {
    await request(app)
      .post('/api/leads/beta')
      .send({ ...makeBetaSignupPayload({ website: TRAP }), fillMs: 30_000 })
      .expect(202, { accepted: true });
    await request(app)
      .post('/api/leads/paywall-interest')
      .send({ ...makePaywallInterestPayload({ website: TRAP }), fillMs: 30_000 })
      .expect(202, { accepted: true });

    expect(mockSubscribe).toHaveBeenCalledTimes(2);
  });

  it('délai négatif ou non entier : refusé en 400 sans envoi', async () => {
    await request(app)
      .post('/api/support/contact')
      .send(makeSupportContactInput({ fillMs: -1 }))
      .expect(400);
    await request(app)
      .post('/api/leads/b2b')
      .send({ ...makeB2bLeadPayload(), fillMs: 1.5 })
      .expect(400);

    expect(mockSupportNotify).not.toHaveBeenCalled();
    expect(mockB2bNotify).not.toHaveBeenCalled();
  });
});
