import { describe, it, expect } from '@jest/globals';
import { flowNames, readFlow } from './helpers/maestro-flows.mjs';

const BACK_HELPER = 'helpers/back.yaml';
const flows = flowNames();

describe('RETOUR-IOS', () => {
  it('RETOUR-IOS · le retour passe par un helper : touche retour sur Android, glissement depuis le bord sur iOS (back ne fait rien sur iOS)', () => {
    expect(
      flows.filter((flow) => flow !== BACK_HELPER && /^\s*- back$/m.test(readFlow(flow))),
    ).toEqual([]);
    expect(flows).toContain(BACK_HELPER);

    const [android, ios] = readFlow(BACK_HELPER)
      .split(/\n(?=- runFlow:)/)
      .slice(1);

    expect(android).toMatch(/^ {6}platform: Android$/m);
    expect(android).toMatch(/^ {6}- back$/m);
    expect(ios).toMatch(/^ {6}platform: iOS$/m);
    expect(ios).toMatch(/^ {10}start: '1%, 50%'$/m);
  });
});
