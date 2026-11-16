import { getErrorMessage } from '@/shared/lib/errors';
import { makeAppError } from '@/__tests__/helpers/factories';

describe('EFFACEMENT-DERNIER-SUPER-ADMIN', () => {
  it('EFFACEMENT-DERNIER-SUPER-ADMIN · le refus 409 CANNOT_DELETE_LAST_SUPER_ADMIN dit quoi faire, pas « Please review your input »', () => {
    const refusal = makeAppError({
      kind: 'Validation',
      code: 'CANNOT_DELETE_LAST_SUPER_ADMIN',
      status: 409,
    });

    expect(getErrorMessage(refusal)).toBe(
      'You are the last super administrator. Appoint another super administrator before deleting your account.',
    );
  });
});
