import { describe, it, expect } from '@jest/globals';
import { scrollTimeoutTo } from './helpers/maestro-flows.mjs';

describe('DEFILEMENT-DECONNEXION-IOS', () => {
  it('DEFILEMENT-DECONNEXION-IOS · le défilement jusqu’à « Se déconnecter », en bas de Paramètres, dure autant que celui jusqu’à la suppression du compte', () => {
    const deleteAccount = scrollTimeoutTo('auth-account-delete.yaml', 'settings-delete-account');

    expect(deleteAccount).toBeGreaterThanOrEqual(30000);
    expect(scrollTimeoutTo('auth-flow.yaml', 'Se déconnecter')).toBeGreaterThanOrEqual(
      deleteAccount,
    );
  });
});
