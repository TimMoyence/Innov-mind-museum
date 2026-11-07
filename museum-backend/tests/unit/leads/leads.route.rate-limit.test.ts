import express from 'express';
import request from 'supertest';

import leadsRouter from '@modules/leads/adapters/primary/http/routes/leads.route';

import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';
import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const app = express().use(express.json()).use('/api/leads', leadsRouter);

describe('leads — limite de soumissions par visiteur', () => {
  it('DRY · la bêta accepte 5 soumissions par fenêtre puis refuse, sans entamer la limite de l’intérêt paywall', async () => {
    const beta = makeBetaSignupPayload({ website: 'bot' });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/leads/beta').send(beta).expect(202);
    }

    await request(app).post('/api/leads/beta').send(beta).expect(429);
    await request(app)
      .post('/api/leads/paywall-interest')
      .send(makePaywallInterestPayload({ website: 'bot' }))
      .expect(202);
    await request(app)
      .post('/api/leads/b2b')
      .send(makeB2bLeadPayload({ website: 'bot' }))
      .expect(202);
  });
});
