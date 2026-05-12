import express from 'express';
import request from 'supertest';

import { createMemoryRouter } from '@modules/chat/adapters/primary/http/routes/chat-memory.route';
import { errorHandler } from '@src/helpers/middleware/error.middleware';

import { visitorToken } from '../../helpers/auth/token.helpers';

import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';

const buildApp = (service: UserMemoryService) => {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', createMemoryRouter(service));
  app.use(errorHandler);
  return app;
};

const makeServiceMock = (
  overrides: Partial<UserMemoryService> = {},
): UserMemoryService =>
  ({
    isDisabledByUser: jest.fn().mockResolvedValue(false),
    setDisabledByUser: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as UserMemoryService;

describe('chat-memory.route', () => {
  describe('GET /api/chat/memory/preference', () => {
    it('returns enabled=true when user has not opted out', async () => {
      const service = makeServiceMock();
      const app = buildApp(service);

      const res = await request(app)
        .get('/api/chat/memory/preference')
        .set('Authorization', `Bearer ${visitorToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enabled: true });
      expect(service.isDisabledByUser).toHaveBeenCalledWith(1);
    });

    it('returns enabled=false when user has opted out', async () => {
      const service = makeServiceMock({
        isDisabledByUser: jest.fn().mockResolvedValue(true),
      });
      const app = buildApp(service);

      const res = await request(app)
        .get('/api/chat/memory/preference')
        .set('Authorization', `Bearer ${visitorToken()}`);

      expect(res.body).toEqual({ enabled: false });
    });

    it('rejects missing auth with 401', async () => {
      const service = makeServiceMock();
      const app = buildApp(service);

      const res = await request(app).get('/api/chat/memory/preference');

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/chat/memory/preference', () => {
    it('toggles memory state and echoes the new value', async () => {
      const service = makeServiceMock();
      const app = buildApp(service);

      const res = await request(app)
        .patch('/api/chat/memory/preference')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enabled: false });
      expect(service.setDisabledByUser).toHaveBeenCalledWith(1, true);
    });

    it('rejects invalid body (missing enabled flag) with 400', async () => {
      const service = makeServiceMock();
      const app = buildApp(service);

      const res = await request(app)
        .patch('/api/chat/memory/preference')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({});

      expect(res.status).toBe(400);
      expect(service.setDisabledByUser).not.toHaveBeenCalled();
    });
  });
});
