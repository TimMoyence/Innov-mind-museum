import { describe, it, expect } from '@jest/globals';
import { scrollTimeoutTo } from './helpers/maestro-flows.mjs';

describe('scrollTimeoutTo', () => {
  it('reads the timeout of the scroll that reaches the target', () => {
    expect(scrollTimeoutTo('consent-location-grant.yaml', 'consent-switch-location_to_llm')).toBe(
      20000,
    );
  });

  it('gives 0 when the flow never scrolls to the target, so a minimum timeout check fails', () => {
    expect(scrollTimeoutTo('consent-location-grant.yaml', 'target-absent-from-every-flow')).toBe(0);
  });
});
