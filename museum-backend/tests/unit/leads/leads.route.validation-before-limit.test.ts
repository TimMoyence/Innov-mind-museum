import express from 'express';
import request from 'supertest';

import leadsRouter from '@modules/leads/adapters/primary/http/routes/leads.route';
import { errorHandler } from '@shared/middleware/error.middleware';

import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const app = express().use(express.json()).use('/api/leads', leadsRouter).use(errorHandler);

describe('leads — une demande invalide ne consomme pas la limite', () => {
  it('QUOTA · six demandes bêta refusées pour formulaire invalide laissent passer la demande valide suivante', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await request(app).post('/api/leads/beta').send({ consent: true }).expect(400);
    }

    await request(app)
      .post('/api/leads/beta')
      .send(makeBetaSignupPayload({ website: 'bot' }))
      .expect(202);
  });
});
