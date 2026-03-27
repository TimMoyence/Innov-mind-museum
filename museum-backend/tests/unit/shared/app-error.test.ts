import {
  AppError,
  badRequest,
  notFound,
  conflict,
  forbidden,
  tooManyRequests,
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
});
