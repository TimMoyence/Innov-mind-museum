import { describe, it, expect } from '@jest/globals';
import { flowNames, stepsOf } from './helpers/maestro-flows.mjs';

const backdropSteps = flowNames().flatMap((flow) =>
  stepsOf(flow)
    .filter((step) => step.includes("id: 'museum-sheet-backdrop'"))
    .map((step) => ({ flow, step })),
);

describe('FOND-MODAL-IOS', () => {
  it('FOND-MODAL-IOS · le fond de la feuille musée, masqué à VoiceOver par accessibilityViewIsModal, ne se vérifie que sur Android', () => {
    expect(backdropSteps.length).toBeGreaterThan(0);
    expect(
      backdropSteps
        .filter(
          ({ step }) => !step.startsWith('- runFlow:') || !/^ {6}platform: Android$/m.test(step),
        )
        .map(({ flow }) => flow),
    ).toEqual([]);
  });
});
