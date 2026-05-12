import express from 'express';
import request from 'supertest';

import { createDescribeRouter } from '@modules/chat/adapters/primary/http/routes/chat-describe.route';
import {
  clearRateLimitBuckets,
  stopRateLimitSweep,
} from '@src/helpers/middleware/rate-limit.middleware';
import { errorHandler } from '@src/helpers/middleware/error.middleware';

import { visitorToken } from '../../helpers/auth/token.helpers';

import type { DescribeService } from '@modules/chat/useCase/describe/describe.service';

const buildApp = (service: DescribeService) => {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/chat', createDescribeRouter(service));
  app.use(errorHandler);
  return app;
};

const makeServiceMock = (
  overrides: Partial<DescribeService> = {},
): DescribeService =>
  ({
    describe: jest.fn().mockResolvedValue({
      description: 'A serene landscape.',
      metadata: { tokensUsed: 42 },
    }),
    ...overrides,
  }) as unknown as DescribeService;

describe('POST /api/chat/describe', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
  });
  afterAll(() => {
    stopRateLimitSweep();
  });

  it('returns description on golden path (text-only input)', async () => {
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app)
      .post('/api/chat/describe')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({ text: 'What is shown here?', locale: 'fr' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('A serene landscape.');
    expect(service.describe).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'What is shown here?', locale: 'fr' }),
    );
  });

  it('rejects payload with neither text nor image with 400', async () => {
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app)
      .post('/api/chat/describe')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({ locale: 'fr' });

    expect(res.status).toBe(400);
    expect(service.describe).not.toHaveBeenCalled();
  });

  it('rejects invalid image source enum with 400', async () => {
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app)
      .post('/api/chat/describe')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({
        image: { source: 'ftp', value: 'whatever' },
        locale: 'fr',
      });

    expect(res.status).toBe(400);
    expect(service.describe).not.toHaveBeenCalled();
  });

  it('streams audio buffer when format=audio is requested', async () => {
    const service = makeServiceMock({
      describe: jest.fn().mockResolvedValue({
        description: 'fallback',
        audio: Buffer.from([0x00, 0x01, 0x02]),
        contentType: 'audio/mpeg',
      }),
    });
    const app = buildApp(service);

    const res = await request(app)
      .post('/api/chat/describe')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({ text: 'hi', format: 'audio' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(res.body).toEqual(Buffer.from([0x00, 0x01, 0x02]));
  });

  it('rejects missing auth with 401', async () => {
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app)
      .post('/api/chat/describe')
      .send({ text: 'hello' });

    expect(res.status).toBe(401);
  });
});
