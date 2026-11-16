jest.mock('@modules/chat/useCase/third-party-ai-consent-checker', () => ({
  buildThirdPartyAiConsentChecker: () => ({
    isGranted: async () => await Promise.resolve(false),
  }),
}));

import express from 'express';
import request from 'supertest';

import { createCompareRouter } from '@modules/chat/adapters/primary/http/routes/chat-compare.route';
import { errorHandler } from '@shared/middleware/error.middleware';
import { makeSiglipJpegBuffer } from 'tests/helpers/chat/visual-similarity/image-fixtures';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from 'tests/helpers/http/route-test-setup';
import { userToken } from 'tests/helpers/auth/token.helpers';

const compareApp = express();
compareApp.use(
  '/chat',
  createCompareRouter({ compareImageUseCase: jest.fn(), verifySessionAccess: jest.fn() }),
);
compareApp.use(errorHandler);

const { app } = createRouteTestApp();

const contractError = (code: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message: expect.any(String), ...extra },
});
const correlated = { requestId: expect.any(String) };

describe('CORPS-ERREUR', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('CORPS-ERREUR · un refus faute de consentement, un funnel sans en-tête de consentement et un Google OAuth non configuré répondent tous { error: { code, message } }, la forme du contrat que lit le client', async () => {
    const image = await makeSiglipJpegBuffer();

    const compare = await request(compareApp)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', '8c7b1e0a-3f4d-4e21-9b6a-1c2d3e4f5a6b')
      .attach('image', image, { filename: 'art.jpg', contentType: 'image/jpeg' });
    const funnel = await request(app)
      .post('/api/telemetry/funnel')
      .send({ name: 'paywall_modal_shown', url: 'app://musaium/mobile', domain: 'musaium.com' });
    const google = await request(app).get('/api/auth/google/initiate?platform=mobile');

    expect([compare.status, funnel.status, google.status]).toEqual([403, 403, 503]);
    expect(compare.body).toEqual(
      contractError('CONSENT_REQUIRED', { details: { scope: 'third_party_ai_image_openai' } }),
    );
    expect(funnel.body).toEqual(contractError('CONSENT_REQUIRED', correlated));
    expect(google.body).toEqual(contractError('GOOGLE_OAUTH_NOT_CONFIGURED', correlated));
  });
});
