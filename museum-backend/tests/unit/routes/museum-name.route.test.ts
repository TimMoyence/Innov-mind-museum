import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { adminToken } from '../../helpers/auth/token.helpers';

const mockCreateMuseum = jest.fn();
const mockUpdateMuseum = jest.fn();

jest.mock('@modules/museum/useCase', () => ({
  listMuseumsUseCase: { execute: jest.fn() },
  createMuseumUseCase: { execute: (...args: unknown[]) => mockCreateMuseum(...args) },
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

describe('M5 · un nom de musée vide est refusé à la création comme à la mise à jour', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockUpdateMuseum.mockResolvedValue({ id: 1, name: 'Louvre', slug: 'louvre' });
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('PUT avec un nom fait d’espaces : 400, rien n’est enregistré', async () => {
    const res = await request(app)
      .put('/api/museums/1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(mockUpdateMuseum).not.toHaveBeenCalled();
  });

  it('PUT avec un nom entouré d’espaces : enregistré sans les espaces', async () => {
    const res = await request(app)
      .put('/api/museums/1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: '  Louvre  ' });

    expect(res.status).toBe(200);
    expect(mockUpdateMuseum).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Louvre' }));
  });
});
