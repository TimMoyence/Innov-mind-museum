import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppError } from '../shared/types/AppError';
import { getErrorMessage } from '../shared/lib/errors';

test('maps app error kinds to user friendly messages', () => {
  const networkError = createAppError({
    kind: 'Network',
    message: 'Network unavailable',
  });

  assert.equal(
    getErrorMessage(networkError),
    'Network unavailable. Check your connection and try again.',
  );

  const timeoutError = createAppError({
    kind: 'Timeout',
    message: 'Request timeout',
  });

  assert.equal(getErrorMessage(timeoutError), 'Request timed out. Please retry.');
});

test('falls back to generic messages', () => {
  assert.equal(getErrorMessage(new Error('Boom')), 'Boom');
  assert.equal(getErrorMessage(null), 'Something went wrong. Please try again.');
});
