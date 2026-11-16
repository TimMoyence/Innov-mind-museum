import { describe, it, expect } from '@jest/globals';
import { flowNames, stepsOf } from './helpers/maestro-flows.mjs';

const PREFERENCES = "text: 'Ouvrir les préférences|Open Preferences'";

const waits = flowNames().flatMap((flow) =>
  stepsOf(flow)
    .filter((step) => !step.startsWith('- tapOn:') && step.includes(PREFERENCES))
    .map((step) => `${flow} ${step.split('\n')[0]}`),
);

describe('NAVIGATION-IOS', () => {
  it('NAVIGATION-IOS · chaque attente du bouton des préférences le fait défiler à l’écran, même au retour sur Paramètres', () => {
    expect(waits.length).toBeGreaterThanOrEqual(4);
    expect(waits.filter((wait) => !wait.endsWith(' - scrollUntilVisible:'))).toEqual([]);
  });
});
