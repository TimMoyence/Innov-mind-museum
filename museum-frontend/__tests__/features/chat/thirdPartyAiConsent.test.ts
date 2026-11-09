import '@/__tests__/helpers/test-utils';

import {
  THIRD_PARTY_AI_SCOPES,
  type ThirdPartyAiScope,
} from '@/features/chat/domain/consentScopes';

describe('thirdPartyAiConsent — location_to_llm scope (B9)', () => {
  it('includes location_to_llm in THIRD_PARTY_AI_SCOPES', () => {
    expect(THIRD_PARTY_AI_SCOPES as readonly string[]).toContain('location_to_llm');
  });

  it('accepts location_to_llm as a ThirdPartyAiScope value', () => {
    const scope: ThirdPartyAiScope = 'location_to_llm' as ThirdPartyAiScope;
    expect(THIRD_PARTY_AI_SCOPES as readonly string[]).toContain(scope);
  });
});
