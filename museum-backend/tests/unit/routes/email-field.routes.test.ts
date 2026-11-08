import express from 'express';
import request from 'supertest';

import authPasswordRouter from '@modules/auth/adapters/primary/http/routes/auth-password.route';
import authSessionRouter from '@modules/auth/adapters/primary/http/routes/auth-session.route';
import { AppError } from '@shared/errors/app.error';
import { errorHandler } from '@shared/middleware/error.middleware';

import { resetRateLimits, stopRateLimitSweep } from '../../helpers/http/route-test-setup';

const mockLogin = jest.fn();
const mockForgotPassword = jest.fn();

jest.mock('@modules/auth/useCase', () => ({
  authSessionService: { login: (...args: unknown[]) => mockLogin(...args) as Promise<unknown> },
  forgotPasswordUseCase: {
    execute: (...args: unknown[]) => mockForgotPassword(...args) as Promise<unknown>,
  },
}));

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

const app = express()
  .use(express.json())
  .use('/api/auth', authSessionRouter)
  .use('/api/auth', authPasswordRouter)
  .use(errorHandler);

const DOMAIN = '@museum.fr';
const emailOfLength = (length: number): string => 'a'.repeat(length - DOMAIN.length) + DOMAIN;

describe('L1 · les routes d’authentification appliquent la règle e-mail partagée', () => {
  beforeEach(() => {
    resetRateLimits();
    mockLogin.mockReset();
    mockLogin.mockRejectedValue(new AppError({ message: 'Invalid credentials', statusCode: 401 }));
    mockForgotPassword.mockReset();
    mockForgotPassword.mockResolvedValue(null);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('connexion : une adresse de 254 caractères atteint la vérification du mot de passe', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: emailOfLength(254), password: 'hunter2' });

    expect(res.status).toBe(401);
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it('connexion : une adresse de 255 caractères est refusée en 400, sans chercher le compte', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: emailOfLength(255), password: 'hunter2' });

    expect(res.status).toBe(400);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('mot de passe oublié : une adresse de 254 caractères est traitée', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: emailOfLength(254) });

    expect(res.status).toBe(200);
    expect(mockForgotPassword).toHaveBeenCalledTimes(1);
  });

  it('mot de passe oublié : une adresse de 255 caractères est refusée en 400', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: emailOfLength(255) });

    expect(res.status).toBe(400);
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  it('mot de passe oublié : les espaces autour de l’adresse sont retirés avant la règle', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: '  curator@museum.fr  ' });

    expect(res.status).toBe(200);
    expect(mockForgotPassword).toHaveBeenCalledWith('curator@museum.fr', expect.anything());
  });
});
