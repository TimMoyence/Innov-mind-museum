import { describe, it, expect } from '@jest/globals';
import { scrollTimeoutTo } from './helpers/maestro-flows.mjs';

describe('DEFILEMENT-AVIS-IOS', () => {
  it('DEFILEMENT-AVIS-IOS · le défilement jusqu’au bouton des avis, en bas de Paramètres, dure autant que celui jusqu’à la suppression du compte', () => {
    const deleteAccount = scrollTimeoutTo('auth-account-delete.yaml', 'settings-delete-account');

    expect(deleteAccount).toBeGreaterThanOrEqual(30000);
    expect(scrollTimeoutTo('reviews-submit-flow.yaml', 'Ouvrir les avis')).toBeGreaterThanOrEqual(
      deleteAccount,
    );
  });
});
