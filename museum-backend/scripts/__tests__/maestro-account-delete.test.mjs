import { describe, it, expect } from '@jest/globals';
import { stepsOf } from './helpers/maestro-flows.mjs';

const steps = stepsOf('auth-account-delete.yaml');
const indexOf = (start) => steps.findIndex((step) => step.startsWith(start));

describe('SUPPRESSION-COMPTE', () => {
  it('SUPPRESSION-COMPTE · le flow amène le bouton de suppression entier à l’écran puis attend le texte propre à l’alerte de confirmation', () => {
    const scroll = indexOf('- scrollUntilVisible:');
    const tap = indexOf("- tapOn:\n    id: 'settings-delete-account'");

    expect(steps[scroll]).toMatch(/^ {6}id: 'settings-delete-account'$/m);
    expect(steps[scroll]).toMatch(/^ {4}visibilityPercentage: 100$/m);
    expect(tap).toBeGreaterThan(scroll);
    expect(steps[tap + 1]).toMatch(
      /^ {6}text: '\.\*\(This will permanently\|Cela supprimera définitivement\)\.\*'$/m,
    );
  });
});
