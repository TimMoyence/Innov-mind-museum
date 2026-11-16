import { getErrorMessage } from '@/shared/lib/errors';
import { makeAppError } from '@/__tests__/helpers/factories';

describe('EFFACEMENT-DERNIER-ADMIN', () => {
  it('EFFACEMENT-DERNIER-ADMIN · le refus 409 CANNOT_DELETE_LAST_ADMIN dit quoi faire, pas « Please review your input »', () => {
    const refusal = makeAppError({
      kind: 'Validation',
      code: 'CANNOT_DELETE_LAST_ADMIN',
      status: 409,
    });

    expect(getErrorMessage(refusal)).toBe(
      'You are the last administrator. Appoint another administrator before deleting your account.',
    );
  });
});
