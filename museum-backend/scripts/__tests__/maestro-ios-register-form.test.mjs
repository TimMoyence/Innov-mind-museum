import { describe, it, expect } from '@jest/globals';
import { flowNames, readFlow, stepsOf } from './helpers/maestro-flows.mjs';

const REGISTER_HELPER = 'helpers/register-form.yaml';
const DISMISS_KEYBOARD = '- pressKey: Enter';
const flows = flowNames();

describe('FORMULAIRE-IOS', () => {
  it('FORMULAIRE-IOS · l’inscription se remplit par un seul helper qui ferme le clavier par la touche Retour après chaque champ (le titre défile sous les pastilles qui basculent en connexion)', () => {
    expect(
      flows.filter(
        (flow) => flow !== REGISTER_HELPER && readFlow(flow).includes("id: 'date-of-birth-input'"),
      ),
    ).toEqual([]);
    expect(flows).toContain(REGISTER_HELPER);

    const steps = stepsOf(REGISTER_HELPER);
    const inputs = steps.flatMap((step, index) => (step.startsWith('- inputText:') ? [index] : []));

    expect(inputs).toHaveLength(5);
    expect(inputs.map((index) => steps[index + 1]?.trim())).toEqual(
      Array(5).fill(DISMISS_KEYBOARD),
    );
  });
});
