import express, { type Express } from 'express';
import request from 'supertest';

import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';
import { SubmitPaywallInterestUseCase } from '@modules/leads/useCase/submitPaywallInterest.useCase';
import { errorHandler } from '@shared/middleware/error.middleware';

import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';
import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';

import type { B2bLeadNotifier } from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import type { BetaSignupNotifier } from '@modules/leads/domain/ports/beta-signup-notifier.port';
import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';

const FAKE_API_KEY = 'xkeysib-secret-0000-leak-canary';
const LEAK_EMAIL = 'route.leak@museum.example.fr';
const BREVO_FAILURE = `Brevo contacts add failed (503) api-key=${FAKE_API_KEY} recipient=${LEAK_EMAIL} body={"code":"unavailable"}`;

function throwingB2bNotifier(): B2bLeadNotifier {
  return {
    notify: jest.fn(async () => {
      throw new Error(BREVO_FAILURE);
    }),
  };
}

function throwingBetaNotifier(): BetaSignupNotifier {
  return {
    subscribe: jest.fn(async () => {
      throw new Error(BREVO_FAILURE);
    }),
  };
}

function buildApp(deps: {
  b2b: SubmitB2bLeadUseCase;
  beta: SubmitBetaSignupUseCase;
  paywall: SubmitPaywallInterestUseCase;
}): Express {
  const app = express();
  app.use(express.json());
  app.post('/api/leads/b2b', (req, res, next) => {
    deps.b2b
      .execute({ ...(req.body as Record<string, unknown>), ip: req.ip } as never)
      .then(() => res.status(202).json({ accepted: true }))
      .catch(next);
  });
  app.post('/api/leads/beta', (req, res, next) => {
    deps.beta
      .execute({ ...(req.body as Record<string, unknown>), ip: req.ip } as never)
      .then(() => res.status(202).json({ accepted: true }))
      .catch(next);
  });
  app.post('/api/leads/paywall-interest', (req, res, next) => {
    deps.paywall
      .execute({ ...(req.body as Record<string, unknown>), ip: req.ip } as never)
      .then(() => res.status(202).json({ accepted: true }))
      .catch(next);
  });
  app.use(errorHandler);
  return app;
}

function assertNoBrevoLeak(rawBody: string): void {
  expect(rawBody).not.toContain('Brevo');
  expect(rawBody).not.toContain(FAKE_API_KEY);
  expect(rawBody).not.toContain('xkeysib');
  expect(rawBody).not.toContain('503');
}

describe('Leads routes — persist-then-notify contract (R5/R6/R7/R16)', () => {
  describe('notifier throws after persist → 202, no Brevo leak (R5/R16)', () => {
    it('B2B: row failed, route 202 { accepted:true }, body has no Brevo fragment', async () => {
      const repo = makeStubLeadRepository();
      const notifier = throwingB2bNotifier();
      const app = buildApp({
        b2b: new SubmitB2bLeadUseCase(notifier, repo),
        beta: new SubmitBetaSignupUseCase(throwingBetaNotifier(), repo),
        paywall: new SubmitPaywallInterestUseCase(throwingBetaNotifier(), repo),
      });

      const res = await request(app)
        .post('/api/leads/b2b')
        .send(makeB2bLeadPayload({ email: LEAK_EMAIL }));

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ accepted: true });
      expect(repo.inserted).toHaveLength(1);
      expect(repo.failed).toHaveLength(1);
      assertNoBrevoLeak(res.text);
      const persistedLastError = repo.failed[0]?.lastError ?? '';
      expect(persistedLastError).not.toContain(FAKE_API_KEY);
      expect(persistedLastError).not.toContain('xkeysib');
      expect(persistedLastError).not.toContain(LEAK_EMAIL);
    });

    it('beta: route 202, body has no Brevo fragment', async () => {
      const repo = makeStubLeadRepository();
      const app = buildApp({
        b2b: new SubmitB2bLeadUseCase(throwingB2bNotifier(), repo),
        beta: new SubmitBetaSignupUseCase(throwingBetaNotifier(), repo),
        paywall: new SubmitPaywallInterestUseCase(throwingBetaNotifier(), repo),
      });

      const res = await request(app).post('/api/leads/beta').send(makeBetaSignupPayload());

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ accepted: true });
      expect(repo.failed).toHaveLength(1);
      assertNoBrevoLeak(res.text);
    });

    it('paywall-interest: route 202, body has no Brevo fragment', async () => {
      const repo = makeStubLeadRepository();
      const app = buildApp({
        b2b: new SubmitB2bLeadUseCase(throwingB2bNotifier(), repo),
        beta: new SubmitBetaSignupUseCase(throwingBetaNotifier(), repo),
        paywall: new SubmitPaywallInterestUseCase(throwingBetaNotifier(), repo),
      });

      const res = await request(app)
        .post('/api/leads/paywall-interest')
        .send(makePaywallInterestPayload());

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ accepted: true });
      expect(repo.failed).toHaveLength(1);
      assertNoBrevoLeak(res.text);
    });
  });

  describe('persistence throws before notify → honest generic 5xx, no leak (R6)', () => {
    it('B2B: repo.insertPending rejects → 5xx generic envelope, notifier never called', async () => {
      const repo: ILeadRepository = {
        ...makeStubLeadRepository(),
        insertPending: jest.fn(async () => {
          throw new Error(`connection refused ${FAKE_API_KEY}`);
        }),
      };
      const notifier = throwingB2bNotifier();
      const app = buildApp({
        b2b: new SubmitB2bLeadUseCase(notifier, repo),
        beta: new SubmitBetaSignupUseCase(throwingBetaNotifier(), repo),
        paywall: new SubmitPaywallInterestUseCase(throwingBetaNotifier(), repo),
      });

      const res = await request(app).post('/api/leads/b2b').send(makeB2bLeadPayload());

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(notifier.notify).not.toHaveBeenCalled();
      assertNoBrevoLeak(res.text);
      expect(res.text).not.toContain('connection refused');
    });
  });

  describe('honeypot → 202, 0 notify, 0 persist (R7)', () => {
    it('B2B honeypot hit', async () => {
      const repo = makeStubLeadRepository();
      const notifier = throwingB2bNotifier();
      const app = buildApp({
        b2b: new SubmitB2bLeadUseCase(notifier, repo),
        beta: new SubmitBetaSignupUseCase(throwingBetaNotifier(), repo),
        paywall: new SubmitPaywallInterestUseCase(throwingBetaNotifier(), repo),
      });

      const res = await request(app)
        .post('/api/leads/b2b')
        .send(makeB2bLeadPayload({ website: 'https://spam.example.com' }));

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ accepted: true });
      expect(repo.inserted).toHaveLength(0);
      expect(notifier.notify).not.toHaveBeenCalled();
    });
  });
});
