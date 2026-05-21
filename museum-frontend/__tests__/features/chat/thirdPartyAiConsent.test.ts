import '@/__tests__/helpers/test-utils';

import {
  THIRD_PARTY_AI_SCOPES,
  type ThirdPartyAiScope,
} from '@/features/chat/application/thirdPartyAiConsent';

/**
 * B9 (spec R1 / AC-B9-1) — the FE consent scope source MUST include
 * `location_to_llm`. The BE already gates location propagation behind
 * `isGranted(userId, 'location_to_llm')` (`location-resolver.ts`), and the
 * BE entity already declares the scope (`userConsent.entity.ts`), but the FE
 * scope array does NOT — so no FE surface ever grants it and `isGranted`
 * returns false for every user, silently dropping the resolved location.
 *
 * Until the green phase adds it, `THIRD_PARTY_AI_SCOPES` does not contain the
 * literal → this test FAILS (proves the gap; currently 0 FE source matches).
 */
describe('thirdPartyAiConsent — location_to_llm scope (B9)', () => {
  it('includes location_to_llm in THIRD_PARTY_AI_SCOPES', () => {
    expect(THIRD_PARTY_AI_SCOPES as readonly string[]).toContain('location_to_llm');
  });

  it('accepts location_to_llm as a ThirdPartyAiScope value', () => {
    // If the union does not include the literal, this assignment forces the
    // green phase to widen the type (it derives from the array). The runtime
    // assertion mirrors the type-level contract.
    const scope: ThirdPartyAiScope = 'location_to_llm' as ThirdPartyAiScope;
    expect(THIRD_PARTY_AI_SCOPES as readonly string[]).toContain(scope);
  });
});
