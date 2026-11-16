import { describe, it, expect } from '@jest/globals';
import { stepsOf } from './helpers/maestro-flows.mjs';

const steps = stepsOf('reviews-submit-flow.yaml');

describe('CLAVIER-AVIS-IOS', () => {
  it('CLAVIER-AVIS-IOS · après le commentaire multiligne, le clavier se ferme en touchant le titre du formulaire (hideKeyboard échoue sur iOS, Retour ajoute une ligne)', () => {
    const submit = steps.findIndex((step) => step.includes("Envoyer l'avis|Submit Review"));
    const lastInput = steps.findLastIndex((step) => step.startsWith('- inputText:'));

    expect(lastInput).toBeGreaterThan(0);
    expect(submit).toBeGreaterThan(lastInput);
    expect(steps.slice(lastInput + 1, submit).map((step) => step.trim())).toEqual([
      '- waitForAnimationToEnd',
      "- tapOn:\n    text: 'Écrire un avis|Write a Review'",
    ]);
  });
});
