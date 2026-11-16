import { describe, expect, it } from 'vitest';

import en from '@/dictionaries/en.json';
import fr from '@/dictionaries/fr.json';
import { userActionRefusals } from '@/lib/admin-dictionary';

const BACKEND_REFUSALS = [
  'CANNOT_DELETE_LAST_ADMIN',
  'CANNOT_DELETE_LAST_SUPER_ADMIN',
  'CANNOT_DEMOTE_LAST_ADMIN',
  'CANNOT_DEMOTE_LAST_SUPER_ADMIN',
  'CANNOT_SUSPEND_LAST_ADMIN',
  'CANNOT_SUSPEND_LAST_SUPER_ADMIN',
  'CANNOT_SUSPEND_SELF',
  'SUPER_ADMIN_REQUIRED',
];

describe('userActionRefusals', () => {
  it.each([
    ['en', en.admin],
    ['fr', fr.admin],
  ])('gives every backend refusal of a user action a non-empty %s message', (_locale, dict) => {
    const refusals = userActionRefusals(dict);

    expect(Object.keys(refusals).sort()).toEqual(BACKEND_REFUSALS);
    for (const message of Object.values(refusals)) {
      expect(message.trim()).not.toBe('');
    }
  });

  it('speaks French with the French dictionary', () => {
    expect(userActionRefusals(fr.admin).SUPER_ADMIN_REQUIRED).toBe(
      'Seul un super administrateur peut donner ou retirer le rôle de super administrateur.',
    );
  });
});
