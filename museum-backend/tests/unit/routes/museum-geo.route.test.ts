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

describe('M5 · le serveur refuse des coordonnées de musée hors du globe', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockCreateMuseum.mockResolvedValue({ id: 1, name: 'Louvre', slug: 'louvre' });
    mockUpdateMuseum.mockResolvedValue({ id: 1, name: 'Louvre', slug: 'louvre' });
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it.each([{ latitude: 90.5 }, { latitude: -91 }, { longitude: 180.1 }, { longitude: -999 }])(
    'POST avec %o : 400, rien n’est créé',
    async (coords) => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Louvre', slug: 'louvre', ...coords });

      expect(res.status).toBe(400);
      expect(mockCreateMuseum).not.toHaveBeenCalled();
    },
  );

  it('PUT avec une latitude de 999 : 400, rien n’est enregistré', async () => {
    const res = await request(app)
      .put('/api/museums/1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ latitude: 999 });

    expect(res.status).toBe(400);
    expect(mockUpdateMuseum).not.toHaveBeenCalled();
  });

  it('POST aux bornes exactes (90, -180) : créé', async () => {
    const res = await request(app)
      .post('/api/museums')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Pôle', slug: 'pole', latitude: 90, longitude: -180 });

    expect(res.status).toBe(201);
    expect(mockCreateMuseum).toHaveBeenCalledTimes(1);
  });
});
