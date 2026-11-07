import express from 'express';
import request from 'supertest';
import { z } from 'zod';

import { badRequest } from '@shared/errors/app.error';
import { errorHandler } from '@shared/middleware/error.middleware';
import {
  _resetLlmCostCounter,
  llmCostGuard,
  setLlmCostCounter,
} from '@shared/middleware/llm-cost-guard.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

import { InMemoryLlmCostCounter } from '../../../helpers/llm-cost-guard/in-memory-llm-cost-counter';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const USER_ID = 42;

const buildApp = () =>
  express()
    .use(express.json())
    .use((req, _res, next) => {
      req.user = { id: USER_ID, role: 'visitor' };
      next();
    })
    .post('/messages', llmCostGuard, validateBody(z.object({ text: z.string() })), (_req, res) => {
      res.status(201).end();
    })
    .post('/refused', llmCostGuard, () => {
      throw badRequest('text must be <= 2000 characters');
    })
    .use(errorHandler);

const spentToday = async (counter: InMemoryLlmCostCounter): Promise<number> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  return counter.get(String(USER_ID), new Date().toISOString().slice(0, 10));
};

describe('plafond de coût LLM — seul un formulaire mal rempli est gratuit', () => {
  let counter: InMemoryLlmCostCounter;

  beforeEach(() => {
    counter = new InMemoryLlmCostCounter();
    setLlmCostCounter(counter);
  });

  afterEach(() => {
    _resetLlmCostCounter();
  });

  it('QUOTA · un formulaire mal rempli rend son estimation au plafond de coût', async () => {
    const response = await request(buildApp()).post('/messages').send({ text: 42 });

    expect(response.status).toBe(400);
    await expect(spentToday(counter)).resolves.toBe(0);
  });

  it('QUOTA · un refus métier après l’action garde son estimation', async () => {
    const response = await request(buildApp()).post('/refused').send({});

    expect(response.status).toBe(400);
    await expect(spentToday(counter)).resolves.toBeGreaterThan(0);
  });
});
