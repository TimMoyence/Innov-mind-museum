import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { adminToken } from '../../helpers/auth/token.helpers';

const mockCreateMuseum = jest.fn();

jest.mock('@modules/museum/useCase', () => ({
  listMuseumsUseCase: { execute: jest.fn() },
  createMuseumUseCase: { execute: (...args: unknown[]) => mockCreateMuseum(...args) },
  getMuseumUseCase: { execute: jest.fn() },
  updateMuseumUseCase: { execute: jest.fn() },
  detectMuseumUseCase: { execute: jest.fn() },
  buildSearchMuseumsUseCase: () => ({ execute: jest.fn() }),
  buildLowDataPackService: () => ({ getLowDataPack: jest.fn() }),
  museumRepository: {},
}));

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

const { app } = createRouteTestApp();

describe('M5 · la création transmet tout ce que la route a validé', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockCreateMuseum.mockResolvedValue({ id: 1, name: 'Louvre', slug: 'louvre' });
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('coordonnées et type : ils arrivent au cas d’usage', async () => {
    const res = await request(app)
      .post('/api/museums')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'Louvre',
        slug: 'louvre',
        latitude: 48.8606,
        longitude: 2.3376,
        museumType: 'art',
      });

    expect(res.status).toBe(201);
    expect(mockCreateMuseum).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 48.8606, longitude: 2.3376, museumType: 'art' }),
    );
  });
});
