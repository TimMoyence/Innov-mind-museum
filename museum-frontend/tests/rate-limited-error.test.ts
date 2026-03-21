import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getErrorMessage, isAppError } from '../shared/lib/errors';
import type { AppError } from '../shared/types/AppError';

describe('RateLimited error kind', () => {
  it('getErrorMessage returns user-friendly message for RateLimited', () => {
    const error: AppError = {
      kind: 'RateLimited',
      message: 'Too many requests',
      status: 429,
    };

    const message = getErrorMessage(error);
    assert.equal(message, 'Too many requests. Please wait a moment and try again.');
  });

  it('isAppError recognizes RateLimited errors', () => {
    const error: AppError = {
      kind: 'RateLimited',
      message: 'Too many requests',
      status: 429,
    };

    assert.ok(isAppError(error));
  });

  it('AppError _reported flag prevents double-reporting', () => {
    const error: AppError = {
      kind: 'Unknown',
      message: 'Server error',
      _reported: true,
    };

    assert.ok(isAppError(error));
    assert.equal(error._reported, true);
  });
});
