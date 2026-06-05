import {
  AppError,
  ValidationError,
  badRequest,
  notFound,
  conflict,
  forbidden,
  serviceUnavailable,
  tooManyRequests,
  unauthorized,
} from '@shared/errors/app.error';

describe('AppError', () => {
  it('uses defaults for statusCode and code when not provided', () => {
    const err = new AppError({ message: 'Something failed' });
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).toBe('Something failed');
    expect(err.name).toBe('AppError');
    expect(err.details).toBeUndefined();
  });

  it('uses provided statusCode and code', () => {
    const err = new AppError({
      message: 'Not allowed',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('attaches details when provided', () => {
    const details = { field: 'email', issue: 'invalid' };
    const err = new AppError({
      message: 'Validation error',
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      details,
    });
    expect(err.details).toEqual(details);
  });

  it('is an instance of Error', () => {
    const err = new AppError({ message: 'test' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('error factory functions', () => {
  it('badRequest creates 400 error', () => {
    const err = badRequest('Bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('Bad input');
  });

  it('badRequest with details', () => {
    const err = badRequest('Validation failed', { field: 'name' });
    expect(err.details).toEqual({ field: 'name' });
  });

  it('notFound creates 404 error', () => {
    const err = notFound('Resource missing');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('notFound with details', () => {
    const err = notFound('Not found', { id: 'abc' });
    expect(err.details).toEqual({ id: 'abc' });
  });

  it('conflict creates 409 error', () => {
    const err = conflict('Already exists');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('forbidden creates 403 error', () => {
    const err = forbidden('Access denied');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('tooManyRequests creates 429 error', () => {
    const err = tooManyRequests('Slow down');
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('TOO_MANY_REQUESTS');
  });

  // Kills L118 ConditionalExpression + L121 EqualityOperator/ConditionalExpression
  // pairs on the retryAfterSec headers/details branches.
  it('tooManyRequests sets Retry-After header when retryAfterSec is provided', () => {
    const err = tooManyRequests('Slow down', { retryAfterSec: 5 });
    expect(err.headers).toEqual({ 'Retry-After': '5' });
  });

  it('tooManyRequests omits headers when retryAfterSec is undefined', () => {
    const err = tooManyRequests('Slow down');
    expect(err.headers).toBeUndefined();
  });

  it('tooManyRequests defaults details to { retryAfterSec } when no explicit details', () => {
    const err = tooManyRequests('Slow down', { retryAfterSec: 5 });
    expect(err.details).toEqual({ retryAfterSec: 5 });
  });

  it('tooManyRequests leaves details undefined when neither retryAfterSec nor details are provided', () => {
    const err = tooManyRequests('Slow down');
    expect(err.details).toBeUndefined();
  });

  it('tooManyRequests prefers explicit options.details over the retryAfterSec fallback', () => {
    const err = tooManyRequests('Slow down', { retryAfterSec: 5, details: { reason: 'spam' } });
    expect(err.details).toEqual({ reason: 'spam' });
  });

  it('tooManyRequests overrides the default code with options.code', () => {
    const err = tooManyRequests('Slow down', { code: 'CUSTOM_THROTTLE' });
    expect(err.code).toBe('CUSTOM_THROTTLE');
  });

  // Kills L148 MethodExpression (Math.max → Math.min): the boundary case
  // retryAfterSec=5 distinguishes max(1, 5)=5 from min(1, 5)=1.
  it('tooManyRequests passes through retryAfterSec values above 1 without flooring to 1', () => {
    const err = tooManyRequests('Slow down', { retryAfterSec: 5 });
    expect(err.headers).toEqual({ 'Retry-After': '5' });
  });

  it('tooManyRequests floors retryAfterSec=0 to 1 and ceils fractional values', () => {
    expect(tooManyRequests('s', { retryAfterSec: 0 }).headers).toEqual({ 'Retry-After': '1' });
    expect(tooManyRequests('s', { retryAfterSec: 1.3 }).headers).toEqual({ 'Retry-After': '2' });
  });

  // Kills L145 / L147 / L153 / L154 OptionalChaining + ConditionalExpression
  // mutations on serviceUnavailable.
  describe('serviceUnavailable (503)', () => {
    it('creates a 503 error with default code and no headers/details', () => {
      const err = serviceUnavailable('Down for maintenance');
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe('SERVICE_UNAVAILABLE');
      expect(err.message).toBe('Down for maintenance');
      expect(err.headers).toBeUndefined();
      expect(err.details).toBeUndefined();
    });

    it('sets Retry-After header when retryAfterSec is provided', () => {
      const err = serviceUnavailable('Down', { retryAfterSec: 30 });
      expect(err.headers).toEqual({ 'Retry-After': '30' });
    });

    it('omits headers when only details (no retryAfterSec) provided', () => {
      const err = serviceUnavailable('Down', { details: { reason: 'planned' } });
      expect(err.headers).toBeUndefined();
      expect(err.details).toEqual({ reason: 'planned' });
    });

    it('overrides the default code with options.code', () => {
      const err = serviceUnavailable('Down', { code: 'MAINTENANCE' });
      expect(err.code).toBe('MAINTENANCE');
    });

    it('passes options.details through verbatim', () => {
      const err = serviceUnavailable('Down', { details: { id: 'planned-1' } });
      expect(err.details).toEqual({ id: 'planned-1' });
    });
  });

  it('unauthorized creates a 401 error', () => {
    const err = unauthorized('Sign in required');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Sign in required');
  });

  // PR-1 / UFR-022 RED — `unauthorized()` MUST accept an optional second
  // `code` argument so the 6 local copies in src/ can be removed. The current
  // mono-arg signature ignores anything beyond `message`, so the assertions
  // below FAIL until the GREEN phase extends the factory.
  describe('unauthorized 2-arg signature (PR-1)', () => {
    it('mono-arg call defaults code to UNAUTHORIZED (backward-compat regression guard)', () => {
      const err = unauthorized('Token required');
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.message).toBe('Token required');
    });

    it('overrides the default code when an explicit 2nd argument is provided', () => {
      const err = unauthorized('Invalid access token', 'INVALID_ACCESS_TOKEN');
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('INVALID_ACCESS_TOKEN');
      expect(err.message).toBe('Invalid access token');
    });

    it('propagates the INVALID_MFA_SESSION code used by mfaSessionToken paths', () => {
      const err = unauthorized('Invalid MFA session token', 'INVALID_MFA_SESSION');
      expect(err.code).toBe('INVALID_MFA_SESSION');
    });

    it('propagates the REFRESH_TOKEN_REUSE_DETECTED code used by sessionIssuer paths', () => {
      const err = unauthorized('Refresh token reuse detected', 'REFRESH_TOKEN_REUSE_DETECTED');
      expect(err.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');
    });

    it('propagates the TOKEN_REVOKED code used by authenticated middleware paths', () => {
      const err = unauthorized('Token revoked', 'TOKEN_REVOKED');
      expect(err.code).toBe('TOKEN_REVOKED');
    });
  });
});

// Kills L37 ObjectLiteral + StringLiteral and L38 StringLiteral mutations on
// the ValidationError subclass constructor (statusCode / code / name).
describe('ValidationError', () => {
  it('sets statusCode=400, code=VALIDATION_ERROR, name=ValidationError', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('bad input');
  });

  it('attaches details when provided', () => {
    const err = new ValidationError('bad', { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });

  it('is an instance of AppError and Error', () => {
    const err = new ValidationError('x');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });
});
