import { describe, it, expect } from '@jest/globals';
import { stepsOf } from './helpers/maestro-flows.mjs';

const steps = stepsOf('modal-paywall-quota-upsell.yaml');
const indexOf = (id) => steps.findIndex((step) => step.startsWith(`- tapOn:\n    id: '${id}'`));

describe('SUCCES-PAYWALL', () => {
  it('SUCCES-PAYWALL · le flow paywall attend le message de succès de l’envoi avant de fermer la fenêtre : sans lui, un consentement non coché ou un envoi raté passait vert', () => {
    const submit = indexOf('quota-upsell-submit');
    const dismiss = indexOf('quota-upsell-dismiss');

    expect(submit).toBeGreaterThan(0);
    expect(dismiss).toBeGreaterThan(submit);
    expect(steps.slice(submit + 1, dismiss).map((step) => step.trim())).toEqual([
      '- extendedWaitUntil:\n    visible:\n      text: "Merci — on revient vers toi.|Thanks — we\'ll be in touch."\n    timeout: 15000',
    ]);
  });
});
