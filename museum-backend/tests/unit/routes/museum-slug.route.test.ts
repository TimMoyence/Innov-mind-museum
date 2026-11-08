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

function create(body: Record<string, unknown>) {
  return request(app)
    .post('/api/museums')
    .set('Authorization', `Bearer ${adminToken()}`)
    .send(body);
}

describe('M5 · la route refuse en 400 ce que la base ne peut pas stocker', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockCreateMuseum.mockResolvedValue({ id: 1, name: 'Louvre', slug: 'louvre' });
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('slug de 129 caractères (colonne varchar(128)) : 400, rien n’est créé', async () => {
    const res = await create({ name: 'Louvre', slug: 'a'.repeat(129) });

    expect(res.status).toBe(400);
    expect(mockCreateMuseum).not.toHaveBeenCalled();
  });

  it('slug de 128 caractères : créé', async () => {
    const res = await create({ name: 'Louvre', slug: 'a'.repeat(128) });

    expect(res.status).toBe(201);
    expect(mockCreateMuseum).toHaveBeenCalledTimes(1);
  });

  it('nom fait d’espaces à la création : 400 à la route, rien n’est créé', async () => {
    const res = await create({ name: '   ', slug: 'louvre' });

    expect(res.status).toBe(400);
    expect(mockCreateMuseum).not.toHaveBeenCalled();
  });
});
