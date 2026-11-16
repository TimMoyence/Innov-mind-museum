import { describe, it, expect } from '@jest/globals';
import { stepsOf } from './helpers/maestro-flows.mjs';

const steps = stepsOf('modal-paywall-quota-upsell.yaml');

describe('CLAVIER-PAYWALL-IOS', () => {
  it('CLAVIER-PAYWALL-IOS · après l’email du paywall, le clavier ne se ferme que sur Android : sur iOS hideKeyboard échoue et la fenêtre centrée reste au-dessus du clavier', () => {
    const email = steps.findIndex((step) => step.includes("id: 'quota-upsell-email'"));

    expect(steps[email + 1]).toMatch(/^- inputText: /);
    expect(steps[email + 2]?.trim()).toBe(
      '- runFlow:\n    when:\n      platform: Android\n    commands:\n      - hideKeyboard',
    );
    expect(steps[email + 3]?.trim()).toBe("- tapOn:\n    id: 'quota-upsell-consent'");
  });
});
