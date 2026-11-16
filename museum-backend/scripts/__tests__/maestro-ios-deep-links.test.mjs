import { describe, it, expect } from '@jest/globals';
import { flowNames, readFlow } from './helpers/maestro-flows.mjs';

const OPEN_LINK_HELPER = 'helpers/open-link.yaml';
const flows = flowNames();

describe('LIEN-PROFOND-IOS', () => {
  it('LIEN-PROFOND-IOS · chaque lien profond des flows passe par le helper qui accepte la confirmation iOS', () => {
    expect(
      flows.filter((flow) => flow !== OPEN_LINK_HELPER && /^\s*- openLink\b/m.test(readFlow(flow))),
    ).toEqual([]);
    expect(flows).toContain(OPEN_LINK_HELPER);

    const helper = readFlow(OPEN_LINK_HELPER);
    expect(helper).toMatch(/^- openLink: '\$\{LINK\}'$/m);
    expect(helper).toMatch(/^ {6}platform: iOS$/m);
    expect(helper).toMatch(/^ {12}below: '\(Ouvrir dans\|Open in\) \.\*Musaium\.\*'$/m);
  });
});
