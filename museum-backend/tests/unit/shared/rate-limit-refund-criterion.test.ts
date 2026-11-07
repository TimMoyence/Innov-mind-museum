import express from 'express';
import request from 'supertest';
import { z } from 'zod';

import { badRequest } from '@shared/errors/app.error';
import { errorHandler } from '@shared/middleware/error.middleware';
import {
  clearRateLimitBuckets,
  createRateLimitMiddleware,
  stopRateLimitSweep,
} from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const limitOfTwo = () =>
  createRateLimitMiddleware({ limit: 2, windowMs: 60_000, keyGenerator: () => 'visitor' });

const app = express()
  .use(express.json())
  .post('/form', limitOfTwo(), validateBody(z.object({ email: z.string() })), (_req, res) => {
    res.status(201).end();
  })
  .post(
    '/flood',
    createRateLimitMiddleware({
      limit: 2,
      windowMs: 60_000,
      keyGenerator: () => 'visitor',
      countRejected: true,
    }),
    validateBody(z.object({ email: z.string() })),
    (_req, res) => {
      res.status(201).end();
    },
  )
  .post('/business', limitOfTwo(), () => {
    throw badRequest('This email is already in use');
  })
  .use(errorHandler);

const statusesOf = async (path: string, body: object, times: number): Promise<number[]> => {
  const statuses: number[] = [];
  for (let attempt = 0; attempt < times; attempt += 1) {
    statuses.push((await request(app).post(path).send(body)).status);
  }
  return statuses;
};

describe('limites — seul un formulaire mal rempli est gratuit', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('QUOTA · un refus métier après l’action (email déjà pris, lien invalide, audio trop long) consomme la limite', async () => {
    await expect(statusesOf('/business', {}, 3)).resolves.toEqual([400, 400, 429]);
  });

  it('QUOTA · un formulaire mal rempli, refusé après le passage du limiteur, rend son unité', async () => {
    await expect(statusesOf('/form', { email: 42 }, 3)).resolves.toEqual([400, 400, 400]);
  });

  it('QUOTA · la limite anti-inondation (countRejected) compte aussi les formulaires mal remplis', async () => {
    await expect(statusesOf('/flood', { email: 42 }, 3)).resolves.toEqual([400, 400, 429]);
  });
});
