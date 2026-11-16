import { describe, it, expect } from '@jest/globals';
import { stepsOf } from './helpers/maestro-flows.mjs';

const steps = stepsOf('modal-museum-sheet.yaml');

describe('FERMETURE-FEUILLE-IOS', () => {
  it('FERMETURE-FEUILLE-IOS · la croix de la feuille musée se touche une fois l’enrichissement fini : la feuille grandit à son issue et déplace la croix', () => {
    const close = steps.findIndex(
      (step) => step.startsWith('- tapOn:') && step.includes("id: 'museum-sheet-close'"),
    );

    expect(close).toBeGreaterThan(0);
    expect(steps[close - 1]?.trim()).toBe(
      "- extendedWaitUntil:\n    notVisible:\n      text: '(Chargement des informations|Loading information).*'\n    timeout: 15000",
    );
  });
});
