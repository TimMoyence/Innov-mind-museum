import {
  THIRD_PARTY_AI_SCOPES,
  REQUIRED_CONSENT_SCOPE,
  CONSENT_POLICY_VERSION,
  type ThirdPartyAiScope,
} from '@/features/chat/domain/consentScopes';

describe('consentScopes domain (C1 split — extracted from thirdPartyAiConsent.ts)', () => {
  it('exposes the 10 scopes in the canonical order (S4-P0-02 audit-chain stability, coarse appended last)', () => {
    expect(THIRD_PARTY_AI_SCOPES).toEqual([
      'third_party_ai_text_openai',
      'third_party_ai_image_openai',
      'third_party_ai_audio_openai',
      'third_party_ai_profile_openai',
      'third_party_ai_text_google',
      'third_party_ai_image_google',
      'third_party_ai_audio_google',
      'third_party_ai_profile_google',
      'location_to_llm',
      'location_coarse_to_llm',
    ]);
  });

  it('marks third_party_ai_text_openai as the required scope (gates Save button)', () => {
    expect(REQUIRED_CONSENT_SCOPE).toBe('third_party_ai_text_openai');
  });

  it('exposes CONSENT_POLICY_VERSION aligned with backend policy-version.ts (2026-06-01)', () => {
    expect(CONSENT_POLICY_VERSION).toBe('2026-06-01');
  });

  it('infers ThirdPartyAiScope as the union of THIRD_PARTY_AI_SCOPES literals', () => {
    const required: ThirdPartyAiScope = 'third_party_ai_text_openai';
    const location: ThirdPartyAiScope = 'location_to_llm';
    expect(required).toBe('third_party_ai_text_openai');
    expect(location).toBe('location_to_llm');
  });

  it('includes location_to_llm (full / neighbourhood geo grant, not a per-vendor grant)', () => {
    expect(THIRD_PARTY_AI_SCOPES).toContain('location_to_llm');
  });

  it('includes location_coarse_to_llm (coarse / city+country geo grant — REQ-FE-1)', () => {
    expect(THIRD_PARTY_AI_SCOPES).toContain('location_coarse_to_llm');
  });

  it('infers location_coarse_to_llm into the ThirdPartyAiScope union (compile-time)', () => {
    const coarse: ThirdPartyAiScope = 'location_coarse_to_llm';
    expect(coarse).toBe('location_coarse_to_llm');
  });

  it('intentionally OMITS deepseek scopes (S4-P0-04 EU sentinel blocks them in prod)', () => {
    const hasDeepseek = THIRD_PARTY_AI_SCOPES.some((s) => s.includes('deepseek'));
    expect(hasDeepseek).toBe(false);
  });
});
