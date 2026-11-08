import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { adminToken } from '../../helpers/auth/token.helpers';

const mockUpdateMuseum = jest.fn();

jest.mock('@modules/museum/useCase', () => ({
  listMuseumsUseCase: { execute: jest.fn() },
  createMuseumUseCase: { execute: jest.fn() },
  getMuseumUseCase: { execute: jest.fn() },
  updateMuseumUseCase: { execute: (...args: unknown[]) => mockUpdateMuseum(...args) },
  detectMuseumUseCase: { execute: jest.fn() },
  buildSearchMuseumsUseCase: () => ({ execute: jest.fn() }),
  buildLowDataPackService: () => ({ getLowDataPack: jest.fn() }),
  museumRepository: {},
}));

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

const { app } = createRouteTestApp();

const EMOJI = '🏛';

const putMuseum = (body: Record<string, unknown>) =>
  request(app).put('/api/museums/1').set('Authorization', `Bearer ${adminToken()}`).send(body);

describe('L3 · le serveur compte les longueurs en caractères, comme le contrat et la base', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockUpdateMuseum.mockResolvedValue({ id: 1, name: 'Louvre', slug: 'louvre' });
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('un nom de 200 emoji (200 caractères) est enregistré', async () => {
    const res = await putMuseum({ name: EMOJI.repeat(200) });

    expect(res.status).toBe(200);
    expect(mockUpdateMuseum).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: EMOJI.repeat(200) }),
    );
  });

  it('un nom de 201 emoji est refusé en 400', async () => {
    const res = await putMuseum({ name: EMOJI.repeat(201) });

    expect(res.status).toBe(400);
    expect(mockUpdateMuseum).not.toHaveBeenCalled();
  });

  it('une description de 2 000 emoji est enregistrée, 2 001 sont refusés', async () => {
    const accepted = await putMuseum({ description: EMOJI.repeat(2000) });
    const refused = await putMuseum({ description: EMOJI.repeat(2001) });

    expect(accepted.status).toBe(200);
    expect(refused.status).toBe(400);
    expect(mockUpdateMuseum).toHaveBeenCalledTimes(1);
  });
});
