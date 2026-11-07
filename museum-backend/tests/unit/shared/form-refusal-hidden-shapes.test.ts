import express from 'express';
import request from 'supertest';

import { createCompareRouter } from '@modules/chat/adapters/primary/http/routes/chat-compare.route';
import { ImageDecodeError } from '@modules/chat/adapters/secondary/image/image-processing.service';
import { SocialLoginUseCase } from '@modules/auth/useCase/social/socialLogin.useCase';
import { invalidInput } from '@shared/errors/app.error';
import { errorHandler } from '@shared/middleware/error.middleware';
import { onInputRejected } from '@shared/middleware/input-rejected';
import { userToken } from 'tests/helpers/auth/token.helpers';
import {
  makeAuthSessionServiceMock,
  makeSocialAccountRepo,
  makeUserRepo,
} from 'tests/helpers/auth/user-repo.mock';
import { makeSiglipJpegBuffer } from 'tests/helpers/chat/visual-similarity/image-fixtures';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';

import type { CompareRouterDeps } from '@modules/chat/adapters/primary/http/routes/chat-compare.route';

const SESSION_ID = '8c7b1e0a-3f4d-4e21-9b6a-1c2d3e4f5a6b';

const refundsOnCompare = async (rejection: Error): Promise<jest.Mock> => {
  const refund = jest.fn();
  const compareImageUseCase: CompareRouterDeps['compareImageUseCase'] = jest.fn(async () => {
    throw rejection;
  });
  const app = express()
    .use((_req, res, next) => {
      onInputRejected(res, refund);
      next();
    })
    .use(
      '/chat',
      createCompareRouter({
        compareImageUseCase,
        verifySessionAccess: async () => ({ museumId: null }),
        consentChecker: { isGranted: async () => true },
      }),
    )
    .use(errorHandler);

  const res = await request(app)
    .post('/chat/compare')
    .set('Authorization', `Bearer ${userToken()}`)
    .field('sessionId', SESSION_ID)
    .field('topK', '5')
    .attach('image', await makeSiglipJpegBuffer(), {
      filename: 'fixture.jpg',
      contentType: 'image/jpeg',
    });
  expect(res.status).toBe(400);
  return refund;
};

describe('refus de forme sous une autre forme que badRequest', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('QUOTA · une image aux octets invalides est un refus de forme, la comparaison ne consomme aucune limite', async () => {
    const refund = await refundsOnCompare(
      invalidInput('Uploaded file does not appear to be a valid image'),
    );

    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('QUOTA · une image indécodable est un refus de forme, la comparaison ne consomme aucune limite', async () => {
    const refund = await refundsOnCompare(new ImageDecodeError());

    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('QUOTA · un idToken fait d’espaces est un refus de forme, il ne consomme pas la limite social-login', async () => {
    const useCase = new SocialLoginUseCase(
      makeUserRepo(),
      makeSocialAccountRepo(),
      makeAuthSessionServiceMock(),
      { verify: jest.fn() },
    );

    await expect(useCase.execute('google', '   ')).rejects.toMatchObject({
      statusCode: 400,
      inputRejected: true,
    });
  });
});
