jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      accessTokenSecret: 'unit-test-access-secret-that-is-at-least-32c',
      refreshTokenSecret: 'unit-test-refresh-secret-that-is-at-least-32c',
      accessTokenTtl: '15m',
      refreshTokenTtl: '14d',
    },
  },
}));

import jwt from 'jsonwebtoken';

const ACCESS_SECRET = 'unit-test-access-secret-that-is-at-least-32c';
const REFRESH_SECRET = 'unit-test-refresh-secret-that-is-at-least-32c';

describe('R2 — Already-secured HS256 sites regression guard', () => {
  let verifySpy: jest.SpyInstance;

  beforeEach(() => {
    verifySpy = jest.spyOn(jwt, 'verify');
  });

  afterEach(() => {
    verifySpy.mockRestore();
  });

  it('R2.2 — TokenJwtService.verifyAccessToken passes algorithms: ["HS256"] to jwt.verify', async () => {
    const { TokenJwtService } = await import('@modules/auth/useCase/session/token-jwt.service');
    const service = new TokenJwtService();

    const validAccessToken = jwt.sign(
      { sub: '1', type: 'access', jti: 'test-jti-access', role: 'visitor' },
      ACCESS_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '15m',
        issuer: 'musaium-access',
        audience: 'musaium-access',
      },
    );

    service.verifyAccessToken(validAccessToken);

    expect(verifySpy).toHaveBeenCalledTimes(1);
    const callArgs = verifySpy.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ algorithms: ['HS256'] });
    expect(callArgs[2]).not.toMatchObject({ algorithms: expect.arrayContaining(['none']) });
  });

  it('R2.3 — TokenJwtService.verifyRefreshToken passes algorithms: ["HS256"] to jwt.verify', async () => {
    const { TokenJwtService } = await import('@modules/auth/useCase/session/token-jwt.service');
    const service = new TokenJwtService();

    const validRefreshToken = jwt.sign(
      {
        sub: '1',
        type: 'refresh',
        jti: 'test-jti-refresh',
        familyId: 'test-family-id',
      },
      REFRESH_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '14d',
        issuer: 'musaium-refresh',
        audience: 'musaium-refresh',
      },
    );

    service.verifyRefreshToken(validRefreshToken);

    expect(verifySpy).toHaveBeenCalledTimes(1);
    const callArgs = verifySpy.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ algorithms: ['HS256'] });
    expect(callArgs[2]).not.toMatchObject({ algorithms: expect.arrayContaining(['none']) });
  });
});
