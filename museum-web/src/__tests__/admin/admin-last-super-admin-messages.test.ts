import { describe, expect, it } from 'vitest';

import en from '@/dictionaries/en.json';
import fr from '@/dictionaries/fr.json';
import { ApiError, errorMessage } from '@/lib/api';
import { userActionRefusals } from '@/lib/admin-dictionary';

const refusal = (code: string): ApiError => new ApiError(409, 'Conflict', code, code);

describe('MESSAGES-DERNIER-SUPER-ADMIN', () => {
  it.each([
    [
      'CANNOT_DEMOTE_LAST_SUPER_ADMIN',
      'Impossible de retirer son rôle au dernier super administrateur.',
    ],
    ['CANNOT_SUSPEND_LAST_SUPER_ADMIN', 'Impossible de suspendre le dernier super administrateur.'],
    ['CANNOT_DELETE_LAST_SUPER_ADMIN', 'Impossible de supprimer le dernier super administrateur.'],
  ])('MESSAGES-DERNIER-SUPER-ADMIN · %s s’affiche en français : « %s »', (code, message) => {
    expect(errorMessage(refusal(code), 'Action impossible.', userActionRefusals(fr.admin))).toBe(
      message,
    );
  });

  it.each([
    ['CANNOT_DEMOTE_LAST_SUPER_ADMIN', 'The last super admin cannot lose the super admin role.'],
    ['CANNOT_SUSPEND_LAST_SUPER_ADMIN', 'The last super admin cannot be suspended.'],
    ['CANNOT_DELETE_LAST_SUPER_ADMIN', 'The last super admin cannot be deleted.'],
  ])('MESSAGES-DERNIER-SUPER-ADMIN · %s s’affiche en anglais : « %s »', (code, message) => {
    expect(errorMessage(refusal(code), 'Action failed.', userActionRefusals(en.admin))).toBe(
      message,
    );
  });
});
