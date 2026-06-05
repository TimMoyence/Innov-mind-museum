/**
 * C1 Red — consentScopes domain constants.
 *
 * Cluster C1 (hexagonal violations, 2026-05-23-frontend-dry-audit) — design
 * §Q3 splits `features/chat/application/thirdPartyAiConsent.ts` into:
 *   - `features/chat/infrastructure/consentApi.ts` (HTTP adapter)
 *   - `features/chat/domain/consentScopes.ts` (pure-data: scope list, required
 *     scope literal, policy version, scope type)
 *
 * THIS TEST FILE IS RED-PHASE: it must FAIL because
 * `@/features/chat/domain/consentScopes` does not yet exist (constants still
 * live in the application-layer file).
 *
 * Contract preserved byte-for-byte from `thirdPartyAiConsent.ts:25-49`:
 *   - THIRD_PARTY_AI_SCOPES order + content (9 scopes incl. `location_to_llm`).
 *   - REQUIRED_CONSENT_SCOPE = 'third_party_ai_text_openai'.
 *   - CONSENT_POLICY_VERSION = '2026-06-01' (matches BE policy-version.ts).
 *   - Type ThirdPartyAiScope = (typeof THIRD_PARTY_AI_SCOPES)[number].
 */

import {
  THIRD_PARTY_AI_SCOPES,
  REQUIRED_CONSENT_SCOPE,
  CONSENT_POLICY_VERSION,
  type ThirdPartyAiScope,
} from '@/features/chat/domain/consentScopes';

describe('consentScopes domain (C1 split — extracted from thirdPartyAiConsent.ts)', () => {
  // Cycle 1.5-FE (REQ-FE-1, D2 append-order) — `location_coarse_to_llm` is the
  // coarse (city+country) geo grant. It is APPENDED last so the existing 0-8
  // indices stay stable (`switches[8] === location_to_llm`, NFR-FE-6 audit-chain
  // stability). The list now has 10 scopes.
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
    // Compile-time guard via a value assignment — if the type drifts, tsc fails.
    const required: ThirdPartyAiScope = 'third_party_ai_text_openai';
    const location: ThirdPartyAiScope = 'location_to_llm';
    expect(required).toBe('third_party_ai_text_openai');
    expect(location).toBe('location_to_llm');
  });

  it('includes location_to_llm (full / neighbourhood geo grant, not a per-vendor grant)', () => {
    expect(THIRD_PARTY_AI_SCOPES).toContain('location_to_llm');
  });

  // REQ-FE-1 (T-DOM-2) — the coarse (city+country) geo level exists on the BE
  // (`CONSENT_SCOPES` + `z.enum` route) but was a dead scope on the FE: never in
  // this list → never grantable. Adding it here is what un-deads it.
  it('includes location_coarse_to_llm (coarse / city+country geo grant — REQ-FE-1)', () => {
    expect(THIRD_PARTY_AI_SCOPES).toContain('location_coarse_to_llm');
  });

  // REQ-FE-1 (T-DOM-3) — compile-time guard: the coarse scope must be assignable
  // to the ThirdPartyAiScope union (so consentApi.grant/revoke accept it).
  it('infers location_coarse_to_llm into the ThirdPartyAiScope union (compile-time)', () => {
    const coarse: ThirdPartyAiScope = 'location_coarse_to_llm';
    expect(coarse).toBe('location_coarse_to_llm');
  });

  it('intentionally OMITS deepseek scopes (S4-P0-04 EU sentinel blocks them in prod)', () => {
    const hasDeepseek = THIRD_PARTY_AI_SCOPES.some((s) => s.includes('deepseek'));
    expect(hasDeepseek).toBe(false);
  });
});
