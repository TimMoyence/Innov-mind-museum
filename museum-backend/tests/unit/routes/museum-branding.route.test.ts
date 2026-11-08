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

const INVALID_BRANDINGS = [
  { primaryColor: 'red' },
  { primaryColor: '#12345' },
  { logoUrl: 'http://cdn.museum.fr/logo.svg' },
  { logoUrl: 'javascript:alert(1)' },
];

describe('M5 · le serveur refuse un branding de musée invalide', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockCreateMuseum.mockResolvedValue({ id: 1, name: 'Louvre', slug: 'louvre' });
    mockUpdateMuseum.mockResolvedValue({ id: 1, name: 'Louvre', slug: 'louvre' });
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it.each(INVALID_BRANDINGS)(
    'PUT avec branding %o : 400, rien n’est enregistré',
    async (branding) => {
      const res = await request(app)
        .put('/api/museums/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ config: { branding } });

      expect(res.status).toBe(400);
      expect(mockUpdateMuseum).not.toHaveBeenCalled();
    },
  );

  it.each(INVALID_BRANDINGS)('POST avec branding %o : 400, rien n’est créé', async (branding) => {
    const res = await request(app)
      .post('/api/museums')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Louvre', slug: 'louvre', config: { branding } });

    expect(res.status).toBe(400);
    expect(mockCreateMuseum).not.toHaveBeenCalled();
  });

  it.each([{ primaryColor: '#38A169', secondaryColor: '#000000' }, { accentColor: '#FFFFFF' }])(
    'L4 · PUT avec une clé de branding sans effet %o : 400, rien n’est enregistré',
    async (branding) => {
      const res = await request(app)
        .put('/api/museums/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ config: { branding } });

      expect(res.status).toBe(400);
      expect(mockUpdateMuseum).not.toHaveBeenCalled();
    },
  );

  it('PUT avec un branding valide et d’autres clés : enregistré tel quel', async () => {
    const config = {
      legacyKey: 'kept',
      branding: { primaryColor: '#38A169', logoUrl: 'https://cdn.museum.fr/logo.svg' },
    };
    const res = await request(app)
      .put('/api/museums/1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ config });

    expect(res.status).toBe(200);
    expect(mockUpdateMuseum).toHaveBeenCalledWith(1, expect.objectContaining({ config }));
  });
});
