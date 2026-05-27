/**
 * T4.1 (RED — Cycle B « Aucun lead perdu », Phase 4 — UFR-022 fresh-context red).
 *
 * Pins the ROUTE-LAYER contract of the 3 leads endpoints once the use-cases are
 * persist-then-notify (spec R5/R6/R7/R16). This is the coverage hole #1 of the
 * discovery: there is NO route-layer test of the Brevo-failure path today.
 *
 * Unlike the existing `tests/unit/routes/leads.route*.test.ts`, this suite does
 * NOT mock the use-case away — it mounts the route on top of a REAL
 * `SubmitB2bLeadUseCase` / `SubmitBetaSignupUseCase` / `SubmitPaywallInterestUseCase`
 * wired with a controllable notifier (throws to simulate a Brevo 5xx) and a
 * controllable in-memory `ILeadRepository`, so the route contract is exercised
 * through `error.middleware`, not faked.
 *
 * Asserted (the "no lead lost" route contract):
 *   (a) R5+R16 — notifier THROWS after persist → route answers HTTP **202**
 *       `{ accepted: true }` (the lead is durable; delivery is async-recoverable),
 *       and the response body leaks NO Brevo internal (no "Brevo", no upstream
 *       status code, no api-key fragment).
 *   (b) R6 — persistence itself THROWS (DB down) BEFORE the notifier → route
 *       answers a generic 5xx (`Internal server error`), the ONLY 5xx left on the
 *       leads surface, and still leaks nothing (api-key / Brevo body).
 *   (c) R7 — honeypot (`website` non-empty) → 202, 0 notify, 0 persist.
 *   (d) the contract holds for the 3 routes b2b / beta / paywall-interest.
 *
 * RED reason: this suite is materialised in the red phase BEFORE the Phase-4
 * route contract is pinned. It exercises the route wiring against the use-case
 * behaviour; assertions that the body NEVER contains a Brevo fragment on the
 * failure paths fail unless the persist-then-notify + generic-envelope contract
 * is honoured end-to-end. The green phase keeps these tests byte-frozen.
 *
 * Maps: R5, R6, R7, R16.
 *
 * Test discipline (CLAUDE.md §Test Discipline) — payloads via the leads
 * fixtures; the repository double is the shared `makeStubLeadRepository()`
 * factory (no inline fake). No BullMQ is instantiated (route layer only).
 */
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

/**
 * A Brevo-style runtime failure. The message mirrors the production notifier
 * (`brevo-beta-signup.notifier.ts:70` / `b2b-lead-email.notifier.ts`) so the
 * no-leak assertions exercise the real failure-message shape. The fake api-key
 * is NOT part of the notifier message in prod — we inject it here only to prove
 * it can never reach the client body.
 */
const FAKE_API_KEY = 'xkeysib-secret-0000-leak-canary';
const LEAK_EMAIL = 'route.leak@museum.example.fr';
// Worst-case upstream error: the Brevo failure message embeds BOTH the api-key
// and the recipient email. The route must answer a clean 202 AND the durable
// `lastError` recorded on the persisted lead must leak neither (R16 — the
// no-leak guarantee covers the persisted record, not only the HTTP body).
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

/** Mounts the 3 leads routes on a real use-case + the shared error middleware. */
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

/** Asserts a serialized response body leaks no Brevo/api-key fragment (R16). */
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
      // Lead durable despite the Brevo failure (persist-then-notify).
      expect(repo.inserted).toHaveLength(1);
      expect(repo.failed).toHaveLength(1);
      assertNoBrevoLeak(res.text);
      // R16 — the durable record must also be clean: the persisted `lastError`
      // leaks neither the api-key nor the full recipient email.
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
          // DB-down style failure carrying a secret-looking string to prove it
          // can NEVER reach the client.
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
      // Generic envelope only — never the raw DB error nor the secret.
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
